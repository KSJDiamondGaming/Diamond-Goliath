const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
} = require('discord.js');

const {
  enableLockdown,
  disableLockdown,
} = require('../../core/security/lockdownSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('🚨 Manage emergency server lockdown.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addStringOption(option =>
      option
        .setName('mode')
        .setDescription('Choose whether to enable or disable lockdown.')
        .setRequired(true)
        .addChoices(
          { name: 'Enable', value: 'enable' },
          { name: 'Disable', value: 'disable' }
        )
    )

    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for enabling lockdown.')
        .setRequired(false)
    ),

  async execute(interaction) {
    const guild = interaction.guild;
    const mode = interaction.options.getString('mode');

    if (!guild) {
      return interaction.reply({
        content: '❌ This command can only be used inside a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (mode === 'enable') {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const reason =
        interaction.options.getString('reason') || 'No reason provided';

      const loadingEmbed = new EmbedBuilder()
        .setColor(0xffcc00)
        .setTitle('🚨 GOLIATH SECURITY SYSTEM')
        .setDescription(
          [
            '🔒 Initializing lockdown sequence...',
            '',
            '⏳ Applying emergency protection systems.',
            '🧱 Securing text channels.',
            '🔊 Restricting voice channels.',
            '🐢 Enabling slowmode protection.',
            '',
            '⚠️ Please wait while Goliath secures the server.',
          ].join('\n')
        )
        .setFooter({
          text: 'Goliath Lockdown System',
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [loadingEmbed],
      });

      const result = await enableLockdown(guild, {
        reason,
        enabledBy: interaction.user.id,
        enabledByTag: interaction.user.tag,
        reminderChannelId: interaction.channel?.id || null,
        reminderUserId: interaction.user.id,
      });

      if (!result.success) {
        const failedEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('❌ LOCKDOWN FAILED')
          .setDescription(
            result.alreadyActive
              ? '⚠️ Lockdown is already active.'
              : `Failed to enable lockdown: ${result.reason}`
          )
          .setFooter({
            text: 'Goliath Lockdown System',
          })
          .setTimestamp();

        return interaction.editReply({
          embeds: [failedEmbed],
        });
      }

      const successEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🔒 LOCKDOWN ENABLED')
        .setDescription(
          [
            '🚨 Panic protection is now active.',
            '',
            '✅ Text channels locked',
            '✅ Voice channels locked',
            '✅ Slowmode enabled',
            '✅ Staff reminder notifications enabled',
            '',
            `⚠️ Reason: ${reason}`,
            `✅ Protected Channels: ${result.locked}`,
            '',
            `👮 Enabled by: ${interaction.user}`,
          ].join('\n')
        )
        .setFooter({
          text: 'Goliath Lockdown System',
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [successEmbed],
      });

      return;
    }

    if (mode === 'disable') {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const loadingEmbed = new EmbedBuilder()
        .setColor(0xffcc00)
        .setTitle('🔓 GOLIATH SECURITY SYSTEM')
        .setDescription(
          [
            '🔄 Disabling lockdown sequence...',
            '',
            '⏳ Restoring channel permissions.',
            '📡 Returning communication systems to normal.',
            '🔔 Stopping staff reminder notifications.',
            '',
            '⚠️ Please wait while Goliath restores the server.',
          ].join('\n')
        )
        .setFooter({
          text: 'Goliath Lockdown System',
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [loadingEmbed],
      });

      const result = await disableLockdown(guild, {
        disabledBy: interaction.user.id,
        disabledByTag: interaction.user.tag,
        reason: 'Lockdown disabled',
      });

      if (!result.success) {
        const failedEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('❌ LOCKDOWN DISABLE FAILED')
          .setDescription(
            result.notActive
              ? '⚠️ Lockdown is not currently active.'
              : `Failed to disable lockdown: ${result.reason}`
          )
          .setFooter({
            text: 'Goliath Lockdown System',
          })
          .setTimestamp();

        return interaction.editReply({
          embeds: [failedEmbed],
        });
      }

      const successEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🔓 LOCKDOWN DISABLED')
        .setDescription(
          [
            '✅ Panic protection removed.',
            '📡 Server returned to normal operation.',
            '',
            `✅ Restored Channels: ${result.restored}`,
            '',
            `👮 Disabled by: ${interaction.user}`,
          ].join('\n')
        )
        .setFooter({
          text: 'Goliath Lockdown System',
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [successEmbed],
      });

      return;
    }
  },
};
