const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const { enforceCommandAccess } = require('../../utils/commandAccess');

module.exports = {
  category: 'Utility',
  help: {
    name: 'ping',
    description: 'Check the bot latency and status.',
    usage: '/ping'
  },
  access: {
    permissions: [],
    ownerOnly: false
  },

  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot latency and status'),

  async execute(interaction) {
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
    const denied = await enforceCommandAccess(interaction, module.exports, BOT_OWNER_ID);
    if (denied) return;

    const apiLatency = Math.round(interaction.client.ws.ping);
    const clientLatency = Date.now() - interaction.createdTimestamp;

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🏓 Pong!')
      .addFields(
        {
          name: 'Client Latency',
          value: `\`${clientLatency}ms\``,
          inline: true
        },
        {
          name: 'API Latency',
          value: `\`${apiLatency}ms\``,
          inline: true
        }
      )
      .setFooter({ text: `${interaction.client.user.username} Status Check` })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
};