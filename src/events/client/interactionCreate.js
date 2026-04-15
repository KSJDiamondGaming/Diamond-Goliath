const { MessageFlags } = require('discord.js');

const stats = require('../../utils/stats/statsManager');
const automodPanel = require('../../utils/automod/automodPanel');

const {
  handleModPanelInteraction,
  handleModPanelModal,
} = require('../../utils/moderation/modPanel');

const {
  handleCasePanelButton,
  handleCasePanelModal,
} = require('../../commands/moderation/case');

// ✅ Safe embed panel handler loader
let embedPanelInteraction = null;

try {
  embedPanelInteraction = require('../../utils/embed/embedPanelInteraction');
  console.log('✅ Embed panel handler loaded');
} catch (error) {
  embedPanelInteraction = null; // silent fallback
}

function isModPanelButton(customId = '') {
  return customId.startsWith('mod_');
}

function isCasePanelButton(customId = '') {
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

function isModPanelModal(customId = '') {
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
    customId.startsWith('mod_submit_timeout:') ||
    customId.startsWith('mod_submit_case_note:')
  );
}

function isCasePanelModal(customId = '') {
  return (
    customId === 'casepanel_submit_search_case' ||
    customId === 'casepanel_submit_search_member' ||
    customId === 'casepanel_submit_moderator' ||
    customId === 'casepanel_submit_export'
  );
}

async function handleButtonInteraction(interaction, client) {
  const { customId } = interaction;

  if (isModPanelButton(customId)) {
    await handleModPanelInteraction(interaction);
    return true;
  }

  if (isCasePanelButton(customId)) {
    await handleCasePanelButton(interaction);
    return true;
  }

  if (stats?.handleInteraction) {
    if (await stats.handleInteraction(interaction, client)) return true;
  }

  if (automodPanel?.handleInteraction) {
    if (await automodPanel.handleInteraction(interaction, client)) return true;
  }

  // ✅ Embed panel (only if exists)
  if (customId?.startsWith('embedpanel_') && embedPanelInteraction) {
    if (await embedPanelInteraction(interaction, client)) return true;
  }

  return false;
}

async function handleSelectMenuInteraction(interaction, client) {
  const { customId } = interaction;

  if (
    customId.startsWith('mod_action_select:') ||
    customId === 'mod_user_select'
  ) {
    await handleModPanelInteraction(interaction);
    return true;
  }

  if (stats?.handleInteraction) {
    if (await stats.handleInteraction(interaction, client)) return true;
  }

  if (automodPanel?.handleInteraction) {
    if (await automodPanel.handleInteraction(interaction, client)) return true;
  }

  // ✅ Embed panel
  if (customId?.startsWith('embedpanel_') && embedPanelInteraction) {
    if (await embedPanelInteraction(interaction, client)) return true;
  }

  return false;
}

async function handleModalInteraction(interaction, client) {
  const { customId } = interaction;

  if (isModPanelModal(customId)) {
    await handleModPanelModal(interaction);
    return true;
  }

  if (isCasePanelModal(customId)) {
    await handleCasePanelModal(interaction);
    return true;
  }

  if (stats?.handleInteraction) {
    if (await stats.handleInteraction(interaction, client)) return true;
  }

  if (automodPanel?.handleInteraction) {
    if (await automodPanel.handleInteraction(interaction, client)) return true;
  }

  // ✅ Embed panel
  if (customId?.startsWith('embedpanel_') && embedPanelInteraction) {
    if (await embedPanelInteraction(interaction, client)) return true;
  }

  return false;
}

module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    try {
      console.log('🟦 INTERACTION EVENT FIRED');
      console.log('🟦 Type:', interaction.type);
      console.log('🟦 Command:', interaction.commandName ?? 'N/A');
      console.log('🟦 Custom ID:', interaction.customId ?? 'N/A');

      // 💬 Slash commands
      if (interaction.isChatInputCommand()) {
        console.log(`🟨 CHAT INPUT COMMAND REACHED: /${interaction.commandName}`);

        const command = client.commands.get(interaction.commandName);
        console.log(`🟨 COMMAND EXISTS: ${!!command}`);

        if (!command) {
          const payload = {
            content: `❌ Command not found: /${interaction.commandName}`,
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

      // 🔎 Autocomplete
      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);

        if (command?.autocomplete) {
          await command.autocomplete(interaction, client);
        }

        return;
      }

      // 🔘 Buttons
      if (interaction.isButton()) {
        const handled = await handleButtonInteraction(interaction, client);
        if (handled) return;
        return;
      }

      // 📋 Select menus
      if (
        interaction.isStringSelectMenu() ||
        interaction.isUserSelectMenu()
      ) {
        const handled = await handleSelectMenuInteraction(interaction, client);
        if (handled) return;
        return;
      }

      // 📝 Modals
      if (interaction.isModalSubmit()) {
        const handled = await handleModalInteraction(interaction, client);
        if (handled) return;
        return;
      }
    } catch (error) {
      console.error(
        `❌ [COMMAND ERROR] /${interaction.commandName || interaction.customId || 'interaction'}`,
        error
      );

      if (interaction.isAutocomplete()) return;

      const payload = {
        content: '❌ There was an error while executing this interaction.',
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