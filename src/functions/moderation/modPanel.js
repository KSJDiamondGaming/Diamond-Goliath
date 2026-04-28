// functions/moderation/modPanel.js

const Discord = require('discord.js');
const { MessageFlags } = require('discord.js');

const { buildDashboardPayload } = require('./dashboardService');
const { routeModInteraction } = require('./modInteractionRouter');
const { routeModModal } = require('./modModalRouter');
const { hasModPermission } = require('./moderationChecks');

const DEFAULT_VIEW = 'overview';

// =========================
// 🛡️ Access Guard
// =========================

function canOpenModPanel(interaction) {
  return Boolean(
    interaction?.guild &&
    interaction?.member &&
    hasModPermission(interaction.member)
  );
}

function noAccessPayload() {
  return {
    content: '❌ You do not have permission to use the moderation panel.',
    flags: MessageFlags.Ephemeral,
  };
}

// =========================
// 🧭 /mod Entry Point
// =========================

async function openModPanel(interaction, options = {}) {
  if (!canOpenModPanel(interaction)) {
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(noAccessPayload());
    }

    return interaction.reply(noAccessPayload());
  }

  const view = options.view || DEFAULT_VIEW;
  const target = options.target || null;

  const payload = await buildDashboardPayload(
    Discord,
    interaction,
    target,
    view,
    {
      actionFilter: options.actionFilter || 'all',
      statusFilter: options.statusFilter || 'all',
      page: options.page || 0,
    }
  );

  const finalPayload = {
    ...payload,
    flags: MessageFlags.Ephemeral,
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(finalPayload);
  }

  return interaction.reply(finalPayload);
}

// =========================
// 🔘 Button / Select Router
// =========================

async function handleModPanelInteraction(interaction) {
  if (!interaction?.customId) return false;

  const isModInteraction =
    interaction.customId.startsWith('mod_') ||
    interaction.customId.startsWith('mod:');

  if (!isModInteraction) return false;

  return routeModInteraction(interaction);
}

// =========================
// 📝 Modal Router
// =========================

async function handleModPanelModal(interaction) {
  if (!interaction?.customId) return false;

  const isModModal =
    interaction.customId.startsWith('mod_submit_') ||
    interaction.customId.startsWith('mod_select_user_modal');

  if (!isModModal) return false;

  return routeModModal(interaction);
}

// =========================
// ♻️ Backwards-Compatible Aliases
// =========================

const handleModButton = handleModPanelInteraction;
const handleModModal = handleModPanelModal;

module.exports = {
  openModPanel,

  handleModPanelInteraction,
  handleModPanelModal,

  handleModButton,
  handleModModal,
};