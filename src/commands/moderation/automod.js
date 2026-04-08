const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} = require('discord.js');
const {
  getGuildAutoModConfig,
  saveGuildAutoModConfig,
  resetGuildAutoModConfig,
} = require('../../utils/automodStore');

const PUNISHMENT_CHOICES = [
  { name: 'Delete', value: 'delete' },
  { name: 'Warn', value: 'warn' },
  { name: 'Timeout', value: 'timeout' },
  { name: 'Kick', value: 'kick' },
  { name: 'Ban', value: 'ban' },
];

function boolText(value) {
  return value ? 'Yes' : 'No';
}

function channelText(channelId) {
  return channelId ? `<#${channelId}>` : '**Not set**';
}

function listText(items) {
  return items.length ? items.join(', ') : 'None';
}

function parseCsvList(value) {
  if (!value) return [];

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildOverviewEmbed(guild, config) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🛡️ AutoMod Overview')
    .setDescription(`Current AutoMod settings for **${guild.name}**.`)
    .addFields(
      {
        name: 'System',
        value: config.enabled ? 'Enabled' : 'Disabled',
        inline: true,
      },
      {
        name: 'Ignore Bots',
        value: boolText(config.ignoreBots),
        inline: true,
      },
      {
        name: 'Ignore Admins',
        value: boolText(config.ignoreAdmins),
        inline: true,
      },
      {
        name: 'Ignored Channels',
        value: config.ignoredChannelIds.length
          ? config.ignoredChannelIds.map((id) => `<#${id}>`).join(', ')
          : 'None',
        inline: false,
      },
      {
        name: 'Ignored Roles',
        value: config.ignoredRoleIds.length
          ? config.ignoredRoleIds.map((id) => `<@&${id}>`).join(', ')
          : 'None',
        inline: false,
      },
      {
        name: 'Ignored Users',
        value: config.ignoredUserIds.length
          ? config.ignoredUserIds.map((id) => `<@${id}>`).join(', ')
          : 'None',
        inline: false,
      },
      {
        name: 'Anti Spam',
        value: [
          `Enabled: **${boolText(config.antiSpam.enabled)}**`,
          `Max Messages: **${config.antiSpam.maxMessages}**`,
          `Window: **${config.antiSpam.intervalSeconds}s**`,
          `Punishment: **${config.antiSpam.punishment}**`,
          `Timeout: **${config.antiSpam.timeoutMinutes}m**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Repeated Messages',
        value: [
          `Enabled: **${boolText(config.repeatedMessages.enabled)}**`,
          `Max Repeats: **${config.repeatedMessages.maxRepeats}**`,
          `Window: **${config.repeatedMessages.intervalSeconds}s**`,
          `Punishment: **${config.repeatedMessages.punishment}**`,
          `Timeout: **${config.repeatedMessages.timeoutMinutes}m**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Anti Invite',
        value: [
          `Enabled: **${boolText(config.antiInvite.enabled)}**`,
          `Punishment: **${config.antiInvite.punishment}**`,
          `Timeout: **${config.antiInvite.timeoutMinutes}m**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Anti Link',
        value: [
          `Enabled: **${boolText(config.antiLink.enabled)}**`,
          `Punishment: **${config.antiLink.punishment}**`,
          `Timeout: **${config.antiLink.timeoutMinutes}m**`,
          `Allowed Domains: **${listText(config.antiLink.allowedDomains)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Caps Abuse',
        value: [
          `Enabled: **${boolText(config.capsAbuse.enabled)}**`,
          `Min Length: **${config.capsAbuse.minLength}**`,
          `Percent: **${config.capsAbuse.percentage}%**`,
          `Punishment: **${config.capsAbuse.punishment}**`,
          `Timeout: **${config.capsAbuse.timeoutMinutes}m**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Bad Words',
        value: [
          `Enabled: **${boolText(config.badWords.enabled)}**`,
          `Words: **${config.badWords.words.length ? config.badWords.words.join(', ') : 'None'}**`,
          `Punishment: **${config.badWords.punishment}**`,
          `Timeout: **${config.badWords.timeoutMinutes}m**`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Logs',
        value: [
          `Enabled: **${boolText(config.logs.enabled)}**`,
          `Channel: ${channelText(config.logs.channelId)}`,
        ].join('\n'),
        inline: false,
      }
    )
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Manage the server automod system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand((subcommand) =>
      subcommand
        .setName('overview')
        .setDescription('View current automod settings')
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('toggle')
        .setDescription('Enable or disable automod globally')
        .addBooleanOption((option) =>
          option
            .setName('enabled')
            .setDescription('Whether automod should be enabled')
            .setRequired(true)
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('ignore')
        .setDescription('Configure basic automod ignore settings')
        .addBooleanOption((option) =>
          option
            .setName('ignore_bots')
            .setDescription('Whether automod should ignore bot messages')
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName('ignore_admins')
            .setDescription('Whether automod should ignore admins')
            .setRequired(false)
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('logs')
        .setDescription('Configure automod logs')
        .addBooleanOption((option) =>
          option
            .setName('enabled')
            .setDescription('Whether automod logs should be enabled')
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel to send automod logs to')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('antispam')
        .setDescription('Configure anti-spam protection')
        .addBooleanOption((option) =>
          option
            .setName('enabled')
            .setDescription('Enable or disable anti-spam')
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('max_messages')
            .setDescription('How many messages are allowed in the time window')
            .setMinValue(2)
            .setMaxValue(20)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName('interval_seconds')
            .setDescription('Time window in seconds')
            .setMinValue(2)
            .setMaxValue(60)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('punishment')
            .setDescription('Action to take when anti-spam triggers')
            .addChoices(...PUNISHMENT_CHOICES)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName('timeout_minutes')
            .setDescription('Timeout length if punishment is timeout')
            .setMinValue(1)
            .setMaxValue(40320)
            .setRequired(false)
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('repeats')
        .setDescription('Configure repeated message protection')
        .addBooleanOption((option) =>
          option
            .setName('enabled')
            .setDescription('Enable or disable repeated message detection')
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('max_repeats')
            .setDescription('How many repeated messages are allowed')
            .setMinValue(2)
            .setMaxValue(10)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName('interval_seconds')
            .setDescription('Time window in seconds')
            .setMinValue(2)
            .setMaxValue(60)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('punishment')
            .setDescription('Action to take when repeat detection triggers')
            .addChoices(...PUNISHMENT_CHOICES)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName('timeout_minutes')
            .setDescription('Timeout length if punishment is timeout')
            .setMinValue(1)
            .setMaxValue(40320)
            .setRequired(false)
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('invite')
        .setDescription('Configure discord invite protection')
        .addBooleanOption((option) =>
          option
            .setName('enabled')
            .setDescription('Enable or disable invite detection')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('punishment')
            .setDescription('Action to take when invite detection triggers')
            .addChoices(...PUNISHMENT_CHOICES)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName('timeout_minutes')
            .setDescription('Timeout length if punishment is timeout')
            .setMinValue(1)
            .setMaxValue(40320)
            .setRequired(false)
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('links')
        .setDescription('Configure link protection')
        .addBooleanOption((option) =>
          option
            .setName('enabled')
            .setDescription('Enable or disable link detection')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('punishment')
            .setDescription('Action to take when link detection triggers')
            .addChoices(...PUNISHMENT_CHOICES)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName('timeout_minutes')
            .setDescription('Timeout length if punishment is timeout')
            .setMinValue(1)
            .setMaxValue(40320)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('allowed_domains')
            .setDescription('Comma separated domains to allow, e.g. youtube.com,youtu.be')
            .setRequired(false)
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('caps')
        .setDescription('Configure excessive caps protection')
        .addBooleanOption((option) =>
          option
            .setName('enabled')
            .setDescription('Enable or disable caps abuse detection')
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('min_length')
            .setDescription('Minimum message length before caps check applies')
            .setMinValue(1)
            .setMaxValue(2000)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName('percentage')
            .setDescription('Uppercase percentage needed to trigger')
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('punishment')
            .setDescription('Action to take when caps abuse triggers')
            .addChoices(...PUNISHMENT_CHOICES)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName('timeout_minutes')
            .setDescription('Timeout length if punishment is timeout')
            .setMinValue(1)
            .setMaxValue(40320)
            .setRequired(false)
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('badwords')
        .setDescription('Configure blocked words protection')
        .addBooleanOption((option) =>
          option
            .setName('enabled')
            .setDescription('Enable or disable blocked words detection')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('punishment')
            .setDescription('Action to take when blocked words trigger')
            .addChoices(...PUNISHMENT_CHOICES)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName('timeout_minutes')
            .setDescription('Timeout length if punishment is timeout')
            .setMinValue(1)
            .setMaxValue(40320)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('words')
            .setDescription('Comma separated blocked words list')
            .setRequired(false)
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('ignorelist')
        .setDescription('Set ignored channels, roles, or users')
        .addStringOption((option) =>
          option
            .setName('channels')
            .setDescription('Comma separated channel IDs')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('roles')
            .setDescription('Comma separated role IDs')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('users')
            .setDescription('Comma separated user IDs')
            .setRequired(false)
        )
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('Reset automod settings back to default')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const config = getGuildAutoModConfig(guildId);

    if (subcommand === 'overview') {
      return interaction.reply({
        embeds: [buildOverviewEmbed(interaction.guild, config)],
        ephemeral: true,
      });
    }

    if (subcommand === 'toggle') {
      config.enabled = interaction.options.getBoolean('enabled');
      const saved = saveGuildAutoModConfig(guildId, config);

      return interaction.reply({
        content: `✅ AutoMod has been **${saved.enabled ? 'enabled' : 'disabled'}**.`,
        ephemeral: true,
      });
    }

    if (subcommand === 'ignore') {
      const ignoreBots = interaction.options.getBoolean('ignore_bots');
      const ignoreAdmins = interaction.options.getBoolean('ignore_admins');

      if (ignoreBots !== null) config.ignoreBots = ignoreBots;
      if (ignoreAdmins !== null) config.ignoreAdmins = ignoreAdmins;

      const saved = saveGuildAutoModConfig(guildId, config);

      return interaction.reply({
        content: [
          '✅ **Ignore settings** updated.',
          `Ignore Bots: **${boolText(saved.ignoreBots)}**`,
          `Ignore Admins: **${boolText(saved.ignoreAdmins)}**`,
        ].join('\n'),
        ephemeral: true,
      });
    }

    if (subcommand === 'logs') {
      const enabled = interaction.options.getBoolean('enabled');
      const channel = interaction.options.getChannel('channel');

      config.logs.enabled = enabled;

      if (channel) {
        config.logs.channelId = channel.id;
      }

      const saved = saveGuildAutoModConfig(guildId, config);

      return interaction.reply({
        content: saved.logs.channelId
          ? `✅ AutoMod logs **${saved.logs.enabled ? 'enabled' : 'disabled'}** in <#${saved.logs.channelId}>.`
          : `✅ AutoMod logs **${saved.logs.enabled ? 'enabled' : 'disabled'}**. No log channel is set yet.`,
        ephemeral: true,
      });
    }

    if (subcommand === 'antispam') {
      config.antiSpam.enabled = interaction.options.getBoolean('enabled');
      config.antiSpam.maxMessages =
        interaction.options.getInteger('max_messages') ?? config.antiSpam.maxMessages;
      config.antiSpam.intervalSeconds =
        interaction.options.getInteger('interval_seconds') ?? config.antiSpam.intervalSeconds;
      config.antiSpam.punishment =
        interaction.options.getString('punishment') ?? config.antiSpam.punishment;
      config.antiSpam.timeoutMinutes =
        interaction.options.getInteger('timeout_minutes') ?? config.antiSpam.timeoutMinutes;

      const saved = saveGuildAutoModConfig(guildId, config);

      return interaction.reply({
        content: [
          '✅ **Anti Spam** updated.',
          `Enabled: **${boolText(saved.antiSpam.enabled)}**`,
          `Max Messages: **${saved.antiSpam.maxMessages}**`,
          `Window: **${saved.antiSpam.intervalSeconds}s**`,
          `Punishment: **${saved.antiSpam.punishment}**`,
          `Timeout: **${saved.antiSpam.timeoutMinutes}m**`,
        ].join('\n'),
        ephemeral: true,
      });
    }

    if (subcommand === 'repeats') {
      config.repeatedMessages.enabled = interaction.options.getBoolean('enabled');
      config.repeatedMessages.maxRepeats =
        interaction.options.getInteger('max_repeats') ?? config.repeatedMessages.maxRepeats;
      config.repeatedMessages.intervalSeconds =
        interaction.options.getInteger('interval_seconds') ?? config.repeatedMessages.intervalSeconds;
      config.repeatedMessages.punishment =
        interaction.options.getString('punishment') ?? config.repeatedMessages.punishment;
      config.repeatedMessages.timeoutMinutes =
        interaction.options.getInteger('timeout_minutes') ?? config.repeatedMessages.timeoutMinutes;

      const saved = saveGuildAutoModConfig(guildId, config);

      return interaction.reply({
        content: [
          '✅ **Repeated Messages** updated.',
          `Enabled: **${boolText(saved.repeatedMessages.enabled)}**`,
          `Max Repeats: **${saved.repeatedMessages.maxRepeats}**`,
          `Window: **${saved.repeatedMessages.intervalSeconds}s**`,
          `Punishment: **${saved.repeatedMessages.punishment}**`,
          `Timeout: **${saved.repeatedMessages.timeoutMinutes}m**`,
        ].join('\n'),
        ephemeral: true,
      });
    }

    if (subcommand === 'invite') {
      config.antiInvite.enabled = interaction.options.getBoolean('enabled');
      config.antiInvite.punishment =
        interaction.options.getString('punishment') ?? config.antiInvite.punishment;
      config.antiInvite.timeoutMinutes =
        interaction.options.getInteger('timeout_minutes') ?? config.antiInvite.timeoutMinutes;

      const saved = saveGuildAutoModConfig(guildId, config);

      return interaction.reply({
        content: [
          '✅ **Anti Invite** updated.',
          `Enabled: **${boolText(saved.antiInvite.enabled)}**`,
          `Punishment: **${saved.antiInvite.punishment}**`,
          `Timeout: **${saved.antiInvite.timeoutMinutes}m**`,
        ].join('\n'),
        ephemeral: true,
      });
    }

    if (subcommand === 'links') {
      config.antiLink.enabled = interaction.options.getBoolean('enabled');
      config.antiLink.punishment =
        interaction.options.getString('punishment') ?? config.antiLink.punishment;
      config.antiLink.timeoutMinutes =
        interaction.options.getInteger('timeout_minutes') ?? config.antiLink.timeoutMinutes;

      const allowedDomains = interaction.options.getString('allowed_domains');
      if (allowedDomains !== null) {
        config.antiLink.allowedDomains = parseCsvList(allowedDomains);
      }

      const saved = saveGuildAutoModConfig(guildId, config);

      return interaction.reply({
        content: [
          '✅ **Anti Link** updated.',
          `Enabled: **${boolText(saved.antiLink.enabled)}**`,
          `Punishment: **${saved.antiLink.punishment}**`,
          `Timeout: **${saved.antiLink.timeoutMinutes}m**`,
          `Allowed Domains: **${listText(saved.antiLink.allowedDomains)}**`,
        ].join('\n'),
        ephemeral: true,
      });
    }

    if (subcommand === 'caps') {
      config.capsAbuse.enabled = interaction.options.getBoolean('enabled');
      config.capsAbuse.minLength =
        interaction.options.getInteger('min_length') ?? config.capsAbuse.minLength;
      config.capsAbuse.percentage =
        interaction.options.getInteger('percentage') ?? config.capsAbuse.percentage;
      config.capsAbuse.punishment =
        interaction.options.getString('punishment') ?? config.capsAbuse.punishment;
      config.capsAbuse.timeoutMinutes =
        interaction.options.getInteger('timeout_minutes') ?? config.capsAbuse.timeoutMinutes;

      const saved = saveGuildAutoModConfig(guildId, config);

      return interaction.reply({
        content: [
          '✅ **Caps Abuse** updated.',
          `Enabled: **${boolText(saved.capsAbuse.enabled)}**`,
          `Min Length: **${saved.capsAbuse.minLength}**`,
          `Percentage: **${saved.capsAbuse.percentage}%**`,
          `Punishment: **${saved.capsAbuse.punishment}**`,
          `Timeout: **${saved.capsAbuse.timeoutMinutes}m**`,
        ].join('\n'),
        ephemeral: true,
      });
    }

    if (subcommand === 'badwords') {
      config.badWords.enabled = interaction.options.getBoolean('enabled');
      config.badWords.punishment =
        interaction.options.getString('punishment') ?? config.badWords.punishment;
      config.badWords.timeoutMinutes =
        interaction.options.getInteger('timeout_minutes') ?? config.badWords.timeoutMinutes;

      const words = interaction.options.getString('words');
      if (words !== null) {
        config.badWords.words = parseCsvList(words);
      }

      const saved = saveGuildAutoModConfig(guildId, config);

      return interaction.reply({
        content: [
          '✅ **Bad Words** updated.',
          `Enabled: **${boolText(saved.badWords.enabled)}**`,
          `Words: **${saved.badWords.words.length ? saved.badWords.words.join(', ') : 'None'}**`,
          `Punishment: **${saved.badWords.punishment}**`,
          `Timeout: **${saved.badWords.timeoutMinutes}m**`,
        ].join('\n'),
        ephemeral: true,
      });
    }

    if (subcommand === 'ignorelist') {
      const channels = interaction.options.getString('channels');
      const roles = interaction.options.getString('roles');
      const users = interaction.options.getString('users');

      if (channels !== null) config.ignoredChannelIds = parseCsvList(channels);
      if (roles !== null) config.ignoredRoleIds = parseCsvList(roles);
      if (users !== null) config.ignoredUserIds = parseCsvList(users);

      const saved = saveGuildAutoModConfig(guildId, config);

      return interaction.reply({
        content: [
          '✅ **Ignore lists** updated.',
          `Channels: **${saved.ignoredChannelIds.length ? saved.ignoredChannelIds.join(', ') : 'None'}**`,
          `Roles: **${saved.ignoredRoleIds.length ? saved.ignoredRoleIds.join(', ') : 'None'}**`,
          `Users: **${saved.ignoredUserIds.length ? saved.ignoredUserIds.join(', ') : 'None'}**`,
        ].join('\n'),
        ephemeral: true,
      });
    }

    if (subcommand === 'reset') {
      resetGuildAutoModConfig(guildId);

      return interaction.reply({
        content: '✅ AutoMod settings have been reset to default.',
        ephemeral: true,
      });
    }

    return interaction.reply({
      content: 'Unknown subcommand.',
      ephemeral: true,
    });
  },
};