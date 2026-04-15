const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');

const autoModStore = require('./automodStore');

const getGuildAutoModConfig = autoModStore.getGuildAutoModConfig;
const saveGuildAutoModConfig = autoModStore.saveGuildAutoModConfig;
const resetGuildAutoModConfig = autoModStore.resetGuildAutoModConfig;

const RULE_KEYS = [
  'antiSpam',
  'repeatedMessages',
  'antiInvite',
  'antiLink',
  'capsAbuse',
  'badWords',
];

const RULE_META = {
  antiSpam: {
    label: '📨 Anti Spam',
    description: 'Detects message spam bursts',
    fields(config) {
      return [
        `Enabled: **${yesNo(config.antiSpam.enabled)}**`,
        `Max Messages: **${config.antiSpam.maxMessages}**`,
        `Interval: **${config.antiSpam.intervalSeconds}s**`,
        `Punishment: **${config.antiSpam.punishment}**`,
        `Timeout: **${config.antiSpam.timeoutMinutes}m**`,
      ];
    },
  },
  repeatedMessages: {
    label: '🔁 Repeated Messages',
    description: 'Detects repeated identical messages',
    fields(config) {
      return [
        `Enabled: **${yesNo(config.repeatedMessages.enabled)}**`,
        `Max Repeats: **${config.repeatedMessages.maxRepeats}**`,
        `Interval: **${config.repeatedMessages.intervalSeconds}s**`,
        `Punishment: **${config.repeatedMessages.punishment}**`,
        `Timeout: **${config.repeatedMessages.timeoutMinutes}m**`,
      ];
    },
  },
  antiInvite: {
    label: '🔗 Anti Invite',
    description: 'Blocks Discord invite links',
    fields(config) {
      return [
        `Enabled: **${yesNo(config.antiInvite.enabled)}**`,
        `Punishment: **${config.antiInvite.punishment}**`,
        `Timeout: **${config.antiInvite.timeoutMinutes}m**`,
      ];
    },
  },
  antiLink: {
    label: '🌐 Anti Link',
    description: 'Blocks links except allowed domains',
    fields(config) {
      return [
        `Enabled: **${yesNo(config.antiLink.enabled)}**`,
        `Punishment: **${config.antiLink.punishment}**`,
        `Timeout: **${config.antiLink.timeoutMinutes}m**`,
        `Allowed Domains: **${
          config.antiLink.allowedDomains.length
            ? config.antiLink.allowedDomains.join(', ')
            : 'None'
        }**`,
      ];
    },
  },
  capsAbuse: {
    label: '🔠 Caps Abuse',
    description: 'Detects excessive uppercase messages',
    fields(config) {
      return [
        `Enabled: **${yesNo(config.capsAbuse.enabled)}**`,
        `Min Length: **${config.capsAbuse.minLength}**`,
        `Percentage: **${config.capsAbuse.percentage}%**`,
        `Punishment: **${config.capsAbuse.punishment}**`,
        `Timeout: **${config.capsAbuse.timeoutMinutes}m**`,
      ];
    },
  },
  badWords: {
    label: '🚫 Bad Words',
    description: 'Blocks configured words',
    fields(config) {
      return [
        `Enabled: **${yesNo(config.badWords.enabled)}**`,
        `Punishment: **${config.badWords.punishment}**`,
        `Timeout: **${config.badWords.timeoutMinutes}m**`,
        `Words: **${
          config.badWords.words.length ? config.badWords.words.join(', ') : 'None'
        }**`,
      ];
    },
  },
};

const PUNISHMENTS = [
  { label: 'Delete', value: 'delete' },
  { label: 'Warn', value: 'warn' },
  { label: 'Timeout', value: 'timeout' },
  { label: 'Kick', value: 'kick' },
  { label: 'Ban', value: 'ban' },
];

function yesNo(v) {
  return v ? 'Yes' : 'No';
}

function onOff(v) {
  return v ? 'On' : 'Off';
}

function stateStyle(v) {
  return v ? ButtonStyle.Success : ButtonStyle.Danger;
}

function extractId(value) {
  if (!value) return null;
  const match = String(value).match(/\d{16,20}/);
  return match ? match[0] : null;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function createFallbackRule(defaults = {}) {
  return {
    enabled: Boolean(defaults.enabled),
    punishment: defaults.punishment || 'timeout',
    timeoutMinutes: Number(defaults.timeoutMinutes) || 10,
    maxMessages: Number(defaults.maxMessages) || 5,
    intervalSeconds: Number(defaults.intervalSeconds) || 8,
    maxRepeats: Number(defaults.maxRepeats) || 3,
    minLength: Number(defaults.minLength) || 8,
    percentage: Number(defaults.percentage) || 70,
    allowedDomains: Array.isArray(defaults.allowedDomains) ? defaults.allowedDomains : [],
    words: Array.isArray(defaults.words) ? defaults.words : [],
  };
}

function normalizeConfig(rawConfig = {}) {
  const legacyLogs = rawConfig.logs || {};
  const normalized = {
    enabled: Boolean(rawConfig.enabled),
    ignoreBots: rawConfig.ignoreBots !== undefined ? Boolean(rawConfig.ignoreBots) : true,
    ignoreAdmins: rawConfig.ignoreAdmins !== undefined ? Boolean(rawConfig.ignoreAdmins) : true,
    logs: {
      enabled:
        legacyLogs.enabled !== undefined
          ? Boolean(legacyLogs.enabled)
          : Boolean(rawConfig.logsEnabled),
      channelId:
        extractId(legacyLogs.channelId) ||
        extractId(legacyLogs.channel) ||
        extractId(rawConfig.logChannelId) ||
        extractId(rawConfig.logChannel) ||
        null,
    },
    ignoredChannelIds: normalizeArray(rawConfig.ignoredChannelIds),
    ignoredRoleIds: normalizeArray(rawConfig.ignoredRoleIds),
    ignoredUserIds: normalizeArray(rawConfig.ignoredUserIds),

    antiSpam: createFallbackRule(rawConfig.antiSpam),
    repeatedMessages: createFallbackRule(rawConfig.repeatedMessages),
    antiInvite: createFallbackRule(rawConfig.antiInvite),
    antiLink: createFallbackRule(rawConfig.antiLink),
    capsAbuse: createFallbackRule(rawConfig.capsAbuse),
    badWords: createFallbackRule(rawConfig.badWords),
  };

  normalized.antiInvite.maxMessages = undefined;
  normalized.antiInvite.intervalSeconds = undefined;
  normalized.antiInvite.maxRepeats = undefined;
  normalized.antiInvite.minLength = undefined;
  normalized.antiInvite.percentage = undefined;
  normalized.antiInvite.allowedDomains = [];
  normalized.antiInvite.words = [];

  normalized.badWords.allowedDomains = [];
  normalized.antiLink.words = [];
  normalized.capsAbuse.allowedDomains = [];
  normalized.capsAbuse.words = [];
  normalized.repeatedMessages.allowedDomains = [];
  normalized.repeatedMessages.words = [];
  normalized.antiSpam.allowedDomains = [];
  normalized.antiSpam.words = [];

  return normalized;
}

function getConfig(guildId) {
  return normalizeConfig(getGuildAutoModConfig(guildId));
}

function saveConfig(guildId, config) {
  return saveGuildAutoModConfig(guildId, normalizeConfig(config));
}

function getChannelDisplay(guild, channelId) {
  if (!channelId) return 'Not set';

  const resolvedId = extractId(channelId);
  if (!resolvedId) return 'Not set';

  const channel = guild.channels.cache.get(resolvedId);
  if (channel) {
    return `<#${channel.id}>`;
  }

  return `Missing channel (${resolvedId})`;
}

function buildMainPanelPayload(guild) {
  const config = getConfig(guild.id);

  const embed = new EmbedBuilder()
    .setColor(config.enabled ? 0x22c55e : 0xef4444)
    .setTitle('🛡️ AutoMod Control Panel')
    .setDescription(`Manage AutoMod for **${guild.name}**\n\u200b`)
    .addFields(
      {
        name: '⚙️ System',
        value:
          `**Status:** ${config.enabled ? '🟢 Enabled' : '🔴 Disabled'}\n` +
          `Ignore Bots: **${yesNo(config.ignoreBots)}**\n` +
          `Ignore Admins: **${yesNo(config.ignoreAdmins)}**`,
      },
      {
        name: '📜 Logs',
        value:
          `Enabled: **${yesNo(config.logs.enabled)}**\n` +
          `Channel: ${getChannelDisplay(guild, config.logs.channelId)}`,
      },
      {
        name: '🚫 Ignored Channels',
        value: config.ignoredChannelIds.length
          ? config.ignoredChannelIds.map((id) => `📁 <#${id}>`).join('\n')
          : 'None',
        inline: true,
      },
      {
        name: '🎭 Ignored Roles',
        value: config.ignoredRoleIds.length
          ? config.ignoredRoleIds.map((id) => `🎭 <@&${id}>`).join('\n')
          : 'None',
        inline: true,
      },
      {
        name: '👤 Ignored Users',
        value: config.ignoredUserIds.length
          ? config.ignoredUserIds.map((id) => `👤 <@${id}>`).join('\n')
          : 'None',
        inline: true,
      }
    )
    .setTimestamp();

  const topRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('automod_view_rules')
      .setLabel('Rules')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('automod_view_logs')
      .setLabel('Logs')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('automod_view_ignore')
      .setLabel('Ignore')
      .setStyle(ButtonStyle.Primary)
  );

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('automod_toggle_ignore_bots')
      .setLabel(`Bots: ${onOff(config.ignoreBots)}`)
      .setStyle(stateStyle(config.ignoreBots)),

    new ButtonBuilder()
      .setCustomId('automod_toggle_ignore_admins')
      .setLabel(`Admins: ${onOff(config.ignoreAdmins)}`)
      .setStyle(stateStyle(config.ignoreAdmins)),

    new ButtonBuilder()
      .setCustomId('automod_reset')
      .setLabel('Reset')
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId('automod_toggle_global')
      .setLabel(`AutoMod: ${onOff(config.enabled)}`)
      .setStyle(stateStyle(config.enabled))
  );

  return {
    embeds: [embed],
    components: [topRow, navRow],
  };
}

function buildRulesPanelPayload(guild, selectedRule = 'antiSpam') {
  const config = getConfig(guild.id);
  const meta = RULE_META[selectedRule];
  const rule = config[selectedRule];

  const embed = new EmbedBuilder()
    .setColor(rule.enabled ? 0x22c55e : 0xef4444)
    .setTitle(`🛡️ AutoMod Rules • ${meta.label}`)
    .setDescription(meta.description)
    .addFields({
      name: meta.label,
      value: meta.fields(config).join('\n'),
      inline: false,
    })
    .setTimestamp();

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('automod_rule_select')
      .setPlaceholder('Choose a rule')
      .addOptions(
        RULE_KEYS.map((key) => ({
          label: RULE_META[key].label,
          description: RULE_META[key].description,
          value: key,
          default: key === selectedRule,
        }))
      )
  );

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`automod_toggle_rule:${selectedRule}`)
      .setLabel(`Rule: ${onOff(rule.enabled)}`)
      .setStyle(stateStyle(rule.enabled)),

    new ButtonBuilder()
      .setCustomId(`automod_edit_rule:${selectedRule}`)
      .setLabel('Edit')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`automod_punishment:${selectedRule}`)
      .setLabel('Punishment')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('automod_back_main')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [selectRow, buttonRow],
  };
}

function buildPunishmentPanelPayload(guild, selectedRule) {
  const config = getConfig(guild.id);
  const meta = RULE_META[selectedRule];
  const rule = config[selectedRule];

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`⚖️ Punishment • ${meta.label}`)
    .setDescription(`Current punishment: **${rule.punishment}**`)
    .addFields({
      name: '⏱️ Timeout Length',
      value: `**${rule.timeoutMinutes}** minute(s)`,
      inline: false,
    })
    .setTimestamp();

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`automod_punishment_select:${selectedRule}`)
      .setPlaceholder('Choose punishment')
      .addOptions(
        PUNISHMENTS.map((entry) => ({
          label: entry.label,
          value: entry.value,
          default: entry.value === rule.punishment,
        }))
      )
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`automod_edit_rule:${selectedRule}`)
      .setLabel('Edit Rule')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`automod_view_rule:${selectedRule}`)
      .setLabel('Back to Rule')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [selectRow, row],
  };
}

function buildLogsPanelPayload(guild) {
  const config = getConfig(guild.id);

  const embed = new EmbedBuilder()
    .setColor(config.logs.enabled ? 0x22c55e : 0xef4444)
    .setTitle('📜 AutoMod Logs')
    .setDescription(
      `Configure logging for moderation actions\n\n` +
        `Enabled: **${config.logs.enabled ? 'Yes' : 'No'}**\n` +
        `Channel: ${getChannelDisplay(guild, config.logs.channelId)}`
    )
    .addFields({
      name: 'ℹ️ Info',
      value:
        `Users will be clickable\n` +
        `Logs include rule + action\n` +
        `Real-time moderation tracking`,
    })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('automod_toggle_logs')
      .setLabel(`Logs: ${onOff(config.logs.enabled)}`)
      .setStyle(stateStyle(config.logs.enabled)),

    new ButtonBuilder()
      .setCustomId('automod_edit_logs')
      .setLabel('Set Channel')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('automod_back_main')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [row],
  };
}

function buildIgnorePanelPayload(guild) {
  const config = getConfig(guild.id);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🙈 AutoMod Ignore Lists')
    .setDescription('Manage ignored channels, roles, and users')
    .addFields(
      {
        name: '🚫 Ignored Channels',
        value: config.ignoredChannelIds.length
          ? config.ignoredChannelIds.map((id) => `📁 <#${id}>`).join('\n')
          : 'None',
        inline: false,
      },
      {
        name: '🎭 Ignored Roles',
        value: config.ignoredRoleIds.length
          ? config.ignoredRoleIds.map((id) => `🎭 <@&${id}>`).join('\n')
          : 'None',
        inline: false,
      },
      {
        name: '👤 Ignored Users',
        value: config.ignoredUserIds.length
          ? config.ignoredUserIds.map((id) => `👤 <@${id}>`).join('\n')
          : 'None',
        inline: false,
      }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('automod_edit_ignore')
      .setLabel('Edit Ignore')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('automod_back_main')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [row],
  };
}

function buildRuleEditModal(ruleKey, guildId) {
  const config = getConfig(guildId);
  const meta = RULE_META[ruleKey];
  const rule = config[ruleKey];

  const modal = new ModalBuilder()
    .setCustomId(`automod_modal_rule:${ruleKey}`)
    .setTitle(`Edit ${meta.label}`);

  if (ruleKey === 'antiSpam') {
    modal.addComponents(
      textRow('enabled', 'Enabled (true/false)', String(rule.enabled)),
      textRow('max_messages', 'Max Messages', String(rule.maxMessages)),
      textRow('interval_seconds', 'Interval Seconds', String(rule.intervalSeconds)),
      textRow('timeout_minutes', 'Timeout Minutes', String(rule.timeoutMinutes))
    );
    return modal;
  }

  if (ruleKey === 'repeatedMessages') {
    modal.addComponents(
      textRow('enabled', 'Enabled (true/false)', String(rule.enabled)),
      textRow('max_repeats', 'Max Repeats', String(rule.maxRepeats)),
      textRow('interval_seconds', 'Interval Seconds', String(rule.intervalSeconds)),
      textRow('timeout_minutes', 'Timeout Minutes', String(rule.timeoutMinutes))
    );
    return modal;
  }

  if (ruleKey === 'antiInvite') {
    modal.addComponents(
      textRow('enabled', 'Enabled (true/false)', String(rule.enabled)),
      textRow('timeout_minutes', 'Timeout Minutes', String(rule.timeoutMinutes))
    );
    return modal;
  }

  if (ruleKey === 'antiLink') {
    modal.addComponents(
      textRow('enabled', 'Enabled (true/false)', String(rule.enabled)),
      textRow('timeout_minutes', 'Timeout Minutes', String(rule.timeoutMinutes)),
      textRow(
        'allowed_domains',
        'Allowed Domains (comma separated)',
        rule.allowedDomains.join(', ')
      )
    );
    return modal;
  }

  if (ruleKey === 'capsAbuse') {
    modal.addComponents(
      textRow('enabled', 'Enabled (true/false)', String(rule.enabled)),
      textRow('min_length', 'Minimum Length', String(rule.minLength)),
      textRow('percentage', 'Caps Percentage', String(rule.percentage)),
      textRow('timeout_minutes', 'Timeout Minutes', String(rule.timeoutMinutes))
    );
    return modal;
  }

  if (ruleKey === 'badWords') {
    modal.addComponents(
      textRow('enabled', 'Enabled (true/false)', String(rule.enabled)),
      textRow('timeout_minutes', 'Timeout Minutes', String(rule.timeoutMinutes)),
      paragraphRow('words', 'Blocked Words (comma separated)', rule.words.join(', '))
    );
    return modal;
  }

  return modal;
}

function buildLogsModal(guildId) {
  const config = getConfig(guildId);

  return new ModalBuilder()
    .setCustomId('automod_modal_logs')
    .setTitle('AutoMod Logs')
    .addComponents(
      textRow('enabled', 'Enabled (true/false)', String(config.logs.enabled)),
      textRow('channel_id', 'Log Channel ID', config.logs.channelId || '')
    );
}

function buildIgnoreModal(guildId) {
  const config = getConfig(guildId);

  return new ModalBuilder()
    .setCustomId('automod_modal_ignore')
    .setTitle('AutoMod Ignore Lists')
    .addComponents(
      paragraphRow(
        'channels',
        'Ignored Channel IDs (comma separated)',
        config.ignoredChannelIds.join(', ')
      ),
      paragraphRow(
        'roles',
        'Ignored Role IDs (comma separated)',
        config.ignoredRoleIds.join(', ')
      ),
      paragraphRow(
        'users',
        'Ignored User IDs (comma separated)',
        config.ignoredUserIds.join(', ')
      )
    );
}

function textRow(customId, label, value = '') {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(String(value || '').slice(0, 4000))
  );
}

function paragraphRow(customId, label, value = '') {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setValue(String(value || '').slice(0, 4000))
  );
}

function parseBoolean(value, fallback) {
  if (value == null || value === '') return fallback;
  const lowered = String(value).trim().toLowerCase();
  if (lowered === 'true') return true;
  if (lowered === 'false') return false;
  return fallback;
}

function parseNumber(value, fallback) {
  if (value == null || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseCsv(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function applyRuleModal(ruleKey, fields, guildId) {
  const config = getConfig(guildId);

  if (ruleKey === 'antiSpam') {
    config.antiSpam.enabled = parseBoolean(fields.enabled, config.antiSpam.enabled);
    config.antiSpam.maxMessages = parseNumber(fields.max_messages, config.antiSpam.maxMessages);
    config.antiSpam.intervalSeconds = parseNumber(
      fields.interval_seconds,
      config.antiSpam.intervalSeconds
    );
    config.antiSpam.timeoutMinutes = parseNumber(
      fields.timeout_minutes,
      config.antiSpam.timeoutMinutes
    );
  }

  if (ruleKey === 'repeatedMessages') {
    config.repeatedMessages.enabled = parseBoolean(
      fields.enabled,
      config.repeatedMessages.enabled
    );
    config.repeatedMessages.maxRepeats = parseNumber(
      fields.max_repeats,
      config.repeatedMessages.maxRepeats
    );
    config.repeatedMessages.intervalSeconds = parseNumber(
      fields.interval_seconds,
      config.repeatedMessages.intervalSeconds
    );
    config.repeatedMessages.timeoutMinutes = parseNumber(
      fields.timeout_minutes,
      config.repeatedMessages.timeoutMinutes
    );
  }

  if (ruleKey === 'antiInvite') {
    config.antiInvite.enabled = parseBoolean(fields.enabled, config.antiInvite.enabled);
    config.antiInvite.timeoutMinutes = parseNumber(
      fields.timeout_minutes,
      config.antiInvite.timeoutMinutes
    );
  }

  if (ruleKey === 'antiLink') {
    config.antiLink.enabled = parseBoolean(fields.enabled, config.antiLink.enabled);
    config.antiLink.timeoutMinutes = parseNumber(
      fields.timeout_minutes,
      config.antiLink.timeoutMinutes
    );
    config.antiLink.allowedDomains = parseCsv(fields.allowed_domains);
  }

  if (ruleKey === 'capsAbuse') {
    config.capsAbuse.enabled = parseBoolean(fields.enabled, config.capsAbuse.enabled);
    config.capsAbuse.minLength = parseNumber(fields.min_length, config.capsAbuse.minLength);
    config.capsAbuse.percentage = parseNumber(fields.percentage, config.capsAbuse.percentage);
    config.capsAbuse.timeoutMinutes = parseNumber(
      fields.timeout_minutes,
      config.capsAbuse.timeoutMinutes
    );
  }

  if (ruleKey === 'badWords') {
    config.badWords.enabled = parseBoolean(fields.enabled, config.badWords.enabled);
    config.badWords.timeoutMinutes = parseNumber(
      fields.timeout_minutes,
      config.badWords.timeoutMinutes
    );
    config.badWords.words = parseCsv(fields.words);
  }

  return saveConfig(guildId, config);
}

function applyLogsModal(fields, guildId) {
  const config = getConfig(guildId);
  config.logs.enabled = parseBoolean(fields.enabled, config.logs.enabled);
  config.logs.channelId = extractId(fields.channel_id) || null;
  return saveConfig(guildId, config);
}

function applyIgnoreModal(fields, guildId) {
  const config = getConfig(guildId);
  config.ignoredChannelIds = parseCsv(fields.channels).map(extractId).filter(Boolean);
  config.ignoredRoleIds = parseCsv(fields.roles).map(extractId).filter(Boolean);
  config.ignoredUserIds = parseCsv(fields.users).map(extractId).filter(Boolean);
  return saveConfig(guildId, config);
}

async function handleInteraction(interaction) {
  if (!interaction.guild) return false;

  if (interaction.isButton()) {
    const { customId } = interaction;

    if (customId === 'automod_toggle_global') {
      console.log('AUTOMOD BUTTON HANDLER', {
  customId,
  interactionId: interaction.id,
  ageMs: Date.now() - interaction.createdTimestamp,
  deferred: interaction.deferred,
  replied: interaction.replied,
});
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.enabled = !config.enabled;
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildMainPanelPayload(interaction.guild));
      return true;
    }

    if (customId === 'automod_toggle_ignore_bots') {
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.ignoreBots = !config.ignoreBots;
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildMainPanelPayload(interaction.guild));
      return true;
    }

    if (customId === 'automod_toggle_ignore_admins') {
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.ignoreAdmins = !config.ignoreAdmins;
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildMainPanelPayload(interaction.guild));
      return true;
    }

    if (customId === 'automod_view_rules') {
      await interaction.deferUpdate();
      await interaction.editReply(buildRulesPanelPayload(interaction.guild));
      return true;
    }

    if (customId === 'automod_view_logs') {
      await interaction.deferUpdate();
      await interaction.editReply(buildLogsPanelPayload(interaction.guild));
      return true;
    }

    if (customId === 'automod_view_ignore') {
      await interaction.deferUpdate();
      await interaction.editReply(buildIgnorePanelPayload(interaction.guild));
      return true;
    }

    if (customId === 'automod_back_main') {
      await interaction.deferUpdate();
      await interaction.editReply(buildMainPanelPayload(interaction.guild));
      return true;
    }

    if (customId === 'automod_toggle_logs') {
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.logs.enabled = !config.logs.enabled;
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildLogsPanelPayload(interaction.guild));
      return true;
    }

    if (customId === 'automod_edit_logs') {
      await interaction.showModal(buildLogsModal(interaction.guild.id));
      return true;
    }

    if (customId === 'automod_edit_ignore') {
      await interaction.showModal(buildIgnoreModal(interaction.guild.id));
      return true;
    }

    if (customId === 'automod_reset') {
      await interaction.deferUpdate();
      resetGuildAutoModConfig(interaction.guild.id);
      await interaction.editReply(buildMainPanelPayload(interaction.guild));
      return true;
    }

    if (customId.startsWith('automod_toggle_rule:')) {
      await interaction.deferUpdate();
      const ruleKey = customId.split(':')[1];
      const config = getConfig(interaction.guild.id);
      config[ruleKey].enabled = !config[ruleKey].enabled;
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildRulesPanelPayload(interaction.guild, ruleKey));
      return true;
    }

    if (customId.startsWith('automod_edit_rule:')) {
      const ruleKey = customId.split(':')[1];
      await interaction.showModal(buildRuleEditModal(ruleKey, interaction.guild.id));
      return true;
    }

    if (customId.startsWith('automod_punishment:')) {
      await interaction.deferUpdate();
      const ruleKey = customId.split(':')[1];
      await interaction.editReply(buildPunishmentPanelPayload(interaction.guild, ruleKey));
      return true;
    }

    if (customId.startsWith('automod_view_rule:')) {
      await interaction.deferUpdate();
      const ruleKey = customId.split(':')[1];
      await interaction.editReply(buildRulesPanelPayload(interaction.guild, ruleKey));
      return true;
    }

    return false;
  }

  if (interaction.isStringSelectMenu()) {
    const { customId } = interaction;

    if (customId === 'automod_rule_select') {
      await interaction.deferUpdate();
      const ruleKey = interaction.values[0];
      await interaction.editReply(buildRulesPanelPayload(interaction.guild, ruleKey));
      return true;
    }

    if (customId.startsWith('automod_punishment_select:')) {
      await interaction.deferUpdate();
      const ruleKey = customId.split(':')[1];
      const punishment = interaction.values[0];
      const config = getConfig(interaction.guild.id);
      config[ruleKey].punishment = punishment;
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildPunishmentPanelPayload(interaction.guild, ruleKey));
      return true;
    }

    return false;
  }

  if (interaction.isModalSubmit()) {
    const { customId } = interaction;

    if (customId.startsWith('automod_modal_rule:')) {
      const ruleKey = customId.split(':')[1];
      const fields = Object.fromEntries(
        [...interaction.fields.fields.values()].map((field) => [field.customId, field.value])
      );

      applyRuleModal(ruleKey, fields, interaction.guild.id);
      await interaction.reply({
        ...buildRulesPanelPayload(interaction.guild, ruleKey),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (customId === 'automod_modal_logs') {
      const fields = Object.fromEntries(
        [...interaction.fields.fields.values()].map((field) => [field.customId, field.value])
      );

      applyLogsModal(fields, interaction.guild.id);
      await interaction.reply({
        ...buildLogsPanelPayload(interaction.guild),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (customId === 'automod_modal_ignore') {
      const fields = Object.fromEntries(
        [...interaction.fields.fields.values()].map((field) => [field.customId, field.value])
      );

      applyIgnoreModal(fields, interaction.guild.id);
      await interaction.reply({
        ...buildIgnorePanelPayload(interaction.guild),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    return false;
  }

  return false;
}

module.exports = {
  buildMainPanelPayload,
  buildRulesPanelPayload,
  buildPunishmentPanelPayload,
  buildLogsPanelPayload,
  buildIgnorePanelPayload,
  handleInteraction,
};