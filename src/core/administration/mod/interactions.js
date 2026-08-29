'use strict';

const Discord = require('discord.js');
const { safeReply } = require('../../../core/ui/interactionResponse');
const { db, getCaseById, updateCaseStatus, recordCaseAudit } = require('./storage');
const {
  fetchTarget,
  ensurePanelAccess,
  ensureActionAccess,
  requireModeratableTarget,
  recordModerationSystemEvent,
} = require('./permissions');
const { buildPunishmentModal, buildBulkModal, submitPunishmentRequest, submitBulkModal, createConfirmation, executePendingAction } = require('./punishments');
const { syncExpiredWarningsToCases, showWarningModal, showRemoveWarningModal, submitWarningModal, submitRemoveWarningRequest } = require('./warns');
const { openCaseTool, handleCaseAction, submitCaseModal, handleExternalAppealInteraction } = require('./cases');
const { openCaseSearch, handleCaseSearchAction, handleCaseSearchSelect, handleCaseSearchModal } = require('./caseSearch');
const {
  refreshCasesDashboard,
  handleDashboardNavigation,
  handleUserSelectMenu,
  handleSelectUserButton,
  handlePresetInteraction,
  handlePresetModal,
  handleExportInteraction,
  presetIdFromSubmission,
  markPresetUsed,
} = require('./panel');

const PUNISHMENT_ACTIONS = new Set(['timeout', 'kick', 'ban']);
const BULK_ACTIONS = new Set(['warn', 'timeout', 'kick', 'ban']);
const OPEN_ACTIONS = new Set(['warn', ...PUNISHMENT_ACTIONS]);
const CONFIRM_LOCKS = new Set();
function isModCustomId(customId) { const id = String(customId || ''); return id.startsWith('mod_') || id.startsWith('mod:'); }
function isExternalAppealCustomId(customId) { const id = String(customId || ''); return id === 'mod_appeal_lookup' || id === 'mod_appeal_lookup_submit' || id.startsWith('mod_appeal_external:') || id.startsWith('mod_appeal_external_submit:'); }
function getTargetIdFromCustomId(customId) { return String(customId || '').split(':')[1] || 'none'; }
function getPrefixedAction(customId, prefix, allowedActions) { const id = String(customId || '').split(':')[0]; if (!id.startsWith(prefix)) return null; const action = id.slice(prefix.length); return allowedActions.has(action) ? action : null; }
function getPunishmentSubmitAction(customId) { return getPrefixedAction(customId, 'mod_submit_', PUNISHMENT_ACTIONS); }
function getBulkAction(customId) { return getPrefixedAction(customId, 'mod_submit_bulk_', BULK_ACTIONS) || getPrefixedAction(customId, 'mod_bulk_', BULK_ACTIONS); }
function parseConfirmActionContext(customId) { const parts = String(customId || '').split(':'); const requestedPage = Number(parts[5]); return { token: parts[1] || null, context: { view: parts[2] || 'overview', actionFilter: parts[3] || 'all', statusFilter: parts[4] || 'all', page: Number.isFinite(requestedPage) ? Math.max(0, Math.trunc(requestedPage)) : 0 } }; }
function fieldValue(i, key) { try { return String(i.fields?.getTextInputValue?.(key) || '').trim(); } catch { return ''; } }
function auditFailure(i, event, action, targetId, reason, metadata = {}) { return recordModerationSystemEvent({ interaction: i, event, action, targetId, reason, metadata }); }

async function showPunishmentModal(i, action, targetId) { if (!PUNISHMENT_ACTIONS.has(action)) return false; const target = await requireModeratableTarget(i, targetId, action); if (!target) return true; await i.showModal(buildPunishmentModal(action, target.id)); return true; }
async function requestRemoveTimeout(i, targetId) { const target = await requireModeratableTarget(i, targetId, 'remove_timeout'); if (!target) return true; return createConfirmation(i, target.id, 'remove-timeout', {}, `✅ Remove timeout from **${target.user.tag}**?`); }
async function routeActionRequest(i, action, targetId) { if (action === 'warn') return showWarningModal(i, targetId); if (action === 'remove-warning') return showRemoveWarningModal(i, targetId); if (action === 'remove-timeout') return requestRemoveTimeout(i, targetId); if (PUNISHMENT_ACTIONS.has(action)) return showPunishmentModal(i, action, targetId); return false; }
async function handleActionSelectMenu(i) { if (!i.customId.startsWith('mod_action_select:')) return false; return routeActionRequest(i, i.values[0], getTargetIdFromCustomId(i.customId)); }
async function handleOpenActionButton(i) { const action = getPrefixedAction(i.customId, 'mod_open_', OPEN_ACTIONS); if (!action) return false; return routeActionRequest(i, action, getTargetIdFromCustomId(i.customId)); }
async function handleCaseToolButton(i) { const caseResult = await openCaseTool(i); if (caseResult) return caseResult; const searchResult = await handleCaseSearchAction(i); if (searchResult) return searchResult; const id = String(i.customId || ''); const targetId = getTargetIdFromCustomId(id); if (id.startsWith('mod_remove_warning:')) return routeActionRequest(i, 'remove-warning', targetId); if (id.startsWith('mod_remove_timeout:')) return routeActionRequest(i, 'remove-timeout', targetId); return false; }
async function handleBulkButton(i) {
  if (!String(i.customId || '').startsWith('mod_bulk_')) return false;
  const action = getBulkAction(i.customId); if (!action) return false;
  const allowed = await ensureActionAccess(i, `bulk_${action}`, `❌ No permission to use bulk ${action}.`); if (!allowed) return true;
  await i.showModal(buildBulkModal(action)); return true;
}
async function handleConfirmButton(i) {
  if (!i.customId.startsWith('mod_confirm_action:')) return false;
  const { token, context } = parseConfirmActionContext(i.customId);
  if (!token) return false;
  const lockKey = `${i.guild?.id || 'none'}:${token}`;
  if (CONFIRM_LOCKS.has(lockKey)) {
    recordModerationSystemEvent({ interaction: i, event: 'moderation.confirmation.duplicate_blocked', metadata: { tokenPresent: true } });
    return safeReply(i, { content: '⏳ That moderation action is already being processed.', flags: 64 });
  }
  CONFIRM_LOCKS.add(lockKey);
  try {
    const result = await executePendingAction(Discord, i, token, context);
    recordModerationSystemEvent({ interaction: i, event: 'moderation.confirmation.processed', metadata: { tokenPresent: true, handled: Boolean(result) } });
    return result;
  } finally {
    CONFIRM_LOCKS.delete(lockKey);
  }
}
async function handleCancelButton(i) {
  if (i.customId !== 'mod_cancel_action') return false;
  let removed = 0;
  if (i.guild?.id && i.user?.id) removed = db.prepare('DELETE FROM pending_actions WHERE guild_id = ? AND moderator_id = ?').run(String(i.guild.id), String(i.user.id)).changes;
  recordModerationSystemEvent({ interaction: i, event: 'moderation.action.cancelled', metadata: { pendingActionsRemoved: removed } });
  if (i.message && typeof i.update === 'function') { await i.update({ content: '❌ Cancelled.', embeds: [], components: [] }); return true; }
  return safeReply(i, { content: '❌ Cancelled.', flags: 64 });
}
async function handleBulkModal(i) {
  if (!String(i.customId || '').startsWith('mod_submit_bulk_')) return false;
  const action = getBulkAction(i.customId); if (!action) return false;
  const allowed = await ensureActionAccess(i, `bulk_${action}`, `❌ No permission to use bulk ${action}.`); if (!allowed) return true;
  recordModerationSystemEvent({ interaction: i, event: 'moderation.bulk.requested', action, metadata: { operation: fieldValue(i, 'operation') || action } });
  return submitBulkModal(i, action);
}
function trackPresetSubmission(i) { const presetId = presetIdFromSubmission(i.customId); if (presetId && i.guild) markPresetUsed(i.guild, presetId, i.user?.id || null); }
async function handleActionModal(i) {
  const id = String(i.customId || ''); const targetId = getTargetIdFromCustomId(id);
  if (id.startsWith('mod_submit_warn:')) {
    const result = await submitWarningModal(i, targetId, refreshCasesDashboard);
    if (result?.ok) trackPresetSubmission(i);
    else auditFailure(i, 'moderation.action.failed', 'warn', targetId, result?.error?.message || result?.error || 'Warning submission failed.');
    return result || true;
  }
  if (id.startsWith('mod_submit_remove_warning:')) return submitRemoveWarningRequest(i, targetId, createConfirmation);
  const action = getPunishmentSubmitAction(id); if (!action) return false;
  const target = await requireModeratableTarget(i, targetId, action); if (!target) return true;
  const result = await submitPunishmentRequest(i, target, action);
  if (result?.ok) trackPresetSubmission(i);
  else auditFailure(i, 'moderation.action.failed', action, targetId, result?.error?.message || result?.error || `${action} submission failed.`);
  if (action === 'timeout' && result?.ok) await refreshCasesDashboard(i, target);
  return true;
}
async function hardenAppealDecisionResult(i, result) {
  const match = String(i.customId || '').match(/^mod_submit_case_appeal_decision:(\d+):([^:]+):(approved|denied)$/);
  if (!match || match[3] !== 'approved' || !i.guild?.id) return result;
  const caseId = Number(match[1]);
  const appealId = match[2];
  let modCase = getCaseById(i.guild.id, caseId);
  if (!modCase) return result;
  const appeal = Array.isArray(modCase.metadata?.appeals) ? modCase.metadata.appeals.find((entry) => String(entry?.id) === appealId) : null;
  const remedy = appeal?.remedy || null;
  if (remedy?.ok === false && modCase.status === 'reversed') {
    modCase = updateCaseStatus(i.guild.id, caseId, 'active', i.user?.id || null) || modCase;
    recordCaseAudit({ guildId: i.guild.id, caseId, actorId: i.user?.id || null, event: 'case.appeal.remedy.status_restored', before: 'reversed', after: 'active', metadata: { appealId, remedyAction: remedy.action || null, reason: remedy.detail || 'Approved appeal remedy failed.' } });
    recordModerationSystemEvent({ interaction: i, event: 'moderation.appeal.remedy.failed', action: remedy.action || modCase.action, targetId: modCase.userId, reason: remedy.detail || 'Approved appeal remedy failed.', metadata: { caseId, appealId, caseStatusRestored: true } });
  }
  if (modCase.action === 'warn' && remedy?.ok === true) {
    const existing = db.prepare('SELECT audit_id FROM case_audit WHERE guild_id = ? AND case_id = ? AND event = ? LIMIT 1').get(String(i.guild.id), caseId, 'case.strike.removed');
    if (!existing) {
      const strikeWeight = Math.max(1, Math.min(5, Number(modCase.metadata?.strikeWeight) || 1));
      recordCaseAudit({ guildId: i.guild.id, caseId, actorId: i.user?.id || null, event: 'case.strike.removed', before: strikeWeight, after: 0, metadata: { strikeWeight, appealId, appealRemedy: true } });
    }
  }
  return result;
}
async function handleCaseModal(i) {
  const result = await submitCaseModal(i, { fetchTarget, refreshCasesDashboard });
  return hardenAppealDecisionResult(i, result);
}
async function routeHandlers(i, handlers) { for (const handler of handlers) { const result = await handler(i); if (result) return result; } return false; }
async function routeButtonsAndSelects(i) {
  const denied = ensurePanelAccess(i); if (denied) return denied;
  if (i.isUserSelectMenu?.()) return handleUserSelectMenu(i);
  if (i.isStringSelectMenu?.()) return routeHandlers(i, [handlePresetInteraction, handleCaseSearchSelect, handleActionSelectMenu]);
  if (!i.isButton?.()) return false;
  return routeHandlers(i, [handleExportInteraction, handlePresetInteraction, handleConfirmButton, value => handleCaseAction(value, { fetchTarget, createConfirmation }), handleDashboardNavigation, handleCancelButton, handleSelectUserButton, handleBulkButton, handleOpenActionButton, handleCaseToolButton]);
}
async function routeModModal(i) {
  if (!i?.customId?.startsWith('mod_')) return false;
  const denied = ensurePanelAccess(i); if (denied) return denied;
  await syncExpiredWarningsToCases(i.guild.id);
  if (String(i.customId).startsWith('mod_export_submit:')) {
    const result = await handleExportInteraction(i);
    if (result) {
      recordModerationSystemEvent({ interaction: i, event: 'moderation.export.requested', action: 'export_cases', metadata: {
        scope: fieldValue(i, 'scope'), reference: fieldValue(i, 'reference') || null, format: fieldValue(i, 'format'), include: fieldValue(i, 'include'), filters: fieldValue(i, 'filters').slice(0, 500),
      } });
      return result;
    }
  }
  return routeHandlers(i, [handleExportInteraction, handlePresetModal, handleCaseSearchModal, handleCaseModal, handleBulkModal, handleActionModal]);
}
async function handleModInteraction(i) {
  if (!i?.customId || !isModCustomId(i.customId)) return false;
  if (i.customId.startsWith('nav|')) return false;
  try {
    if (isExternalAppealCustomId(i.customId)) return await handleExternalAppealInteraction(i);
    if (i.isModalSubmit?.()) return await routeModModal(i);
    const handled = await routeButtonsAndSelects(i);
    if (!handled) recordModerationSystemEvent({ interaction: i, event: 'moderation.interaction.unhandled', metadata: { interactionType: i.componentType || null } });
    return handled;
  } catch (error) {
    console.error('❌ Moderation interaction failed:', error);
    auditFailure(i, 'moderation.interaction.failed', null, getTargetIdFromCustomId(i.customId), error?.message || error, { stack: String(error?.stack || '').slice(0, 1500) });
    await safeReply(i, { content: '❌ That moderation action failed safely. No further action was taken.', flags: 64 }).catch(() => null);
    return true;
  }
}
module.exports = { handleModInteraction };
