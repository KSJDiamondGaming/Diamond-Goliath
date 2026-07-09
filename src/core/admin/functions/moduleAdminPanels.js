'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const guildManager = require('../../guild/guildManager');

const PANEL_COLOR = '#5865F2';

const MODULE_PANEL_REGISTRY = {
  sticky: {
    route: 'admin:sticky',
    key: 'sticky',
    title: '📌 Sticky Notes',
    summary: 'Persistent channel notes and reminders.',
    commandHint: '/admin → Modules → Sticky Notes',
    status: 'Foundation panel ready. Detailed sticky setup controls are next.',
  },
  suggestions: {
    route: 'admin:suggestions',
    key: 'suggestions',
    title: '💡 Suggestions',
    summary: 'Suggestion intake, voting, review and approval workflow.',
    commandHint: '/admin → Modules → Suggestions',
    status: 'Foundation panel ready. Channel setup and voting controls are next.',
  },
  giveaways: {
    route: 'admin:giveaways',
    key: 'giveaways',
    title: '🎉 Giveaways',
    summary: 'Giveaway creation, entries, winners and rerolls.',
    commandHint: '/admin → Modules → Giveaways',
    status: 'Foundation panel ready. Giveaway builder controls are next.',
  },
  fun: {
    route: 'admin:fun',
    key: 'fun',
    title: '🎮 Fun',
    summary: 'Fun commands and optional community extras.',
    commandHint: '/admin → Modules → Fun',
    status: 'Foundation panel ready. Per-command toggles are next.',
  },
  polls: {
    route: 'admin:polls',
    key: 'polls',
    title: '📊 Polls',
    summary: 'Poll creation, voting and results.',
    commandHint: '/admin → Modules → Polls',
    status: 'Foundation panel ready. Poll templates and channel defaults are next.',
  },
};

const ROUTE_TO_KEY = Object.fromEntries(
  Object.values(MODULE_PANEL_REGISTRY).map((module) => [module.route, module.key])
);

function button(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);
}

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function getMemberDisplayName(interaction) {
  return (
    interaction.member?.displayName ||
    interaction.user?.displayName ||
    interaction.user?.username ||
    'Unknown User'
  );
}

function getModuleConfig(guildId, key) {
  const modules = guildManager.getGuildSection(guildId, 'modules', {});
  const config = modules?.[key];
  return config && typeof config === 'object' ? config : { enabled: config !== false };
}

function setModuleEnabled(guild, key, enabled) {
  return guildManager.setModuleEnabled(guild.id, key, enabled, guild);
}

function moduleStatusText(enabled) {
  return enabled ? 'Enabled ✅' : 'Disabled ❌';
}

function buildModulePanel(guild, moduleKey, memberDisplayName = 'Unknown User') {
  const module = MODULE_PANEL_REGISTRY[moduleKey];
  if (!module) return null;

  const config = getModuleConfig(guild.id, module.key);
  const enabled = config.enabled !== false;

  const embed = new EmbedBuilder()
    .setColor(enabled ? 0x57f287 : PANEL_COLOR)
    .setTitle(module.title)
    .setDescription([
      module.summary,
      '',
      `**Status:** ${moduleStatusText(enabled)}`,
      `**Module Key:** \`${module.key}\``,
      `**Current Panel:** \`${module.commandHint}\``,
      '',
      module.status,
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(
        button(`admin:module:${module.key}:enable`, '▶️ Enable', ButtonStyle.Success),
        button(`admin:module:${module.key}:disable`, '⏸️ Disable', ButtonStyle.Secondary),
        button(`admin:module:${module.key}:refresh`, '🔄 Refresh', ButtonStyle.Primary)
      ),
      row(
        button('admin:modules', '⬅️ Back to Modules', ButtonStyle.Secondary)
      ),
    ],
  };
}

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return true;
  }

  await interaction.update(payload);
  return true;
}

async function openTicketsPanel(interaction) {
  const { sendSetupPanel } = require('../../../modules/tickets/ticketSetupPanel');
  await sendSetupPanel(interaction);
  return true;
}

async function handleModuleAdminInteraction(interaction) {
  if (!interaction?.isButton?.()) return false;

  const customId = String(interaction.customId || '');

  if (customId === 'admin:tickets') {
    return openTicketsPanel(interaction);
  }

  const routeKey = ROUTE_TO_KEY[customId];
  if (routeKey) {
    return safeUpdate(interaction, buildModulePanel(interaction.guild, routeKey, getMemberDisplayName(interaction)));
  }

  const match = customId.match(/^admin:module:([a-zA-Z0-9_-]+):(enable|disable|refresh)$/);
  if (!match) return false;

  const [, moduleKey, action] = match;
  if (!MODULE_PANEL_REGISTRY[moduleKey]) return false;

  if (action === 'enable') setModuleEnabled(interaction.guild, moduleKey, true);
  if (action === 'disable') setModuleEnabled(interaction.guild, moduleKey, false);

  return safeUpdate(interaction, buildModulePanel(interaction.guild, moduleKey, getMemberDisplayName(interaction)));
}

module.exports = {
  MODULE_PANEL_REGISTRY,
  buildModulePanel,
  handleModuleAdminInteraction,
};
