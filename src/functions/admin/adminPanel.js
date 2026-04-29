// functions/admin/adminPanel.js

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const guildManager = require('../../guild/guildManager');
const adminModule = require('../../modules/admin/admin');

const PANEL_COLOR = '#5865F2';

const LOG_TYPES = {
  logs: {
    key: 'general',
    label: 'Logs',
    emoji: '📋',
    customId: 'admin:setlogs',
    selectId: 'admin:selectlogs',
    title: '📋 Set Logs Channel',
  },
  modlog: {
    key: 'moderation',
    label: 'Mod Log',
    emoji: '📌',
    customId: 'admin:setmodlog',
    selectId: 'admin:selectmodlog',
    title: '📌 Set Mod Log Channel',
  },
  adminlog: {
    key: 'admin',
    label: 'Admin Log',
    emoji: '👑',
    customId: 'admin:setadminlog',
    selectId: 'admin:selectadminlog',
    title: '👑 Set Admin Log Channel',
  },
  automodlog: {
    key: 'automod',
    label: 'AutoMod Log',
    emoji: '🤖',
    customId: 'admin:setautomodlog',
    selectId: 'admin:selectautomodlog',
    title: '🤖 Set AutoMod Log Channel',
  },
};

function getLogChannelId(guildId, type) {
  return guildManager.getLogChannelId(guildId, type);
}

function getAdminLoggerEnabled(guildId) {
  const adminState = adminModule.getAdminPanelState(guildId);
  return Boolean(adminState?.adminActionsEnabled);
}

function formatChannelStatus(channelId, fallbackLabel) {
  return channelId
    ? `Set ${fallbackLabel.toLowerCase()} channel\nCurrent: <#${channelId}>`
    : `Set ${fallbackLabel.toLowerCase()} channel`;
}

function buildAdminFields(guildId) {
  const generalLogId = getLogChannelId(guildId, LOG_TYPES.logs.key);
  const modLogId = getLogChannelId(guildId, LOG_TYPES.modlog.key);
  const adminLogId = getLogChannelId(guildId, LOG_TYPES.adminlog.key);
  const automodLogId = getLogChannelId(guildId, LOG_TYPES.automodlog.key);
  const adminLoggerEnabled = getAdminLoggerEnabled(guildId);

  return [
    { name: '⚙️ AutoMod', value: 'Filters & protection', inline: true },
    { name: '🎨 Embed', value: 'Create custom embeds', inline: true },
    { name: '📊 Stats', value: 'Server stats system', inline: true },

    {
      name: '📋 Logs',
      value: formatChannelStatus(generalLogId, 'logs'),
      inline: true,
    },
    {
      name: '📌 Mod Log',
      value: formatChannelStatus(modLogId, 'mod log'),
      inline: true,
    },
    {
      name: '👑 Admin Log',
      value: formatChannelStatus(adminLogId, 'admin log'),
      inline: true,
    },
    {
      name: '🤖 AutoMod Log',
      value: formatChannelStatus(automodLogId, 'automod log'),
      inline: true,
    },
    {
      name: '🧾 Admin Logger',
      value: adminLoggerEnabled ? 'Enabled ✅' : 'Disabled ❌',
      inline: true,
    },
    {
      name: '🧹 Purge',
      value: 'Bulk delete messages',
      inline: true,
    },
  ];
}

function buildFeatureRows(guildId) {
  const generalLogId = getLogChannelId(guildId, LOG_TYPES.logs.key);
  const modLogId = getLogChannelId(guildId, LOG_TYPES.modlog.key);
  const adminLogId = getLogChannelId(guildId, LOG_TYPES.adminlog.key);
  const automodLogId = getLogChannelId(guildId, LOG_TYPES.automodlog.key);
  const adminLoggerEnabled = getAdminLoggerEnabled(guildId);

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('admin:automod')
        .setLabel('AutoMod')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('admin:embed')
        .setLabel('Embed')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('admin:stats')
        .setLabel('Stats')
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(LOG_TYPES.logs.customId)
        .setLabel(generalLogId ? 'Set Logs ✅' : 'Set Logs')
        .setStyle(generalLogId ? ButtonStyle.Success : ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(LOG_TYPES.modlog.customId)
        .setLabel(modLogId ? 'Set Mod Log ✅' : 'Set Mod Log')
        .setStyle(modLogId ? ButtonStyle.Success : ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(LOG_TYPES.adminlog.customId)
        .setLabel(adminLogId ? 'Set Admin Log ✅' : 'Set Admin Log')
        .setStyle(adminLogId ? ButtonStyle.Success : ButtonStyle.Primary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(LOG_TYPES.automodlog.customId)
        .setLabel(automodLogId ? 'Set AutoMod Log ✅' : 'Set AutoMod Log')
        .setStyle(automodLogId ? ButtonStyle.Success : ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('admin:toggleadminlogger')
        .setLabel(adminLoggerEnabled ? 'Admin Logger ON' : 'Admin Logger OFF')
        .setStyle(adminLoggerEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('admin:purge')
        .setLabel('Purge')
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function buildAdminPanel(guild, memberDisplayName = 'Unknown') {
  const guildId = guild?.id;

  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('🛠️ Admin Hub')
    .setDescription('Control your server tools from one panel.')
    .addFields(buildAdminFields(guildId))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: buildFeatureRows(guildId),
  };
}

function buildChannelPanel(type = 'logs') {
  const selected = LOG_TYPES[type] || LOG_TYPES.logs;

  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(selected.title)
    .setDescription('Select a text channel below.')
    .setTimestamp();

  const channelRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(selected.selectId)
      .setPlaceholder('Choose a channel')
      .addChannelTypes(ChannelType.GuildText)
  );

  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('admin:home')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [channelRow, backRow],
  };
}

function buildPurgeModal() {
  const input = new TextInputBuilder()
    .setCustomId('amount')
    .setLabel('Amount (1-100)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('25')
    .setMaxLength(3);

  return new ModalBuilder()
    .setCustomId('admin:purgeModal')
    .setTitle('Purge Messages')
    .addComponents(new ActionRowBuilder().addComponents(input));
}

module.exports = {
  LOG_TYPES,

  buildAdminPanel,
  buildChannelPanel,
  buildPurgeModal,
};