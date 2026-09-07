from pathlib import Path
import re

ROOT = Path('.')


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'Anchor not found: {label}')
    return text.replace(old, new, 1)

# --- storage.js: add a cross-process atomic claim helper backed by an IMMEDIATE SQLite transaction.
storage_path = ROOT / 'src/core/administration/mod/storage.js'
storage = storage_path.read_text()

if 'function claimCourtOperationAtomic(' not in storage:
    anchor = "function getCaseById(guildId, caseId) { return mapCase(db.prepare('SELECT * FROM cases WHERE guild_id = ? AND case_id = ?').get(guildId, Number(caseId))); }\n"
    helper = r'''function courtOperationTimestamp(execution, mode) {
  if (!execution || typeof execution !== 'object') return 0;
  const value = mode === 'reversal'
    ? (execution.reversalClaimedAt || execution.reversalAttemptedAt || execution.startedAt || execution.claimedAt)
    : (execution.startedAt || execution.claimedAt || execution.reversalClaimedAt || execution.reversalAttemptedAt);
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}
function claimCourtOperationAtomic(guildId, caseId, { mode = 'execution', claim, staleMs = 5 * 60 * 1000 } = {}) {
  const normalizedGuildId = String(guildId || '').trim();
  const normalizedCaseId = Number(caseId);
  if (!normalizedGuildId || !Number.isInteger(normalizedCaseId) || normalizedCaseId <= 0 || !claim || typeof claim !== 'object') {
    return { ok: false, reason: 'invalid' };
  }
  const transaction = db.transaction(() => {
    const row = db.prepare('SELECT * FROM cases WHERE guild_id = ? AND case_id = ?').get(normalizedGuildId, normalizedCaseId);
    if (!row) return { ok: false, reason: 'missing' };
    const metadata = parseMetadata(row.metadata);
    const court = metadata.court && typeof metadata.court === 'object' ? metadata.court : null;
    if (!court) return { ok: false, reason: 'not_court' };
    const current = court.sanctionExecution && typeof court.sanctionExecution === 'object' ? court.sanctionExecution : null;
    const status = String(current?.status || '');
    const age = Date.now() - courtOperationTimestamp(current, mode);
    const stale = !courtOperationTimestamp(current, mode) || age > Math.max(1000, Number(staleMs) || 0);

    if (mode === 'execution') {
      if (['executed', 'reversed', 'reversal_failed', 'reversing'].includes(status) && !(status === 'reversing' && stale)) {
        return { ok: false, reason: status === 'reversing' ? 'busy' : 'finalized', current };
      }
      if (status === 'executing' && !stale) return { ok: false, reason: 'busy', current };
    } else if (mode === 'reversal') {
      if (status === 'reversed') return { ok: false, reason: 'finalized', current };
      if (status === 'reversing' && !stale) return { ok: false, reason: 'busy', current };
      if (!['reversal_failed', 'reversing'].includes(status)) return { ok: false, reason: 'invalid_state', current };
    } else {
      return { ok: false, reason: 'invalid_mode', current };
    }

    const nextMetadata = { ...metadata, court: { ...court, sanctionExecution: claim } };
    const updatedAt = now();
    const result = db.prepare('UPDATE cases SET metadata = ?, updated_at = ? WHERE guild_id = ? AND case_id = ?')
      .run(JSON.stringify(nextMetadata), updatedAt, normalizedGuildId, normalizedCaseId);
    if (!result.changes) return { ok: false, reason: 'update_failed', current };
    const updatedRow = db.prepare('SELECT * FROM cases WHERE guild_id = ? AND case_id = ?').get(normalizedGuildId, normalizedCaseId);
    return { ok: true, case: mapCase(updatedRow), previous: current };
  });
  const outcome = transaction.immediate();
  if (outcome?.ok && outcome.case) emitCaseUpdated(normalizedGuildId, outcome.case);
  return outcome;
}
'''
    storage = replace_once(storage, anchor, anchor + helper, 'storage getCaseById')

# Export helper.
if 'claimCourtOperationAtomic,' not in storage:
    match = re.search(r'module\.exports\s*=\s*\{', storage)
    if not match:
        raise RuntimeError('storage module.exports anchor not found')
    insert_at = match.end()
    storage = storage[:insert_at] + '\n  claimCourtOperationAtomic,' + storage[insert_at:]

storage_path.write_text(storage)

# --- caseCourt.js: execution claim moves from process-local save to DB atomic claim.
court_path = ROOT / 'src/core/administration/mod/caseCourt.js'
court = court_path.read_text()
if 'claimCourtOperationAtomic,' not in court.split("} = require('./storage');", 1)[0]:
    court = replace_once(
        court,
        '  recordCaseAudit,\n  emitCaseUpdated,\n',
        '  recordCaseAudit,\n  emitCaseUpdated,\n  claimCourtOperationAtomic,\n',
        'caseCourt storage import',
    )

old_claim = """    const claimed = saveCourt(interaction.guildId, caseId, { ...court, sanctionExecution: claimedExecution }, interaction.user.id, 'case.court.sanction_execution_claimed', court);\n    if (!claimed) { COURT_EXECUTION_LOCKS.delete(lockKey); await interaction.reply({ content: '❌ Failed to claim the sanction execution lock. No punishment was applied.', flags: 64 }); return true; }\n"""
new_claim = """    const atomicClaim = claimCourtOperationAtomic(interaction.guildId, caseId, { mode: 'execution', claim: claimedExecution, staleMs: COURT_EXECUTION_STALE_MS });\n    const claimed = atomicClaim?.case || null;\n    if (!atomicClaim?.ok || !claimed) {\n      COURT_EXECUTION_LOCKS.delete(lockKey);\n      const message = atomicClaim?.reason === 'busy'\n        ? '❌ This sanction is already being executed by another Goliath process.'\n        : atomicClaim?.reason === 'finalized'\n          ? '❌ This sanction was already finalised before this execution claim completed.'\n          : '❌ Failed to claim the sanction execution lock. No punishment was applied.';\n      await interaction.reply({ content: message, flags: 64 });\n      return true;\n    }\n    recordCaseAudit({ guildId: interaction.guildId, caseId, actorId: interaction.user.id, event: 'case.court.sanction_execution_claimed', before: atomicClaim.previous || court.sanctionExecution || null, after: claimedExecution, metadata: { court: true, atomic: true, operationId } });\n"""
if old_claim in court:
    court = replace_once(court, old_claim, new_claim, 'caseCourt execution claim')
elif 'const atomicClaim = claimCourtOperationAtomic' not in court:
    raise RuntimeError('caseCourt execution claim anchor not found')

court_path.write_text(court)

# --- cases.js: retry reversal claim also moves to the shared DB atomic helper.
cases_path = ROOT / 'src/core/administration/mod/cases.js'
cases = cases_path.read_text()
if 'claimCourtOperationAtomic,' not in cases.split("} = require('./storage');", 1)[0]:
    cases = replace_once(
        cases,
        '  recordCaseAudit,\n  emitCaseUpdated,\n',
        '  recordCaseAudit,\n  emitCaseUpdated,\n  claimCourtOperationAtomic,\n',
        'cases storage import',
    )

# Find the Phase 19 retry claim block semantically and replace only the metadata claim portion.
pattern = re.compile(
    r"(const claimedExecution = \{[\s\S]*?status: 'reversing',[\s\S]*?\};\n)"
    r"\s*const claimedMetadata = \{[\s\S]*?\};\n"
    r"\s*const claimed = updateCaseMetadata\(guildId, caseId, claimedMetadata\);\n"
    r"\s*if \(!claimed\) \{ APPEAL_REMEDY_LOCKS\.delete\(lockKey\); return \{ ok: false, error: 'Failed to claim appeal remedy retry\.' \}; \}\n",
    re.M,
)
match = pattern.search(cases)
if match:
    replacement = match.group(1) + """  const atomicClaim = claimCourtOperationAtomic(guildId, caseId, { mode: 'reversal', claim: claimedExecution, staleMs: APPEAL_REMEDY_STALE_MS });\n  const claimed = atomicClaim?.case || null;\n  if (!atomicClaim?.ok || !claimed) {\n    APPEAL_REMEDY_LOCKS.delete(lockKey);\n    return { ok: false, error: atomicClaim?.reason === 'busy' ? 'This appeal remedy is already being retried by another Goliath process.' : atomicClaim?.reason === 'finalized' ? 'This appeal remedy has already completed.' : 'Failed to claim appeal remedy retry.' };\n  }\n  recordCaseAudit({ guildId, caseId, actorId, event: 'case.court.appeal_remedy_retry_claimed', before: atomicClaim.previous || execution, after: claimedExecution, metadata: { appealId, atomic: true, operationId } });\n"""
    cases = cases[:match.start()] + replacement + cases[match.end():]
elif "mode: 'reversal', claim: claimedExecution" not in cases:
    raise RuntimeError('Phase 19 retry claim anchor not found')

cases_path.write_text(cases)
print('Phase 20 atomic Court operation claims patched.')
