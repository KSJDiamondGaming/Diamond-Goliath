from pathlib import Path

p = Path('src/core/administration/mod/cases.js')
s = p.read_text()

old = '''  if (linkedCaseId) {
    const linked = getCaseById(guild.id, linkedCaseId);
    if (linked && linked.status === 'active') updateCaseStatus(guild.id, linkedCaseId, 'reversed', actorId);
  }

  const current = getCaseById(guild.id, modCase.caseId) || modCase;
'''
new = '''  const reversalSucceeded = remedy.ok !== false;
  if (linkedCaseId && reversalSucceeded) {
    const linked = getCaseById(guild.id, linkedCaseId);
    if (linked && linked.status === 'active') updateCaseStatus(guild.id, linkedCaseId, 'reversed', actorId);
  }

  const current = getCaseById(guild.id, modCase.caseId) || modCase;
'''
if old not in s: raise RuntimeError('linked-case reversal anchor not found')
s = s.replace(old, new, 1)

old = '''    sanctionExecution: execution ? {
      ...execution,
      status: 'reversed',
      reversedBy: actorId,
      reversedAt: new Date().toISOString(),
      reversalReason: reason,
      reversalRemedy: remedy,
    } : execution,
'''
new = '''    sanctionExecution: execution ? {
      ...execution,
      status: reversalSucceeded ? 'reversed' : 'reversal_failed',
      reversedBy: reversalSucceeded ? actorId : null,
      reversedAt: reversalSucceeded ? new Date().toISOString() : null,
      reversalAttemptedBy: actorId,
      reversalAttemptedAt: new Date().toISOString(),
      reversalReason: reason,
      reversalRemedy: remedy,
    } : execution,
'''
if old not in s: raise RuntimeError('sanction execution reversal anchor not found')
s = s.replace(old, new, 1)

old = '''  updateCaseMetadata(guild.id, modCase.caseId, metadata);
  updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);
  recordCaseAudit({ guildId: guild.id, caseId: modCase.caseId, actorId, event: 'case.court.appeal_remedy_applied', before: execution, after: metadata.court.sanctionExecution, metadata: { linkedCaseId, remedy } });
  return remedy;
'''
new = '''  updateCaseMetadata(guild.id, modCase.caseId, metadata);
  if (reversalSucceeded) updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);
  recordCaseAudit({ guildId: guild.id, caseId: modCase.caseId, actorId, event: reversalSucceeded ? 'case.court.appeal_remedy_applied' : 'case.court.appeal_remedy_failed', before: execution, after: metadata.court.sanctionExecution, metadata: { linkedCaseId, remedy } });
  return remedy;
'''
if old not in s: raise RuntimeError('court case reversal anchor not found')
s = s.replace(old, new, 1)

p.write_text(s)
