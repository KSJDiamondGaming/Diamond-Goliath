from pathlib import Path

path = Path('src/core/administration/mod/caseCourt.js')
text = path.read_text()

# Neutralise remaining visible stage wording on the detailed case workspace.
text = text.replace("  review: '⚖️ Awaiting Review',\n  decided: '👨‍⚖️ Decision Recorded',\n", "  review: '📥 Awaiting Review',\n  decided: '✅ Decision Recorded',\n")

start = text.index('function buildCaseFile(interaction, modCase) {')
end = text.index('\nfunction buildEvidencePage(interaction, modCase) {', start)

new_function = r'''function buildCaseFile(interaction, modCase) {
  const court = parseCourt(modCase);
  const verified = court.evidence.filter((item) => item.status === 'verified');
  const draft = court.evidence.filter((item) => item.status === 'draft');
  const rejected = court.evidence.filter((item) => item.status === 'rejected');
  const appeals = getCourtAppeals(modCase);
  const latestAppeal = latestCourtAppeal(modCase);
  const canManage = canManageCourt(interaction);
  const reviewerAuthority = isJudge(interaction);
  const executionAction = String(court.decision?.action || '');
  const canExecuteAction = Boolean(executionAction && executionAction !== 'no_action' && canUseModAction(interaction.member, interaction.guild, executionAction, interaction));
  const isAssignedReviewer = reviewerAuthority && court.reviewingAdminId === interaction.user.id;
  const canDecide = isAssignedReviewer && ['review', 'decided'].includes(court.stage);
  const isClosed = court.stage === 'closed';

  const nextStep = (() => {
    if (isClosed) return 'This case is closed. Reopen it before making further changes.';
    if (court.stage === 'investigation') return 'Build the case file, verify the available material, then submit it for review.';
    if (court.stage === 'review') return court.reviewingAdminId
      ? `Review is assigned to <@${court.reviewingAdminId}>. Verify evidence and record the decision.`
      : 'The case is waiting for an authorised reviewer to claim it from the Review Brief.';
    if (court.stage === 'decided') {
      if (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved') return 'A second administrator must approve the ban before the member record can be published.';
      return 'The decision is recorded. Check the member preview, then publish the official member record.';
    }
    if (court.stage === 'published') {
      if (court.decision?.action && court.decision.action !== 'no_action' && court.sanctionExecution?.status !== 'executed') return 'The member record is published. Execute the approved moderation action when ready.';
      return latestAppeal?.status === 'pending' ? 'A member appeal is waiting for review.' : 'The published case is active. Monitor appeals or close the case when complete.';
    }
    return 'Continue working through the case workflow.';
  })();

  const decisionSummary = court.decision
    ? [
        `**Finding:** ${cleanExcerpt(court.decision.finding, 180)}`,
        `**Action:** ${String(court.decision.action || 'none').replaceAll('_', ' ')}`,
        `**Recorded by:** <@${court.decision.decidedBy}> • ${discordTime(court.decision.decidedAt)}`,
        court.decision.action === 'ban' ? `**Second approval:** ${court.sanctionReview?.status === 'approved' ? `✅ Approved by <@${court.sanctionReview.approvedBy}>` : '⏳ Required'}` : null,
        court.sanctionExecution ? `**Execution:** ${court.sanctionExecution.status === 'executed' ? '✅ Completed' : court.sanctionExecution.status === 'reversed' ? '↩️ Reversed' : court.sanctionExecution.status === 'reversal_failed' ? '⚠️ Appeal remedy failed' : court.sanctionExecution.status === 'executing' ? '⏳ In progress' : court.sanctionExecution.status === 'failed' ? '❌ Failed' : '⏳ Pending'}` : (court.decision.action !== 'no_action' ? '**Execution:** ⏳ Pending' : null),
      ].filter(Boolean).join('\n')
    : 'No decision has been recorded yet.';

  const recordSummary = court.publication
    ? `✅ **Published** • Revision ${court.publication.revision || 1}\nPublished by <@${court.publication.publishedBy}> ${discordTime(court.publication.publishedAt)}\n${cleanExcerpt(court.publication.summary, 360)}`
    : '🔒 **Internal only** • Nothing from this case is currently visible to the member.';

  const appealSummary = latestAppeal
    ? `${appealStatusText(latestAppeal)} • ${discordTime(latestAppeal.submittedAt)}${latestAppeal.reviewedAt ? ` • reviewed ${discordTime(latestAppeal.reviewedAt)}` : ''}`
    : 'No appeal submitted.';

  const embed = new EmbedBuilder()
    .setColor(court.stage === 'review' ? 0xFEE75C : court.stage === 'published' ? 0x57F287 : court.stage === 'closed' ? 0x747F8D : 0x5865F2)
    .setTitle(`📂 ${cleanExcerpt(court.title, 72)} • Case #${modCase.caseId}`)
    .setDescription([
      `**${stageText(court.stage)}** • Severity **${severityText(court.severity)}**`,
      `**Subject:** <@${modCase.userId}> • \`${modCase.userId}\``,
      `**Case lead:** <@${court.leadModeratorId}>`,
      '',
      `**Next step:** ${nextStep}`,
    ].join('\n'))
    .addFields(
      { name: '📋 Case Summary', value: cleanExcerpt(court.allegations || modCase.reason || 'No case summary recorded.', 1024), inline: false },
      { name: '🗂️ Working File', value: [
        `**Evidence:** ✅ ${verified.length} verified • 🟡 ${draft.length} draft • 🔴 ${rejected.length} rejected`,
        `**Private notes:** ${court.notes.length}`,
        `**Linked moderation records:** ${court.linkedCases.length}`,
        `**Recommendation:** ${court.recommendation?.reason ? cleanExcerpt(court.recommendation.reason, 180) : 'Not set'}`,
      ].join('\n'), inline: false },
      { name: '✅ Review & Decision', value: decisionSummary.slice(0, 1024), inline: false },
      { name: '📜 Member Record', value: `${recordSummary}\n**Appeal:** ${appealSummary}`.slice(0, 1024), inline: false },
    )
    .setFooter({ text: 'Private staff case file • only verified, approved information may be published to the member' })
    .setTimestamp();

  const workspace = new StringSelectMenuBuilder()
    .setCustomId(`mod_court_workspace:${modCase.caseId}`)
    .setPlaceholder('🗂️ Open case workspace')
    .addOptions(
      { label: 'Evidence', description: `${court.evidence.length} item(s) • review sources and verification`, value: 'evidence', emoji: '🔎' },
      { label: 'Private Notes', description: `${court.notes.length} note(s) • internal staff working notes`, value: 'notes', emoji: '📝' },
      { label: 'Timeline', description: 'Audit trail and case activity', value: 'timeline', emoji: '🕘' },
      { label: 'Review Brief', description: 'Reviewer summary, assignment and review controls', value: 'review', emoji: '📋' },
      { label: 'Member Preview', description: 'Exactly what the member can see', value: 'preview', emoji: '👁️' },
      { label: 'Record History', description: 'Decision and publication history', value: 'history', emoji: '📚' },
    );

  const workflowButtons = [
    button(`mod_court_submit_review:${modCase.caseId}`, court.stage === 'review' ? 'Awaiting Review' : 'Submit for Review', '📥', ButtonStyle.Primary, !canManage || court.stage !== 'investigation'),
    button(`mod_court_verify:${modCase.caseId}`, 'Verify Evidence', '✅', ButtonStyle.Secondary, !reviewerAuthority || !court.evidence.length || isClosed),
    button(`mod_court_decide:${modCase.caseId}`, 'Record Decision', '🧾', canDecide ? ButtonStyle.Primary : ButtonStyle.Secondary, !canDecide),
    button(`mod_court_publish:${modCase.caseId}`, court.publication ? 'Update Record' : 'Publish Record', '📜', ButtonStyle.Success, !canPublishCourt(interaction) || !court.decision || isClosed || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),
    button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Action Completed' : court.sanctionExecution?.status === 'reversed' ? 'Action Reversed' : court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution) ? 'Action Running' : court.sanctionExecution?.status === 'failed' || executionIsStale(court.sanctionExecution) ? 'Retry Action' : 'Execute Action', '⚡', ButtonStyle.Danger, !reviewerAuthority || !canExecuteAction || isClosed || court.stage !== 'published' || !court.decision || court.decision.action === 'no_action' || ['executed', 'reversed', 'reversal_failed'].includes(court.sanctionExecution?.status) || (court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution)) || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),
  ];

  const controlButtons = [];
  if (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved') {
    controlButtons.push(button(`mod_court_approve_ban:${modCase.caseId}`, 'Approve Ban', '🛡️', ButtonStyle.Danger, !reviewerAuthority || court.decision?.decidedBy === interaction.user.id));
  }
  if (appeals.length) controlButtons.push(button(`mod_case_appeal_history:${modCase.caseId}:0`, `Appeals (${appeals.length})`, '⚖️'));
  controlButtons.push(button('mod_case_appeal_queue:0', 'Appeal Queue', '📥'));
  controlButtons.push(button(isClosed ? `mod_court_reopen:${modCase.caseId}` : `mod_court_close:${modCase.caseId}`, isClosed ? 'Reopen Case' : 'Close Case', isClosed ? '🔓' : '🔒', ButtonStyle.Secondary, !canCloseCourt(interaction)));

  const components = [
    row(workspace),
    row(
      button(`mod_court_evidence:${modCase.caseId}`, 'Add Evidence', '➕', ButtonStyle.Primary, !canManage || isClosed),
      button(`mod_court_note:${modCase.caseId}`, 'Add Note', '📝', ButtonStyle.Secondary, !canManage || isClosed),
      button(`mod_court_import:${modCase.caseId}`, 'Import Records', '🔗', ButtonStyle.Secondary, !canManage || isClosed),
      button(`mod_court_severity:${modCase.caseId}`, 'Change Severity', '📊', ButtonStyle.Secondary, !canManage || isClosed),
      button(`mod_court_recommend:${modCase.caseId}`, 'Recommendation', '📋', ButtonStyle.Secondary, !canManage || isClosed),
    ),
    row(...workflowButtons),
    row(...controlButtons),
    caseFileNavigationRow(interaction, modCase),
  ];
  return { embeds: [embed], components };
}
'''

text = text[:start] + new_function + text[end:]

# Add workspace selector routing before generic button handling.
old = """  if (interaction.isStringSelectMenu?.() && id.startsWith('mod_court_open:')) {\n    return openCase(interaction, interaction.values?.[0]);\n  }\n  if (!interaction.isButton?.()) return false;\n"""
new = """  if (interaction.isStringSelectMenu?.()) {\n    if (id.startsWith('mod_court_open:')) return openCase(interaction, interaction.values?.[0]);\n    if (id.startsWith('mod_court_workspace:')) {\n      const caseId = Number(id.split(':')[1]);\n      const modCase = getCaseById(interaction.guildId, caseId);\n      if (!caseIsCourt(modCase)) return false;\n      const section = String(interaction.values?.[0] || '');\n      if (section === 'evidence') { await interaction.update(buildEvidencePage(interaction, modCase)); return true; }\n      if (section === 'notes') { await interaction.update(buildNotesPage(interaction, modCase)); return true; }\n      if (section === 'timeline') { await interaction.update(buildTimelinePage(interaction, modCase)); return true; }\n      if (section === 'review') { await interaction.update(buildReviewBriefPage(interaction, modCase)); return true; }\n      if (section === 'preview') { await interaction.update(buildMemberPreviewPage(modCase)); return true; }\n      if (section === 'history') { await interaction.update(buildRecordHistoryPage(modCase)); return true; }\n      return false;\n    }\n  }\n  if (!interaction.isButton?.()) return false;\n"""
if old not in text:
    raise SystemExit('workspace routing anchor not found')
text = text.replace(old, new, 1)

text = text.replace('so this sanction cannot be executed from Case Court.', 'so this action cannot be executed from Case Management.')

path.write_text(text)
print('Phase 26 case workspace overhaul applied')
