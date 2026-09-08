from pathlib import Path


def replace_once(path, old, new):
    text = Path(path).read_text()
    if old not in text:
        raise RuntimeError(f'Anchor not found in {path}: {old[:120]!r}')
    if text.count(old) != 1:
        raise RuntimeError(f'Anchor is not unique in {path}: {old[:120]!r}')
    Path(path).write_text(text.replace(old, new, 1))

# Allow a published, successfully executed sanction to be atomically claimed for reversal.
replace_once(
    'src/core/administration/mod/storage.js',
    "      if (!['reversal_failed', 'reversing'].includes(status)) return { ok: false, reason: 'invalid_state', current };",
    "      if (!['executed', 'reversal_failed', 'reversing'].includes(status)) return { ok: false, reason: 'invalid_state', current };",
)

cases = Path('src/core/administration/mod/cases.js')
text = cases.read_text()
anchor = """function appealRemedyIsStale(execution) {
  if (!execution || execution.status !== 'reversing') return false;
  const started = new Date(execution.reversalClaimedAt || execution.reversalAttemptedAt || 0).getTime();
  return !Number.isFinite(started) || Date.now() - started > APPEAL_REMEDY_STALE_MS;
}

"""
insert = anchor + """function claimCourtAppealRemedyForApproval(interaction, modCase) {
  const guildId = interaction.guild.id;
  const actorId = interaction.user?.id || null;
  const court = modCase?.metadata?.court && typeof modCase.metadata.court === 'object' ? modCase.metadata.court : null;
  const execution = court?.sanctionExecution && typeof court.sanctionExecution === 'object' ? court.sanctionExecution : null;
  if (!court?.publication || !court?.decision) return { ok: true, case: modCase, claimed: false };

  // No successful punishment reached Discord, so there is nothing physical to undo.
  if (!execution || execution.status === 'failed') return { ok: true, case: modCase, claimed: false };
  if (execution.status === 'reversed') return { ok: false, error: 'This court sanction has already been reversed.' };
  if (execution.status === 'executing') {
    return { ok: false, error: executionIsStaleForAppeal(execution)
      ? 'The sanction execution lock is stale and its outcome is uncertain. Resolve the execution state before approving this appeal.'
      : 'The sanction is still being executed. Wait for execution to finish before approving this appeal.' };
  }
  if (execution.status === 'reversing') return { ok: false, error: appealRemedyIsStale(execution) ? 'A stale appeal reversal exists. Use Retry Remedy from the appeal record to recover it.' : 'This appeal remedy is already being processed.' };
  if (execution.status === 'reversal_failed') return { ok: false, error: 'A previous reversal failed. Use Retry Remedy from the approved appeal record.' };
  if (execution.status !== 'executed') return { ok: false, error: `Sanction state ${execution.status || 'unknown'} cannot be safely reversed automatically.` };

  const claimedAt = new Date().toISOString();
  const operationId = `court_remedy_${modCase.caseId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const claimedExecution = {
    ...execution,
    status: 'reversing',
    reversalOperationId: operationId,
    reversalClaimedBy: actorId,
    reversalClaimedAt: claimedAt,
    reversalAttemptedBy: actorId,
    reversalAttemptedAt: claimedAt,
    reversalRemedy: null,
  };
  const atomicClaim = claimCourtOperationAtomic(guildId, modCase.caseId, { mode: 'reversal', claim: claimedExecution, staleMs: APPEAL_REMEDY_STALE_MS });
  if (!atomicClaim?.ok || !atomicClaim.case) {
    const error = atomicClaim?.reason === 'busy'
      ? 'This sanction reversal is already being processed by another Goliath process.'
      : atomicClaim?.reason === 'finalized'
        ? 'This sanction has already been reversed.'
        : 'The sanction could not be safely claimed for reversal. No appeal remedy was attempted.';
    return { ok: false, error };
  }
  recordCaseAudit({ guildId, caseId: modCase.caseId, actorId, event: 'case.court.appeal_remedy_claimed', before: atomicClaim.previous || execution, after: claimedExecution, metadata: { operationId, atomic: true } });
  return { ok: true, case: atomicClaim.case, claimed: true, operationId };
}

function executionIsStaleForAppeal(execution) {
  if (!execution || execution.status !== 'executing') return false;
  const started = new Date(execution.startedAt || execution.claimedAt || 0).getTime();
  return !Number.isFinite(started) || Date.now() - started > APPEAL_REMEDY_STALE_MS;
}

function persistCourtAppealReversalFailure(interaction, modCase, error, operationId = null) {
  const guildId = interaction.guild.id;
  const actorId = interaction.user?.id || null;
  const current = getCaseById(guildId, modCase.caseId) || modCase;
  const metadata = { ...(current.metadata || {}) };
  const court = metadata.court && typeof metadata.court === 'object' ? metadata.court : {};
  const execution = court.sanctionExecution && typeof court.sanctionExecution === 'object' ? court.sanctionExecution : null;
  const remedy = { attempted: true, action: String(execution?.action || court.decision?.action || 'court'), ok: false, detail: String(error?.message || error || 'Appeal remedy failed.').slice(0, 300) };
  metadata.court = {
    ...court,
    sanctionExecution: execution ? {
      ...execution,
      status: 'reversal_failed',
      reversalOperationId: operationId || execution.reversalOperationId || null,
      reversalAttemptedBy: actorId,
      reversalAttemptedAt: new Date().toISOString(),
      reversalRemedy: remedy,
    } : execution,
  };
  const updated = updateCaseMetadata(guildId, modCase.caseId, metadata) || current;
  recordCaseAudit({ guildId, caseId: modCase.caseId, actorId, event: 'case.court.appeal_remedy_failed', before: execution, after: metadata.court.sanctionExecution, metadata: { operationId, remedy } });
  return { case: updated, remedy };
}

"""
if anchor not in text:
    raise RuntimeError('appeal remedy helper anchor not found')
text = text.replace(anchor, insert, 1)
cases.write_text(text)

# Do not attempt to undo a sanction that never successfully executed. Still persist a final
# reversed execution state so the Court Execute button can never apply it after the appeal.
replace_once(
    'src/core/administration/mod/cases.js',
    """  let remedy = { attempted: false, action, ok: true, detail: 'Published case decision reversed.' };
  const target = typeof fetchTarget === 'function' ? await fetchTarget(guild, modCase.userId) : null;

  if (action === 'warn') {
""",
    """  let remedy = { attempted: false, action, ok: true, detail: 'Published case decision reversed.' };
  if (!execution || execution.status === 'failed') {
    remedy = { attempted: false, action, ok: true, detail: 'Appeal approved before any sanction was successfully executed; no physical undo was required.' };
    const current = getCaseById(guild.id, modCase.caseId) || modCase;
    const metadata = { ...(current.metadata || {}) };
    const currentCourt = metadata.court && typeof metadata.court === 'object' ? metadata.court : court;
    const reversedAt = new Date().toISOString();
    metadata.court = {
      ...currentCourt,
      sanctionExecution: {
        ...(execution || { action }),
        status: 'reversed',
        action,
        reversedBy: actorId,
        reversedAt,
        reversalAttemptedBy: actorId,
        reversalAttemptedAt: reversedAt,
        reversalReason: reason,
        reversalRemedy: remedy,
      },
      appealOutcome: { status: 'approved', reviewedBy: actorId, reviewedAt: reversedAt, remedy },
    };
    updateCaseMetadata(guild.id, modCase.caseId, metadata);
    updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);
    recordCaseAudit({ guildId: guild.id, caseId: modCase.caseId, actorId, event: 'case.court.appeal_remedy_applied', before: execution, after: metadata.court.sanctionExecution, metadata: { linkedCaseId, remedy } });
    return remedy;
  }

  const target = typeof fetchTarget === 'function' ? await fetchTarget(guild, modCase.userId) : null;

  if (action === 'warn') {
""",
)

# Claim the initial approved court reversal atomically, then refresh from storage before
# persisting the appeal record so Court metadata cannot be overwritten by an older snapshot.
replace_once(
    'src/core/administration/mod/cases.js',
    """    let remedy = null;
    if (decision === 'approved') remedy = await applyApprovedAppealRemedy(interaction, modCase, fetchTarget);
    modCase = getCaseById(interaction.guild.id, caseId) || modCase;
""",
    """    let remedy = null;
    if (decision === 'approved') {
      let reversalClaim = { ok: true, case: modCase, claimed: false, operationId: null };
      if (modCase.action === 'case' && modCase.metadata?.court) {
        reversalClaim = claimCourtAppealRemedyForApproval(interaction, modCase);
        if (!reversalClaim.ok) return { ok: false, error: reversalClaim.error };
        modCase = reversalClaim.case || modCase;
      }
      try {
        remedy = await applyApprovedAppealRemedy(interaction, modCase, fetchTarget);
      } catch (error) {
        if (modCase.action === 'case' && modCase.metadata?.court) {
          const failed = persistCourtAppealReversalFailure(interaction, modCase, error, reversalClaim.operationId);
          modCase = failed.case;
          remedy = failed.remedy;
        } else {
          remedy = { attempted: true, action: modCase.action, ok: false, detail: String(error?.message || error || 'Appeal remedy failed.').slice(0, 300) };
        }
      }
    }
    modCase = getCaseById(interaction.guild.id, caseId) || modCase;
""",
)

# Court workspace guidance and controls must accurately reflect appeal reversal states.
replace_once(
    'src/core/administration/mod/caseCourt.js',
    """  const nextStep = (() => {
    if (isClosed) return 'This case is closed. Reopen it before making further changes.';
""",
    """  const nextStep = (() => {
    if (isClosed) return 'This case is closed. Reopen it before making further changes.';
    if (modCase.status === 'reversed') return 'This published decision has been reversed. Its sanction cannot be executed again.';
""",
)
replace_once(
    'src/core/administration/mod/caseCourt.js',
    """        court.sanctionExecution ? `**Execution:** ${court.sanctionExecution.status === 'executed' ? '✅ Completed' : court.sanctionExecution.status === 'reversed' ? '↩️ Reversed' : court.sanctionExecution.status === 'reversal_failed' ? '⚠️ Appeal remedy failed' : court.sanctionExecution.status === 'executing' ? '⏳ In progress' : court.sanctionExecution.status === 'failed' ? '❌ Failed' : '⏳ Pending'}` : (court.decision.action !== 'no_action' ? '**Execution:** ⏳ Pending' : null),
""",
    """        court.sanctionExecution ? `**Execution:** ${court.sanctionExecution.status === 'executed' ? '✅ Completed' : court.sanctionExecution.status === 'reversed' ? '↩️ Reversed' : court.sanctionExecution.status === 'reversing' ? '⏳ Reversing after appeal' : court.sanctionExecution.status === 'reversal_failed' ? '⚠️ Appeal remedy failed' : court.sanctionExecution.status === 'executing' ? '⏳ In progress' : court.sanctionExecution.status === 'failed' ? '❌ Failed' : '⏳ Pending'}` : (court.decision.action !== 'no_action' ? '**Execution:** ⏳ Pending' : null),
""",
)
replace_once(
    'src/core/administration/mod/caseCourt.js',
    """    button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Done' : court.sanctionExecution?.status === 'reversed' ? 'Reversed' : court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution) ? 'Running' : court.sanctionExecution?.status === 'failed' || executionIsStale(court.sanctionExecution) ? 'Retry' : 'Execute', '⚡', ButtonStyle.Danger, !reviewerAuthority || !canExecuteAction || isClosed || court.stage !== 'published' || !court.decision || court.decision.action === 'no_action' || ['executed', 'reversed', 'reversal_failed'].includes(court.sanctionExecution?.status) || (court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution)) || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),
""",
    """    button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Done' : court.sanctionExecution?.status === 'reversed' ? 'Reversed' : court.sanctionExecution?.status === 'reversing' ? 'Reversing' : court.sanctionExecution?.status === 'reversal_failed' ? 'Appeal Failed' : court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution) ? 'Running' : court.sanctionExecution?.status === 'failed' || executionIsStale(court.sanctionExecution) ? 'Retry' : 'Execute', '⚡', ButtonStyle.Danger, !reviewerAuthority || !canExecuteAction || isClosed || modCase.status === 'reversed' || court.stage !== 'published' || !court.decision || court.decision.action === 'no_action' || ['executed', 'reversed', 'reversing', 'reversal_failed'].includes(court.sanctionExecution?.status) || (court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution)) || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),
""",
)

print('Phase 11 Court appeal reversal hardening applied.')
