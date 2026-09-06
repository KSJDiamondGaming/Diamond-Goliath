from pathlib import Path

p = Path('src/core/administration/mod/caseCourt.js')
s = p.read_text()

def replace_once(old, new):
    global s
    if old not in s:
        raise RuntimeError(f'Anchor not found: {old[:120]}')
    s = s.replace(old, new, 1)

replace_once(
"const EVIDENCE_STATUS = Object.freeze({ draft: '🟡 Draft', verified: '🟢 Verified', rejected: '🔴 Rejected' });\n",
"const EVIDENCE_STATUS = Object.freeze({ draft: '🟡 Draft', verified: '🟢 Verified', rejected: '🔴 Rejected' });\nconst COURT_EXECUTION_LOCKS = new Set();\nconst COURT_EXECUTION_STALE_MS = 5 * 60 * 1000;\n"
)

replace_once(
"function appealStatusText(appeal) { if (!appeal) return 'No appeal submitted.'; return appeal.status === 'approved' ? '✅ Approved' : appeal.status === 'denied' ? '❌ Denied' : '⏳ Pending review'; }\n",
"function appealStatusText(appeal) { if (!appeal) return 'No appeal submitted.'; return appeal.status === 'approved' ? '✅ Approved' : appeal.status === 'denied' ? '❌ Denied' : '⏳ Pending review'; }\nfunction courtExecutionLockKey(guildId, caseId) { return `${guildId}:${caseId}`; }\nfunction executionIsStale(execution) { if (!execution || execution.status !== 'executing') return false; const started = new Date(execution.startedAt || execution.claimedAt || 0).getTime(); return !Number.isFinite(started) || Date.now() - started > COURT_EXECUTION_STALE_MS; }\n"
)

replace_once(
"  const executionLine = court.sanctionExecution\n    ? `\\n**Execution:** ${court.sanctionExecution.status === 'executed' ? '✅ Executed' : court.sanctionExecution.status === 'reversed' ? '↩️ Reversed' : '❌ Failed'} by <@${court.sanctionExecution.executedBy}> • ${discordTime(court.sanctionExecution.executedAt)}${court.sanctionExecution.linkedCaseId ? ` • Moderation Case #${court.sanctionExecution.linkedCaseId}` : ''}${court.sanctionExecution.status === 'reversed' ? `\\nReversed by <@${court.sanctionExecution.reversedBy}> • ${discordTime(court.sanctionExecution.reversedAt)}` : ''}${court.sanctionExecution.error ? `\\n${cleanExcerpt(court.sanctionExecution.error, 180)}` : ''}`\n",
"  const executionLine = court.sanctionExecution\n    ? `\\n**Execution:** ${court.sanctionExecution.status === 'executed' ? '✅ Executed' : court.sanctionExecution.status === 'reversed' ? '↩️ Reversed' : court.sanctionExecution.status === 'executing' ? (executionIsStale(court.sanctionExecution) ? '⚠️ Execution lock stale' : '⏳ Executing') : '❌ Failed'} by <@${court.sanctionExecution.executedBy || court.sanctionExecution.claimedBy}> • ${discordTime(court.sanctionExecution.executedAt || court.sanctionExecution.startedAt || court.sanctionExecution.claimedAt)}${court.sanctionExecution.linkedCaseId ? ` • Moderation Case #${court.sanctionExecution.linkedCaseId}` : ''}${court.sanctionExecution.status === 'reversed' ? `\\nReversed by <@${court.sanctionExecution.reversedBy}> • ${discordTime(court.sanctionExecution.reversedAt)}` : ''}${court.sanctionExecution.error ? `\\n${cleanExcerpt(court.sanctionExecution.error, 180)}` : ''}`\n"
)

old = "      button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Sanction Executed' : court.sanctionExecution?.status === 'reversed' ? 'Sanction Reversed' : court.sanctionExecution?.status === 'failed' ? 'Retry Sanction' : 'Execute Sanction', '⚡', ButtonStyle.Danger, !canManage || isClosed || court.stage !== 'published' || !court.decision || court.decision.action === 'no_action' || ['executed', 'reversed'].includes(court.sanctionExecution?.status) || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),\n"
new = "      button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Sanction Executed' : court.sanctionExecution?.status === 'reversed' ? 'Sanction Reversed' : court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution) ? 'Sanction Executing' : court.sanctionExecution?.status === 'failed' || executionIsStale(court.sanctionExecution) ? 'Retry Sanction' : 'Execute Sanction', '⚡', ButtonStyle.Danger, !isJudge(interaction) || isClosed || court.stage !== 'published' || !court.decision || court.decision.action === 'no_action' || ['executed', 'reversed'].includes(court.sanctionExecution?.status) || (court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution)) || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),\n"
replace_once(old, new)

replace_once(
"    if (court.sanctionExecution?.status === 'executed') { await interaction.reply({ content: '❌ This sanction has already been executed. Duplicate execution is blocked.', flags: 64 }); return true; }\n",
"    if (court.sanctionExecution?.status === 'executed' || court.sanctionExecution?.status === 'reversed') { await interaction.reply({ content: '❌ This sanction has already been finalised. Duplicate execution is blocked.', flags: 64 }); return true; }\n    if (court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution)) { await interaction.reply({ content: '❌ This sanction is already being executed by another judge.', flags: 64 }); return true; }\n"
)

needle = "    if (field(interaction, 'confirmation').toUpperCase() !== 'EXECUTE') { await interaction.reply({ content: '❌ Execution cancelled. Type EXECUTE exactly to confirm.', flags: 64 }); return true; }\n    const parameter = field(interaction, 'parameter');\n    const note = field(interaction, 'note');\n    const target = await interaction.guild.members.fetch(modCase.userId).catch(() => null);\n"
replacement = "    if (field(interaction, 'confirmation').toUpperCase() !== 'EXECUTE') { await interaction.reply({ content: '❌ Execution cancelled. Type EXECUTE exactly to confirm.', flags: 64 }); return true; }\n    const parameter = field(interaction, 'parameter');\n    const note = field(interaction, 'note');\n    const lockKey = courtExecutionLockKey(interaction.guildId, caseId);\n    if (COURT_EXECUTION_LOCKS.has(lockKey)) { await interaction.reply({ content: '❌ This sanction is already being executed. Duplicate execution is blocked.', flags: 64 }); return true; }\n    if (court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution)) { await interaction.reply({ content: '❌ This sanction is already being executed by another judge.', flags: 64 }); return true; }\n    COURT_EXECUTION_LOCKS.add(lockKey);\n    const executionStarted = now();\n    const operationId = `court_exec_${caseId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;\n    const claimedExecution = { status: 'executing', operationId, action, claimedBy: interaction.user.id, claimedAt: executionStarted, startedAt: executionStarted, executedBy: interaction.user.id, executedAt: null, linkedCaseId: null, note: note || null, error: null };\n    const claimed = saveCourt(interaction.guildId, caseId, { ...court, sanctionExecution: claimedExecution }, interaction.user.id, 'case.court.sanction_execution_claimed', court);\n    if (!claimed) { COURT_EXECUTION_LOCKS.delete(lockKey); await interaction.reply({ content: '❌ Failed to claim the sanction execution lock. No punishment was applied.', flags: 64 }); return true; }\n    const target = await interaction.guild.members.fetch(modCase.userId).catch(() => null);\n"
replace_once(needle, replacement)

replace_once(
"    if (!target) { await interaction.reply({ content: '❌ The member is not currently available in this server, so this sanction cannot be executed from Case Court.', flags: 64 }); return true; }\n    const executionStarted = now();\n    try {\n",
"    if (!target) {\n      const failed = { ...claimedExecution, status: 'failed', executedAt: now(), error: 'Member is not currently available in this server.' };\n      saveCourt(interaction.guildId, caseId, { ...court, sanctionExecution: failed }, interaction.user.id, 'case.court.sanction_failed', claimedExecution);\n      COURT_EXECUTION_LOCKS.delete(lockKey);\n      await interaction.reply({ content: '❌ The member is not currently available in this server, so this sanction cannot be executed from Case Court.', flags: 64 }); return true;\n    }\n    try {\n"
)

replace_once(
"      await updateCaseMessage(interaction, updated);\n      return true;\n    } catch (error) {\n",
"      COURT_EXECUTION_LOCKS.delete(lockKey);\n      await updateCaseMessage(interaction, updated);\n      return true;\n    } catch (error) {\n"
)

replace_once(
"      const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.sanction_failed', court);\n      await updateCaseMessage(interaction, updated);\n",
"      const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.sanction_failed', court);\n      COURT_EXECUTION_LOCKS.delete(lockKey);\n      await updateCaseMessage(interaction, updated);\n"
)

p.write_text(s)
