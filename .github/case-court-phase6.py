from pathlib import Path

p = Path('src/core/administration/mod/cases.js')
s = p.read_text()

old = "const { canUseModAction } = require('./permissions');\n"
new = "const { canUseModAction } = require('./permissions');\nconst { restoreQuarantinedMember } = require('../../security/protection/quarantine');\n"
assert old in s
s = s.replace(old, new, 1)

start = s.index('async function applyApprovedAppealRemedy(interaction, modCase, fetchTarget) {')
end = s.index('\nasync function createRejoinInvite', start)
replacement = '''async function applyApprovedCourtAppealRemedy(interaction, modCase, fetchTarget) {
  const guild = interaction.guild;
  const actorId = interaction.user?.id || null;
  const court = modCase.metadata?.court && typeof modCase.metadata.court === 'object' ? modCase.metadata.court : null;
  const execution = court?.sanctionExecution && typeof court.sanctionExecution === 'object' ? court.sanctionExecution : null;
  const action = String(execution?.action || court?.decision?.action || 'no_action').toLowerCase();
  const linkedCaseId = Number(execution?.linkedCaseId || 0) || null;
  const reason = `Court appeal approved for Case #${modCase.caseId}`;

  if (!court?.publication || !court?.decision) {
    updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);
    return { attempted: false, action: 'court', ok: true, detail: 'Court case reversed; no published sanction was available to undo.' };
  }

  let remedy = { attempted: false, action, ok: true, detail: 'Published court decision reversed.' };
  const target = typeof fetchTarget === 'function' ? await fetchTarget(guild, modCase.userId) : null;

  if (action === 'warn') {
    const removed = linkedCaseId ? deleteWarningByCaseId(guild.id, linkedCaseId) : false;
    remedy = { attempted: true, action: 'remove-warning', ok: Boolean(removed), detail: removed ? `Warning Case #${linkedCaseId} removed.` : 'Linked warning record was already absent or unavailable.' };
  } else if (action === 'timeout') {
    if (!target) remedy = { attempted: true, action: 'remove-timeout', ok: false, detail: 'Member not available to clear timeout.' };
    else {
      try { await target.timeout(null, reason); remedy = { attempted: true, action: 'remove-timeout', ok: true, detail: 'Court-ordered timeout cleared.' }; }
      catch (error) { remedy = { attempted: true, action: 'remove-timeout', ok: false, detail: String(error?.message || 'Failed to clear timeout.').slice(0, 300) }; }
    }
  } else if (action === 'quarantine') {
    if (!target) remedy = { attempted: true, action: 'remove-quarantine', ok: false, detail: 'Member not available to restore quarantine roles.' };
    else {
      const result = await restoreQuarantinedMember(guild, target, { reason });
      remedy = { attempted: true, action: 'remove-quarantine', ok: Boolean(result?.success), detail: result?.success ? `Quarantine removed; restored ${result.restoredRoles || 0} role(s).` : String(result?.error || result?.reason || 'Failed to remove quarantine.').slice(0, 300) };
    }
  } else if (action === 'ban') {
    try { await guild.bans.remove(modCase.userId, reason); remedy = { attempted: true, action: 'unban', ok: true, detail: 'Court-ordered ban removed.' }; }
    catch (error) { remedy = { attempted: true, action: 'unban', ok: false, detail: String(error?.message || 'Failed to remove ban.').slice(0, 300) }; }
  } else if (action === 'kick') {
    remedy = { attempted: false, action: 'kick', ok: true, detail: 'Kick cannot be automatically undone; the court decision has been reversed.' };
  } else if (action === 'no_action') {
    remedy = { attempted: false, action: 'no_action', ok: true, detail: 'Court finding reversed; there was no sanction to undo.' };
  }

  if (linkedCaseId) {
    const linked = getCaseById(guild.id, linkedCaseId);
    if (linked && linked.status === 'active') updateCaseStatus(guild.id, linkedCaseId, 'reversed', actorId);
  }

  const current = getCaseById(guild.id, modCase.caseId) || modCase;
  const metadata = { ...(current.metadata || {}) };
  const currentCourt = metadata.court && typeof metadata.court === 'object' ? metadata.court : court;
  metadata.court = {
    ...currentCourt,
    sanctionExecution: execution ? {
      ...execution,
      status: 'reversed',
      reversedBy: actorId,
      reversedAt: new Date().toISOString(),
      reversalReason: reason,
      reversalRemedy: remedy,
    } : execution,
    appealOutcome: {
      status: 'approved',
      reviewedBy: actorId,
      reviewedAt: new Date().toISOString(),
      remedy,
    },
  };
  updateCaseMetadata(guild.id, modCase.caseId, metadata);
  updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);
  recordCaseAudit({ guildId: guild.id, caseId: modCase.caseId, actorId, event: 'case.court.appeal_remedy_applied', before: execution, after: metadata.court.sanctionExecution, metadata: { linkedCaseId, remedy } });
  return remedy;
}

async function applyApprovedAppealRemedy(interaction, modCase, fetchTarget) {
  const guild = interaction.guild;
  const actorId = interaction.user?.id || null;
  const reason = `Appeal approved for Case #${modCase.caseId}`;
  if (modCase.action === 'case' && modCase.metadata?.court) return applyApprovedCourtAppealRemedy(interaction, modCase, fetchTarget);
  if (modCase.action === 'warn') {
    const removed = deleteWarningByCaseId(guild.id, modCase.caseId);
    updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);
    return { attempted: true, action: 'remove-warning', ok: Boolean(removed), detail: removed ? 'Warning removed.' : 'Warning record was already absent.' };
  }
  if (modCase.action === 'timeout') {
    const target = typeof fetchTarget === 'function' ? await fetchTarget(guild, modCase.userId) : null;
    if (!target) {
      updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);
      return { attempted: true, action: 'remove-timeout', ok: false, detail: 'Member not available to clear timeout; case status reversed.' };
    }
    try {
      await target.timeout(null, reason);
      updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);
      return { attempted: true, action: 'remove-timeout', ok: true, detail: 'Timeout cleared.' };
    } catch (error) {
      updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);
      return { attempted: true, action: 'remove-timeout', ok: false, detail: String(error?.message || 'Failed to clear timeout.').slice(0, 300) };
    }
  }
  if (modCase.action === 'ban') {
    try {
      await guild.bans.remove(modCase.userId, reason);
      updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);
      return { attempted: true, action: 'unban', ok: true, detail: 'Ban removed.' };
    } catch (error) {
      updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);
      return { attempted: true, action: 'unban', ok: false, detail: String(error?.message || 'Failed to remove ban.').slice(0, 300) };
    }
  }
  updateCaseStatus(guild.id, modCase.caseId, 'reversed', actorId);
  return { attempted: false, action: modCase.action, ok: true, detail: modCase.action === 'kick' ? 'Kick cannot be automatically undone; case status reversed.' : 'Case status reversed.' };
}
'''
s = s[:start] + replacement + s[end:]
p.write_text(s)

p = Path('src/core/administration/mod/caseCourt.js')
s = p.read_text()
old = "  const executionLine = court.sanctionExecution\n    ? `\\n**Execution:** ${court.sanctionExecution.status === 'executed' ? '✅ Executed' : '❌ Failed'} by <@${court.sanctionExecution.executedBy}> • ${discordTime(court.sanctionExecution.executedAt)}${court.sanctionExecution.linkedCaseId ? ` • Moderation Case #${court.sanctionExecution.linkedCaseId}` : ''}${court.sanctionExecution.error ? `\\n${cleanExcerpt(court.sanctionExecution.error, 180)}` : ''}`\n"
new = "  const executionLine = court.sanctionExecution\n    ? `\\n**Execution:** ${court.sanctionExecution.status === 'executed' ? '✅ Executed' : court.sanctionExecution.status === 'reversed' ? '↩️ Reversed' : '❌ Failed'} by <@${court.sanctionExecution.executedBy}> • ${discordTime(court.sanctionExecution.executedAt)}${court.sanctionExecution.linkedCaseId ? ` • Moderation Case #${court.sanctionExecution.linkedCaseId}` : ''}${court.sanctionExecution.status === 'reversed' ? `\\nReversed by <@${court.sanctionExecution.reversedBy}> • ${discordTime(court.sanctionExecution.reversedAt)}` : ''}${court.sanctionExecution.error ? `\\n${cleanExcerpt(court.sanctionExecution.error, 180)}` : ''}`\n"
assert old in s
s = s.replace(old, new, 1)

old = "court.sanctionExecution?.status === 'executed' ? 'Sanction Executed' : court.sanctionExecution?.status === 'failed' ? 'Retry Sanction' : 'Execute Sanction'"
new = "court.sanctionExecution?.status === 'executed' ? 'Sanction Executed' : court.sanctionExecution?.status === 'reversed' ? 'Sanction Reversed' : court.sanctionExecution?.status === 'failed' ? 'Retry Sanction' : 'Execute Sanction'"
assert old in s
s = s.replace(old, new, 1)
old = "court.sanctionExecution?.status === 'executed' || (court.decision?.action === 'ban'"
new = "['executed', 'reversed'].includes(court.sanctionExecution?.status) || (court.decision?.action === 'ban'"
assert old in s
s = s.replace(old, new, 1)
p.write_text(s)
