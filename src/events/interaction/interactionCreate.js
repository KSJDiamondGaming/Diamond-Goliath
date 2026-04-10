const { MessageFlags } = require('discord.js');
const stats = require('../../utils/stats/statsManager');
const automodPanel = require('../../utils/automod/automodPanel');

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
  ) {
    return false;
  }

  if (stats?.handleInteraction) {
    if (await stats.handleInteraction(interaction)) return true;
  }

  if (automodPanel?.handleInteraction) {
    if (await automodPanel.handleInteraction(interaction, client)) return true;
  }

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
      if (!command) {
        const payload = {
          content: 'That command could not be found.',
          flags: MessageFlags.Ephemeral,
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload).catch(() => {});
        } else {
          await interaction.reply(payload).catch(() => {});
        }
        return;
      }

      await command.execute(interaction, client);
    } catch (error) {
      console.error(`[COMMAND ERROR] /${interaction.commandName}`, error);

      const payload = {
        content: 'There was an error while executing this command.',
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