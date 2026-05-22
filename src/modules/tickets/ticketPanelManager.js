// src/modules/tickets/ticketPanelManager.js

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const {
  DEFAULT_TICKET_PANEL,
  TICKET_SOURCE,
} = require('./ticketDefaults');

const {
  getPanels,
  savePanels,
} = require('./ticketStore');

const {
  createNewTicket,
} = require('./ticketManager');

const {
  createTicketChannel,
} = require('./ticketChannelManager');

const {
  getTicketActionRows,
} = require('./ticketChannelButtons');

const ticketGuard = require('./ticketGuard');

function getTicketChannelId(ticket) {
  return ticket?.discordChannelId || ticket?.channelId || null;
}

function buildPanelEmbed(panel = DEFAULT_TICKET_PANEL) {
  return new EmbedBuilder()
    .setTitle(panel.title || 'Open a Ticket')
    .setDescription(
      panel.description ||
        'Need help? Open a ticket and our staff team will assist you.'
    )
    .setTimestamp();
}

function buildPanelButtons(panel = DEFAULT_TICKET_PANEL) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_open:${panel.panelId}`)
        .setLabel(panel.buttonLabel || 'Open Ticket')
        .setStyle(ButtonStyle[panel.buttonStyle] || ButtonStyle.Primary)
    ),
  ];
}

function createPanel(guildId, panelData = {}) {
  const data = getPanels(guildId);

  const panel = {
    ...DEFAULT_TICKET_PANEL,
    ...panelData,
    panelId:
      panelData.panelId ||
      `panel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.panels.push(panel);
  savePanels(guildId, data);

  return panel;
}

function getPanel(guildId, panelId) {
  const data = getPanels(guildId);

  return (
    data.panels.find(
      (panel) => panel.panelId === panelId
    ) || null
  );
}

function updatePanel(guildId, panelId, updates = {}) {
  const data = getPanels(guildId);

  const index = data.panels.findIndex(
    (panel) => panel.panelId === panelId
  );

  if (index === -1) return null;

  data.panels[index] = {
    ...data.panels[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  savePanels(guildId, data);

  return data.panels[index];
}

function deletePanel(guildId, panelId) {
  const data = getPanels(guildId);
  const before = data.panels.length;

  data.panels = data.panels.filter(
    (panel) => panel.panelId !== panelId
  );

  savePanels(guildId, data);

  return before !== data.panels.length;
}

async function deployPanel({ guild, channel, panel } = {}) {
  if (!guild || !channel || !panel) {
    return null;
  }

  const message = await channel.send({
    embeds: [buildPanelEmbed(panel)],
    components: buildPanelButtons(panel),
  });

  return updatePanel(guild.id, panel.panelId, {
    panelChannelId: channel.id,
    channelId: channel.id,
    messageId: message.id,
  });
}

async function sendTicketControlMessage({
  channel,
  ticket,
  panel,
  user,
} = {}) {
  if (!channel || !ticket) return null;

  const ticketTitle = ticket.title || panel?.name || 'Ticket';

  const embed = new EmbedBuilder()
    .setTitle(`🎫 ${ticketTitle}`)
    .setDescription(
      [
        `Ticket opened by <@${user?.id || ticket.creatorId}>.`,
        '',
        '**Staff Controls**',
        'Use the buttons below to claim, close, archive, generate transcripts, add users, or change priority.',
      ].join('\n')
    )
    .addFields(
      {
        name: 'Ticket ID',
        value: `\`${ticket.displayId || ticket.ticketId || 'Unknown'}\``,
        inline: true,
      },
      {
        name: 'Status',
        value: `\`${ticket.status || 'open'}\``,
        inline: true,
      },
      {
        name: 'Priority',
        value: `\`${ticket.priority || panel?.ticketPriority || 'normal'}\``,
        inline: true,
      },
      {
        name: 'Panel',
        value: `\`${panel?.name || panel?.panelId || 'Unknown'}\``,
        inline: true,
      }
    )
    .setTimestamp();

  return channel.send({
    content: `<@${user?.id || ticket.creatorId}>`,
    embeds: [embed],
    components: getTicketActionRows(ticket, {
      allowReopen: true,
      allowDelete: true,
    }),
  });
}

async function handleTicketPanelButton(interaction, client) {
  if (!interaction.isButton()) return false;

  const customId = interaction.customId || '';

  if (!customId.startsWith('ticket_open:')) {
    return false;
  }

  const panelId = customId.split(':')[1];
  const guild = interaction.guild;

  if (!guild) {
    await interaction.reply({
      content: 'Tickets can only be opened inside a server.',
      ephemeral: true,
    });

    return true;
  }

  const panel = getPanel(guild.id, panelId);

  if (!panel || !panel.enabled) {
    await interaction.reply({
      content: 'This ticket panel is no longer available.',
      ephemeral: true,
    });

    return true;
  }

  const guard = await ticketGuard.canCreateTicket({
    guildId: guild.id,
    userId: interaction.user.id,
    type: panel.ticketType,
    cooldownMs: panel.cooldownMs || 60 * 1000,
    oneActivePerType: panel.oneActivePerType !== false,
  });

  if (!guard.allowed) {
    const existingChannelId = getTicketChannelId(guard.ticket);

    await interaction.reply({
      content: existingChannelId
        ? `${guard.reason}\nExisting ticket: <#${existingChannelId}>`
        : guard.reason,
      ephemeral: true,
    });

    return true;
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  const ticket = await createNewTicket({
    guildId: guild.id,
    creatorId: interaction.user.id,
    type: panel.ticketType,
    title: `${panel.name || 'Ticket'} - ${interaction.user.username}`,
    description: `Ticket opened by <@${interaction.user.id}>.`,
    priority: panel.ticketPriority,
    source: TICKET_SOURCE.DISCORD_PANEL,
    sourceId: panel.panelId,
    metadata: {
      panelId: panel.panelId,
      openedFromChannelId: interaction.channelId,
      logsChannelId: panel.logsChannelId || null,
      transcriptsChannelId: panel.transcriptsChannelId || null,
      archiveCategoryId: panel.archiveCategoryId || null,
    },
  });

  await ticketGuard.markTicketCreated({
    guildId: guild.id,
    userId: interaction.user.id,
    type: panel.ticketType,
  });

  const channel = await createTicketChannel({
    client,
    guild,
    ticket,
    panel,
  });

  if (channel) {
    await sendTicketControlMessage({
      channel,
      ticket: {
        ...ticket,
        discordChannelId: channel.id,
      },
      panel,
      user: interaction.user,
    });
  }

  await interaction.editReply({
    content: channel
      ? `Ticket created: <#${channel.id}>`
      : 'Ticket created, but I could not create the Discord channel.',
  });

  return true;
}

module.exports = {
  buildPanelEmbed,
  buildPanelButtons,

  createPanel,
  getPanel,
  updatePanel,
  deletePanel,
  deployPanel,

  sendTicketControlMessage,
  handleTicketPanelButton,

  getTicketChannelId,
};