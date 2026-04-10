const { MessageFlags } = require('discord.js');
const stats = require('../../utils/stats/statsManager');

let embedPanelHandler = null;

try {
  embedPanelHandler = require('../../utils/embed/embedPanelInteraction');
  console.log('✅ Embed panel handler loaded');
} catch {
  console.warn('⚠️ Embed panel handler missing');
}

async function handleComponents(interaction, client) {
  if (
    !interaction.isButton() &&
    !interaction.isStringSelectMenu() &&
    !interaction.isModalSubmit()
  ) return false;

  // stats system
  if (stats?.handleInteraction) {
    if (await stats.handleInteraction(interaction)) return true;
  }

  // embed panel
  if (interaction.customId?.startsWith('embedpanel_') && embedPanelHandler) {
    return await embedPanelHandler(interaction, client);
  }

  return false;
}

module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    try {
      if (await handleComponents(interaction, client)) return;

      if (!interaction.isChatInputCommand()) return;

      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      await command.execute(interaction, client);

    } catch (error) {
      console.error(`[COMMAND ERROR] /${interaction.commandName}`, error);

      const payload = {
        content: 'Something went wrong.',
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};