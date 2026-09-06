from pathlib import Path

p = Path('src/core/administration/mod/caseCourt.js')
s = p.read_text()

needle = "function caseIsCourt(modCase) { return Boolean(modCase && (modCase.action === COURT_ACTION || modCase.metadata?.court)); }\n"
insert = needle + "function getCourtAppeals(modCase = {}) { return Array.isArray(modCase?.metadata?.appeals) ? modCase.metadata.appeals.filter((appeal) => appeal && typeof appeal === 'object' && appeal.id) : []; }\nfunction latestCourtAppeal(modCase = {}) { return getCourtAppeals(modCase).slice().sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))[0] || null; }\nfunction appealStatusText(appeal) { if (!appeal) return 'No appeal submitted.'; return appeal.status === 'approved' ? '✅ Approved' : appeal.status === 'denied' ? '❌ Denied' : '⏳ Pending review'; }\n"
assert needle in s
s = s.replace(needle, insert, 1)

needle = "  const publication = court.publication\n    ? `Revision **${court.publication.revision || 1}** • Published by <@${court.publication.publishedBy}> ${discordTime(court.publication.publishedAt)}\\n${cleanExcerpt(court.publication.summary, 500)}`\n    : 'Not published. The member cannot see this internal case file.';\n"
insert = needle + "  const appeals = getCourtAppeals(modCase);\n  const latestAppeal = latestCourtAppeal(modCase);\n  const appealSummary = latestAppeal\n    ? `${appealStatusText(latestAppeal)} • submitted ${discordTime(latestAppeal.submittedAt)}${latestAppeal.reviewedAt ? ` • reviewed ${discordTime(latestAppeal.reviewedAt)}` : ''}\\n${cleanExcerpt(latestAppeal.grounds || 'No grounds recorded.', 380)}${latestAppeal.remedy?.detail ? `\\n**Remedy:** ${cleanExcerpt(latestAppeal.remedy.detail, 260)}` : ''}`\n    : 'No appeal submitted for this court case.';\n"
assert needle in s
s = s.replace(needle, insert, 1)

needle = "      { name: '📜 Member Record', value: publication.slice(0, 1024), inline: false },\n"
replacement = needle + "      { name: `⚖️ Appeals${appeals.length ? ` (${appeals.length})` : ''}`, value: appealSummary.slice(0, 1024), inline: false },\n"
assert needle in s
s = s.replace(needle, replacement, 1)

needle = "      button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Sanction Executed' : court.sanctionExecution?.status === 'reversed' ? 'Sanction Reversed' : court.sanctionExecution?.status === 'failed' ? 'Retry Sanction' : 'Execute Sanction', '⚡', ButtonStyle.Danger, !canManage || isClosed || court.stage !== 'published' || !court.decision || court.decision.action === 'no_action' || ['executed', 'reversed'].includes(court.sanctionExecution?.status) || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),\n      button(isClosed ? `mod_court_reopen:${modCase.caseId}` : `mod_court_close:${modCase.caseId}`, isClosed ? 'Reopen' : 'Close Case', isClosed ? '🔓' : '🔒', ButtonStyle.Secondary, !canManage),\n"
replacement = "      button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Sanction Executed' : court.sanctionExecution?.status === 'reversed' ? 'Sanction Reversed' : court.sanctionExecution?.status === 'failed' ? 'Retry Sanction' : 'Execute Sanction', '⚡', ButtonStyle.Danger, !canManage || isClosed || court.stage !== 'published' || !court.decision || court.decision.action === 'no_action' || ['executed', 'reversed'].includes(court.sanctionExecution?.status) || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),\n      button(`mod_court_record_history:${modCase.caseId}`, 'Record History', '📚'),\n      button(`mod_case_appeal_history:${modCase.caseId}:0`, `Appeals${appeals.length ? ` (${appeals.length})` : ''}`, '⚖️', ButtonStyle.Secondary, !appeals.length),\n      button('mod_case_appeal_queue:0', 'Appeal Queue', '📥'),\n      button(isClosed ? `mod_court_reopen:${modCase.caseId}` : `mod_court_close:${modCase.caseId}`, isClosed ? 'Reopen' : 'Close Case', isClosed ? '🔓' : '🔒', ButtonStyle.Secondary, !canManage),\n"
assert needle in s
s = s.replace(needle, replacement, 1)

marker = "function buildMemberPreviewPage(modCase) {\n"
record_page = '''function buildRecordHistoryPage(modCase) {
  const court = parseCourt(modCase);
  const decisions = [...court.decisionHistory, ...(court.decision ? [court.decision] : [])].filter(Boolean);
  const publications = [...court.publicationHistory, ...(court.publication ? [court.publication] : [])].filter(Boolean);
  const appeals = getCourtAppeals(modCase);
  const decisionLines = decisions.length ? decisions.slice(-8).reverse().map((item, index) => `**${index === 0 ? 'Current' : 'Prior'}** • ${item.action || 'no_action'} • ${cleanExcerpt(item.finding || 'No finding', 100)}\\n<@${item.decidedBy || '0'}> • ${discordTime(item.decidedAt)}`) : ['No decision history recorded.'];
  const publicationLines = publications.length ? publications.slice(-8).reverse().map((item) => `**Revision ${item.revision || 1}** • ${discordTime(item.publishedAt)} • <@${item.publishedBy || '0'}>\\n${cleanExcerpt(item.summary || '', 180)}`) : ['No publication history recorded.'];
  const appealLines = appeals.length ? appeals.slice(-8).reverse().map((appeal) => `**${appealStatusText(appeal)}** • ${discordTime(appeal.submittedAt)}\\n${cleanExcerpt(appeal.grounds || '', 180)}${appeal.reviewNote ? `\\nReview: ${cleanExcerpt(appeal.reviewNote, 140)}` : ''}${appeal.remedy?.detail ? `\\nRemedy: ${cleanExcerpt(appeal.remedy.detail, 140)}` : ''}`) : ['No appeal history recorded.'];
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📚 Official Record History • Case #${modCase.caseId}`)
    .setDescription('Decision, publication and appeal history for this Court Case. Internal evidence and private staff notes are intentionally excluded.')
    .addFields(
      { name: '👨‍⚖️ Decision History', value: decisionLines.join('\\n\\n').slice(0, 1024), inline: false },
      { name: '📜 Publication Revisions', value: publicationLines.join('\\n\\n').slice(0, 1024), inline: false },
      { name: '⚖️ Appeal History', value: appealLines.join('\\n\\n').slice(0, 1024), inline: false },
    )
    .setFooter({ text: 'Court record history • newest entries first' })
    .setTimestamp();
  return { embeds: [embed], components: [caseFileBackRow(modCase.caseId)] };
}

'''
assert marker in s
s = s.replace(marker, record_page + marker, 1)

needle = "      { name: 'Official Summary', value: cleanExcerpt(summary, 1800), inline: false },\n"
replacement = needle + "      { name: 'Appeal Status', value: (() => { const appeal = latestCourtAppeal(modCase); return appeal ? `${appealStatusText(appeal)}${appeal.reviewedAt ? ` • reviewed ${discordTime(appeal.reviewedAt)}` : ''}` : 'No appeal submitted.'; })(), inline: false },\n"
assert needle in s
s = s.replace(needle, replacement, 1)

needle = "  if (key === 'mod_court_preview') { const payload = buildMemberPreviewPage(modCase); await interaction.update(payload); return true; }\n"
replacement = needle + "  if (key === 'mod_court_record_history') { const payload = buildRecordHistoryPage(modCase); await interaction.update(payload); return true; }\n"
assert needle in s
s = s.replace(needle, replacement, 1)

# Add appeal status to member-facing published case summary without exposing private material.
needle = "    const court = parseCourt(entry);\n    const publication = court.publication;\n"
if needle in s:
    replacement = needle + "    const appeal = latestCourtAppeal(entry);\n"
    s = s.replace(needle, replacement, 1)

p.write_text(s)
