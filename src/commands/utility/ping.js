const {
  SlashCommandBuilder,
  MessageFlags,
} = require('discord.js');
const { createPanelEmbed } = require('../../utils/embed/embedStyle');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('`🏓` Check the bots latency and status'),

  async execute(interaction) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        });
      }

      const apiLatency = Math.round(interaction.client.ws.ping);
      const botLatency = Date.now() - interaction.createdTimestamp;
      const uptime = process.uptime();

      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);

      const getStatusIcon = (ms) => {
        if (ms < 100) return '🟢';
        if (ms < 200) return '🟡';
        return '🔴';
      };

      const getHealthText = () => {
        if (botLatency < 100 && apiLatency < 100) return 'Excellent';
        if (botLatency < 200 && apiLatency < 200) return 'Stable';
        if (botLatency < 350 && apiLatency < 350) return 'Moderate';
        return 'Delayed';
      };

      const embed = createPanelEmbed(interaction, {
        title: '📡 Bot Ping',
        description: 'Live performance snapshot for KSJ Goliath.',
        thumbnail: interaction.client.user.displayAvatarURL({ dynamic: true }),
        footerText: 'KSJ Goliath • Performance Panel',
        footerIcon: interaction.client.user.displayAvatarURL({ dynamic: true }),
        timestamp: true,
      }).addFields(
        {
          name: 'Performance',
          value: [
            `${getStatusIcon(botLatency)} **Bot Latency**`,
            `\`${botLatency}ms\``,
            '',
            `${getStatusIcon(apiLatency)} **API Latency**`,
            `\`${apiLatency}ms\``,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Overview',
          value: [
            '**Health**',
            `\`${getHealthText()}\``,
            '',
            '**Uptime**',
            `\`${days}d ${hours}h ${minutes}m\``,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Panel Status',
          value: 'System response is being tracked for this request.',
          inline: false,
        }
      );

      await interaction.editReply({
        content: '',
        embeds: [embed],
      });
    } catch (error) {
      console.error('❌ Ping command failed:', error);

      if (isIgnorableInteractionError(error)) {
        return;
      }

      try {
        await safeReply(interaction, {
          content: '❌ Ping failed to load.',
          embeds: [],
          components: [],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        console.error('❌ Failed to send ping failure response:', replyError);
      }
    }
  },
};

async function safeReply(interaction, payload) {
  const safePayload = {
    ...payload,
    embeds: payload.embeds ?? [],
    components: payload.components ?? [],
  };

  if (interaction.deferred) {
    return await interaction.editReply(stripFlagsForEditReply(safePayload));
  }

  if (interaction.replied) {
    return await interaction.followUp({
      ...safePayload,
      flags: safePayload.flags ?? MessageFlags.Ephemeral,
    });
  }

  return await interaction.reply(safePayload);
}

function stripFlagsForEditReply(payload) {
  const { flags, ...rest } = payload;
  return rest;
}

function isIgnorableInteractionError(error) {
  return error?.code === 10062 || error?.code === 40060;
}