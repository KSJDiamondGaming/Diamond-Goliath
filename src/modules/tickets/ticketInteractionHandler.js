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
} = require('./ticketPanelManager');

const {
  handleTicketSetupInteraction,
} = require('./ticketSetupPanel');

const {
  refreshDeployedPanel,
} = require('./ticketPanelManager');

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

function alreadyHandled(interaction) {
  return interaction.deferred || interaction.replied;
}

function ephemeralPayload(payload = {}) {
  return {
    ...payload,
    flags: MessageFlags.Ephemeral,
  };
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

async function refreshPanelEditor(
  interaction,
  panelId
) {
  try {
    const panel =
      ticketStore.getPanel(
        interaction.guildId,
        panelId
      );

    if (!panel) {
      return false;
    }

    const {
      buildEditorEmbed,
      buildEditorControls,
    } = require('./ticketSetupPanel');

    const payload = {
      embeds: [
        buildEditorEmbed(panel),
      ],

      components:
        buildEditorControls(panelId),
    };

    if (
      interaction.deferred ||
      interaction.replied
    ) {
      await interaction.editReply(
        payload
      );

      return true;
    }

    await interaction.update(
      payload
    );

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

  const reason = new TextInputBuilder()
    .setCustomId(INPUT_IDS.CLOSE_REASON)
    .setLabel('Reason for closing')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder().addComponents(reason)
  );

  return interaction.showModal(modal);
}

async function showAppearanceModal(interaction, panelId, field) {
  if (alreadyHandled(interaction)) return true;

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_IDS.PANEL_APPEARANCE}:${panelId}:${field}`)
    .setTitle(`Edit ${field}`);

  const input = new TextInputBuilder()
    .setCustomId(INPUT_IDS.APPEARANCE_VALUE)
    .setLabel(`New ${field}`)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(4000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  return interaction.showModal(modal);
}

async function handleArchive(interaction, ticket) {
  if (!can(interaction, TICKET_ACTIONS.ARCHIVE, ticket)) {
    return deny(interaction, 'You cannot archive tickets.');
  }

  const deferred = await safeDefer(interaction, true);
  if (!deferred) return true;

  const updated = await ticketActions.archive(
    ticket,
    interaction.user,
    {
      client: interaction.client,
      reason: 'Archived from ticket channel',
    }
  );

  await refreshTicketButtons(interaction, updated);

  return safeEditOrReply(interaction, {
    content: '📁 Ticket archived and transcript generated.',
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

  return safeEditOrReply(interaction, {
    content: transcript.upload?.uploaded
      ? '📄 Transcript generated and uploaded.'
      : '📄 Transcript generated locally.',
  });
}

async function showAddUserModal(interaction, ticket) {
  if (!can(interaction, TICKET_ACTIONS.UPDATE, ticket)) {
    return deny(interaction, 'You cannot add users to tickets.');
  }

  if (alreadyHandled(interaction)) return true;

  const modal = new ModalBuilder()
    .setCustomId(MODAL_IDS.ADD_USER)
    .setTitle('Add User To Ticket');

  const userId = new TextInputBuilder()
    .setCustomId(INPUT_IDS.ADD_USER_ID)
    .setLabel('User ID')
    .setPlaceholder('Paste the Discord user ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(32);

  modal.addComponents(
    new ActionRowBuilder().addComponents(userId)
  );

  return interaction.showModal(modal);
}

async function showPrioritySelect(interaction, ticket) {
  if (!can(interaction, TICKET_ACTIONS.UPDATE, ticket)) {
    return deny(interaction, 'You cannot change ticket priority.');
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(SELECT_IDS.PRIORITY)
    .setPlaceholder('Choose ticket priority')
    .addOptions(
      {
        label: 'Low',
        value: ticketActions.PRIORITY.LOW,
        emoji: '🟢',
      },
      {
        label: 'Normal',
        value: ticketActions.PRIORITY.NORMAL,
        emoji: '🔵',
      },
      {
        label: 'High',
        value: ticketActions.PRIORITY.HIGH,
        emoji: '🟠',
      },
      {
        label: 'Urgent',
        value: ticketActions.PRIORITY.URGENT,
        emoji: '🔴',
      }
    );

  return safeReply(
    interaction,
    ephemeralPayload({
      content: '⚠️ Select new ticket priority:',
      components: [
        new ActionRowBuilder().addComponents(menu),
      ],
    })
  );
}

async function handleReopen(interaction, ticket) {
  if (!can(interaction, TICKET_ACTIONS.REOPEN, ticket)) {
    return deny(interaction, 'You cannot reopen tickets.');
  }

  const updated = await ticketActions.reopen(
    ticket,
    interaction.user,
    {
      client: interaction.client,
    }
  );

  await refreshTicketButtons(interaction, updated);

  return safeReply(interaction, {
    content: `🔓 Ticket reopened by <@${interaction.user.id}>.`,
  });
}

async function handleDelete(
  interaction,
  ticket
) {
  if (
    !can(
      interaction,
      TICKET_ACTIONS.DELETE,
      ticket
    )
  ) {
    return deny(
      interaction,
      'You cannot delete tickets.'
    );
  }

  if (alreadyHandled(interaction)) {
    return true;
  }

  const modal =
    new ModalBuilder()
      .setCustomId(
        MODAL_IDS.DELETE_CONFIRM
      )
      .setTitle(
        'Delete Ticket'
      );

  const confirm =
    new TextInputBuilder()
      .setCustomId(
        INPUT_IDS.DELETE_CONFIRM
      )
      .setLabel(
        'Type DELETE to confirm'
      )
      .setPlaceholder(
        'DELETE'
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true)
      .setMaxLength(20);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      confirm
    )
  );

  return interaction.showModal(
    modal
  );
}

async function handleTicketButton(interaction) {
  if (!interaction.isButton()) return false;

  if (!isTicketButton(interaction.customId)) {
    return false;
  }

  const ticket = await getTicketForInteraction(interaction);

if (!ticket) {
  await safeReply(
    interaction,
    ephemeralPayload({
      content:
        '⚠️ No ticket record found for this channel.',
    })
  );

  return true;
}

  try {
    switch (interaction.customId) {
      case CUSTOM_IDS.CLAIM:
        await handleClaim(interaction, ticket);
        return true;

      case CUSTOM_IDS.CLOSE:
        await showCloseModal(interaction, ticket);
        return true;

      case CUSTOM_IDS.ARCHIVE:
        await handleArchive(interaction, ticket);
        return true;

      case CUSTOM_IDS.TRANSCRIPT:
        await handleTranscript(interaction, ticket);
        return true;

      case CUSTOM_IDS.ADD_USER:
        await showAddUserModal(interaction, ticket);
        return true;

      case CUSTOM_IDS.PRIORITY:
        await showPrioritySelect(interaction, ticket);
        return true;

      case CUSTOM_IDS.REOPEN:
        await handleReopen(interaction, ticket);
        return true;

      case CUSTOM_IDS.DELETE:
        await handleDelete(interaction, ticket);
        return true;

      default:
        return false;
    }
  } catch (error) {
    await safeEditOrReply(
      interaction,
      ephemeralPayload({
        content: `❌ Ticket action failed: ${error.message}`,
      })
    );

    return true;
  }
}

async function handleTicketModal(interaction) {
  if (!interaction.isModalSubmit()) return false;

  if (
    interaction.customId.startsWith(
      MODAL_IDS.PANEL_APPEARANCE
    )
  ) {
    const [, panelId, field] = interaction.customId.split(':');

    const value = interaction.fields.getTextInputValue(
      INPUT_IDS.APPEARANCE_VALUE
    );

    const panel = ticketStore.getPanel(
      interaction.guildId,
      panelId
    );

    if (!panel) {
      await safeReply(
        interaction,
        ephemeralPayload({
          content: '❌ Ticket panel not found.',
        })
      );

      return true;
    }

    const updated = ticketStore.updatePanel(
      interaction.guildId,
      panelId,
      {
        appearance: {
          ...(panel.appearance || {}),
          [field]: value || null,
        },
      }
    );

    if (updated?.deployed && interaction.guild) {
      await refreshDeployedPanel({
        guild: interaction.guild,
        panel: updated,
      }).catch(() => null);
    }

    await safeReply(
      interaction,
      ephemeralPayload({
        content: `✅ Updated panel appearance: \`${field}\`.`,
      })
    );

    return true;
  }

  if (!isTicketModal(interaction.customId)) {
    return false;
  }

  const ticket = await getTicketForInteraction(interaction);

  if (!ticket) {
    await safeReply(
      interaction,
      ephemeralPayload({
        content: '⚠️ No ticket record found for this channel.',
      })
    );

    return true;
  }

  try {
    if (interaction.customId === MODAL_IDS.DELETE_CONFIRM) {
      const confirm = interaction.fields
        .getTextInputValue(INPUT_IDS.DELETE_CONFIRM)
        .trim();

      if (confirm.toUpperCase() !== 'DELETE') {
        await safeReply(
          interaction,
          ephemeralPayload({
            content: '❌ Delete confirmation failed.',
          })
        );

        return true;
      }

      const deferred = await safeDefer(interaction, true);
      if (!deferred) return true;

      await ticketActions.deleteTicket(
        ticket,
        interaction.user,
        {
          client: interaction.client,
          reason: 'Deleted from ticket channel',
        }
      );

      await safeEditOrReply(interaction, {
        content: '🗑️ Ticket deleted.',
      });

      return true;
    }

    if (interaction.customId === MODAL_IDS.CLOSE) {
      const reason =
        interaction.fields.getTextInputValue(
          INPUT_IDS.CLOSE_REASON
        ) || 'No reason provided';

      const deferred = await safeDefer(interaction, true);
      if (!deferred) return true;

      const updated = await ticketActions.close(
        ticket,
        interaction.user,
        {
          client: interaction.client,
          reason,
        }
      );

      await refreshTicketButtons(interaction, updated);

      await safeEditOrReply(interaction, {
        content: '🔒 Ticket closed and transcript generated.',
      });

      return true;
    }

    if (interaction.customId === MODAL_IDS.ADD_USER) {
      const userId = interaction.fields
        .getTextInputValue(INPUT_IDS.ADD_USER_ID)
        .trim();

      const deferred = await safeDefer(interaction, true);
      if (!deferred) return true;

      await ticketActions.addUser(
        interaction.client,
        ticket,
        userId,
        interaction.user
      );

      await safeEditOrReply(interaction, {
        content: `👤 Added <@${userId}> to the ticket.`,
      });

      return true;
    }

    return false;
  } catch (error) {
    await safeEditOrReply(
      interaction,
      ephemeralPayload({
        content: `❌ Ticket modal action failed: ${error.message}`,
      })
    );

    return true;
  }
}

async function handleTicketSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return false;

  if (
    interaction.customId.startsWith(
      'ticket_setup:appearance_select:'
    )
  ) {
    const panelId = interaction.customId.split(':')[2];
    const field = interaction.values?.[0];

    await showAppearanceModal(
      interaction,
      panelId,
      field
    );

    return true;
  }

  if (!isTicketSelect(interaction.customId)) {
    return false;
  }

  const ticket = await getTicketForInteraction(interaction);

  if (!ticket) {
    await safeReply(
      interaction,
      ephemeralPayload({
        content: '⚠️ No ticket record found for this channel.',
      })
    );

    return true;
  }

  try {
    if (interaction.customId === SELECT_IDS.PRIORITY) {
      const priority = interaction.values[0];

      const updated =
        await ticketActions.changePriority(
          ticket,
          priority,
          interaction.user
        );

      if (alreadyHandled(interaction)) {
        await safeEditOrReply(interaction, {
          content: `⚠️ Ticket priority changed to \`${updated.priority}\`.`,
          components: [],
        });
      } else {
        await interaction
          .update({
            content: `⚠️ Ticket priority changed to \`${updated.priority}\`.`,
            components: [],
          })
          .catch(() => null);
      }

      return true;
    }

    return false;
  } catch (error) {
    await safeReply(
      interaction,
      ephemeralPayload({
        content: `❌ Ticket priority update failed: ${error.message}`,
      })
    );

    return true;
  }
}

async function handleTicketInteraction(interaction) {
  const handledPanelOpen =
    await handleTicketPanelButton(interaction, interaction.client);

  if (handledPanelOpen) return true;

  const handledSetup =
    await handleTicketSetupInteraction(interaction);

  if (handledSetup) return true;

  if (interaction.isButton()) {
    return handleTicketButton(interaction);
  }

  if (interaction.isModalSubmit()) {
    return handleTicketModal(interaction);
  }

  if (interaction.isStringSelectMenu()) {
    return handleTicketSelect(interaction);
  }

  return false;
}

module.exports = {
  MODAL_IDS,
  INPUT_IDS,
  SELECT_IDS,

  handleTicketInteraction,

  handleTicketButton,
  handleTicketModal,
  handleTicketSelect,

  findTicketByChannel,
  getTicketForInteraction,
};