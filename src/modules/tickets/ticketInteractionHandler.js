'use strict';

const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');

const ticketActions = require('./ticketActions');
const ticketManager = require('./ticketManager');
const ticketStore = require('./ticketStore');
const ticketTranscriptManager = require('./ticketTranscriptManager');
const ticketPermissions = require('./ticketPermissions');

const {
  handleTicketPanelButton,
  refreshDeployedPanel,
} = require('./ticketPanelManager');

const {
  handleTicketSetupInteraction,
} = require('./ticketSetupPanel');

const {
  CUSTOM_IDS,
  isTicketButton,
  getTicketActionRows,
  getClosedTicketActionRows,
  getArchivedTicketActionRows,
} = require('./ticketChannelButtons');

const { TICKET_ACTIONS } = ticketPermissions;

const MODAL_IDS = {
  CLOSE: 'goliath_ticket_close_modal',
  ADD_USER: 'goliath_ticket_add_user_modal',
  PANEL_APPEARANCE: 'goliath_ticket_panel_appearance_modal',
  DELETE_CONFIRM: 'goliath_ticket_delete_confirm_modal',
};

const INPUT_IDS = {
  CLOSE_REASON: 'close_reason',
  ADD_USER_ID: 'add_user_id',
  APPEARANCE_VALUE: 'appearance_value',
  DELETE_CONFIRM: 'delete_confirm',
};

const SELECT_IDS = {
  PRIORITY: 'goliath_ticket_priority_select',
};

const PRIORITY_LABELS = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

function alreadyHandled(interaction) {
  return interaction.deferred || interaction.replied;
}

function ephemeralPayload(payload = {}) {
  return {
    ...payload,
    flags: MessageFlags.Ephemeral,
  };
}

function formatPriority(priority = 'normal') {
  const value = String(priority || 'normal').toLowerCase().trim();
  return PRIORITY_LABELS[value] || 'Normal';
}

function normalizePriority(priority = 'normal') {
  const value = String(priority || 'normal').toLowerCase().trim();

  if (Object.prototype.hasOwnProperty.call(PRIORITY_LABELS, value)) {
    return value;
  }

  return 'normal';
}

async function safeReply(interaction, payload = {}) {
  try {
    if (alreadyHandled(interaction)) {
      return interaction.followUp(payload).catch(() => null);
    }

    return interaction.reply(payload).catch(() => null);
  } catch {
    return null;
  }
}

async function safeEditOrReply(interaction, payload = {}) {
  try {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload).catch(() => null);
    }

    return interaction.reply(payload).catch(() => null);
  } catch {
    return null;
  }
}

async function safeDefer(interaction, ephemeral = true) {
  if (alreadyHandled(interaction)) return true;

  try {
    await interaction.deferReply(
      ephemeral
        ? { flags: MessageFlags.Ephemeral }
        : {}
    );

    return true;
  } catch (error) {
    if (error?.code === 10062 || error?.code === 40060) {
      return false;
    }

    throw error;
  }
}

async function refreshPanelEditor(interaction, panelId) {
  try {
    const panel = ticketStore.getPanel(interaction.guildId, panelId);

    if (!panel) {
      return false;
    }

    const {
      buildEditorEmbed,
      buildEditorControlsForPanel,
      buildEditorControls,
    } = require('./ticketSetupPanel');

    const controls =
      typeof buildEditorControlsForPanel === 'function'
        ? buildEditorControlsForPanel(panel)
        : buildEditorControls(panelId);

    const payload = {
      embeds: [
        buildEditorEmbed(panel),
      ],
      components: controls,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
      return true;
    }

    if (typeof interaction.update === 'function') {
      await interaction.update(payload);
      return true;
    }

    await interaction.reply(ephemeralPayload(payload));
    return true;
  } catch {
    return false;
  }
}

function isTicketModal(customId) {
  return Object.values(MODAL_IDS).includes(customId);
}

function isTicketSelect(customId) {
  return Object.values(SELECT_IDS).includes(customId);
}

function isTicketSetupInteraction(interaction) {
  const customId = interaction.customId || '';

  return customId.startsWith('ticket_setup:');
}

async function listTickets(guildId) {
  if (!guildId) return [];

  if (typeof ticketManager.getTickets === 'function') {
    return ticketManager.getTickets(guildId);
  }

  if (typeof ticketManager.getAllTickets === 'function') {
    return ticketManager.getAllTickets(guildId);
  }

  if (typeof ticketStore.getAllTickets === 'function') {
    return ticketStore.getAllTickets(guildId);
  }

  return [];
}

async function findTicketByChannel(guildId, channelId) {
  if (!guildId || !channelId) return null;

  const tickets = await listTickets(guildId);

  return (
    tickets.find(
      (ticket) =>
        ticket.discordChannelId === channelId ||
        ticket.channelId === channelId
    ) || null
  );
}

async function getTicketForInteraction(interaction) {
  return findTicketByChannel(
    interaction.guildId,
    interaction.channelId
  );
}

async function refreshTicketButtons(interaction, ticket) {
  if (!interaction.message?.editable || !ticket) return;

  const status = String(ticket.status || 'open').toLowerCase();

  let components = getTicketActionRows(ticket, {
    allowReopen: true,
    allowDelete: true,
  });

  if (status === ticketActions.STATUS.CLOSED) {
    components = getClosedTicketActionRows(ticket, {
      allowDelete: true,
    });
  }

  if (status === ticketActions.STATUS.ARCHIVED) {
    components = getArchivedTicketActionRows(ticket, {
      allowDelete: true,
    });
  }

  await interaction.message
    .edit({ components })
    .catch(() => null);
}

function deny(interaction, message) {
  return safeReply(
    interaction,
    ephemeralPayload({
      content: `❌ ${message}`,
    })
  );
}

function can(interaction, action, ticket) {
  return ticketPermissions.can(
    interaction.member,
    action,
    ticket
  );
}

async function handleClaim(interaction, ticket) {
  if (!can(interaction, TICKET_ACTIONS.CLAIM, ticket)) {
    return deny(interaction, 'You cannot claim tickets.');
  }

  const updated = await ticketActions.claim(
    ticket,
    interaction.user,
    {
      client: interaction.client,
    }
  );

  await refreshTicketButtons(interaction, updated);

  return safeReply(interaction, {
    content: `🎫 Ticket claimed by <@${interaction.user.id}>.`,
  });
}

async function showCloseModal(interaction, ticket) {
  if (!can(interaction, TICKET_ACTIONS.CLOSE, ticket)) {
    return deny(interaction, 'You cannot close this ticket.');
  }

  if (alreadyHandled(interaction)) return true;

  const modal = new ModalBuilder()
    .setCustomId(MODAL_IDS.CLOSE)
    .setTitle('Close Ticket');

  const input = new TextInputBuilder()
    .setCustomId(INPUT_IDS.CLOSE_REASON)
    .setLabel('Close reason')
    .setPlaceholder('Optional reason for closing this ticket')
    .setRequired(false)
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  await interaction.showModal(modal);
  return true;
}

async function handleCloseModal(interaction, ticket) {
  if (!ticket) {
    return deny(interaction, 'Ticket not found.');
  }

  const reason =
    interaction.fields.getTextInputValue(INPUT_IDS.CLOSE_REASON) ||
    'No reason provided.';

  const updated = await ticketActions.close(
    ticket,
    interaction.user,
    {
      reason,
      client: interaction.client,
      createTranscript: true,
    }
  );

  await refreshTicketButtons(interaction, updated);

  return safeReply(
    interaction,
    ephemeralPayload({
      content: `🔒 Ticket closed. Reason: ${reason}`,
    })
  );
}

async function handleArchive(interaction, ticket) {
  if (!can(interaction, TICKET_ACTIONS.ARCHIVE, ticket)) {
    return deny(interaction, 'You cannot archive this ticket.');
  }

  const deferred = await safeDefer(interaction, true);
  if (!deferred) return true;

  const updated = await ticketActions.archive(
    ticket,
    interaction.user,
    {
      client: interaction.client,
      createTranscript: true,
    }
  );

  await refreshTicketButtons(interaction, updated);

  return safeEditOrReply(interaction, {
    content: '📁 Ticket archived.',
  });
}

async function handleReopen(interaction, ticket) {
  if (!can(interaction, TICKET_ACTIONS.REOPEN, ticket)) {
    return deny(interaction, 'You cannot reopen this ticket.');
  }

  const deferred = await safeDefer(interaction, true);
  if (!deferred) return true;

  const updated = await ticketActions.reopen(
    ticket,
    interaction.user,
    {
      client: interaction.client,
    }
  );

  await refreshTicketButtons(interaction, updated);

  return safeEditOrReply(interaction, {
    content: '🔓 Ticket reopened.',
  });
}

async function handleTranscript(interaction, ticket) {
  if (!can(interaction, TICKET_ACTIONS.VIEW, ticket)) {
    return deny(interaction, 'You cannot generate transcripts.');
  }

  const deferred = await safeDefer(interaction, true);
  if (!deferred) return true;

  const transcript =
    await ticketTranscriptManager.createAndUploadTranscript(
      interaction.client,
      ticket,
      {
        generatedBy: interaction.user.id,
        reason: 'Manual transcript request',
      }
    );

  if (transcript?.error) {
    return safeEditOrReply(interaction, {
      content: `❌ Transcript failed: ${transcript.message}`,
    });
  }

  return safeEditOrReply(interaction, {
    content: '📄 Transcript generated.',
  });
}

async function showAddUserModal(interaction, ticket) {
  if (!can(interaction, TICKET_ACTIONS.UPDATE, ticket)) {
    return deny(interaction, 'You cannot add users to this ticket.');
  }

  if (alreadyHandled(interaction)) return true;

  const modal = new ModalBuilder()
    .setCustomId(MODAL_IDS.ADD_USER)
    .setTitle('Add User To Ticket');

  const input = new TextInputBuilder()
    .setCustomId(INPUT_IDS.ADD_USER_ID)
    .setLabel('User ID')
    .setPlaceholder('Enter the Discord user ID to add')
    .setRequired(true)
    .setStyle(TextInputStyle.Short)
    .setMaxLength(32);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  await interaction.showModal(modal);
  return true;
}

async function handleAddUserModal(interaction, ticket) {
  if (!ticket) {
    return deny(interaction, 'Ticket not found.');
  }

  const userId = interaction.fields
    .getTextInputValue(INPUT_IDS.ADD_USER_ID)
    .replace(/[<@!>]/g, '')
    .trim();

  if (!/^\d{15,25}$/.test(userId)) {
    return deny(interaction, 'Invalid user ID.');
  }

  const channel =
    interaction.channel ||
    (ticket.discordChannelId
      ? await interaction.guild.channels
          .fetch(ticket.discordChannelId)
          .catch(() => null)
      : null);

  if (!channel) {
    return deny(interaction, 'Ticket channel not found.');
  }

  await channel.permissionOverwrites.edit(userId, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
    EmbedLinks: true,
  });

  const allowedUserIds = [
    ...new Set([
      ...(Array.isArray(ticket.allowedUserIds)
        ? ticket.allowedUserIds
        : []),
      userId,
    ]),
  ];

  ticketStore.updateTicket(
    interaction.guildId,
    ticket.ticketId,
    {
      allowedUserIds,
      updatedAt: new Date().toISOString(),
    }
  );

  return safeReply(
    interaction,
    ephemeralPayload({
      content: `✅ Added <@${userId}> to this ticket.`,
    })
  );
}

async function showPrioritySelect(interaction, ticket) {
  if (!can(interaction, TICKET_ACTIONS.UPDATE, ticket)) {
    return deny(interaction, 'You cannot change ticket priority.');
  }

  const current = normalizePriority(ticket.priority);

  const select = new StringSelectMenuBuilder()
    .setCustomId(SELECT_IDS.PRIORITY)
    .setPlaceholder(`Current: ${formatPriority(current)}`)
    .addOptions(
      Object.entries(PRIORITY_LABELS).map(([value, label]) => ({
        label,
        value,
        default: value === current,
      }))
    );

  return safeReply(
    interaction,
    ephemeralPayload({
      content: 'Choose a new ticket priority:',
      components: [
        new ActionRowBuilder().addComponents(select),
      ],
    })
  );
}

async function handlePrioritySelect(interaction, ticket) {
  if (!ticket) {
    return deny(interaction, 'Ticket not found.');
  }

  const priority = normalizePriority(interaction.values?.[0]);

  const updated = await ticketActions.setPriority(
    ticket,
    priority,
    interaction.user,
    {
      client: interaction.client,
    }
  );

  await refreshTicketButtons(interaction, updated);

  return safeReply(
    interaction,
    ephemeralPayload({
      content: `⚠️ Priority updated to **${formatPriority(priority)}**.`,
    })
  );
}

async function showDeleteConfirmModal(interaction, ticket) {
  if (!can(interaction, TICKET_ACTIONS.DELETE, ticket)) {
    return deny(interaction, 'You cannot delete tickets.');
  }

  if (alreadyHandled(interaction)) return true;

  const modal = new ModalBuilder()
    .setCustomId(MODAL_IDS.DELETE_CONFIRM)
    .setTitle('Delete Ticket');

  const input = new TextInputBuilder()
    .setCustomId(INPUT_IDS.DELETE_CONFIRM)
    .setLabel('Type DELETE to confirm')
    .setPlaceholder('DELETE')
    .setRequired(true)
    .setStyle(TextInputStyle.Short)
    .setMaxLength(20);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  await interaction.showModal(modal);
  return true;
}

async function handleDeleteConfirmModal(interaction, ticket) {
  if (!ticket) {
    return deny(interaction, 'Ticket not found.');
  }

  const value = interaction.fields
    .getTextInputValue(INPUT_IDS.DELETE_CONFIRM)
    .trim()
    .toUpperCase();

  if (value !== 'DELETE') {
    return deny(interaction, 'Delete cancelled. Confirmation did not match.');
  }

  const deferred = await safeDefer(interaction, true);
  if (!deferred) return true;

  await ticketActions.deleteTicket(
    ticket,
    interaction.user,
    {
      client: interaction.client,
      createTranscript: true,
    }
  );

  return safeEditOrReply(interaction, {
    content: '🗑️ Ticket deleted.',
  });
}

async function routeTicketButton(interaction, ticket) {
  const customId = interaction.customId;

  switch (customId) {
    case CUSTOM_IDS.CLAIM:
      return handleClaim(interaction, ticket);

    case CUSTOM_IDS.CLOSE:
      return showCloseModal(interaction, ticket);

    case CUSTOM_IDS.ARCHIVE:
      return handleArchive(interaction, ticket);

    case CUSTOM_IDS.TRANSCRIPT:
      return handleTranscript(interaction, ticket);

    case CUSTOM_IDS.ADD_USER:
      return showAddUserModal(interaction, ticket);

    case CUSTOM_IDS.PRIORITY:
      return showPrioritySelect(interaction, ticket);

    case CUSTOM_IDS.REOPEN:
      return handleReopen(interaction, ticket);

    case CUSTOM_IDS.DELETE:
    case CUSTOM_IDS.DELETE_CONFIRM:
      return showDeleteConfirmModal(interaction, ticket);

    default:
      return false;
  }
}

async function routeTicketModal(interaction, ticket) {
  const customId = interaction.customId;

  switch (customId) {
    case MODAL_IDS.CLOSE:
      return handleCloseModal(interaction, ticket);

    case MODAL_IDS.ADD_USER:
      return handleAddUserModal(interaction, ticket);

    case MODAL_IDS.DELETE_CONFIRM:
      return handleDeleteConfirmModal(interaction, ticket);

    default:
      return false;
  }
}

async function routeTicketSelect(interaction, ticket) {
  const customId = interaction.customId;

  switch (customId) {
    case SELECT_IDS.PRIORITY:
      return handlePrioritySelect(interaction, ticket);

    default:
      return false;
  }
}

async function handleTicketInteraction(
  interaction,
  client = interaction.client,
  io = null
) {
  try {
    if (!interaction?.guildId) {
      return false;
    }

    const customId = interaction.customId || '';

    /*
     * Ticket setup/admin panel interactions.
     * This must run early so setup modals/buttons/selects do not get treated
     * as normal ticket channel controls.
     */

    if (isTicketSetupInteraction(interaction)) {
      return handleTicketSetupInteraction(interaction);
    }

    /*
     * Public deployed panel button.
     */

    if (
      interaction.isButton?.() &&
      customId.startsWith('ticket_open:')
    ) {
      return handleTicketPanelButton(
        interaction,
        client,
        io
      );
    }

    /*
     * Existing ticket channel controls.
     */

    if (
      interaction.isButton?.() &&
      isTicketButton(customId)
    ) {
      const ticket = await getTicketForInteraction(interaction);

      if (!ticket) {
        return deny(interaction, 'Ticket not found for this channel.');
      }

      return routeTicketButton(interaction, ticket);
    }

    /*
     * Ticket modals.
     */

    if (
      interaction.isModalSubmit?.() &&
      isTicketModal(customId)
    ) {
      const ticket = await getTicketForInteraction(interaction);
      return routeTicketModal(interaction, ticket);
    }

    /*
     * Ticket selects.
     */

    if (
      interaction.isStringSelectMenu?.() &&
      isTicketSelect(customId)
    ) {
      const ticket = await getTicketForInteraction(interaction);
      return routeTicketSelect(interaction, ticket);
    }

    return false;
  } catch (error) {
    console.error('[TicketInteractionHandler] Failed:', error);

    await safeReply(
      interaction,
      ephemeralPayload({
        content:
          '❌ Ticket interaction failed. Check VPS logs for details.',
      })
    );

    return true;
  }
}

module.exports = {
  MODAL_IDS,
  INPUT_IDS,
  SELECT_IDS,

  handleTicketInteraction,

  refreshPanelEditor,

  getTicketForInteraction,
  findTicketByChannel,
  refreshTicketButtons,
};
