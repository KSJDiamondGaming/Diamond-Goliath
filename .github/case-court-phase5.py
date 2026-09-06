from pathlib import Path

p = Path('src/core/administration/mod/caseCourt.js')
s = p.read_text()

old = "const { canUseModAction } = require('./permissions');\n"
new = "const { canUseModAction } = require('./permissions');\nconst { executeEnginePunishment } = require('./punishments');\nconst { createWarningCaseAtomic } = require('./warns');\nconst { quarantineMember } = require('../../security/protection/quarantine');\n"
assert old in s
s = s.replace(old, new, 1)

old = "    sanctionReview: court.sanctionReview && typeof court.sanctionReview === 'object' ? court.sanctionReview : null,\n"
assert old in s
s = s.replace(old, old + "    sanctionExecution: court.sanctionExecution && typeof court.sanctionExecution === 'object' ? court.sanctionExecution : null,\n", 1)

old = "  const decision = court.decision\n    ? `**Finding:** ${court.decision.finding}\\n**Decision:** ${court.decision.action}\\n**Reason:** ${court.decision.reason}\\n**Judge:** <@${court.decision.decidedBy}> • ${discordTime(court.decision.decidedAt)}${sanctionGate}`\n    : 'No decision recorded.';\n"
new = "  const executionLine = court.sanctionExecution\n    ? `\\n**Execution:** ${court.sanctionExecution.status === 'executed' ? '✅ Executed' : '❌ Failed'} by <@${court.sanctionExecution.executedBy}> • ${discordTime(court.sanctionExecution.executedAt)}${court.sanctionExecution.linkedCaseId ? ` • Moderation Case #${court.sanctionExecution.linkedCaseId}` : ''}${court.sanctionExecution.error ? `\\n${cleanExcerpt(court.sanctionExecution.error, 180)}` : ''}`\n    : court.decision?.action && court.decision.action !== 'no_action' ? '\\n**Execution:** ⏳ Not executed' : '';\n  const decision = court.decision\n    ? `**Finding:** ${court.decision.finding}\\n**Decision:** ${court.decision.action}\\n**Reason:** ${court.decision.reason}\\n**Judge:** <@${court.decision.decidedBy}> • ${discordTime(court.decision.decidedAt)}${sanctionGate}${executionLine}`\n    : 'No decision recorded.';\n"
assert old in s
s = s.replace(old, new, 1)

old = "      button(`mod_court_approve_ban:${modCase.caseId}`, 'Approve Ban', '🛡️', ButtonStyle.Danger, !canManage || court.decision?.action !== 'ban' || court.sanctionReview?.status === 'approved' || court.decision?.decidedBy === interaction.user.id),\n      button(isClosed ? `mod_court_reopen:${modCase.caseId}` : `mod_court_close:${modCase.caseId}`, isClosed ? 'Reopen' : 'Close Case', isClosed ? '🔓' : '🔒', ButtonStyle.Secondary, !canManage),\n    ),\n    staffBackRow(modCase.userId),\n"
new = "      button(`mod_court_approve_ban:${modCase.caseId}`, 'Approve Ban', '🛡️', ButtonStyle.Danger, !canManage || court.decision?.action !== 'ban' || court.sanctionReview?.status === 'approved' || court.decision?.decidedBy === interaction.user.id),\n    ),\n    row(\n      button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Sanction Executed' : court.sanctionExecution?.status === 'failed' ? 'Retry Sanction' : 'Execute Sanction', '⚡', ButtonStyle.Danger, !canManage || isClosed || court.stage !== 'published' || !court.decision || court.decision.action === 'no_action' || court.sanctionExecution?.status === 'executed' || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),\n      button(isClosed ? `mod_court_reopen:${modCase.caseId}` : `mod_court_close:${modCase.caseId}`, isClosed ? 'Reopen' : 'Close Case', isClosed ? '🔓' : '🔒', ButtonStyle.Secondary, !canManage),\n    ),\n    staffBackRow(modCase.userId),\n"
assert old in s
s = s.replace(old, new, 1)

marker = "function publishModal(caseId, court) {\n"
insert = '''function sanctionExecutionModal(caseId, court) {
  const action = String(court.decision?.action || 'sanction');
  const hint = action === 'timeout' ? 'Example: 1h, 1d (max 28d)' : action === 'ban' ? 'Delete message days: 0-7' : action === 'warn' ? 'Strike weight: 1-5' : 'Leave blank for this action';
  return new ModalBuilder().setCustomId(`mod_court_execute_submit:${caseId}`).setTitle(`Execute ${action}`.slice(0, 45)).addComponents(
    modalInput('confirmation', 'Type EXECUTE to confirm', TextInputStyle.Short, true, 7, 'EXECUTE'),
    modalInput('parameter', 'Action parameter', TextInputStyle.Short, ['timeout', 'ban', 'warn'].includes(action), 20, hint),
    modalInput('note', 'Execution note (optional)', TextInputStyle.Paragraph, false, 600, 'Optional operational note for the audit trail.'),
  );
}
function parseCourtTimeout(value) {
  const match = String(value || '').trim().toLowerCase().match(/^(\\d+(?:\\.\\d+)?)\\s*([smhdw])$/);
  if (!match) return null;
  const units = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  const ms = Math.floor(Number(match[1]) * units[match[2]]);
  return Number.isFinite(ms) && ms > 0 && ms <= 28 * 86400000 ? ms : null;
}
'''
assert marker in s
s = s.replace(marker, insert + marker, 1)

old = "  if (key === 'mod_court_publish') { if (!isJudge(interaction)) return interaction.reply({ content: '❌ Admin authority is required to publish the member record.', flags: 64 }).then(() => true); await interaction.showModal(publishModal(caseId, court)); return true; }\n"
new = old + "  if (key === 'mod_court_execute') {\n    const action = String(court.decision?.action || '');\n    if (!isJudge(interaction) || !action || action === 'no_action') { await interaction.reply({ content: '❌ There is no executable court sanction.', flags: 64 }); return true; }\n    if (court.stage !== 'published' || !court.publication) { await interaction.reply({ content: '❌ Publish the official member record before executing the sanction.', flags: 64 }); return true; }\n    if (court.sanctionExecution?.status === 'executed') { await interaction.reply({ content: '❌ This sanction has already been executed. Duplicate execution is blocked.', flags: 64 }); return true; }\n    if (action === 'ban' && court.sanctionReview?.status !== 'approved') { await interaction.reply({ content: '❌ A second admin must approve this ban before execution.', flags: 64 }); return true; }\n    if (!canUseModAction(interaction.member, interaction.guild, action, interaction)) { await interaction.reply({ content: `❌ You do not have authority to execute the ${action} sanction.`, flags: 64 }); return true; }\n    await interaction.showModal(sanctionExecutionModal(caseId, court)); return true;\n  }\n"
assert old in s
s = s.replace(old, new, 1)

marker = "  if (key === 'mod_court_publish_submit') {\n"
execution = '''  if (key === 'mod_court_execute_submit') {
    const action = String(court.decision?.action || '');
    if (!isJudge(interaction) || !action || action === 'no_action') { await interaction.reply({ content: '❌ There is no executable court sanction.', flags: 64 }); return true; }
    if (court.stage !== 'published' || !court.publication) { await interaction.reply({ content: '❌ The official member record must be published first.', flags: 64 }); return true; }
    if (court.sanctionExecution?.status === 'executed') { await interaction.reply({ content: '❌ Duplicate execution blocked: this sanction has already been executed.', flags: 64 }); return true; }
    if (action === 'ban' && court.sanctionReview?.status !== 'approved') { await interaction.reply({ content: '❌ Second-admin ban approval is still required.', flags: 64 }); return true; }
    if (!canUseModAction(interaction.member, interaction.guild, action, interaction)) { await interaction.reply({ content: `❌ You do not have authority to execute the ${action} sanction.`, flags: 64 }); return true; }
    if (field(interaction, 'confirmation').toUpperCase() !== 'EXECUTE') { await interaction.reply({ content: '❌ Execution cancelled. Type EXECUTE exactly to confirm.', flags: 64 }); return true; }
    const parameter = field(interaction, 'parameter');
    const note = field(interaction, 'note');
    const target = await interaction.guild.members.fetch(modCase.userId).catch(() => null);
    if (!target) { await interaction.reply({ content: '❌ The member is not currently available in this server, so this sanction cannot be executed from Case Court.', flags: 64 }); return true; }
    const executionStarted = now();
    try {
      let linkedCaseId = null;
      let resultSummary = null;
      const reason = `Court Case #${caseId}: ${court.decision.reason || court.decision.finding || 'Court decision'}`.slice(0, 500);
      if (action === 'warn') {
        const strikeWeight = Number(parameter);
        if (!Number.isInteger(strikeWeight) || strikeWeight < 1 || strikeWeight > 5) { await interaction.reply({ content: '❌ Warning strike weight must be a whole number from 1 to 5.', flags: 64 }); return true; }
        const created = createWarningCaseAtomic({ guildId: interaction.guildId, userId: target.id, moderatorId: interaction.user.id, reason, strikeWeight, metadata: { sourceCourtCaseId: caseId, courtOrdered: true }, actorId: interaction.user.id });
        linkedCaseId = created?.modCase?.caseId || null;
        resultSummary = `Warning recorded with strike weight ${strikeWeight}.`;
      } else if (action === 'quarantine') {
        const result = await quarantineMember(interaction.guild, target, { reason, quarantinedBy: interaction.user.id });
        if (!result?.success) throw new Error(result?.error || result?.reason || 'Quarantine failed.');
        const linked = createCase({ guildId: interaction.guildId, userId: target.id, moderatorId: interaction.user.id, action: 'quarantine', reason, metadata: { sourceCourtCaseId: caseId, courtOrdered: true, quarantineResult: result }, status: 'active', actorId: interaction.user.id });
        linkedCaseId = linked?.caseId || null;
        resultSummary = result.dryRun ? 'Quarantine dry-run completed.' : 'Member quarantined.';
      } else {
        const metadata = { sourceCourtCaseId: caseId, courtOrdered: true };
        if (action === 'timeout') {
          const durationMs = parseCourtTimeout(parameter);
          if (!durationMs) { await interaction.reply({ content: '❌ Invalid timeout duration. Use values such as 10m, 1h or 1d; maximum 28 days.', flags: 64 }); return true; }
          metadata.durationRaw = parameter;
          metadata.durationMs = durationMs;
        }
        if (action === 'ban') {
          const deleteDays = Number(parameter);
          if (!Number.isInteger(deleteDays) || deleteDays < 0 || deleteDays > 7) { await interaction.reply({ content: '❌ Ban delete-message days must be a whole number from 0 to 7.', flags: 64 }); return true; }
          metadata.deleteDays = deleteDays;
        }
        const result = await executeEnginePunishment(interaction, target, action, reason, metadata, { logAction: `Court ${action}` });
        linkedCaseId = result?.modCase?.caseId || null;
        resultSummary = `${action} applied successfully.`;
      }
      const sanctionExecution = { status: 'executed', action, executedBy: interaction.user.id, executedAt: now(), startedAt: executionStarted, linkedCaseId, note: note || null, result: resultSummary };
      const next = { ...court, sanctionExecution, linkedCases: linkedCaseId ? [...new Set([...court.linkedCases, linkedCaseId])] : court.linkedCases };
      const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.sanction_executed', court);
      await updateCaseMessage(interaction, updated);
      return true;
    } catch (error) {
      const sanctionExecution = { status: 'failed', action, executedBy: interaction.user.id, executedAt: now(), startedAt: executionStarted, linkedCaseId: null, note: note || null, error: String(error?.message || error || 'Unknown sanction execution failure').slice(0, 500) };
      const next = { ...court, sanctionExecution };
      const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.sanction_failed', court);
      await updateCaseMessage(interaction, updated);
      return true;
    }
  }
'''
assert marker in s
s = s.replace(marker, execution + marker, 1)
p.write_text(s)

p = Path('src/core/administration/mod/punishments.js')
s = p.read_text()
old = "    ...(metadata.bulkBatchId ? { bulk: true, bulkBatchId: metadata.bulkBatchId } : {}),\n    punishmentReport: report,\n"
new = "    ...(metadata.bulkBatchId ? { bulk: true, bulkBatchId: metadata.bulkBatchId } : {}),\n    ...(metadata.sourceCourtCaseId ? { sourceCourtCaseId: Number(metadata.sourceCourtCaseId), courtOrdered: Boolean(metadata.courtOrdered) } : {}),\n    punishmentReport: report,\n"
assert old in s
s = s.replace(old, new, 1)
old = "module.exports = { buildPunishmentModal, buildBulkModal, createConfirmation, submitPunishmentRequest, submitBulkModal, executePendingAction, runBulkAction, MAX_BULK_TARGETS };"
new = "module.exports = { buildPunishmentModal, buildBulkModal, createConfirmation, submitPunishmentRequest, submitBulkModal, executePendingAction, executeEnginePunishment, runBulkAction, MAX_BULK_TARGETS };"
assert old in s
s = s.replace(old, new, 1)
p.write_text(s)
