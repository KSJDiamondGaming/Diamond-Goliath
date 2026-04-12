const { MessageFlags } = require('discord.js');
const stats = require('../../utils/stats/statsManager');
const automodPanel = require('../../utils/automod/automodPanel');
const { handleModButton, handleModModal } = require('../../commands/moderation/modpanel');

let embedPanelHandler = null;

try {
  embedPanelHandler = require('../../utils/embed/embedPanelInteraction');
  console.log('✅ Embed panel handler loaded');
} catch {
  console.warn('⚠️ Embed panel handler missing');
}

async function handleComponents(interaction, client) {
  if (interaction.isButton()) {
    if (
      interaction.customId === 'mod_select_user' ||
      interaction.customId === 'mod_cancel_action' ||
      interaction.customId.startsWith('mod_refresh:') ||
      interaction.customId.startsWith('mod_view_cases:') ||
      interaction.customId.startsWith('mod_case_detail:') ||
      interaction.customId.startsWith('mod_edit_case:') ||
      interaction.customId.startsWith('mod_remove_warning:') ||
      interaction.customId.startsWith('mod_remove_timeout:') ||
      interaction.customId.startsWith('mod_case_reverse_warning:') ||
      interaction.customId.startsWith('mod_case_reverse_timeout:') ||
      interaction.customId.startsWith('mod_confirm_action:') ||
      interaction.customId.startsWith('mod_open_ban:') ||
      interaction.customId.startsWith('mod_open_kick:') ||
      interaction.customId.startsWith('mod_open_warn:') ||
      interaction.customId.startsWith('mod_open_timeout:')
    ) {
      await handleModButton(interaction);
      return true;
    }
  }

  if (interaction.isModalSubmit()) {
    if (
      interaction.customId === 'mod_select_user_modal' ||
      interaction.customId.startsWith('mod_submit_case_detail:') ||
      interaction.customId.startsWith('mod_submit_edit_case:') ||
      interaction.customId.startsWith('mod_submit_remove_warning:') ||
      interaction.customId.startsWith('mod_submit_ban:') ||
      interaction.customId.startsWith('mod_submit_kick:') ||
      interaction.customId.startsWith('mod_submit_warn:') ||
      interaction.customId.startsWith('mod_submit_timeout:')
    ) {
      await handleModModal(interaction);
      return true;
    }
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

      if (interaction.isChatInputCommand()) {
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
        return;
      }
    } catch (error) {
      console.error(`[COMMAND ERROR] /${interaction.commandName || 'interaction'}`, error);

      const payload = {
        content: 'There was an error while executing this interaction.',
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