// src/modules/feedbackStudio/tickets/ticketSetupPanel.js

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');

const {
  TICKET_TYPES,
  TICKET_PRIORITY,
} = require('./ticketDefaults');

const {
  getPanels,
  getAllTickets,
} = require('./ticketStore');

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

const SETUP_PREFIX = 'ticket_setup';

const MODAL_IDS = {
  SET_LIMIT: `${SETUP_PREFIX}:limit_modal`,
  SET_COOLDOWN: `${SETUP_PREFIX}:cooldown_modal`,
  APPEARANCE: `${SETUP_PREFIX}:appearance_modal`,
};

const INPUT_IDS = {
  LIMIT: 'ticket_limit',
  COOLDOWN: 'ticket_cooldown',
  APPEARANCE_VALUE: 'appearance_value',
};

const PANEL_TYPE_UI = {
  support: {
    emoji: '🎟️',
    name: 'General Support',
    label: 'Create Support',
    title: 'Need Support?',
    description: 'Press the button below to open a private support ticket.',
    buttonLabel: 'Open Support Ticket',
    buttonEmoji: '🎟️',
  },
  appeal: {
    emoji: '⚖️',
    name: 'Ban Appeal',
    label: 'Create Appeal',
    title: 'Submit an Appeal',
    description: 'Press the button below to open a private appeal ticket.',
    buttonLabel: 'Open Appeal Ticket',
    buttonEmoji: '⚖️',
  },
  report: {
    emoji: '🚨',
    name: 'Reports',
    label: 'Create Report',
    title: 'Submit a Report',
    description: 'Press the button below to report an issue privately.',
    buttonLabel: 'Open Report Ticket',
    buttonEmoji: '🚨',
  },
  application: {
    emoji: '📝',
    name: 'Applications',
    label: 'Create Application',
    title: 'Submit an Application',
    description: 'Press the button below to open a private application ticket.',
    buttonLabel: 'Open Application Ticket',
    buttonEmoji: '📝',
  },
};

function getPanelTypeUi(type = 'support') {
  return PANEL_TYPE_UI[String(type || 'support').toLowerCase()] || PANEL_TYPE_UI.support;
}

const APPEARANCE_FIELDS = {
  title: {
    label: 'Embed Title',
    placeholder: 'Need Support?',
    style: TextInputStyle.Short,
    maxLength: 256,
  },
  description: {
    label: 'Embed Description',
    placeholder: 'Press the button below to open a ticket.',
    style: TextInputStyle.Paragraph,
    maxLength: 2000,
  },
  color: {
    label: 'Embed Color',
    placeholder: '#5865F2',
    style: TextInputStyle.Short,
    maxLength: 20,
  },
  buttonLabel: {
    label: 'Button Label',
    placeholder: 'Open Ticket',
    style: TextInputStyle.Short,
    maxLength: 80,
  },
  buttonEmoji: {
    label: 'Button Emoji',
    placeholder: '🎫',
    style: TextInputStyle.Short,
    maxLength: 50,
  },
  footerText: {
    label: 'Footer Text',
    placeholder: 'Goliath • Ticket System',
    style: TextInputStyle.Short,
    maxLength: 2048,
  },
  imageUrl: {
    label: 'Image URL',
    placeholder: 'https://example.com/banner.png',
    style: TextInputStyle.Short,
    maxLength: 1000,
  },
  thumbnailUrl: {
    label: 'Thumbnail URL',
    placeholder: 'https://example.com/icon.png',
    style: TextInputStyle.Short,
    maxLength: 1000,
  },
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

    if (typeof interaction.update === 'function') {
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
    }

    return interaction.reply(ephemeralPayload(payload)).catch((error) => {
      console.error('[TicketsSetup] reply failed:', error);
      return null;
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

function formatLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatRoleCount(ids = []) {
  if (!Array.isArray(ids) || !ids.length) return '`None`';
  return `\`${ids.length}\``;
}

function formatLimit(value) {
  const limit = Number(value ?? 2);

  if (!Number.isFinite(limit)) return '`2`';
  if (limit <= 0) return '`Unlimited`';

  return `\`${Math.floor(limit)}\``;
}

function formatCooldown(ms) {
  const value = Number(ms ?? 60 * 1000);

  if (!Number.isFinite(value) || value <= 0) return '`Off`';

  const seconds = Math.floor(value / 1000);
  if (seconds < 60) return `\`${seconds}s\``;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `\`${minutes}m\``;

  const hours = Math.floor(minutes / 60);
  return `\`${hours}h\``;
}

function getPanelLimit(panel = {}) {
  return Number(
    panel.maxOpenTicketsPerUser ??
      panel.maxActiveTicketsPerUser ??
      2
  );
}

function getPanelCooldownMs(panel = {}) {
  return Number(panel.cooldownMs ?? 60 * 1000);
}

function getSetupStats(guildId) {
  const panels = getPanelList(guildId);
  const tickets = getTicketList(guildId);

  const deployedPanels = panels.filter((panel) => panel.deployed).length;
  const draftPanels = panels.filter((panel) => !panel.deployed).length;

  const activeTickets = tickets.filter((ticket) =>
    [
      'open',
      'claimed',
      'pending',
      'waiting_user',
      'in_review',
      'approved',
      'denied',
    ].includes(String(ticket.status || 'open').toLowerCase())
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
    .setTitle('🎟️ Goliath Tickets')
    .setDescription(
      [
        '**Realtime Platform Expansion**',
        '',
        'Manage ticket panels, deployments, staff access, ticket limits, cooldowns, and routing.',
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
    .setFooter({ text: 'Goliath • Ticket System' })
    .setTimestamp();
}

function buildPanelSelect(guildId) {
  const panels = getPanelList(guildId).slice(0, 25);

  if (!panels.length) return null;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_setup:select_panel')
      .setPlaceholder('👥 Manage an existing ticket panel')
      .addOptions(
        panels.map((panel) => {
          const ui = getPanelTypeUi(panel.ticketType);

          return {
            label: String(panel.name || ui.name || 'Ticket Panel').slice(0, 100),
            description: `${formatLabel(panel.ticketType || 'Support')} • ${formatLabel(
              panel.deployed ? 'Deployed' : panel.status || 'Draft'
            )}`,
            value: panel.panelId,
            emoji: ui.emoji,
          };
        })
      )
  );
}

function buildSetupButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_setup:create_support')
      .setLabel('Create Support')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎟️'),

    new ButtonBuilder()
      .setCustomId('ticket_setup:create_appeal')
      .setLabel('Create Appeal')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⚖️'),

    new ButtonBuilder()
      .setCustomId('ticket_setup:create_report')
      .setLabel('Create Report')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🚨'),

    new ButtonBuilder()
      .setCustomId('ticket_setup:create_application')
      .setLabel('Create Application')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📝'),

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
    .setTitle(`🎛️ ${panel.name}`)
    .setDescription(
      [
        `**Panel ID:** \`${panel.panelId}\``,
        `**Status:** ${getStatusText(panel)}`,
        `**Type:** \`${formatLabel(panel.ticketType || 'support')}\``,
        `**Priority:** \`${formatLabel(panel.ticketPriority || 'low')}\``,

        '',
        '**Routing**',
        `📁 Ticket Category: ${
          panel.outputCategoryId
            ? `<#${panel.outputCategoryId}>`
            : '`Not set`'
        }`,
        `📢 Panel Channel: ${
          panel.deployChannelId
            ? `<#${panel.deployChannelId}>`
            : '`Not set`'
        }`,
        `📜 Logs Channel: ${
          panel.logsChannelId
            ? `<#${panel.logsChannelId}>`
            : '`Not set`'
        }`,
        `📦 Archive Category: ${
          panel.archiveCategoryId
            ? `<#${panel.archiveCategoryId}>`
            : '`Not set`'
        }`,

        '',
        '**Management Summary**',
        `⚙️ Manage Ticket: \`Appearance, limits, cooldowns and roles\``,
        `🎟️ Ticket Limit: ${formatLimit(getPanelLimit(panel))}`,
        `⏱️ Cooldown: ${formatCooldown(getPanelCooldownMs(panel))}`,
        `🔒 One Active Per Type: \`${
          panel.oneActivePerType === false
            ? 'Off'
            : 'On'
        }\``,

        '',
        '**Roles**',
        `👥 Staff Roles: ${formatRoleCount(panel.staffRoleIds)}`,
        `🛡️ Manager Roles: ${formatRoleCount(panel.managerRoleIds)}`,
        `👁️ Viewer Roles: ${formatRoleCount(panel.viewerRoleIds)}`,

        '',
        '**Appearance**',
        `🎨 Appearance: \`Embed, button, colors and layout\``,
        `🎨 Embed Title: \`${appearance.title || 'Not set'}\``,
        `🧾 Embed Description: \`${
          appearance.description
            ? 'Configured'
            : 'Not set'
        }\``,
        `🎨 Embed Color: \`${appearance.color || '#5865F2'}\``,
        `🔘 Button: \`${appearance.buttonEmoji || '🎫'} ${
          appearance.buttonLabel || 'Open Ticket'
        }\``,
      ].join('\n')
    )
    .setColor(appearance.color || '#5865F2')
    .setFooter({
      text: 'Use Manage Ticket for appearance, limits, cooldowns and roles.',
    })
    .setTimestamp();
}

function buildManagementEmbed(panel) {
  const appearance = panel.appearance || {};

  return new EmbedBuilder()
    .setTitle(`⚙️ Manage Ticket • ${panel.name}`)
    .setDescription(
      [
        `**Panel ID:** \`${panel.panelId}\``,
        '',
        '**Appearance**',
        `🎨 Title: \`${appearance.title || 'Not set'}\``,
        `🧾 Description: \`${appearance.description ? 'Configured' : 'Not set'}\``,
        `🎨 Color: \`${appearance.color || '#5865F2'}\``,
        `🔘 Button: \`${appearance.buttonEmoji || '🎫'} ${
          appearance.buttonLabel || 'Open Ticket'
        }\``,
        '',
        '**Ticket Controls**',
        `🎟️ Ticket Limit: ${formatLimit(getPanelLimit(panel))}`,
        `⏱️ Cooldown: ${formatCooldown(getPanelCooldownMs(panel))}`,
        `🔒 One Active Per Type: \`${panel.oneActivePerType === false ? 'Off' : 'On'}\``,
        '',
        '**Roles**',
        `👥 Staff Roles: ${formatRoleCount(panel.staffRoleIds)}`,
        `🛡️ Manager Roles: ${formatRoleCount(panel.managerRoleIds)}`,
        `👁️ Viewer Roles: ${formatRoleCount(panel.viewerRoleIds)}`,
      ].join('\n')
    )
    .setColor(appearance.color || '#5865F2')
    .setFooter({ text: 'Configure all ticket settings in one place.' })
    .setTimestamp();
}

function buildRoleEditorEmbed(panel) {
  return new EmbedBuilder()
    .setTitle(`👥 Manage Roles • ${panel.name}`)
    .setDescription(
      [
        `**Panel ID:** \`${panel.panelId}\``,
        '',
        '**Current Roles**',
        `👥 Staff Roles: ${formatRoleCount(panel.staffRoleIds)}`,
        `🛡️ Manager Roles: ${formatRoleCount(panel.managerRoleIds)}`,
        `👁️ Viewer Roles: ${formatRoleCount(panel.viewerRoleIds)}`,
        '',
        '**Role Access**',
        '👥 Staff can claim, update, close, reopen and archive tickets.',
        '🛡️ Managers can do staff actions plus delete/manage higher-level controls.',
        '👁️ Viewers can read tickets but cannot send messages.',
      ].join('\n')
    )
    .setColor('#5865F2')
    .setFooter({ text: 'Goliath • Ticket Role Editor' })
    .setTimestamp();
}

function buildAppearanceEmbed(panel) {
  const appearance = panel.appearance || {};

  return new EmbedBuilder()
    .setTitle(`🎨 Appearance • ${panel.name}`)
    .setDescription(
      [
        `**Panel ID:** \`${panel.panelId}\``,
        '',
        '**Current Appearance**',
        `🎨 Embed Title: \`${appearance.title || 'Not set'}\``,
        `🧾 Description: \`${appearance.description ? 'Configured' : 'Not set'}\``,
        `🎨 Embed Color: \`${appearance.color || '#5865F2'}\``,
        `🖼️ Image: \`${appearance.imageUrl ? 'Configured' : 'Not set'}\``,
        `🖼️ Thumbnail: \`${appearance.thumbnailUrl ? 'Configured' : 'Not set'}\``,
        `🔘 Button Label: \`${appearance.buttonLabel || 'Open Ticket'}\``,
        `😀 Button Emoji: \`${appearance.buttonEmoji || '🎫'}\``,
        `📝 Footer Text: \`${appearance.footerText || 'Not set'}\``,
        '',
        'Choose what you want to edit from the dropdown below.',
      ].join('\n')
    )
    .setColor(appearance.color || '#5865F2')
    .setFooter({ text: 'Goliath • Ticket Appearance Editor' })
    .setTimestamp();
}

function buildDeploymentRow(panelId) {
  return new ActionRowBuilder().addComponents(
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
      .setEmoji('📦')
  );
}

function buildManagementRow(panelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_setup:management:${panelId}`)
      .setLabel('Manage Ticket')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⚙️'),

    new ButtonBuilder()
      .setCustomId(`ticket_setup:refresh_deployed:${panelId}`)
      .setLabel('Refresh Panel')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('♻️')
  );
}

function buildDangerBackRow(panelId) {
  return new ActionRowBuilder().addComponents(
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
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1)
    ),

    buildDeploymentRow(panelId),
    buildManagementRow(panelId),
    buildDangerBackRow(panelId),
  ];
}

function buildEditorControlsForPanel(panel) {
  return buildEditorControls(panel.panelId);
}

function buildManagementControls(panel) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_setup:appearance:${panel.panelId}`)
        .setLabel('Appearance')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎨'),

      new ButtonBuilder()
        .setCustomId(`ticket_setup:roles:${panel.panelId}`)
        .setLabel('Manage Roles')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('👥'),

      new ButtonBuilder()
        .setCustomId(`ticket_setup:set_limit:${panel.panelId}`)
        .setLabel('Ticket Limit')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎟️')
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_setup:toggle_one_active:${panel.panelId}`)
        .setLabel(panel.oneActivePerType === false ? 'One Active: Off' : 'One Active: On')
        .setStyle(panel.oneActivePerType === false ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setEmoji('🔒'),

      new ButtonBuilder()
        .setCustomId(`ticket_setup:set_cooldown:${panel.panelId}`)
        .setLabel('Cooldown')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏱️'),

      new ChannelSelectMenuBuilder()
        .setCustomId(`ticket_setup:set_logs:${panel.panelId}`)
        .setPlaceholder(
          panel.logsChannelId
            ? '📜 Logs Channel • Set'
            : '📜 Logs Channel'
        )
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1),

      new ButtonBuilder()
        .setCustomId(`ticket_setup:back_panel:${panel.panelId}`)
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
    ),
  ];
}

function buildRoleEditorControls(panel) {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`ticket_setup:set_staff:${panel.panelId}`)
        .setPlaceholder(
          Array.isArray(panel.staffRoleIds) && panel.staffRoleIds.length
            ? `👥 Staff Roles • ${panel.staffRoleIds.length} selected`
            : '👥 Staff Roles'
        )
        .setMinValues(0)
        .setMaxValues(10)
    ),

    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`ticket_setup:set_manager:${panel.panelId}`)
        .setPlaceholder(
          Array.isArray(panel.managerRoleIds) && panel.managerRoleIds.length
            ? `🛡️ Manager Roles • ${panel.managerRoleIds.length} selected`
            : '🛡️ Manager Roles'
        )
        .setMinValues(0)
        .setMaxValues(10)
    ),

    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`ticket_setup:set_viewer:${panel.panelId}`)
        .setPlaceholder(
          Array.isArray(panel.viewerRoleIds) && panel.viewerRoleIds.length
            ? `👁️ Viewer Roles • ${panel.viewerRoleIds.length} selected`
            : '👁️ Viewer Roles'
        )
        .setMinValues(0)
        .setMaxValues(10)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_setup:management:${panel.panelId}`)
        .setLabel('Back To Manage Ticket')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
    ),
  ];
}

function buildAppearanceControls(panel) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ticket_setup:appearance_select:${panel.panelId}`)
        .setPlaceholder('🎨 Choose appearance setting to edit')
        .addOptions(
          {
            label: 'Embed Title',
            description: 'Change the panel embed title',
            value: 'title',
            emoji: '🎨',
          },
          {
            label: 'Embed Description',
            description: 'Change the panel embed description',
            value: 'description',
            emoji: '🧾',
          },
          {
            label: 'Embed Color',
            description: 'Set the panel HEX color',
            value: 'color',
            emoji: '🎨',
          },
          {
            label: 'Image URL',
            description: 'Set a large image/banner',
            value: 'imageUrl',
            emoji: '🖼️',
          },
          {
            label: 'Thumbnail URL',
            description: 'Set a small thumbnail/icon',
            value: 'thumbnailUrl',
            emoji: '🖼️',
          },
          {
            label: 'Button Label',
            description: 'Change the open-ticket button text',
            value: 'buttonLabel',
            emoji: '🔘',
          },
          {
            label: 'Button Emoji',
            description: 'Change the open-ticket button emoji',
            value: 'buttonEmoji',
            emoji: '😀',
          },
          {
            label: 'Footer Text',
            description: 'Change the embed footer text',
            value: 'footerText',
            emoji: '📝',
          }
        )
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_setup:management:${panel.panelId}`)
        .setLabel('Back To Manage Ticket')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
    ),
  ];
}

async function sendSetupPanel(interaction) {
  const components = [buildSetupButtons()];
  const panelSelect = buildPanelSelect(interaction.guild.id);

  if (panelSelect) components.push(panelSelect);

  const payload = {
    embeds: [buildSetupEmbed(interaction.guild.id)],
    components,
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }

  return interaction.reply(ephemeralPayload(payload));
}

async function showSetupHome(interaction) {
  const components = [buildSetupButtons()];
  const panelSelect = buildPanelSelect(interaction.guild.id);

  if (panelSelect) components.push(panelSelect);

  return safeUpdate(interaction, {
    content: null,
    embeds: [buildSetupEmbed(interaction.guild.id)],
    components,
  });
}

async function showPanelEditor(interaction, panelId) {
  const panel = getPanel(interaction.guild.id, panelId);

  if (!panel) {
    return safeUpdate(interaction, {
      content: '❌ Ticket panel not found.',
      embeds: [],
      components: [],
    });
  }

  return safeUpdate(interaction, {
    content: null,
    embeds: [buildEditorEmbed(panel)],
    components: buildEditorControlsForPanel(panel),
  });
}

async function showManagementEditor(interaction, panelId) {
  const panel = getPanel(interaction.guild.id, panelId);

  if (!panel) {
    return safeUpdate(interaction, {
      content: '❌ Ticket panel not found.',
      embeds: [],
      components: [],
    });
  }

  return safeUpdate(interaction, {
    content: null,
    embeds: [buildManagementEmbed(panel)],
    components: buildManagementControls(panel),
  });
}

async function showRoleEditor(interaction, panelId) {
  const panel = getPanel(interaction.guild.id, panelId);

  if (!panel) {
    return safeUpdate(interaction, {
      content: '❌ Ticket panel not found.',
      embeds: [],
      components: [],
    });
  }

  return safeUpdate(interaction, {
    content: null,
    embeds: [buildRoleEditorEmbed(panel)],
    components: buildRoleEditorControls(panel),
  });
}

async function showAppearanceEditor(interaction, panelId) {
  const panel = getPanel(interaction.guild.id, panelId);

  if (!panel) {
    return safeUpdate(interaction, {
      content: '❌ Ticket panel not found.',
      embeds: [],
      components: [],
    });
  }

  return safeUpdate(interaction, {
    content: null,
    embeds: [buildAppearanceEmbed(panel)],
    components: buildAppearanceControls(panel),
  });
}

function createBasicPanel(guildId, type) {
  const existing = getPanelList(guildId).find(
    (panel) => panel.ticketType === type
  );

  if (existing) return existing;

  const isAppeal = type === TICKET_TYPES.APPEAL;
  const isReport = type === TICKET_TYPES.REPORT;
  const isApplication = type === TICKET_TYPES.APPLICATION;

  let name = 'General Support';
  let title = 'Need Support?';
  let description = 'Press the button below to open a private support ticket.';
  let buttonLabel = 'Open Support Ticket';
  let buttonEmoji = '🎫';
  let priority = TICKET_PRIORITY.LOW;
  let limit = 2;

  if (isAppeal) {
    name = 'Ban Appeal';
    title = 'Submit an Appeal';
    description = 'Press the button below to open a private appeal ticket.';
    buttonLabel = 'Open Appeal Ticket';
    buttonEmoji = '⚖️';
    priority = TICKET_PRIORITY.HIGH;
    limit = 1;
  }

  if (isReport) {
    name = 'Reports';
    title = 'Submit a Report';
    description = 'Press the button below to report an issue privately.';
    buttonLabel = 'Open Report Ticket';
    buttonEmoji = '🚨';
    priority = TICKET_PRIORITY.NORMAL;
    limit = 3;
  }

  if (isApplication) {
    name = 'Applications';
    title = 'Submit an Application';
    description = 'Press the button below to open a private application ticket.';
    buttonLabel = 'Open Application Ticket';
    buttonEmoji = '📝';
    priority = TICKET_PRIORITY.NORMAL;
    limit = 1;
  }

  return createPanel(guildId, {
    name,
    ticketType: type,
    ticketPriority: priority,
    maxOpenTicketsPerUser: limit,
    oneActivePerType: limit === 1,
    cooldownMs: 60 * 1000,
    appearance: {
      title,
      description,
      color: '#5865F2',
      buttonLabel,
      buttonEmoji,
      imageUrl: null,
      thumbnailUrl: null,
      footerText: 'Goliath • Ticket System',
    },
  });
}

async function handleNoPermission(interaction) {
  return safeReply(
    interaction,
    ephemeralPayload({
      content: '❌ You need Manage Server permission.',
    })
  );
}

async function fetchDeployChannel(interaction, panel) {
  const channelId = panel.deployChannelId;

  if (!channelId) return null;

  const channel =
    interaction.guild.channels.cache.get(channelId) ||
    (await interaction.guild.channels.fetch(channelId).catch(() => null));

  if (!channel?.isTextBased?.()) return null;

  return channel;
}

async function refreshPanelIfDeployed(interaction, panelId) {
  const panel = getPanel(interaction.guild.id, panelId);

  if (!panel?.deployed) return false;

  return refreshDeployedPanel({
    guild: interaction.guild,
    panel,
  });
}

function showLimitModal(interaction, panelId) {
  const panel = getPanel(interaction.guild.id, panelId);

  if (!panel) {
    return safeReply(
      interaction,
      ephemeralPayload({
        content: '❌ Ticket panel not found.',
      })
    );
  }

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_IDS.SET_LIMIT}:${panelId}`)
    .setTitle('Set Ticket Limit');

  const input = new TextInputBuilder()
    .setCustomId(INPUT_IDS.LIMIT)
    .setLabel('Max Open Tickets Per User')
    .setPlaceholder('0 = Unlimited, 1 = One ticket, 2 = Two tickets')
    .setValue(String(getPanelLimit(panel)))
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  modal.addComponents(new ActionRowBuilder().addComponents(input));

  return interaction.showModal(modal);
}

function showCooldownModal(interaction, panelId) {
  const panel = getPanel(interaction.guild.id, panelId);

  if (!panel) {
    return safeReply(
      interaction,
      ephemeralPayload({
        content: '❌ Ticket panel not found.',
      })
    );
  }

  const currentSeconds = Math.floor(getPanelCooldownMs(panel) / 1000);

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_IDS.SET_COOLDOWN}:${panelId}`)
    .setTitle('Set Ticket Cooldown');

  const input = new TextInputBuilder()
    .setCustomId(INPUT_IDS.COOLDOWN)
    .setLabel('Cooldown Seconds')
    .setPlaceholder('0 = Off, 60 = 1 minute, 300 = 5 minutes')
    .setValue(String(currentSeconds))
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  modal.addComponents(new ActionRowBuilder().addComponents(input));

  return interaction.showModal(modal);
}

function showAppearanceModal(interaction, panelId, field) {
  const panel = getPanel(interaction.guild.id, panelId);
  const config = APPEARANCE_FIELDS[field];

  if (!panel || !config) {
    return safeReply(
      interaction,
      ephemeralPayload({
        content: '❌ Appearance setting not found.',
      })
    );
  }

  const appearance = panel.appearance || {};
  const currentValue = appearance[field] || '';

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_IDS.APPEARANCE}:${panelId}:${field}`)
    .setTitle(config.label);

  const input = new TextInputBuilder()
    .setCustomId(INPUT_IDS.APPEARANCE_VALUE)
    .setLabel(config.label)
    .setPlaceholder(config.placeholder)
    .setValue(String(currentValue).slice(0, config.maxLength))
    .setRequired(false)
    .setStyle(config.style)
    .setMaxLength(config.maxLength);

  modal.addComponents(new ActionRowBuilder().addComponents(input));

  return interaction.showModal(modal);
}

function parseNonNegativeInteger(value) {
  const number = Number(String(value || '').trim());

  if (!Number.isFinite(number) || number < 0) return null;

  return Math.floor(number);
}

function normalizeHexColor(value) {
  const clean = String(value || '').trim();

  if (!clean) return null;

  const withHash = clean.startsWith('#') ? clean : `#${clean}`;

  if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    return false;
  }

  return withHash.toUpperCase();
}

async function handleLimitModal(interaction, panelId) {
  const rawValue = interaction.fields.getTextInputValue(INPUT_IDS.LIMIT);
  const value = parseNonNegativeInteger(rawValue);

  if (value === null) {
    return safeReply(
      interaction,
      ephemeralPayload({
        content: '❌ Invalid ticket limit. Enter 0 or a whole number above 0.',
      })
    );
  }

  updatePanel(interaction.guild.id, panelId, {
    maxOpenTicketsPerUser: value,
  });

  await refreshPanelIfDeployed(interaction, panelId);

  return safeReply(
    interaction,
    ephemeralPayload({
      content:
        value === 0
          ? '✅ Ticket limit updated: Unlimited.'
          : `✅ Ticket limit updated: ${value} open ticket${value === 1 ? '' : 's'} per user.`,
    })
  );
}

async function handleCooldownModal(interaction, panelId) {
  const rawValue = interaction.fields.getTextInputValue(INPUT_IDS.COOLDOWN);
  const seconds = parseNonNegativeInteger(rawValue);

  if (seconds === null) {
    return safeReply(
      interaction,
      ephemeralPayload({
        content: '❌ Invalid cooldown. Enter 0 or a whole number of seconds.',
      })
    );
  }

  updatePanel(interaction.guild.id, panelId, {
    cooldownMs: seconds * 1000,
  });

  await refreshPanelIfDeployed(interaction, panelId);

  return safeReply(
    interaction,
    ephemeralPayload({
      content:
        seconds === 0
          ? '✅ Ticket cooldown disabled.'
          : `✅ Ticket cooldown updated: ${seconds} second${seconds === 1 ? '' : 's'}.`,
    })
  );
}

async function handleAppearanceModal(interaction, panelId, field) {
  const config = APPEARANCE_FIELDS[field];

  if (!config) {
    return safeReply(
      interaction,
      ephemeralPayload({
        content: '❌ Appearance setting not found.',
      })
    );
  }

  let value = interaction.fields.getTextInputValue(INPUT_IDS.APPEARANCE_VALUE);
  value = String(value || '').trim();

  if (field === 'color') {
    const color = normalizeHexColor(value);

    if (color === false) {
      return safeReply(
        interaction,
        ephemeralPayload({
          content: '❌ Invalid HEX color. Use something like `#5865F2`.',
        })
      );
    }

    value = color || '#5865F2';
  }

  const panel = getPanel(interaction.guild.id, panelId);

  if (!panel) {
    return safeReply(
      interaction,
      ephemeralPayload({
        content: '❌ Ticket panel not found.',
      })
    );
  }

  updatePanel(interaction.guild.id, panelId, {
    appearance: {
      ...(panel.appearance || {}),
      [field]: value || null,
    },
  });

  await refreshPanelIfDeployed(interaction, panelId);

  return safeReply(
    interaction,
    ephemeralPayload({
      content: `✅ ${config.label} updated.`,
    })
  );
}

async function handleModalSubmit(interaction) {
  const customId = interaction.customId || '';

  if (!customId.startsWith(`${SETUP_PREFIX}:`)) return false;

  const [, modalAction, panelId, field] = customId.split(':');

  if (!panelId) return false;

  if (modalAction === 'limit_modal') {
    await handleLimitModal(interaction, panelId);
    return true;
  }

  if (modalAction === 'cooldown_modal') {
    await handleCooldownModal(interaction, panelId);
    return true;
  }

  if (modalAction === 'appearance_modal') {
    await handleAppearanceModal(interaction, panelId, field);
    return true;
  }

  return false;
}

async function handleTicketSetupInteraction(interaction) {
  if (!interaction.guild) return false;

  const customId = interaction.customId || '';

  if (!customId.startsWith(`${SETUP_PREFIX}:`)) return false;

  if (!interaction.memberPermissions?.has('ManageGuild')) {
    await handleNoPermission(interaction);
    return true;
  }

  if (interaction.isModalSubmit?.()) {
    return handleModalSubmit(interaction);
  }

  if (customId === 'ticket_setup:refresh' || customId === 'ticket_setup:back') {
    await showSetupHome(interaction);
    return true;
  }

  if (customId === 'ticket_setup:create_support') {
    const panel = createBasicPanel(interaction.guild.id, TICKET_TYPES.SUPPORT);
    await showPanelEditor(interaction, panel.panelId);
    return true;
  }

  if (customId === 'ticket_setup:create_appeal') {
    const panel = createBasicPanel(interaction.guild.id, TICKET_TYPES.APPEAL);
    await showPanelEditor(interaction, panel.panelId);
    return true;
  }

  if (customId === 'ticket_setup:create_report') {
    const panel = createBasicPanel(interaction.guild.id, TICKET_TYPES.REPORT);
    await showPanelEditor(interaction, panel.panelId);
    return true;
  }

  if (customId === 'ticket_setup:create_application') {
    const panel = createBasicPanel(interaction.guild.id, TICKET_TYPES.APPLICATION);
    await showPanelEditor(interaction, panel.panelId);
    return true;
  }

  if (customId === 'ticket_setup:select_panel') {
    await showPanelEditor(interaction, interaction.values?.[0]);
    return true;
  }

  const [, action, panelId] = customId.split(':');

  if (!panelId) return false;

  if (action === 'management') {
    await showManagementEditor(interaction, panelId);
    return true;
  }

  if (action === 'back_panel') {
    await showPanelEditor(interaction, panelId);
    return true;
  }

  if (action === 'roles') {
    await showRoleEditor(interaction, panelId);
    return true;
  }

  if (action === 'appearance') {
    await showAppearanceEditor(interaction, panelId);
    return true;
  }

  if (action === 'set_logs') {
  updatePanel(interaction.guild.id, panelId, {
    logsChannelId: interaction.values?.[0] || null,
  });

  await showManagementEditor(interaction, panelId);
  return true;
}

  if (action === 'appearance_select') {
    const field = interaction.values?.[0];
    await showAppearanceModal(interaction, panelId, field);
    return true;
  }

  if (action === 'set_limit') {
    await showLimitModal(interaction, panelId);
    return true;
  }

  if (action === 'set_cooldown') {
    await showCooldownModal(interaction, panelId);
    return true;
  }

  if (action === 'toggle_one_active') {
    const panel = getPanel(interaction.guild.id, panelId);

    if (!panel) {
      await safeReply(
        interaction,
        ephemeralPayload({
          content: '❌ Ticket panel not found.',
        })
      );
      return true;
    }

    const updated = updatePanel(interaction.guild.id, panelId, {
      oneActivePerType: panel.oneActivePerType === false,
    });

    await refreshPanelIfDeployed(interaction, panelId);

    await safeReply(
      interaction,
      ephemeralPayload({
        content: `✅ One Active Per Type is now ${
          updated?.oneActivePerType === false ? 'Off' : 'On'
        }.`,
      })
    );

    return true;
  }

  if (action === 'set_output') {
    updatePanel(interaction.guild.id, panelId, {
      outputCategoryId: interaction.values?.[0] || null,
    });

    await showPanelEditor(interaction, panelId);
    return true;
  }

  if (action === 'set_deploy') {
    updatePanel(interaction.guild.id, panelId, {
      deployChannelId: interaction.values?.[0] || null,
    });

    await showPanelEditor(interaction, panelId);
    return true;
  }

  if (action === 'set_staff') {
    updatePanel(interaction.guild.id, panelId, {
      staffRoleIds: interaction.values || [],
    });

    await showRoleEditor(interaction, panelId);
    return true;
  }

  if (action === 'set_manager') {
    updatePanel(interaction.guild.id, panelId, {
      managerRoleIds: interaction.values || [],
    });

    await showRoleEditor(interaction, panelId);
    return true;
  }

  if (action === 'set_viewer') {
    updatePanel(interaction.guild.id, panelId, {
      viewerRoleIds: interaction.values || [],
    });

    await showRoleEditor(interaction, panelId);
    return true;
  }

  if (action === 'deploy') {
    const panel = getPanel(interaction.guild.id, panelId);

    if (!panel) {
      await safeReply(interaction, ephemeralPayload({ content: '❌ Panel not found.' }));
      return true;
    }

    const deployChannel = await fetchDeployChannel(interaction, panel);

    if (!deployChannel) {
      await safeReply(
        interaction,
        ephemeralPayload({
          content:
            '❌ Please set a Panel Channel first. This is where the ticket panel message will be posted.',
        })
      );
      return true;
    }

    const deferred = await safeDefer(interaction, true);
    if (!deferred) return true;

    await deployPanel({
      guild: interaction.guild,
      channel: deployChannel,
      panel,
      actorId: interaction.user.id,
    });

    await safeEditOrReply(interaction, {
      content: `✅ Ticket panel **${panel.name}** deployed in ${deployChannel}.`,
    });

    return true;
  }

  if (action === 'redeploy') {
    const panel = getPanel(interaction.guild.id, panelId);

    if (!panel) {
      await safeReply(interaction, ephemeralPayload({ content: '❌ Panel not found.' }));
      return true;
    }

    const deployChannel = await fetchDeployChannel(interaction, panel);

    if (!deployChannel) {
      await safeReply(
        interaction,
        ephemeralPayload({
          content: '❌ Please set a Panel Channel first before redeploying.',
        })
      );
      return true;
    }

    const deferred = await safeDefer(interaction, true);
    if (!deferred) return true;

    await redeployPanel({
      guild: interaction.guild,
      channel: deployChannel,
      panel,
      actorId: interaction.user.id,
    });

    await safeEditOrReply(interaction, {
      content: `🔄 Ticket panel **${panel.name}** redeployed in ${deployChannel}.`,
    });

    return true;
  }

  if (action === 'undeploy') {
    const panel = getPanel(interaction.guild.id, panelId);

    if (!panel) {
      await safeReply(interaction, ephemeralPayload({ content: '❌ Panel not found.' }));
      return true;
    }

    const deferred = await safeDefer(interaction, true);
    if (!deferred) return true;

    const success = await undeployPanel({
      guild: interaction.guild,
      panel,
    });

    await safeEditOrReply(interaction, {
      content: success
        ? `📦 Ticket panel **${panel.name}** undeployed.`
        : '⚠️ This panel was not deployed or the message could not be found.',
    });

    return true;
  }

  if (action === 'delete') {
    const deleted = deletePanel(interaction.guild.id, panelId);

    await safeUpdate(interaction, {
      content: deleted ? '🗑️ Ticket panel deleted.' : '❌ Ticket panel not found.',
      embeds: [],
      components: [],
    });

    return true;
  }

  if (action === 'refresh_deployed') {
    const panel = getPanel(interaction.guild.id, panelId);

    if (panel) {
      await refreshDeployedPanel({
        guild: interaction.guild,
        panel,
      });
    }

    await showPanelEditor(interaction, panelId);
    return true;
  }

  return false;
}

module.exports = {
  sendSetupPanel,
  handleTicketSetupInteraction,

  buildSetupEmbed,
  buildEditorEmbed,
  buildManagementEmbed,
  buildRoleEditorEmbed,
  buildAppearanceEmbed,

  buildEditorControls,
  buildEditorControlsForPanel,
  buildManagementControls,
  buildRoleEditorControls,
  buildAppearanceControls,

  showPanelEditor,
  showManagementEditor,
  showRoleEditor,
  showAppearanceEditor,
};
