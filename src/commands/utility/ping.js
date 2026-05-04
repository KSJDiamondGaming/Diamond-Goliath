const {
  SlashCommandBuilder,
} = require('discord.js');

const { enforceCommandAccess } = require('../../helpers/ui/commandAccess');
const {
  baseEmbed,
  statusText,
  formatUptime,
} = require('../../helpers/ui/embeds');

module.exports = {
  category: 'Utility',

  help: {
    name: 'ping',
    description: '💎 Check Goliath’s live status, heartbeat and latency.',
    usage: '/ping',
  },

  access: {
    permissions: [],
    ownerOnly: false,
  },

  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('💎 Check Goliath’s live status, heartbeat and latency'),

  async execute(interaction) {
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
    const denied = await enforceCommandAccess(interaction, module.exports, BOT_OWNER_ID);
    if (denied) return;

    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({
          flags: 64,
        });
      }

      const clientLatency = Date.now() - interaction.createdTimestamp;
      const apiLatency = Math.round(interaction.client.ws.ping);
      const uptime = formatUptime(process.uptime());

      const health =
        clientLatency < 100 && apiLatency < 100
          ? '🟢 Excellent'
          : clientLatency < 200 && apiLatency < 200
            ? '🟡 Stable'
            : clientLatency < 400 && apiLatency < 400
              ? '🟠 Slower than usual'
              : '🔴 Needs attention';

      const getBar = (ms) => {
        if (ms < 100) return '▰▰▰▰▰';
        if (ms < 200) return '▰▰▰▰▱';
        if (ms < 400) return '▰▰▰▱▱';
        return '▰▰▱▱▱';
      };

      const shardId = interaction.guild?.shardId ?? 0;
      const shardCount = interaction.client.shard?.count ?? 1;

      const embed = baseEmbed(interaction.client)
        .setTitle('`🏓` Goliath Status')
        .setDescription([
          `\`●\` **Status:** ${health}`,
          '',
          `\`📡\` **Bot Latency**`,
          `\`${clientLatency}ms\` ${statusText(clientLatency)}`,
          getBar(clientLatency),
          '',
          `\`🌐\` **Discord API**`,
          `\`${apiLatency}ms\` ${statusText(apiLatency)}`,
          getBar(apiLatency),
          '',
          `\`⏱️\` **Uptime**`,
          `\`${uptime}\``,
          '',
          `\`🧩\` **Shard**`,
          `\`${shardId + 1}/${shardCount}\``,
        ].join('\n'));

      return await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      console.error('❌ Ping command failed:', error);

      if (interaction.deferred || interaction.replied) {
        return await interaction.editReply({
          content: '❌ Failed to check Goliath status.',
          embeds: [],
          components: [],
        });
      }

      return await interaction.reply({
        content: '❌ Failed to check Goliath status.',
        flags: 64,
      });
    }
  },
};