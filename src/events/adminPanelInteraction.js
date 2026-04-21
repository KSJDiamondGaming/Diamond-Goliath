const fs = require('fs');
const path = require('path');
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
const { buildStatsSetupMessage } = require('../utils/stats/statsUI');
const { buildEmbedPanelMessage } = require('../utils/embed/embedPanelInteraction');
const { setGuildConfig } = require('../utils/config/guildConfigStore');
const {
  enforceCommandAccess,
} = require('../utils/utility/commandAccess');

const purgeCommand = require('../commands/moderation/purge');

const logChannelsPath = path.join(__dirname, '..', 'data', 'logChannels.json');

function buildBackRow(label = 'Back to Admin Panel') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('admin:home')
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary)
  );
}

function readLogChannels() {
  try {
    if (!fs.existsSync(logChannelsPath)) {
      return {};
    }

    const raw = fs.readFileSync(logChannelsPath, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error('❌ Failed to read logChannels.json:', error);
    return {};
  }
}

function writeLogChannels(data) {
  try {
    const dir = path.dirname(logChannelsPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(logChannelsPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Failed to write logChannels.json:', error);
    throw error;
  }
}

module.exports = {
  name: 'interactionCreate',

  async execute(interaction) {
    try {
      if (interaction.isButton()) {
        if (!interaction.customId.startsWith('admin:')) return;
        if (!interaction.guild) return;

        const memberDisplayName =
          interaction.member?.displayName ||
          interaction.user?.displayName ||
          interaction.user?.username ||
          'Unknown User';

        if (interaction.customId === 'admin:home') {
          return await interaction.update(
            buildAdminPanel(interaction.guild, memberDisplayName)
          );
        }

        if (interaction.customId === 'admin:automod') {
          const payload = automodPanel.buildMainPanelPayload(interaction.guild);
          return await interaction.update(payload);
        }

        if (interaction.customId === 'admin:stats') {
          const payload = buildStatsSetupMessage(interaction.guild);
          return await interaction.update(payload);
        }

        if (interaction.customId === 'admin:embed') {
          const payload = buildEmbedPanelMessage(interaction.guildId);

          return await interaction.update({
            embeds: [payload.embed],
            components: payload.components,
          });
        }

        if (interaction.customId === 'admin:setlogs') {
          return await interaction.update(buildChannelPanel('logs'));
        }

        if (interaction.customId === 'admin:setmodlog') {
          return await interaction.update(buildChannelPanel('modlog'));
        }

        if (interaction.customId === 'admin:purge') {
          return await interaction.showModal(buildPurgeModal());
        }

        return;
      }

      if (interaction.isChannelSelectMenu()) {
        if (!interaction.customId.startsWith('admin:')) return;
        if (!interaction.guild) return;

        const channelId = interaction.values[0];
        const channel = interaction.guild.channels.cache.get(channelId);

        if (!channel) {
          return await interaction.reply({
            content: '❌ I could not find that channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (interaction.customId === 'admin:selectlogs') {
          const logChannels = readLogChannels();
          logChannels[interaction.guild.id] = channel.id;
          writeLogChannels(logChannels);

          return await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('✅ Logs Updated')
                .setDescription(`Logs channel set to ${channel}.`)
                .setTimestamp(),
            ],
            components: [buildBackRow()],
          });
        }

        if (interaction.customId === 'admin:selectmodlog') {
          setGuildConfig(interaction.guild.id, {
            modLogChannelId: channel.id,
          });

          return await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('✅ Moderation Logs Updated')
                .setDescription(`Moderation log channel set to ${channel}.`)
                .setTimestamp(),
            ],
            components: [buildBackRow()],
          });
        }

        return;
      }

      if (interaction.isModalSubmit()) {
        if (interaction.customId !== 'admin:purgeModal') return;
        if (!interaction.guild) return;

        const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
        const denied = await enforceCommandAccess(interaction, purgeCommand, BOT_OWNER_ID);
        if (denied) return;

        const channel = interaction.channel;

        if (!channel) {
          return await interaction.reply({
            content: '❌ I could not find this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const allowedChannelTypes = [
          ChannelType.GuildText,
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
          ChannelType.AnnouncementThread,
        ];

        if (!allowedChannelTypes.includes(channel.type)) {
          return await interaction.reply({
            content: '❌ This can only be used in text channels or threads.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const amount = Number(interaction.fields.getTextInputValue('amount'));

        if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
          return await interaction.reply({
            content: '❌ Please enter a whole number between 1 and 100.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const botMember =
          interaction.guild.members.me ||
          (await interaction.guild.members.fetchMe().catch(() => null));

        if (!botMember) {
          return await interaction.reply({
            content: '❌ I could not verify my permissions in this server.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return await interaction.reply({
            content: '❌ I do not have permission to manage messages in this server.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (
          'permissionsFor' in channel &&
          !channel.permissionsFor(botMember)?.has(PermissionFlagsBits.ManageMessages)
        ) {
          return await interaction.reply({
            content: '❌ I do not have permission to manage messages in this channel.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const deleted = await channel.bulkDelete(amount, true);

        if (!deleted.size) {
          return await interaction.reply({
            content: '⚠️ No messages were deleted. They may all be older than 14 days.',
            flags: MessageFlags.Ephemeral,
          });
        }

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🧹 Messages Purged')
          .setDescription(
            `Successfully deleted \`${deleted.size}\` message${deleted.size === 1 ? '' : 's'}.`
          )
          .addFields(
            {
              name: 'Channel',
              value: `${channel}`,
              inline: true,
            },
            {
              name: 'Moderator',
              value: `${interaction.user}`,
              inline: true,
            }
          )
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();

        return await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) {
        return;
      }

      console.error('❌ Admin panel interaction failed:', error);

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: '❌ Something went wrong in the admin panel.',
            embeds: [],
            components: [],
          });
        } else if (interaction.isRepliable()) {
          await interaction.reply({
            content: '❌ Something went wrong in the admin panel.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        console.error('❌ Failed to send admin panel error response:', replyError);
      }
    }
  },
};