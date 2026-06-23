const Discord = require('discord.js');
const { ActionRowBuilder, UserSelectMenuBuilder, EmbedBuilder } = require('discord.js');

const {
  hasModPermission,
  canUseModAction,
  getModActionDeniedMessage,
  checkHierarchy,
} = require('./moderationChecks');

const {
  fetchTarget,
  findMemberByQuery,
  parseDuration,
  isValidTimeoutDuration,
  getWarningExpiry,
  parseDeleteDays,
} = require('../../../helpers/ui/targetHelpers');

const {
  safeReply,
  ephemeralError,
} = require('../../../helpers/ui/interactionResponse');

const { buildDashboardPayload, refreshDashboard } = require('./dashboardService');
const { executePendingAction } = require('./modActionExecutor');

const { runBulkAction } = require('./bulkActionRunner');
const {
  buildReasonModal,
  buildBulkModal,
  buildCaseIdModal,
  buildEditCaseModal,
  buildCaseNoteModal,
} = require('../../../helpers/ui/modalBuilders');

const {
  buildConfirmRow,
  buildConfirmCustomId,
  parseConfirmActionContext,
} = require('../../../helpers/ui/pendingActionHelpers');

const {
  createCase,
  getCaseById,
  updateCaseReason,
  updateCaseNote,
  clearCaseNote,
} = require('../../../logging/cases/caseStore');

const {
  addWarning,
  getWarningByCaseId,
} = require('../../../logging/warnings/warningStore');

const { createPendingAction } = require('../../../logging/stores/pendingActionStore');
const { handleEscalation, getRepeatReasonInfo } = require('./escalationSystem');

const DEFAULT_CONTEXT = {
  view: 'cases',
  actionFilter: 'all',
  statusFilter: 'all',
  page: 0,
};

function cleanError(error) {
  return String(error || '').replace(/^❌\s*/, '');
}

function ensureAccess(interaction) {
  if (!hasModPermission(interaction.member)) {
    return safeReply(
      interaction,
      ephemeralError('No permission to use moderation panel.')
    );
  }
  return null;
}

function getTargetId(customId) {
  return String(customId || '').split(':')[1] || 'none';
}

async function requireTarget(interaction, targetId) {
  if (!targetId || targetId === 'none') {
    await safeReply(interaction, ephemeralError('No user selected.'));
    return null;
  }

  const target = await fetchTarget(interaction.guild, targetId);

  if (!target) {
    await safeReply(interaction, ephemeralError('User not found.'));
    return null;
  }

  return target;
}

/* =========================
   🔘 BUTTON + SELECT ROUTER
========================= */

async function handleInteraction(interaction) {
  if (!interaction?.customId) return false;

  // ================= USER SELECT =================
  if (interaction.isUserSelectMenu()) {
    if (interaction.customId !== 'mod_user_select') return false;

    const denied = ensureAccess(interaction);
    if (denied) return denied;

    const target = await fetchTarget(interaction.guild, interaction.values[0]);

    if (!target) {
      return safeReply(interaction, {
        content: '❌ User not found.',
        flags: 64,
      });
    }

    const payload = await buildDashboardPayload(
      Discord,
      interaction,
      target,
      'overview'
    );

    return interaction.update(payload);
  }

  // ================= ACTION SELECT =================
  if (interaction.isStringSelectMenu()) {
    if (!interaction.customId.startsWith('mod_action_select:')) return false;

    const denied = ensureAccess(interaction);
    if (denied) return denied;

    const targetId = getTargetId(interaction.customId);
    const action = interaction.values[0];

    const modalMap = {
      warn: buildReasonModal(`mod_submit_warn:${targetId}`, 'Warn User'),
      timeout: buildReasonModal(`mod_submit_timeout:${targetId}`, 'Timeout User'),
      kick: buildReasonModal(`mod_submit_kick:${targetId}`, 'Kick User'),
      ban: buildReasonModal(`mod_submit_ban:${targetId}`, 'Ban User', true),
    };

    if (modalMap[action]) {
      await interaction.showModal(modalMap[action]);
      return true;
    }
  }

  if (!interaction.isButton()) return false;

  const denied = ensureAccess(interaction);
  if (denied) return denied;

  // ================= CONFIRM =================
  if (interaction.customId.startsWith('mod_confirm_action:')) {
    const { token, context } = parseConfirmActionContext(interaction.customId);
    return executePendingAction(Discord, interaction, token, context);
  }

  // ================= SELECT USER BUTTON =================
  if (interaction.customId === 'mod_select_user') {
    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId('mod_user_select')
        .setPlaceholder('Select user')
        .setMinValues(1)
        .setMaxValues(1)
    );

    return safeReply(interaction, {
      content: 'Select a user:',
      components: [row],
      flags: 64,
    });
  }

  return false;
}

/* =========================
   📝 MODAL ROUTER
========================= */

async function handleModal(interaction) {
  if (!interaction?.customId?.startsWith('mod_')) return false;

  const denied = ensureAccess(interaction);
  if (denied) return denied;

  // ================= WARN =================
  if (interaction.customId.startsWith('mod_submit_warn:')) {
    const target = await fetchTarget(
      interaction.guild,
      getTargetId(interaction.customId)
    );

    const reason = interaction.fields.getTextInputValue('reason');

    const modCase = createCase({
      guildId: interaction.guild.id,
      userId: target.id,
      moderatorId: interaction.user.id,
      action: 'warn',
      reason,
    });

    addWarning({
      guildId: interaction.guild.id,
      userId: target.id,
      moderatorId: interaction.user.id,
      reason,
      caseId: modCase.caseId,
    });

    await safeReply(interaction, {
      content: `⚠️ Warned ${target.user.tag}`,
      flags: 64,
    });

    return true;
  }

  // ================= TIMEOUT =================
  if (interaction.customId.startsWith('mod_submit_timeout:')) {
    const target = await fetchTarget(
      interaction.guild,
      getTargetId(interaction.customId)
    );

    const duration = interaction.fields.getTextInputValue('duration');
    const reason = interaction.fields.getTextInputValue('reason');

    const ms = parseDuration(duration);

    if (!ms || !isValidTimeoutDuration(ms)) {
      return safeReply(interaction, {
        content: '❌ Invalid duration.',
        flags: 64,
      });
    }

    await target.timeout(ms, reason);

    await safeReply(interaction, {
      content: `⏳ Timed out ${target.user.tag}`,
      flags: 64,
    });

    return true;
  }

  return false;
}

/* =========================
   🧠 MASTER ROUTER
========================= */

async function routeMod(interaction) {
  if (interaction.isModalSubmit()) {
    return handleModal(interaction);
  }

  return handleInteraction(interaction);
}

module.exports = {
  routeMod,
};
