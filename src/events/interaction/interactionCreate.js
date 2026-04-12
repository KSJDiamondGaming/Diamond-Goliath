const { MessageFlags } = require('discord.js');
const stats = require('../../utils/stats/statsManager');
const automodPanel = require('../../utils/automod/automodPanel');
const { handleModButton, handleModModal } = require('../../utils/moderation/modPanel');
const {
  handleCasePanelButton,
  handleCasePanelModal
} = require('../../commands/moderation/case');

let embedPanelHandler = null;

try {
  embedPanelHandler = require('../../utils/embed/embedPanelInteraction');
  console.log('✅ Embed panel handler loaded');
} catch {
  console.warn('⚠️ Embed panel handler missing');
}

function isModPanelButton(customId) {
  return (
    customId === 'mod_select_user' ||
    customId === 'mod_cancel_action' ||
    customId === 'mod_bulk_warn' ||
    customId === 'mod_bulk_timeout' ||
    customId === 'mod_bulk_kick' ||
    customId === 'mod_bulk_ban' ||
    customId.startsWith('mod_refresh:') ||
    customId.startsWith('mod_view_cases:') ||
    customId.startsWith('mod_filter_cases:') ||
    customId.startsWith('mod_case_detail:') ||
    customId.startsWith('mod_edit_case:') ||
    customId.startsWith('mod_remove_warning:') ||
    customId.startsWith('mod_remove_timeout:') ||
    customId.startsWith('mod_case_reverse_warning:') ||
    customId.startsWith('mod_case_reverse_timeout:') ||
    customId.startsWith('mod_confirm_action:') ||
    customId.startsWith('mod_open_ban:') ||
    customId.startsWith('mod_open_kick:') ||
    customId.startsWith('mod_open_warn:') ||
    customId.startsWith('mod_open_timeout:')
  );
}

function isCasePanelButton(customId) {
  return (
    customId === 'casepanel_search_case' ||
    customId === 'casepanel_search_member' ||
    customId === 'casepanel_recent' ||
    customId === 'casepanel_filter_action' ||
    customId === 'casepanel_filter_status' ||
    customId === 'casepanel_moderator' ||
    customId === 'casepanel_export' ||
    customId.startsWith('casepanel_filter_action_') ||
    customId.startsWith('casepanel_filter_status_')
  );
}

function isModPanelModal(customId) {
  return (
    customId === 'mod_select_user_modal' ||
    customId === 'mod_submit_bulk_warn' ||
    customId === 'mod_submit_bulk_timeout' ||
    customId === 'mod_submit_bulk_kick' ||
    customId === 'mod_submit_bulk_ban' ||
    customId.startsWith('mod_submit_case_detail:') ||
    customId.startsWith('mod_submit_edit_case:') ||
    customId.startsWith('mod_submit_remove_warning:') ||
    customId.startsWith('mod_submit_ban:') ||
    customId.startsWith('mod_submit_kick:') ||
    customId.startsWith('mod_submit_warn:') ||
    customId.startsWith('mod_submit_timeout:')
  );
}

function isCasePanelModal(customId) {
  return (
    customId === 'casepanel_submit_search_case' ||
    customId === 'casepanel_submit_search_member' ||
    customId === 'casepanel_submit_moderator' ||
    customId === 'casepanel_submit_export'
  );
}

async function handleComponents(interaction, client) {
  if (interaction.isButton()) {
    if (isModPanelButton(interaction.customId)) {
      await handleModButton(interaction);
      return true;
    }

    if (isCasePanelButton(interaction.customId)) {
      await handleCasePanelButton(interaction);
      return true;
    }
  }

  if (interaction.isModalSubmit()) {
    if (isModPanelModal(interaction.customId)) {
      await handleModModal(interaction);
      return true;
    }

    if (isCasePanelModal(interaction.customId)) {
      await handleCasePanelModal(interaction);
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

      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) {
          await command.autocomplete(interaction, client);
          return;
        }
      }
    } catch (error) {
      console.error(`[COMMAND ERROR] /${interaction.commandName || 'interaction'}`, error);

      if (interaction.isAutocomplete()) return;

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