from pathlib import Path

p = Path('src/core/administration/mod/caseCourt.js')
s = p.read_text()

def add_after_once(anchor, addition):
    global s
    if addition.strip() in s:
        return
    if anchor not in s:
        raise RuntimeError(f'Anchor not found: {anchor[:80]}')
    s = s.replace(anchor, anchor + addition, 1)

def replace_once(old, new):
    global s
    if new in s:
        return
    if old not in s:
        raise RuntimeError(f'Replacement anchor not found: {old[:80]}')
    s = s.replace(old, new, 1)

add_after_once(
    "function caseIsCourt(modCase) { return Boolean(modCase && (modCase.action === COURT_ACTION || modCase.metadata?.court)); }\n",
    "function getCourtAppeals(modCase = {}) { return Array.isArray(modCase?.metadata?.appeals) ? modCase.metadata.appeals.filter((appeal) => appeal && typeof appeal === 'object' && appeal.id) : []; }\n"
    "function latestCourtAppeal(modCase = {}) { return getCourtAppeals(modCase).slice().sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))[0] || null; }\n"
    "function appealStatusText(appeal) { if (!appeal) return 'No appeal submitted.'; return appeal.status === 'approved' ? '✅ Approved' : appeal.status === 'denied' ? '❌ Denied' : '⏳ Pending review'; }\n"
)

# Case-file appeal summary: inject immediately before the embed is built.
anchor = "    : 'Not published. The member cannot see this internal case file.';\n\n  const embed = new EmbedBuilder()"
addition = "    : 'Not published. The member cannot see this internal case file.';\n  const appeals = getCourtAppeals(modCase);\n  const latestAppeal = latestCourtAppeal(modCase);\n  const appealSummary = latestAppeal\n    ? `${appealStatusText(latestAppeal)} • submitted ${discordTime(latestAppeal.submittedAt)}${latestAppeal.reviewedAt ? ` • reviewed ${discordTime(latestAppeal.reviewedAt)}` : ''}\\n${cleanExcerpt(latestAppeal.grounds || 'No grounds recorded.', 380)}${latestAppeal.remedy?.detail ? `\\n**Remedy:** ${cleanExcerpt(latestAppeal.remedy.detail, 260)}` : ''}`\n    : 'No appeal submitted for this court case.';\n\n  const embed = new EmbedBuilder()"
replace_once(anchor, addition)

add_after_once(
    "      { name: '📜 Member Record', value: publication.slice(0, 1024), inline: false },\n",
    "      { name: `⚖️ Appeals${appeals.length ? ` (${appeals.length})` : ''}`, value: appealSummary.slice(0, 1024), inline: false },\n"
)

# Add Court record/appeal controls to the existing execution/close row.
old = "      button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Sanction Executed' : court.sanctionExecution?.status === 'reversed' ? 'Sanction Reversed' : court.sanctionExecution?.status === 'failed' ? 'Retry Sanction' : 'Execute Sanction', '⚡', ButtonStyle.Danger, !canManage || isClosed || court.stage !== 'published' || !court.decision || court.decision.action === 'no_action' || ['executed', 'reversed'].includes(court.sanctionExecution?.status) || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),\n      button(isClosed ? `mod_court_reopen:${modCase.caseId}` : `mod_court_close:${modCase.caseId}`, isClosed ? 'Reopen' : 'Close Case', isClosed ? '🔓' : '🔒', ButtonStyle.Secondary, !canClose),\n"
new = "      button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Sanction Executed' : court.sanctionExecution?.status === 'reversed' ? 'Sanction Reversed' : court.sanctionExecution?.status === 'failed' ? 'Retry Sanction' : 'Execute Sanction', '⚡', ButtonStyle.Danger, !canManage || isClosed || court.stage !== 'published' || !court.decision || court.decision.action === 'no_action' || ['executed', 'reversed'].includes(court.sanctionExecution?.status) || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),\n      button(`mod_court_record_history:${modCase.caseId}`, 'Record History', '📚'),\n      button(`mod_case_appeal_history:${modCase.caseId}:0`, `Appeals${appeals.length ? ` (${appeals.length})` : ''}`, '⚖️', ButtonStyle.Secondary, !appeals.length),\n      button('mod_case_appeal_queue:0', 'Appeal Queue', '📥'),\n      button(isClosed ? `mod_court_reopen:${modCase.caseId}` : `mod_court_close:${modCase.caseId}`, isClosed ? 'Reopen' : 'Close Case', isClosed ? '🔓' : '🔒', ButtonStyle.Secondary, !canClose),\n"
replace_once(old, new)

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
if 'function buildRecordHistoryPage(modCase)' not in s:
    marker = 'function buildMemberPreviewPage(modCase) {\n'
    if marker not in s: raise RuntimeError('Member preview marker not found')
    s = s.replace(marker, record_page + marker, 1)

add_after_once(
    "      { name: 'Official Summary', value: cleanExcerpt(summary, 1800), inline: false },\n",
    "      { name: 'Appeal Status', value: (() => { const appeal = latestCourtAppeal(modCase); return appeal ? `${appealStatusText(appeal)}${appeal.reviewedAt ? ` • reviewed ${discordTime(appeal.reviewedAt)}` : ''}` : 'No appeal submitted.'; })(), inline: false },\n"
)

add_after_once(
    "  if (key === 'mod_court_preview') { const payload = buildMemberPreviewPage(modCase); await interaction.update(payload); return true; }\n",
    "  if (key === 'mod_court_record_history') { const payload = buildRecordHistoryPage(modCase); await interaction.update(payload); return true; }\n"
)

p.write_text(s)
