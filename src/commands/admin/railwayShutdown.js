const { SlashCommandBuilder } = require('discord.js');
const state = require('../../utils/utility/state');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('railwayshutdown')
    .setDescription('Toggle bot maintenance mode and shut it down'),

  async execute(interaction) {
    if (!state.isOwner(interaction.user.id)) {
      return interaction.reply({
        content: '❌ You are not authorized to use this command.',
        ephemeral: true,
      });
    }

    const isActive = state.toggle();

    await interaction.reply(
      isActive
        ? '🟢 Bot is now ONLINE'
        : '🔴 Bot is shutting down...'
    );

    try {
      await interaction.client.user.setPresence({
        activities: [
          {
            name: isActive ? 'Serving the server' : 'Maintenance Mode',
          },
        ],
        status: isActive ? 'online' : 'dnd',
      });
    } catch (error) {
      console.error('❌ Failed to update bot presence:', error);
    }

    if (!isActive) {
      setTimeout(() => {
        console.log('🛑 Shutting down bot process...');
        process.exit(0);
      }, 1500);
    }
  },
};