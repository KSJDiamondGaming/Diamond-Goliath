const Discord = require('discord.js');

const { buildDashboardPayload } = require('./dashboardService');
const { routeModInteraction } = require('./modInteractionRouter');
const { routeModModal } = require('./modModalRouter');

const {
  safeReply,
  ephemeralError
} = require('../utility/interactionResponse');

const {
  hasModPermission
} = require('../admin/permissionChecks');

// =========================
// 🚀 Open Moderation Panel
// =========================
async function openModPanel(interaction) {
  if (!hasModPermission(interaction.member)) {
    return safeReply(
      interaction,
      ephemeralError('You do not have permission to use this panel.')
    );
  }

  try {
    const payload = await buildDashboardPayload(
      Discord,
      interaction,
      null,
      'overview'
    );

    return safeReply(interaction, payload);
  } catch (error) {
    console.error('openModPanel error:', error);

    return safeReply(
      interaction,
      ephemeralError('Failed to open moderation panel.')
    );
  }
}

// =========================
// 🔘 Button / Select Router
// =========================
async function handleModPanelInteraction(interaction) {
  try {
    return await routeModInteraction(interaction);
  } catch (error) {
    console.error('handleModPanelInteraction error:', error);

    return safeReply(
      interaction,
      ephemeralError('Interaction failed.')
    );
  }
}

// =========================
// 📝 Modal Router
// =========================
async function handleModPanelModal(interaction) {
  try {
    return await routeModModal(interaction);
  } catch (error) {
    console.error('handleModPanelModal error:', error);

    return safeReply(
      interaction,
      ephemeralError('Modal handling failed.')
    );
  }
}

// =========================
// ♻️ Backward-compatible aliases
// =========================
const handleModButton = handleModPanelInteraction;
const handleModModal = handleModPanelModal;

module.exports = {
  openModPanel,
  handleModPanelInteraction,
  handleModPanelModal,

  // old names kept so older files still work
  handleModButton,
  handleModModal
};