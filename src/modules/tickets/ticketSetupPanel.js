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

const {
  getPanels,
} = require('./ticketStore');

const {
  createPanel,
  getPanel,
  updatePanel,
  deployPanel,
  deletePanel,
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
  if (alreadyHandled(interaction)) {
    return interaction.followUp(payload).catch(() => null);
  }

  return interaction.reply(payload).catch(() => null);
}

async function safeEditOrReply(interaction, payload = {}) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload).catch(() => null);
  }

  return interaction.reply(payload).catch(() => null);
}

async function safeUpdate(interaction, payload = {}) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload).catch(() => null);
  }

  return interaction.update(payload).catch(() => null);
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

function getPanelList(guildId) {
  const data = getPanels(guildId);
  return Array.isArray(data?.panels) ? data.panels : [];
}

function buildSetupEmbed(guildId) {
  const panels = getPanelList(guildId);

  const panelSummary = panels.length
    ? panels
        .slice(0, 8)
        .map((panel, index) => {
          return `**${index + 1}. ${panel.name}**\nType: \`${panel.ticketType}\`\nOutput: ${
            panel.outputCategoryId ? `<#${panel.outputCategoryId}>` : '`Not set`'
          }\nStaff Roles: ${
            panel.staffRoleIds?.length
              ? panel.staffRoleIds.map((id) => `<@&${id}>`).join(', ')
              : '`Not set`'
          }`;
        })
        .join('\n\n')
    : '`No ticket panels created yet.`';

  return new EmbedBuilder()
    .setTitle('🎫 Goliath Ticket Setup')
    .setDescription(
      [
        'Create and manage multiple ticket panels for this server.',
        '',
        '**Each panel can have its own:**',
        '• Output category',
        '• Staff roles',
        '• Manager roles',
        '• Viewer roles',
        '• Logs channel',
        '• Archive category',
        '• Ticket type',
        '',
        panelSummary,
      ].join('\n')
    )
    .setColor('#5865F2')
    .setTimestamp();
}

function buildPanelSelect(guildId) {
  const panels = getPanelList(guildId).slice(0, 25);

  if (!panels.length) return null;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_setup:select_panel')
      .setPlaceholder('Select a ticket panel to edit')
      .addOptions(
        panels.map((panel) => ({
          label: String(panel.name || 'Ticket Panel').slice(0, 100),
          description: `${panel.ticketType || 'support'} panel`,
          value: panel.panelId,
        }))
      )
  );
}

function buildSetupButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_setup:create_support')
      .setLabel('Create Support Panel')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎫'),

    new ButtonBuilder()
      .setCustomId('ticket_setup:create_appeal')
      .setLabel('Create Appeal Panel')
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
  return new EmbedBuilder()
    .setTitle(`🛠️ Edit Ticket Panel: ${panel.name}`)
    .setDescription(
      [
        `**Panel ID:** \`${panel.panelId}\``,
        `**Type:** \`${panel.ticketType}\``,
        `**Priority:** \`${panel.ticketPriority}\``,
        '',
        `**Output Category:** ${panel.outputCategoryId ? `<#${panel.outputCategoryId}>` : '`Not set`'}`,
        `**Staff Roles:** ${
          panel.staffRoleIds?.length
            ? panel.staffRoleIds.map((id) => `<@&${id}>`).join(', ')
            : '`Not set`'
        }`,
        `**Manager Roles:** ${
          panel.managerRoleIds?.length
            ? panel.managerRoleIds.map((id) => `<@&${id}>`).join(', ')
            : '`Not set`'
        }`,
        `**Viewer Roles:** ${
          panel.viewerRoleIds?.length
            ? panel.viewerRoleIds.map((id) => `<@&${id}>`).join(', ')
            : '`Not set`'
        }`,
        `**Logs Channel:** ${panel.logsChannelId ? `<#${panel.logsChannelId}>` : '`Not set`'}`,
        `**Archive Category:** ${panel.archiveCategoryId ? `<#${panel.archiveCategoryId}>` : '`Not set`'}`,
        `**Panel Channel:** ${panel.panelChannelId ? `<#${panel.panelChannelId}>` : '`Not deployed`'}`,
      ].join('\n')
    )
    .setColor(panel.color || '#5865F2')
    .setTimestamp();
}

function buildEditorControls(panelId) {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`ticket_setup:set_output:${panelId}`)
        .setPlaceholder('Set ticket output category')
        .setChannelTypes(ChannelType.GuildCategory)
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`ticket_setup:set_staff:${panelId}`)
        .setPlaceholder('Set staff roles')
        .setMinValues(0)
        .setMaxValues(10)
    ),

    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`ticket_setup:set_manager:${panelId}`)
        .setPlaceholder('Set manager roles')
        .setMinValues(0)
        .setMaxValues(10)
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`ticket_setup:set_logs:${panelId}`)
        .setPlaceholder('Set logs channel')
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(0)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_setup:deploy:${panelId}`)
        .setLabel('Deploy Panel Here')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🚀'),

      new ButtonBuilder()
        .setCustomId(`ticket_setup:delete:${panelId}`)
        .setLabel('Delete Panel')
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

async function sendSetupPanel(interaction) {
  const embed = buildSetupEmbed(interaction.guild.id);
  const components = [buildSetupButtons()];

  const panelSelect = buildPanelSelect(interaction.guild.id);
  if (panelSelect) components.push(panelSelect);

  const payload = {
    embeds: [embed],
    components,
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }

  return interaction.reply(
    ephemeralPayload(payload)
  );
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
    components: buildEditorControls(panelId),
  });
}

function createBasicPanel(guildId, type) {
  const existing = getPanelList(guildId).find(
    (panel) => panel.ticketType === type
  );

  if (existing) {
    return existing;
  }

  const presets = {
    [TICKET_TYPES.SUPPORT]: {
      name: 'General Support',
      title: 'Need Support?',
      description: 'Press the button below to open a private support ticket.',
      buttonLabel: 'Open Support Ticket',
      emoji: '🎫',
      ticketType: TICKET_TYPES.SUPPORT,
      ticketPriority: TICKET_PRIORITY.NORMAL,
    },

    [TICKET_TYPES.APPEAL]: {
      name: 'Ban Appeal',
      title: 'Submit an Appeal',
      description: 'Press the button below to open a private appeal ticket.',
      buttonLabel: 'Open Appeal Ticket',
      emoji: '⚖️',
      ticketType: TICKET_TYPES.APPEAL,
      ticketPriority: TICKET_PRIORITY.HIGH,
    },
  };

  return createPanel(
    guildId,
    presets[type] || presets[TICKET_TYPES.SUPPORT]
  );
}

async function handleNoPermission(interaction) {
  const payload = ephemeralPayload({
    content: '❌ You need Manage Server permission to edit ticket setup.',
  });

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload).catch(() => null);
  }

  return interaction.reply(payload).catch(() => null);
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

async function handleTicketSetupInteraction(interaction) {
  if (!interaction.guild) return false;

  const customId = interaction.customId || '';

  if (!customId.startsWith('ticket_setup:')) {
    return false;
  }

  if (!interaction.memberPermissions?.has('ManageGuild')) {
    await handleNoPermission(interaction);
    return true;
  }

  if (
    customId === 'ticket_setup:refresh' ||
    customId === 'ticket_setup:back'
  ) {
    await showSetupHome(interaction);
    return true;
  }

  if (customId === 'ticket_setup:create_support') {
    const panel = createBasicPanel(
      interaction.guild.id,
      TICKET_TYPES.SUPPORT
    );

    await showPanelEditor(interaction, panel.panelId);
    return true;
  }

  if (customId === 'ticket_setup:create_appeal') {
    const panel = createBasicPanel(
      interaction.guild.id,
      TICKET_TYPES.APPEAL
    );

    await showPanelEditor(interaction, panel.panelId);
    return true;
  }

  if (customId === 'ticket_setup:select_panel') {
    const panelId = interaction.values?.[0];

    await showPanelEditor(interaction, panelId);
    return true;
  }

  const [, action, panelId] = customId.split(':');

  if (!panelId) return false;

  if (action === 'set_output') {
    updatePanel(interaction.guild.id, panelId, {
      outputCategoryId: interaction.values?.[0] || null,
    });

    await showPanelEditor(interaction, panelId);
    return true;
  }

  if (action === 'set_staff') {
    updatePanel(interaction.guild.id, panelId, {
      staffRoleIds: interaction.values || [],
    });

    await showPanelEditor(interaction, panelId);
    return true;
  }

  if (action === 'set_manager') {
    updatePanel(interaction.guild.id, panelId, {
      managerRoleIds: interaction.values || [],
    });

    await showPanelEditor(interaction, panelId);
    return true;
  }

  if (action === 'set_logs') {
    updatePanel(interaction.guild.id, panelId, {
      logsChannelId: interaction.values?.[0] || null,
    });

    await showPanelEditor(interaction, panelId);
    return true;
  }

  if (action === 'set_archive') {
    updatePanel(interaction.guild.id, panelId, {
      archiveCategoryId: interaction.values?.[0] || null,
    });

    await showPanelEditor(interaction, panelId);
    return true;
  }

  if (action === 'delete') {
    const deleted = deletePanel(interaction.guild.id, panelId);

    if (!deleted) {
      await safeReply(
        interaction,
        ephemeralPayload({
          content: '❌ Ticket panel not found.',
        })
      );

      return true;
    }

    await showSetupHome(interaction);
    return true;
  }

  if (action === 'deploy') {
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

    const deferred = await safeDefer(interaction, true);
    if (!deferred) return true;

    await deployPanel({
      guild: interaction.guild,
      channel: interaction.channel,
      panel,
    });

    await safeEditOrReply(interaction, {
      content: `✅ Ticket panel **${panel.name}** deployed in ${interaction.channel}.`,
    });

    return true;
  }

  return false;
}

module.exports = {
  sendSetupPanel,
  handleTicketSetupInteraction,
};