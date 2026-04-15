const { MessageFlags } = require('discord.js');

const stats = require('../../utils/stats/statsManager');
const automodPanel = require('../../utils/automod/automodPanel');

async function handleButtonInteraction(interaction, client) {
  const { customId } = interaction;

  console.log('BUTTON RECEIVED', {
    customId,
    interactionId: interaction.id,
    userId: interaction.user?.id,
    createdTimestamp: interaction.createdTimestamp,
    now: Date.now(),
    ageMs: Date.now() - interaction.createdTimestamp,
    deferred: interaction.deferred,
    replied: interaction.replied,
  });

  if (customId.startsWith('automod_')) {
    return await automodPanel.handleInteraction(interaction, client);
  }

  // rest...
}

const {
  handleModPanelInteraction,
  handleModPanelModal,
} = require('../../utils/moderation/modPanel');

const {
  handleCasePanelButton,
  handleCasePanelModal,
} = require('../../commands/moderation/case');

// Safe embed panel handler
let embedPanelInteraction = null;

try {
  embedPanelInteraction = require('../../utils/embed/embedPanelInteraction');
  console.log('✅ Embed panel handler loaded');
} catch {
  embedPanelInteraction = null;
}

function isModPanelButton(customId = '') {
  return customId.startsWith('mod_');
}

function isCasePanelButton(customId = '') {
  return customId.startsWith('casepanel_');
}

/* =========================
   BUTTON HANDLER
========================= */
async function handleButtonInteraction(interaction, client) {
  const { customId } = interaction;

  // 🔒 HARD LOCK: AutoMod ONLY
  if (customId.startsWith('automod_')) {
    return await automodPanel.handleInteraction(interaction, client);
  }

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

  if (customId?.startsWith('embedpanel_') && embedPanelInteraction) {
    if (await embedPanelInteraction(interaction, client)) return true;
  }

  return false;
}

/* =========================
   SELECT MENU HANDLER
========================= */
async function handleSelectMenuInteraction(interaction, client) {
  const { customId } = interaction;

  // 🔒 HARD LOCK: AutoMod ONLY
  if (customId.startsWith('automod_')) {
    return await automodPanel.handleInteraction(interaction, client);
  }

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

  if (customId?.startsWith('embedpanel_') && embedPanelInteraction) {
    if (await embedPanelInteraction(interaction, client)) return true;
  }

  return false;
}

/* =========================
   MODAL HANDLER
========================= */
async function handleModalInteraction(interaction, client) {
  const { customId } = interaction;

  // 🔒 HARD LOCK: AutoMod ONLY
  if (customId.startsWith('automod_')) {
    return await automodPanel.handleInteraction(interaction, client);
  }

  if (customId.startsWith('mod_')) {
    await handleModPanelModal(interaction);
    return true;
  }

  if (customId.startsWith('casepanel_')) {
    await handleCasePanelModal(interaction);
    return true;
  }

  if (stats?.handleInteraction) {
    if (await stats.handleInteraction(interaction, client)) return true;
  }

  if (customId?.startsWith('embedpanel_') && embedPanelInteraction) {
    if (await embedPanelInteraction(interaction, client)) return true;
  }

  return false;
}

/* =========================
   MAIN EVENT
========================= */
module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    try {
      console.log('🟦 INTERACTION EVENT FIRED');
      console.log('🟦 Type:', interaction.type);
      console.log('🟦 Command:', interaction.commandName ?? 'N/A');
      console.log('🟦 Custom ID:', interaction.customId ?? 'N/A');

      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
          return interaction.reply({
            content: `❌ Command not found`,
            flags: MessageFlags.Ephemeral,
          });
        }

        await command.execute(interaction, client);
        return;
      }

      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) {
          await command.autocomplete(interaction, client);
        }
        return;
      }

      if (interaction.isButton()) {
        const handled = await handleButtonInteraction(interaction, client);
        if (handled) return;
        return;
      }

      if (
        interaction.isStringSelectMenu() ||
        interaction.isUserSelectMenu()
      ) {
        const handled = await handleSelectMenuInteraction(interaction, client);
        if (handled) return;
        return;
      }

      if (interaction.isModalSubmit()) {
        const handled = await handleModalInteraction(interaction, client);
        if (handled) return;
        return;
      }

    } catch (error) {
      console.error('❌ Interaction error:', error);

      const payload = {
        content: '❌ Something went wrong.',
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