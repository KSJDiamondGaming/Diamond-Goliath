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
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  UserSelectMenuBuilder,
  ChannelType,
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
        `Actions: **${formatPunishments(config.antiSpam.punishments)}**`,
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
        `Actions: **${formatPunishments(config.repeatedMessages.punishments)}**`,
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
        `Actions: **${formatPunishments(config.antiInvite.punishments)}**`,
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
        `Actions: **${formatPunishments(config.antiLink.punishments)}**`,
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
        `Actions: **${formatPunishments(config.capsAbuse.punishments)}**`,
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
        `Actions: **${formatPunishments(config.badWords.punishments)}**`,
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

function normalizePunishments(value) {
  if (Array.isArray(value)) {
    const cleaned = value
      .map((entry) => String(entry).trim().toLowerCase())
      .filter((entry) => PUNISHMENTS.some((p) => p.value === entry));

    return cleaned.length ? [...new Set(cleaned)] : ['delete'];
  }

  if (value) {
    const single = String(value).trim().toLowerCase();
    if (PUNISHMENTS.some((p) => p.value === single)) {
      return [single];
    }
  }

  return ['delete'];
}

function formatPunishments(values) {
  const punishments = normalizePunishments(values);

  return punishments
    .map((value) => PUNISHMENTS.find((entry) => entry.value === value)?.label || value)
    .join(', ');
}

function createFallbackRule(defaults = {}) {
  return {
    enabled: Boolean(defaults.enabled),
    punishments: normalizePunishments(defaults.punishments || defaults.punishment),
    punishment: normalizePunishments(defaults.punishments || defaults.punishment)[0],
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
    dmWarnings: rawConfig.dmWarnings !== undefined ? Boolean(rawConfig.dmWarnings) : false,
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

function getIgnoredChannelsDisplay(guild, ids) {
  return ids.length
    ? ids
        .map((id) => {
          const channel = guild.channels.cache.get(id);
          return channel ? `📁 ${channel}` : `📁 Missing channel (${id})`;
        })
        .join('\n')
    : 'None';
}

function getIgnoredRolesDisplay(guild, ids) {
  return ids.length
    ? ids
        .map((id) => {
          const role = guild.roles.cache.get(id);
          return role ? `🎭 <@&${role.id}>` : `🎭 Missing role (${id})`;
        })
        .join('\n')
    : 'None';
}

function getIgnoredUsersDisplay(guild, ids) {
  return ids.length
    ? ids
        .map((id) => {
          const member = guild.members.cache.get(id);
          return member ? `👤 <@${id}>` : `👤 Missing user (${id})`;
        })
        .join('\n')
    : 'None';
}

function buildMainPanelPayload(guild, view = 'overview') {
  const config = getConfig(guild.id);

  const embed = new EmbedBuilder()
    .setColor(config.enabled ? 0x22c55e : 0xef4444)
    .setTitle('🛡️ AutoMod Control Panel')
    .setDescription(`Manage AutoMod for **${guild.name}**`)
    .setTimestamp();

  if (view === 'overview') {
    embed.addFields(
      {
        name: '⚙️ System',
        value:
          `**Status:** ${config.enabled ? '🟢 Enabled' : '🔴 Disabled'}\n` +
          `Ignore Bots: **${yesNo(config.ignoreBots)}**\n` +
          `Ignore Admins: **${yesNo(config.ignoreAdmins)}**\n` +
          `DM Warnings: **${yesNo(config.dmWarnings)}**`,
      },
      {
        name: '📜 Logs',
        value:
          `Enabled: **${yesNo(config.logs.enabled)}**\n` +
          `Channel: ${getChannelDisplay(guild, config.logs.channelId)}`,
      },
      {
        name: '🚫 Ignored Channels',
        value: getIgnoredChannelsDisplay(guild, config.ignoredChannelIds),
        inline: true,
      },
      {
        name: '🎭 Ignored Roles',
        value: getIgnoredRolesDisplay(guild, config.ignoredRoleIds),
        inline: true,
      },
      {
        name: '👤 Ignored Users',
        value: getIgnoredUsersDisplay(guild, config.ignoredUserIds),
        inline: true,
      }
    );
  }

  if (view === 'rules') {
    embed
      .setDescription(`Manage AutoMod rules for **${guild.name}**`)
      .addFields({
        name: '🛡️ Rules Overview',
        value: RULE_KEYS.map((key) => {
          const rule = config[key];
          return `${RULE_META[key].label} • **${yesNo(rule.enabled)}** • Actions: **${formatPunishments(rule.punishments)}**`;
        }).join('\n'),
      });
  }

  if (view === 'logs') {
    embed
      .setDescription(`Configure AutoMod logs for **${guild.name}**`)
      .addFields(
        {
          name: '📜 Logs',
          value:
            `Enabled: **${yesNo(config.logs.enabled)}**\n` +
            `Channel: ${getChannelDisplay(guild, config.logs.channelId)}`,
        },
        {
          name: '✉️ Warning Delivery',
          value: `DM Warnings: **${yesNo(config.dmWarnings)}**`,
        }
      );
  }

  if (view === 'ignore') {
    embed
      .setDescription(`Choose who and what AutoMod ignores in **${guild.name}**`)
      .addFields(
        {
          name: '🚫 Ignored Channels',
          value: getIgnoredChannelsDisplay(guild, config.ignoredChannelIds),
          inline: false,
        },
        {
          name: '🎭 Ignored Roles',
          value: getIgnoredRolesDisplay(guild, config.ignoredRoleIds),
          inline: false,
        },
        {
          name: '👤 Ignored Users',
          value: getIgnoredUsersDisplay(guild, config.ignoredUserIds),
          inline: false,
        }
      );
  }

  const tabRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('automod_tab_overview')
      .setLabel('Overview')
      .setStyle(view === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('automod_tab_rules')
      .setLabel('Rules')
      .setStyle(view === 'rules' ? ButtonStyle.Primary : ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('automod_tab_logs')
      .setLabel('Logs')
      .setStyle(view === 'logs' ? ButtonStyle.Primary : ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('automod_tab_ignore')
      .setLabel('Ignore')
      .setStyle(view === 'ignore' ? ButtonStyle.Primary : ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('admin:home')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
  );

  const mainControlsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('automod_toggle_ignore_bots')
      .setLabel(`Bots: ${onOff(config.ignoreBots)}`)
      .setStyle(stateStyle(config.ignoreBots)),

    new ButtonBuilder()
      .setCustomId('automod_toggle_ignore_admins')
      .setLabel(`Admins: ${onOff(config.ignoreAdmins)}`)
      .setStyle(stateStyle(config.ignoreAdmins)),

    new ButtonBuilder()
      .setCustomId('automod_toggle_dm_warnings')
      .setLabel(`DM Warnings: ${onOff(config.dmWarnings)}`)
      .setStyle(stateStyle(config.dmWarnings)),

    new ButtonBuilder()
      .setCustomId('automod_toggle_global')
      .setLabel(`AutoMod: ${onOff(config.enabled)}`)
      .setStyle(stateStyle(config.enabled)),

    new ButtonBuilder()
      .setCustomId('automod_reset')
      .setLabel('Reset')
      .setStyle(ButtonStyle.Danger)
  );

  if (view === 'overview') {
    return {
      embeds: [embed],
      components: [tabRow, mainControlsRow],
    };
  }

  if (view === 'rules') {
    const selectedRule = 'antiSpam';

    const rulesSelectRow = new ActionRowBuilder().addComponents(
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

    const rule = config[selectedRule];

    const rulesButtonRow = new ActionRowBuilder().addComponents(
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
        .setLabel('Actions')
        .setStyle(ButtonStyle.Secondary)
    );

    return {
      embeds: [embed],
      components: [tabRow, rulesSelectRow, rulesButtonRow],
    };
  }

  if (view === 'logs') {
    const channelRow = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('automod_logs_channel_select')
        .setPlaceholder('Select AutoMod logs channel')
        .setMinValues(0)
        .setMaxValues(1)
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.GuildForum
        )
    );

    const logsButtonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('automod_toggle_logs')
        .setLabel(`Logs: ${onOff(config.logs.enabled)}`)
        .setStyle(stateStyle(config.logs.enabled)),

      new ButtonBuilder()
        .setCustomId('automod_toggle_dm_warnings')
        .setLabel(`DM Warnings: ${onOff(config.dmWarnings)}`)
        .setStyle(stateStyle(config.dmWarnings)),

      new ButtonBuilder()
        .setCustomId('automod_clear_logs_channel')
        .setLabel('Clear Channel')
        .setStyle(ButtonStyle.Secondary)
    );

    return {
      embeds: [embed],
      components: [tabRow, channelRow, logsButtonRow],
    };
  }

  if (view === 'ignore') {
    const maxChannelValues = Math.max(1, Math.min(25, guild.channels.cache.size || 1));
    const maxRoleValues = Math.max(
      1,
      Math.min(25, guild.roles.cache.filter((role) => role.id !== guild.id).size || 1)
    );
    const maxUserValues = Math.max(1, Math.min(25, guild.memberCount || 1));

    const channelRow = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('automod_ignore_channels_select')
        .setPlaceholder('Select ignored channels')
        .setMinValues(0)
        .setMaxValues(maxChannelValues)
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
          ChannelType.AnnouncementThread,
          ChannelType.GuildVoice,
          ChannelType.GuildStageVoice,
          ChannelType.GuildForum,
          ChannelType.GuildCategory
        )
    );

    const roleRow = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId('automod_ignore_roles_select')
        .setPlaceholder('Select ignored roles')
        .setMinValues(0)
        .setMaxValues(maxRoleValues)
    );

    const userRow = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId('automod_ignore_users_select')
        .setPlaceholder('Select ignored users')
        .setMinValues(0)
        .setMaxValues(maxUserValues)
    );

    const ignoreButtonsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('automod_clear_ignored_channels')
        .setLabel('Clear Channels')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('automod_clear_ignored_roles')
        .setLabel('Clear Roles')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('automod_clear_ignored_users')
        .setLabel('Clear Users')
        .setStyle(ButtonStyle.Secondary)
    );

    return {
      embeds: [embed],
      components: [tabRow, channelRow, roleRow, userRow, ignoreButtonsRow],
    };
  }

  return {
    embeds: [embed],
    components: [tabRow, mainControlsRow],
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
      .setLabel('Actions')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('automod_tab_rules')
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
  const selectedValues = normalizePunishments(rule.punishments);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`⚖️ Actions • ${meta.label}`)
    .setDescription(`Current actions: **${formatPunishments(selectedValues)}**`)
    .addFields({
      name: '⏱️ Timeout Length',
      value: `**${rule.timeoutMinutes}** minute(s)`,
      inline: false,
    })
    .setTimestamp();

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`automod_punishment_select:${selectedRule}`)
      .setPlaceholder('Choose one or more actions')
      .setMinValues(1)
      .setMaxValues(PUNISHMENTS.length)
      .addOptions(
        PUNISHMENTS.map((entry) => ({
          label: entry.label,
          value: entry.value,
          default: selectedValues.includes(entry.value),
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
  return buildMainPanelPayload(guild, 'logs');
}

function buildIgnorePanelPayload(guild) {
  return buildMainPanelPayload(guild, 'ignore');
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

async function handleInteraction(interaction) {
  if (!interaction.guild) return false;

  if (interaction.isButton()) {
    const { customId } = interaction;

    if (customId.startsWith('automod_tab_')) {
      await interaction.deferUpdate();
      const view = customId.replace('automod_tab_', '');
      await interaction.editReply(buildMainPanelPayload(interaction.guild, view));
      return true;
    }

    if (customId === 'automod_toggle_global') {
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.enabled = !config.enabled;
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'overview'));
      return true;
    }

    if (customId === 'automod_toggle_ignore_bots') {
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.ignoreBots = !config.ignoreBots;
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'overview'));
      return true;
    }

    if (customId === 'automod_toggle_ignore_admins') {
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.ignoreAdmins = !config.ignoreAdmins;
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'overview'));
      return true;
    }

    if (customId === 'automod_toggle_dm_warnings') {
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.dmWarnings = !config.dmWarnings;
      saveConfig(interaction.guild.id, config);

      const activeView = interaction.message?.components?.[0]?.components?.find(
        (component) => component.custom_id?.startsWith('automod_tab_') && component.style === ButtonStyle.Primary
      )?.custom_id?.replace('automod_tab_', '') || 'overview';

      await interaction.editReply(buildMainPanelPayload(interaction.guild, activeView));
      return true;
    }

    if (customId === 'automod_view_rules') {
      await interaction.deferUpdate();
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'rules'));
      return true;
    }

    if (customId === 'automod_view_logs') {
      await interaction.deferUpdate();
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'logs'));
      return true;
    }

    if (customId === 'automod_view_ignore') {
      await interaction.deferUpdate();
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'ignore'));
      return true;
    }

    if (customId === 'automod_back_main') {
      await interaction.deferUpdate();
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'overview'));
      return true;
    }

    if (customId === 'automod_toggle_logs') {
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.logs.enabled = !config.logs.enabled;
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'logs'));
      return true;
    }

    if (customId === 'automod_clear_logs_channel') {
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.logs.channelId = null;
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'logs'));
      return true;
    }

    if (customId === 'automod_clear_ignored_channels') {
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.ignoredChannelIds = [];
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'ignore'));
      return true;
    }

    if (customId === 'automod_clear_ignored_roles') {
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.ignoredRoleIds = [];
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'ignore'));
      return true;
    }

    if (customId === 'automod_clear_ignored_users') {
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.ignoredUserIds = [];
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'ignore'));
      return true;
    }

    if (customId === 'automod_reset') {
      await interaction.deferUpdate();
      resetGuildAutoModConfig(interaction.guild.id);
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'overview'));
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
      const punishments = normalizePunishments(interaction.values);
      const config = getConfig(interaction.guild.id);
      config[ruleKey].punishments = punishments;
      config[ruleKey].punishment = punishments[0];
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildPunishmentPanelPayload(interaction.guild, ruleKey));
      return true;
    }

    return false;
  }

  if (interaction.isChannelSelectMenu()) {
    if (interaction.customId === 'automod_logs_channel_select') {
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.logs.channelId = interaction.values[0] ? extractId(interaction.values[0]) : null;
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'logs'));
      return true;
    }

    if (interaction.customId === 'automod_ignore_channels_select') {
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.ignoredChannelIds = interaction.values.map(extractId).filter(Boolean);
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'ignore'));
      return true;
    }

    return false;
  }

  if (interaction.isRoleSelectMenu()) {
    if (interaction.customId === 'automod_ignore_roles_select') {
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.ignoredRoleIds = interaction.values.map(extractId).filter(Boolean);
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'ignore'));
      return true;
    }

    return false;
  }

  if (interaction.isUserSelectMenu()) {
    if (interaction.customId === 'automod_ignore_users_select') {
      await interaction.deferUpdate();
      const config = getConfig(interaction.guild.id);
      config.ignoredUserIds = interaction.values.map(extractId).filter(Boolean);
      saveConfig(interaction.guild.id, config);
      await interaction.editReply(buildMainPanelPayload(interaction.guild, 'ignore'));
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