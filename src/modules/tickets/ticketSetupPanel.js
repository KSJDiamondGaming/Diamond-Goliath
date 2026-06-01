// src/modules/tickets/ticketSetupPanel.js

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');

const {
  TICKET_TYPES,
  TICKET_PRIORITY,
} = require('./ticketDefaults');

const { getPanels, getAllTickets } = require('./ticketStore');

const {
  createPanel,
  getPanel,
  updatePanel,
  deployPanel,
  undeployPanel,
  redeployPanel,
  deletePanel,
  refreshDeployedPanel,
} = require('./ticketPanelManager');

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
      return interaction.followUp(payload).catch((error) => {
        console.error('[TicketsSetup] followUp failed:', error);
        return null;
      });
    }

    return interaction.reply(payload).catch((error) => {
      console.error('[TicketsSetup] reply failed:', error);
      return null;
    });
  } catch (error) {
    console.error('[TicketsSetup] safeReply failed:', error);
    return null;
  }
}

async function safeEditOrReply(interaction, payload = {}) {
  try {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload).catch((error) => {
        console.error('[TicketsSetup] editReply failed:', error);
        return null;
      });
    }

    return interaction.reply(payload).catch((error) => {
      console.error('[TicketsSetup] reply failed:', error);
      return null;
    });
  } catch (error) {
    console.error('[TicketsSetup] safeEditOrReply failed:', error);
    return null;
  }
}

async function safeUpdate(interaction, payload = {}) {
  try {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload).catch((error) => {
        console.error('[TicketsSetup] editReply failed:', error);
        return null;
      });
    }

    return interaction.update(payload).catch(async (error) => {
      console.error('[TicketsSetup] update failed:', error);

      return interaction
        .reply(
          ephemeralPayload({
            content:
              '❌ Ticket setup panel failed to update. Check VPS logs.',
          })
        )
        .catch(() => null);
    });
  } catch (error) {
    console.error('[TicketsSetup] safeUpdate failed:', error);
    return null;
  }
}

async function safeDefer(interaction, ephemeral = true) {
  if (alreadyHandled(interaction)) return true;

  try {
    await interaction.deferReply(
      ephemeral ? { flags: MessageFlags.Ephemeral } : {}
    );

    return true;
  } catch (error) {
    if (error?.code === 10062 || error?.code === 40060) {
      return false;
    }

    throw error;
  }
}

function getPanelList(guildId) {
  const data = getPanels(guildId);
  return Array.isArray(data?.panels) ? data.panels : [];
}

function getTicketList(guildId) {
  try {
    return getAllTickets(guildId);
  } catch {
    return [];
  }
}

function getStatusText(panel) {
  if (panel?.deployed) return '🟢 Deployed';
  if (panel?.enabled === false) return '🔴 Disabled';
  return '🟡 Draft';
}

function getSetupStats(guildId) {
  const panels = getPanelList(guildId);
  const tickets = getTicketList(guildId);

  const deployedPanels = panels.filter((panel) => panel.deployed).length;
  const draftPanels = panels.filter((panel) => !panel.deployed).length;
  const activeTickets = tickets.filter((ticket) =>
    ['open', 'claimed', 'pending'].includes(
      String(ticket.status || 'open').toLowerCase()
    )
  ).length;

  return {
    panels,
    totalPanels: panels.length,
    deployedPanels,
    draftPanels,
    activeTickets,
  };
}

function buildSetupEmbed(guildId) {
  const stats = getSetupStats(guildId);

  return new EmbedBuilder()
    .setTitle('🎫 Goliath Tickets')
    .setDescription(
      [
        '**Realtime Platform Expansion**',
        '',
        'Manage ticket panels, deployments, staff access, and ticket routing.',
        '',
        `**Panels:** \`${stats.totalPanels}\``,
        `**Deployed:** \`${stats.deployedPanels}\``,
        `**Drafts:** \`${stats.draftPanels}\``,
        `**Active Tickets:** \`${stats.activeTickets}\``,
        '',
        'Use the controls below to create or manage panels.',
      ].join('\n')
    )
    .setColor('#5865F2')
    .setFooter({ text: 'KSJ Goliath • Ticket System' })
    .setTimestamp();
}

function buildPanelSelect(guildId) {
  const panels = getPanelList(guildId).slice(0, 25);

  if (!panels.length) return null;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_setup:select_panel')
      .setPlaceholder('Manage an existing ticket panel')
      .addOptions(
        panels.map((panel) => ({
          label: String(panel.name || 'Ticket Panel').slice(0, 100),
          description: `${panel.ticketType || 'support'} • ${
            panel.deployed ? 'deployed' : panel.status || 'draft'
          }`,
          value: panel.panelId,
        }))
      )
  );
}

function buildSetupButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_setup:create_support')
      .setLabel('Create Support')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎫'),

    new ButtonBuilder()
      .setCustomId('ticket_setup:create_appeal')
      .setLabel('Create Appeal')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⚖️'),

    new ButtonBuilder()
      .setCustomId('ticket_setup:refresh')
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔄')
  );
}

function buildEditorEmbed(panel) {
  const appearance = panel.appearance || {};

  return new EmbedBuilder()
    .setTitle(`🛠️ ${panel.name}`)
    .setDescription(
      [
        `**Panel ID:** \`${panel.panelId}\``,
        `**Status:** ${getStatusText(panel)}`,
        `**Type:** \`${panel.ticketType || 'support'}\``,
        `**Priority:** \`${panel.ticketPriority || 'normal'}\``,
        '',
        '**Routing**',
        `Deploy Channel: ${
          panel.deployChannelId ? `<#${panel.deployChannelId}>` : '`Not set`'
        }`,
        `Output Category: ${
          panel.outputCategoryId ? `<#${panel.outputCategoryId}>` : '`Not set`'
        }`,
        `Logs Channel: ${
          panel.logsChannelId ? `<#${panel.logsChannelId}>` : '`Not set`'
        }`,
        `Archive Category: ${
          panel.archiveCategoryId ? `<#${panel.archiveCategoryId}>` : '`Not set`'
        }`,
        '',
        '**Appearance**',
        `Title: \`${appearance.title || 'Not set'}\``,
        `Color: \`${appearance.color || '#5865F2'}\``,
        `Button: \`${appearance.buttonEmoji || '🎫'} ${
          appearance.buttonLabel || 'Open Ticket'
        }\``,
        `Image: ${appearance.imageUrl ? '`Configured`' : '`Not set`'}`,
        `Thumbnail: ${appearance.thumbnailUrl ? '`Configured`' : '`Not set`'}`,
        `Footer: \`${appearance.footerText || 'Not set'}\``,
      ].join('\n')
    )
    .setColor(appearance.color || '#5865F2')
    .setFooter({ text: 'Set deploy channel + ticket category before deploying.' })
    .setTimestamp();
}

function buildAppearanceEditor(panelId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ticket_setup:appearance_select:${panelId}`)
      .setPlaceholder('🎨 Edit Panel Appearance')
      .addOptions([
        { label: 'Edit Title', value: 'title', emoji: '📝' },
        { label: 'Edit Description', value: 'description', emoji: '📄' },
        { label: 'Edit Embed Color', value: 'color', emoji: '🎨' },
        { label: 'Edit Button Label', value: 'buttonLabel', emoji: '🔘' },
        { label: 'Edit Button Emoji', value: 'buttonEmoji', emoji: '😀' },
        { label: 'Edit Banner Image', value: 'imageUrl', emoji: '🖼️' },
        { label: 'Edit Thumbnail', value: 'thumbnailUrl', emoji: '📷' },
        { label: 'Edit Footer', value: 'footerText', emoji: '📌' },
      ])
  );
}

function buildEditorControls(panelId) {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`ticket_setup:set_output:${panelId}`)
        .setPlaceholder('📁 Ticket Category')
        .setChannelTypes(ChannelType.GuildCategory)
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`ticket_setup:set_deploy:${panelId}`)
        .setPlaceholder('📢 Panel Channel')
        .setChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`ticket_setup:set_staff:${panelId}`)
        .setPlaceholder('👥 Staff Roles')
        .setMinValues(0)
        .setMaxValues(10)
    ),

    buildAppearanceEditor(panelId),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_setup:deploy:${panelId}`)
        .setLabel('Deploy')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🚀'),

      new ButtonBuilder()
        .setCustomId(`ticket_setup:redeploy:${panelId}`)
        .setLabel('Redeploy')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔄'),

      new ButtonBuilder()
        .setCustomId(`ticket_setup:undeploy:${panelId}`)
        .setLabel('Undeploy')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📦'),

      new ButtonBuilder()
        .setCustomId(`ticket_setup:delete:${panelId}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️'),

      new ButtonBuilder()
        .setCustomId('ticket_setup:back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
    ),
  ];
}