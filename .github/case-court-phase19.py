from pathlib import Path

p = Path('src/core/administration/mod/cases.js')
s = p.read_text()

def rep(old, new, label):
    global s
    if old not in s:
        raise RuntimeError(f'Anchor not found: {label}')
    s = s.replace(old, new, 1)

rep("const APPEAL_REVIEW_LOCKS = new Set();\n", "const APPEAL_REVIEW_LOCKS = new Set();\nconst APPEAL_REMEDY_LOCKS = new Set();\nconst APPEAL_REMEDY_STALE_MS = 5 * 60 * 1000;\n", 'appeal remedy constants')

rep("function getAppealQueueState(token, guildId) {\n  const state = APPEAL_QUEUE_STATES.get(token);\n  if (!state || state.guildId !== String(guildId) || Date.now() - state.createdAt > APPEAL_QUEUE_TTL) { APPEAL_QUEUE_STATES.delete(token); return null; }\n  return state;\n}\n", "function getAppealQueueState(token, guildId) {\n  const state = APPEAL_QUEUE_STATES.get(token);\n  if (!state || state.guildId !== String(guildId) || Date.now() - state.createdAt > APPEAL_QUEUE_TTL) { APPEAL_QUEUE_STATES.delete(token); return null; }\n  return state;\n}\nfunction appealRemedyIsStale(execution) {\n  if (!execution || execution.status !== 'reversing') return false;\n  const started = new Date(execution.reversalClaimedAt || execution.reversalAttemptedAt || 0).getTime();\n  return !Number.isFinite(started) || Date.now() - started > APPEAL_REMEDY_STALE_MS;\n}\n", 'appeal remedy stale helper')

old = "  const components = [new ActionRowBuilder().addComponents(\n    new ButtonBuilder().setCustomId(`mod_case_appeal_decide:${modCase.caseId}:${appeal.id}:approved`).setLabel('✅ Approve').setStyle(ButtonStyle.Success).setDisabled(appeal.status !== 'pending'),\n    new ButtonBuilder().setCustomId(`mod_case_appeal_decide:${modCase.caseId}:${appeal.id}:denied`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger).setDisabled(appeal.status !== 'pending'),\n    new ButtonBuilder().setCustomId(`mod_case_appeal_history:${modCase.caseId}:0`).setLabel('← Appeal History').setStyle(ButtonStyle.Secondary),\n    new ButtonBuilder().setCustomId(`mod_search_open:${modCase.caseId}`).setLabel('Case Detail').setStyle(ButtonStyle.Secondary)\n  )];"
new = "  const courtExecution = modCase.action === 'case' ? modCase.metadata?.court?.sanctionExecution : null;\n  const canRetryRemedy = appeal.status === 'approved' && appeal.remedy?.ok === false && (courtExecution?.status === 'reversal_failed' || (courtExecution?.status === 'reversing' && appealRemedyIsStale(courtExecution)));\n  const components = [new ActionRowBuilder().addComponents(\n    new ButtonBuilder().setCustomId(`mod_case_appeal_decide:${modCase.caseId}:${appeal.id}:approved`).setLabel('✅ Approve').setStyle(ButtonStyle.Success).setDisabled(appeal.status !== 'pending'),\n    new ButtonBuilder().setCustomId(`mod_case_appeal_decide:${modCase.caseId}:${appeal.id}:denied`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger).setDisabled(appeal.status !== 'pending'),\n    new ButtonBuilder().setCustomId(`mod_case_appeal_retry_remedy:${modCase.caseId}:${appeal.id}`).setLabel(courtExecution?.status === 'reversing' && !appealRemedyIsStale(courtExecution) ? '⏳ Remedy Running' : '🔁 Retry Remedy').setStyle(ButtonStyle.Primary).setDisabled(!canRetryRemedy),\n    new ButtonBuilder().setCustomId(`mod_case_appeal_history:${modCase.caseId}:0`).setLabel('← Appeal History').setStyle(ButtonStyle.Secondary),\n    new ButtonBuilder().setCustomId(`mod_search_open:${modCase.caseId}`).setLabel('Case Detail').setStyle(ButtonStyle.Secondary)\n  )];"
rep(old, new, 'appeal detail controls')

anchor = "async function resolveAppeal(interaction, caseId, appealId, decision, reviewNote, fetchTarget) {"
retry_fn = r'''async function retryApprovedCourtAppealRemedy(interaction, caseId, appealId, fetchTarget) {
  const guildId = interaction.guild.id;
  const actorId = interaction.user?.id || null;
  const lockKey = `${guildId}:${caseId}:${appealId}:remedy`;
  if (APPEAL_REMEDY_LOCKS.has(lockKey)) return { ok: false, error: 'This appeal remedy is already being retried.' };
  APPEAL_REMEDY_LOCKS.add(lockKey);
  try {
    let modCase = getCaseById(guildId, caseId);
    if (!modCase || modCase.action !== 'case' || !modCase.metadata?.court) return { ok: false, error: 'Court case could not be found.' };
    let appeals = getCaseAppeals(modCase);
    let index = appeals.findIndex((appeal) => String(appeal.id) === String(appealId));
    if (index < 0 || appeals[index].status !== 'approved') return { ok: false, error: 'Only an approved Court appeal can retry its remedy.' };
    if (appeals[index].remedy?.ok !== false) return { ok: false, error: 'This appeal remedy is already satisfied.' };
    const court = modCase.metadata.court;
    const execution = court.sanctionExecution && typeof court.sanctionExecution === 'object' ? court.sanctionExecution : null;
    if (!execution || !['reversal_failed', 'reversing'].includes(execution.status)) return { ok: false, error: 'This Court sanction is not awaiting reversal recovery.' };
    if (execution.status === 'reversing' && !appealRemedyIsStale(execution)) return { ok: false, error: 'This appeal remedy is already being processed by another reviewer.' };

    const claimedAt = new Date().toISOString();
    const operationId = `court_remedy_${caseId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const claimedExecution = {
      ...execution,
      status: 'reversing',
      reversalOperationId: operationId,
      reversalClaimedBy: actorId,
      reversalClaimedAt: claimedAt,
      reversalAttemptedBy: actorId,
      reversalAttemptedAt: claimedAt,
      error: null,
    };
    const claimedMetadata = { ...(modCase.metadata || {}), court: { ...court, sanctionExecution: claimedExecution } };
    const claimed = updateCaseMetadata(guildId, caseId, claimedMetadata);
    if (!claimed) return { ok: false, error: 'Failed to claim the appeal remedy retry. No reversal action was attempted.' };
    recordCaseAudit({ guildId, caseId, actorId, event: 'case.court.appeal_remedy_retry_claimed', before: execution, after: claimedExecution, metadata: { appealId, operationId } });

    let remedy;
    try {
      remedy = await applyApprovedCourtAppealRemedy(interaction, claimed, fetchTarget);
    } catch (error) {
      remedy = { attempted: true, action: String(claimedExecution.action || court.decision?.action || 'court'), ok: false, detail: String(error?.message || error || 'Appeal remedy retry failed.').slice(0, 300) };
      const failedCase = getCaseById(guildId, caseId) || claimed;
      const failedCourt = failedCase.metadata?.court || court;
      updateCaseMetadata(guildId, caseId, { ...(failedCase.metadata || {}), court: { ...failedCourt, sanctionExecution: { ...(failedCourt.sanctionExecution || claimedExecution), status: 'reversal_failed', reversalOperationId: operationId, reversalAttemptedBy: actorId, reversalAttemptedAt: new Date().toISOString(), reversalRemedy: remedy } } });
      recordCaseAudit({ guildId, caseId, actorId, event: 'case.court.appeal_remedy_retry_failed', before: claimedExecution, after: remedy, metadata: { appealId, operationId } });
    }

    modCase = getCaseById(guildId, caseId) || claimed;
    appeals = getCaseAppeals(modCase);
    index = appeals.findIndex((appeal) => String(appeal.id) === String(appealId));
    if (index < 0) return { ok: false, error: 'Appeal disappeared while the remedy retry was running.' };
    const previousAppeal = appeals[index];
    const attempt = { operationId, attemptedBy: actorId, attemptedAt: new Date().toISOString(), remedy };
    const updatedAppeal = { ...previousAppeal, remedy, remedyAttempts: [...(Array.isArray(previousAppeal.remedyAttempts) ? previousAppeal.remedyAttempts : []), attempt].slice(-20) };
    const nextAppeals = appeals.map((appeal, idx) => idx === index ? updatedAppeal : appeal);
    const updated = updateCaseMetadata(guildId, caseId, { ...(modCase.metadata || {}), appeals: nextAppeals }) || modCase;
    recordCaseAudit({ guildId, caseId, actorId, event: remedy?.ok ? 'case.court.appeal_remedy_retry_succeeded' : 'case.court.appeal_remedy_retry_failed', before: previousAppeal.remedy || null, after: remedy, metadata: { appealId, operationId } });
    return { ok: true, case: updated, appeal: getAppealById(updated, appealId) || updatedAppeal, remedy };
  } finally {
    APPEAL_REMEDY_LOCKS.delete(lockKey);
  }
}

'''
rep(anchor, retry_fn + anchor, 'retry remedy function')

route_anchor = "  if (id.startsWith('mod_case_appeal_decide:')) {\n"
route = "  if (id.startsWith('mod_case_appeal_retry_remedy:')) {\n    if (!canUseModAction(interaction.member, interaction.guild, 'edit_case')) return safeReply(interaction, ephemeralError('No permission to retry appeal remedies.'));\n    const [, caseIdRaw, appealId] = id.split(':');\n    const result = await retryApprovedCourtAppealRemedy(interaction, Number(caseIdRaw), appealId, fetchTarget);\n    if (!result.ok) return safeReply(interaction, ephemeralError(result.error || 'Failed to retry appeal remedy.'));\n    return safeReply(interaction, { ...buildAppealDetailPayload(result.case, result.appeal), flags: 64 });\n  }\n"
rep(route_anchor, route + route_anchor, 'retry remedy route')

p.write_text(s)
