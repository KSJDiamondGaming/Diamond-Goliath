const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} = require('discord.js');
const {
  getGuildAutoModConfig,
  saveGuildAutoModConfig,
} = require('../../utils/automodStore');

const PUNISHMENT_CHOICES = [
  { name: 'Delete', value: 'delete' },
  { name: 'Warn', value: 'warn' },
  { name: 'Timeout', value: 'timeout' },
  { name: 'Kick', value: 'kick' },
  { name: 'Ban', value: 'ban' },
];

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
        value: config.ignoreBots ? 'Yes' : 'No',
        inline: true,
      },
      {
        name: 'Ignore Admins',
        value: config.ignoreAdmins ? 'Yes' : 'No',
        inline: true,
      },
      {
        name: 'Anti Spam',
        value: [
          `Enabled: **${config.antiSpam.enabled ? 'Yes' : 'No'}**`,
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
          `Enabled: **${config.repeatedMessages.enabled ? 'Yes' : 'No'}**`,
          `Max Repeats: **${config.repeatedMessages.maxRepeats}**`,
          `Window: **${config.repeatedMessages.intervalSeconds}s**`,
          `Punishment: **${config.repeatedMessages.punishment}**`,
          `Timeout: **${config.repeatedMessages.timeoutMinutes}m**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Logs',
        value: config.logs.channelId
          ? `Enabled: **${config.logs.enabled ? 'Yes' : 'No'}**\nChannel: <#${config.logs.channelId}>`
          : `Enabled: **${config.logs.enabled ? 'Yes' : 'No'}**\nChannel: **Not set**`,
        inline: true,
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
          `✅ **Anti Spam** updated.`,
          `Enabled: **${saved.antiSpam.enabled ? 'Yes' : 'No'}**`,
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
        interaction.options.getInteger('interval_seconds') ??
        config.repeatedMessages.intervalSeconds;
      config.repeatedMessages.punishment =
        interaction.options.getString('punishment') ?? config.repeatedMessages.punishment;
      config.repeatedMessages.timeoutMinutes =
        interaction.options.getInteger('timeout_minutes') ??
        config.repeatedMessages.timeoutMinutes;

      const saved = saveGuildAutoModConfig(guildId, config);

      return interaction.reply({
        content: [
          `✅ **Repeated Messages** updated.`,
          `Enabled: **${saved.repeatedMessages.enabled ? 'Yes' : 'No'}**`,
          `Max Repeats: **${saved.repeatedMessages.maxRepeats}**`,
          `Window: **${saved.repeatedMessages.intervalSeconds}s**`,
          `Punishment: **${saved.repeatedMessages.punishment}**`,
          `Timeout: **${saved.repeatedMessages.timeoutMinutes}m**`,
        ].join('\n'),
        ephemeral: true,
      });
    }

    return interaction.reply({
      content: 'Unknown subcommand.',
      ephemeral: true,
    });
  },
};