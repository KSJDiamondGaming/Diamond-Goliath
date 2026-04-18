const { SlashCommandBuilder } = require('discord.js');
const state = require('../../utils/utility/state');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('railwayShutdown')
    .setDescription('🛠️ Maintenance • toggle bot maintenance mode'),

  async execute(interaction) {
    if (!state.isOwner(interaction.user.id)) {
      return interaction.reply({
        content: '❌ You are not authorized to use this command.',
        ephemeral: true
      });
    }

    const isActive = state.toggle();

    await interaction.reply(
      isActive
        ? '🟢 Bot is now ONLINE'
        : '🔴 Bot is now OFFLINE (maintenance mode)'
    );

    interaction.client.user.setPresence({
      activities: [{
        name: isActive ? 'Serving the server' : 'Maintenance Mode'
      }],
      status: isActive ? 'online' : 'dnd'
    });
  }
};