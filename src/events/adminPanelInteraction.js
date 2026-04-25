const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');

const { buildAdminPanel, buildChannelPanel, buildPurgeModal } = require('../utils/admin/adminPanel');
const automodPanel = require('../utils/automod/automodPanel');
const { getGuildConfig, setGuildConfig } = require('../utils/config/guildConfigStore');
const { enforceCommandAccess } = require('../utils/utility/commandAccess');
const logAdminAction = require('../utils/logging/adminlogs/adminActionLog');

function buildBackRow(label = 'Back to Admin Panel') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('admin:home')
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildEmbedPanelMessage(guild) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🧩 Embed Panel')
    .setDescription(
      [
        'Manage embed tools from here.',
        '',
        'This panel is connected and ready for expansion.',
      ].join('\n')
    )
    .addFields(
      {
        name: 'Server',
        value: guild?.name ? `\`${guild.name}\`` : '`Unknown Server`',
        inline: true,
      },
      {
        name: 'Status',
        value: '✅ Embed panel loaded',
        inline: true,
      }
    )
    .setFooter({
      text: guild?.name || 'KSJ Goliath',
      iconURL: guild?.iconURL?.({ dynamic: true }) || undefined,
    })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [buildBackRow()],
  };
}

async function execute(interaction) {
  try {
    if (interaction.isButton()) {
      if (!interaction.customId.startsWith('admin:')) return false;
      if (!interaction.guild) return false;

      const memberDisplayName =
        interaction.member?.displayName ||
        interaction.user?.globalName ||
        interaction.user?.username ||
        'Unknown User';

      if (interaction.customId === 'admin:home') {
        await interaction.update(
          buildAdminPanel(interaction.guild, memberDisplayName)
        );
        return true;
      }

      if (interaction.customId === 'admin:automod') {
        const payload = automodPanel.buildMainPanelPayload(interaction.guild);
        await interaction.update(payload);
        return true;
      }

      if (interaction.customId === 'admin:embed') {
        await interaction.update(buildEmbedPanelMessage(interaction.guild));
        return true;
      }

      if (interaction.customId === 'admin:setlogs') {
        await interaction.update(buildChannelPanel('logs'));
        return true;
      }

      if (interaction.customId === 'admin:setmodlog') {
        await interaction.update(buildChannelPanel('modlog'));
        return true;
      }

      if (interaction.customId === 'admin:setadminlog') {
        await interaction.update(buildChannelPanel('adminlog'));
        return true;
      }

      if (interaction.customId === 'admin:setautomodlog') {
        await interaction.update(buildChannelPanel('automodlog'));
        return true;
      }

      if (interaction.customId === 'admin:toggleadminlogger') {
        const currentConfig = getGuildConfig(interaction.guild.id);
        const nextEnabled = !currentConfig.adminActionLoggerEnabled;

        setGuildConfig(interaction.guild.id, {
          adminActionLoggerEnabled: nextEnabled,
        });

        await interaction.update({
          ...buildAdminPanel(interaction.guild, memberDisplayName),
        });

        await logAdminAction({
          guild: interaction.guild,
          moderator: interaction.user,
          action: nextEnabled ? 'Admin Logger Enabled' : 'Admin Logger Disabled',
          reason: nextEnabled
            ? 'Admin action logger was enabled from the admin panel.'
            : 'Admin action logger was disabled from the admin panel.',
          details: [
            {
              name: 'Setting',
              value: 'adminActionLoggerEnabled',
              inline: true,
            },
            {
              name: 'New Value',
              value: String(nextEnabled),
              inline: true,
            },
          ],
          force: nextEnabled,
        });

        return true;
      }

      if (interaction.customId === 'admin:purge') {
        await interaction.showModal(buildPurgeModal());
        return true;
      }

      return false;
    }

    if (interaction.isChannelSelectMenu()) {
      if (!interaction.customId.startsWith('admin:')) return false;
      if (!interaction.guild) return false;

      const channelId = interaction.values[0];
      const channel = interaction.guild.channels.cache.get(channelId);

      if (!channel) {
        await interaction.reply({
          content: '❌ I could not find that channel.',
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      if (interaction.customId === 'admin:selectlogs') {
        setGuildConfig(interaction.guild.id, {
          logsChannelId: channel.id,
        });

        await interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor('#5865F2')
              .setTitle('✅ Logs Updated')
              .setDescription(`Logs channel set to ${channel}.`)
              .setTimestamp(),
          ],
          components: [buildBackRow()],
        });

        await logAdminAction({
          guild: interaction.guild,
          moderator: interaction.user,
          action: 'Logs Channel Updated',
          reason: `General logs channel set to ${channel}.`,
          details: [
            {
              name: 'Channel ID',
              value: channel.id,
              inline: true,
            },
          ],
        });

        return true;
      }

      if (interaction.customId === 'admin:selectmodlog') {
        setGuildConfig(interaction.guild.id, {
          modLogChannelId: channel.id,
        });

        await interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor('#5865F2')
              .setTitle('✅ Moderation Logs Updated')
              .setDescription(`Moderation log channel set to ${channel}.`)
              .setTimestamp(),
          ],
          components: [buildBackRow()],
        });

        await logAdminAction({
          guild: interaction.guild,
          moderator: interaction.user,
          action: 'Mod Log Channel Updated',
          reason: `Moderation log channel set to ${channel}.`,
          details: [
            {
              name: 'Channel ID',
              value: channel.id,
              inline: true,
            },
          ],
        });

        return true;
      }

      if (interaction.customId === 'admin:selectadminlog') {
        setGuildConfig(interaction.guild.id, {
          adminLogChannelId: channel.id,
        });

        await interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor('#5865F2')
              .setTitle('✅ Admin Logs Updated')
              .setDescription(`Admin log channel set to ${channel}.`)
              .setTimestamp(),
          ],
          components: [buildBackRow()],
        });

        await logAdminAction({
          guild: interaction.guild,
          moderator: interaction.user,
          action: 'Admin Log Channel Updated',
          reason: `Admin log channel set to ${channel}.`,
          details: [
            {
              name: 'Channel ID',
              value: channel.id,
              inline: true,
            },
          ],
          force: true,
        });

        return true;
      }

      if (interaction.customId === 'admin:selectautomodlog') {
        setGuildConfig(interaction.guild.id, {
          automodLogChannelId: channel.id,
        });

        await interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor('#5865F2')
              .setTitle('✅ AutoMod Logs Updated')
              .setDescription(`AutoMod log channel set to ${channel}.`)
              .setTimestamp(),
          ],
          components: [buildBackRow()],
        });

        await logAdminAction({
          guild: interaction.guild,
          moderator: interaction.user,
          action: 'AutoMod Log Channel Updated',
          reason: `AutoMod log channel set to ${channel}.`,
          details: [
            {
              name: 'Channel ID',
              value: channel.id,
              inline: true,
            },
          ],
        });

        return true;
      }

      return false;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId !== 'admin:purgeModal') return false;
      if (!interaction.guild) return false;

      const denied = await enforceCommandAccess(
        interaction,
        purgeCommand,
        process.env.BOT_OWNER_ID
      );
      if (denied) return true;

      const channel = interaction.channel;

      if (!channel) {
        await interaction.reply({
          content: '❌ I could not find this channel.',
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      const allowedChannelTypes = [
        ChannelType.GuildText,
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
        ChannelType.AnnouncementThread,
      ];

      if (!allowedChannelTypes.includes(channel.type)) {
        await interaction.reply({
          content: '❌ This can only be used in text channels or threads.',
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      const amount = Number(interaction.fields.getTextInputValue('amount'));

      if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
        await interaction.reply({
          content: '❌ Please enter a whole number between 1 and 100.',
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      const botMember =
        interaction.guild.members.me ||
        (await interaction.guild.members.fetchMe().catch(() => null));

      if (!botMember) {
        await interaction.reply({
          content: '❌ I could not verify my permissions in this server.',
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
        await interaction.reply({
          content: '❌ I do not have permission to manage messages in this server.',
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      if (
        'permissionsFor' in channel &&
        !channel.permissionsFor(botMember)?.has(PermissionFlagsBits.ManageMessages)
      ) {
        await interaction.reply({
          content: '❌ I do not have permission to manage messages in this channel.',
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let deleted;

      try {
        deleted = await channel.bulkDelete(amount, true);
      } catch (error) {
        if (error?.code === 10008) {
          await interaction.editReply({
            content: '⚠️ Some messages no longer existed while purging. Please try again.',
            embeds: [],
            components: [],
          });
          return true;
        }

        throw error;
      }

      if (!deleted?.size) {
        await interaction.editReply({
          content: '⚠️ No messages were deleted.',
          embeds: [],
          components: [],
        });
        return true;
      }

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🧹 Messages Purged')
        .setDescription(`Successfully deleted \`${deleted.size}\` messages.`)
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
        components: [],
      });

      await logAdminAction({
        guild: interaction.guild,
        moderator: interaction.user,
        action: 'Purge',
        reason: `Purged ${deleted.size} message(s) in ${channel}.`,
        details: [
          {
            name: 'Channel',
            value: `${channel}`,
            inline: true,
          },
          {
            name: 'Deleted',
            value: String(deleted.size),
            inline: true,
          },
        ],
      });

      return true;
    }

    return false;
  } catch (error) {
    if (error?.code === 10062 || error?.code === 40060) {
      return true;
    }

    console.error('❌ Admin panel interaction failed:', error);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: '❌ Something went wrong in the admin panel.',
        });
      } else if (interaction.isRepliable()) {
        await interaction.reply({
          content: '❌ Something went wrong in the admin panel.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch {}

    return true;
  }
}

module.exports = { execute };