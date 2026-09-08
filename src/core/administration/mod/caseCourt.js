'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const {
  db,
  createCase,
  getCaseById,
  getCasesForUser,
  getAllCases,
  recordCaseAudit,
  emitCaseUpdated,
  claimCourtOperationAtomic,
} = require('./storage');
const { canUseModAction } = require('./permissions');
const { executeEnginePunishment } = require('./punishments');
const { createWarningCaseAtomic } = require('./warns');
const { quarantineMember } = require('../../security/protection/quarantine');

const COURT_ACTION = 'case';
const SEVERITY = Object.freeze({
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Severe',
  5: 'Critical',
});
const STAGES = Object.freeze({
  investigation: '🔎 Under Investigation',
  review: '📥 Awaiting Review',
  decided: '✅ Decision Recorded',
  published: '📜 Published',
  closed: '🔒 Closed',
});
const EVIDENCE_STATUS = Object.freeze({ draft: '🟡 Draft', verified: '🟢 Verified', rejected: '🔴 Rejected' });
const COURT_EXECUTION_LOCKS = new Set();
const COURT_EXECUTION_STALE_MS = 5 * 60 * 1000;

function now() { return new Date().toISOString(); }
function parseCourt(modCase = {}) {
  const metadata = modCase.metadata && typeof modCase.metadata === 'object' ? modCase.metadata : {};
  const court = metadata.court && typeof metadata.court === 'object' ? metadata.court : {};
  return {
    stage: court.stage || 'investigation',
    severity: Math.min(5, Math.max(1, Number(court.severity) || 1)),
    title: String(court.title || court.allegations || modCase.reason || `Case #${modCase.caseId || '?'}`).replace(/\s+/g, ' ').trim().slice(0, 100),
    allegations: String(court.allegations || modCase.reason || '').slice(0, 3000),
    leadModeratorId: court.leadModeratorId || modCase.moderatorId || null,
    reviewingAdminId: court.reviewingAdminId || null,
    evidence: Array.isArray(court.evidence) ? court.evidence : [],
    notes: Array.isArray(court.notes) ? court.notes : [],
    linkedCases: Array.isArray(court.linkedCases) ? court.linkedCases : [],
    recommendation: court.recommendation || null,
    decision: court.decision || null,
    publication: court.publication || null,
    submittedForReviewAt: court.submittedForReviewAt || null,
    submittedForReviewBy: court.submittedForReviewBy || null,
    reviewClaimedAt: court.reviewClaimedAt || null,
    closedAt: court.closedAt || null,
    closedBy: court.closedBy || null,
    closeReason: court.closeReason || null,
    previousStage: court.previousStage || null,
    decisionHistory: Array.isArray(court.decisionHistory) ? court.decisionHistory : [],
    publicationHistory: Array.isArray(court.publicationHistory) ? court.publicationHistory : [],
    sanctionReview: court.sanctionReview && typeof court.sanctionReview === 'object' ? court.sanctionReview : null,
    sanctionExecution: court.sanctionExecution && typeof court.sanctionExecution === 'object' ? court.sanctionExecution : null,
  };
}
function saveCourt(guildId, caseId, court, actorId, event, beforeCourt = null) {
  const current = getCaseById(guildId, caseId);
  if (!current) return null;
  const metadata = { ...(current.metadata || {}), court };
  const updatedAt = now();
  const result = db.prepare('UPDATE cases SET metadata = ?, updated_at = ? WHERE guild_id = ? AND case_id = ?')
    .run(JSON.stringify(metadata), updatedAt, String(guildId), Number(caseId));
  if (!result.changes) return null;
  const updated = getCaseById(guildId, caseId);
  recordCaseAudit({ guildId, caseId, actorId, event, before: beforeCourt, after: court, metadata: { court: true } });
  emitCaseUpdated(guildId, updated);
  return updated;
}
function severityText(value) { const n = Math.min(5, Math.max(1, Number(value) || 1)); return SEVERITY[n]; }
function parseSeverityInput(value) {
  const raw = String(value || '').trim().toLowerCase();
  const aliases = { '1': 1, low: 1, '2': 2, medium: 2, moderate: 2, '3': 3, high: 3, '4': 4, severe: 4, '5': 5, critical: 5 };
  return aliases[raw] || null;
}
function stageText(stage) { return STAGES[stage] || STAGES.investigation; }
function discordTime(value, style = 'R') {
  const ms = new Date(value || 0).getTime();
  return Number.isFinite(ms) && ms > 0 ? `<t:${Math.floor(ms / 1000)}:${style}>` : 'Unknown';
}
function row(...items) { return new ActionRowBuilder().addComponents(...items); }
function button(id, label, emoji, style = ButtonStyle.Secondary, disabled = false) {
  const item = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
  if (emoji) item.setEmoji(emoji);
  return item;
}
function modalInput(id, label, style = TextInputStyle.Paragraph, required = true, maxLength = 1000, placeholder = null, value = null) {
  const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(maxLength);
  if (placeholder) input.setPlaceholder(placeholder);
  if (value) input.setValue(String(value).slice(0, maxLength));
  return row(input);
}
function caseIsCourt(modCase) { return Boolean(modCase && (modCase.action === COURT_ACTION || modCase.metadata?.court)); }
function getCourtAppeals(modCase = {}) { return Array.isArray(modCase?.metadata?.appeals) ? modCase.metadata.appeals.filter((appeal) => appeal && typeof appeal === 'object' && appeal.id) : []; }
function latestCourtAppeal(modCase = {}) { return getCourtAppeals(modCase).slice().sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))[0] || null; }
function appealStatusText(appeal) { if (!appeal) return 'No appeal submitted.'; return appeal.status === 'approved' ? '✅ Approved' : appeal.status === 'denied' ? '❌ Denied' : '⏳ Pending review'; }
function courtExecutionLockKey(guildId, caseId) { return `${guildId}:${caseId}`; }
function executionIsStale(execution) { if (!execution || execution.status !== 'executing') return false; const started = new Date(execution.startedAt || execution.claimedAt || 0).getTime(); return !Number.isFinite(started) || Date.now() - started > COURT_EXECUTION_STALE_MS; }
function getCourtCases(guildId, userId = null) {
  const cases = userId ? getCasesForUser(guildId, userId) : getAllCases(guildId);
  return (cases || []).filter(caseIsCourt);
}
function courtCounts(cases = []) {
  const counts = { investigation: 0, review: 0, decided: 0, published: 0, closed: 0 };
  for (const modCase of cases) counts[parseCourt(modCase).stage] = (counts[parseCourt(modCase).stage] || 0) + 1;
  return counts;
}
function cleanExcerpt(value, max = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
function staffBackRow(targetId) { return row(button(`mod_court_back:${targetId}`, 'Back', '⬅️')); }
function caseManagementNavigationRow(interaction, targetId) {
  return row(button(`mod_dashboard:${targetId}:actions`, 'Back', '⬅️'));
}
function caseFileBackRow(caseId) { return row(button(`mod_court_file:${caseId}`, 'Back', '⬅️')); }
function canDeleteCourt(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_delete', interaction); }
function caseFileNavigationRow(interaction, modCase) {
  return row(button(`mod_court_back:${modCase.userId}`, 'Back', '⬅️'));
}
function auditRows(guildId, caseId, limit = 25) {
  try { return db.prepare('SELECT actor_id, event, after_value, metadata, created_at FROM case_audit WHERE guild_id = ? AND case_id = ? ORDER BY audit_id DESC LIMIT ?').all(String(guildId), Number(caseId), Math.max(1, Math.min(50, Number(limit) || 25))); }
  catch { return []; }
}

function buildCourtDashboard(interaction, target) {
  const cases = target ? getCourtCases(interaction.guildId, target.id) : [];
  const counts = courtCounts(cases);
  const latest = cases.slice(0, 5);
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(target ? `📂 Case Management • ${target.displayName || target.user.globalName || target.user.username || target.user.tag}` : '📂 Case Management')
    .setDescription(target
      ? ['Build the internal case file here. Only a **published record** is visible to the member.', '', `**Subject:** ${target.user} • \`${target.id}\``].join('\n')
      : 'Select a member to open their case-management workspace.')
    .addFields(
      { name: '🔎 Investigating', value: `**${counts.investigation}**`, inline: true },
      { name: '⚖️ Review Queue', value: `**${counts.review}**`, inline: true },
      { name: '📜 Published', value: `**${counts.published}**`, inline: true },
      { name: 'Case Workflow', value: 'Investigation → Review → Decision → Published record → Appeal', inline: false },
    )
    .setFooter({ text: 'Private staff workspace • unpublished work is never shown to the member' })
    .setTimestamp();
  if (latest.length) embed.addFields({
    name: 'Recent Case Files',
    value: latest.map((entry) => {
      const court = parseCourt(entry);
      return `**${cleanExcerpt(court.title, 78)}** • Case #${entry.caseId}\n${stageText(court.stage)} • Severity **${severityText(court.severity)}**`;
    }).join('\n\n').slice(0, 1024),
    inline: false,
  });

  const components = [];
  if (target) {
    if (cases.length) components.push(row(new StringSelectMenuBuilder()
      .setCustomId(`mod_court_open:${target.id}`)
      .setPlaceholder('📂 Open a case file')
      .addOptions(cases.slice(0, 25).map((entry) => {
        const court = parseCourt(entry);
        const memberName = target.displayName || target.user?.globalName || target.user?.username || 'Unknown Member';
        const caseTitle = cleanExcerpt(court.title || court.allegations || entry.reason || 'Untitled Case', 42);
        return {
          label: cleanExcerpt(`${memberName} • ${target.id} • ${caseTitle}`, 100),
          description: cleanExcerpt(`Case #${entry.caseId} • ${stageText(court.stage).replace(/^\S+\s/, '')} • Severity ${severityText(court.severity)}`, 100),
          value: String(entry.caseId),
          emoji: court.stage === 'published' ? '📜' : court.stage === 'review' ? '⚖️' : '📂',
        };
      }))));
    const dashboardActions = [
    button(`mod_court_new:${target.id}`, 'New Case', '➕', ButtonStyle.Primary, !canManageCourt(interaction)),
    button(`mod_court_review_queue:${target.id}`, 'Review Queue', '⚖️'),
    button(`mod_court_published:${target.id}`, 'Published', '📜'),
  ];
  if (canUseModAction(interaction.member, interaction.guild, 'export_cases', interaction)) dashboardActions.push(button(`mod_export_cases:${target.id}`, 'Export', '📤'));
  components.push(row(...dashboardActions));
  components.push(caseManagementNavigationRow(interaction, target.id));
  }
  return { embed, components };
}

function buildCaseFile(interaction, modCase) {
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
    if (modCase.status === 'reversed') return 'This published decision has been reversed. Its sanction cannot be executed again.';
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
        court.sanctionExecution ? `**Execution:** ${court.sanctionExecution.status === 'executed' ? '✅ Completed' : court.sanctionExecution.status === 'reversed' ? '↩️ Reversed' : court.sanctionExecution.status === 'reversing' ? '⏳ Reversing after appeal' : court.sanctionExecution.status === 'reversal_failed' ? '⚠️ Appeal remedy failed' : court.sanctionExecution.status === 'executing' ? '⏳ In progress' : court.sanctionExecution.status === 'failed' ? '❌ Failed' : '⏳ Pending'}` : (court.decision.action !== 'no_action' ? '**Execution:** ⏳ Pending' : null),
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
    button(`mod_court_submit_review:${modCase.caseId}`, court.stage === 'review' ? 'Pending' : 'Review', '📥', ButtonStyle.Primary, !canManage || court.stage !== 'investigation'),
    button(`mod_court_verify:${modCase.caseId}`, 'Verify', '✅', ButtonStyle.Secondary, !reviewerAuthority || !court.evidence.length || isClosed),
    button(`mod_court_decide:${modCase.caseId}`, 'Decide', '🧾', canDecide ? ButtonStyle.Primary : ButtonStyle.Secondary, !canDecide),
    button(`mod_court_publish:${modCase.caseId}`, court.publication ? 'Update' : 'Publish', '📜', ButtonStyle.Success, !canPublishCourt(interaction) || !court.decision || isClosed || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),
    button(`mod_court_execute:${modCase.caseId}`, court.sanctionExecution?.status === 'executed' ? 'Done' : court.sanctionExecution?.status === 'reversed' ? 'Reversed' : court.sanctionExecution?.status === 'reversing' ? 'Reversing' : court.sanctionExecution?.status === 'reversal_failed' ? 'Appeal Failed' : court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution) ? 'Running' : court.sanctionExecution?.status === 'failed' || executionIsStale(court.sanctionExecution) ? 'Retry' : 'Execute', '⚡', ButtonStyle.Danger, !reviewerAuthority || !canExecuteAction || isClosed || modCase.status === 'reversed' || court.stage !== 'published' || !court.decision || court.decision.action === 'no_action' || ['executed', 'reversed', 'reversing', 'reversal_failed'].includes(court.sanctionExecution?.status) || (court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution)) || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),
  ];

  const controlButtons = [];
  if (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved') {
    controlButtons.push(button(`mod_court_approve_ban:${modCase.caseId}`, 'Approve Ban', '🛡️', ButtonStyle.Danger, !reviewerAuthority || court.decision?.decidedBy === interaction.user.id));
  }
  if (appeals.length) controlButtons.push(button(`mod_case_appeal_history:${modCase.caseId}:0`, `Appeals (${appeals.length})`, '⚖️'));
  controlButtons.push(button('mod_case_appeal_queue:0', 'Appeals', '📥'));
  if (canDeleteCourt(interaction)) controlButtons.push(button(`mod_court_delete:${modCase.caseId}`, 'Delete Case', '🗑️', ButtonStyle.Danger));
  controlButtons.push(button(isClosed ? `mod_court_reopen:${modCase.caseId}` : `mod_court_close:${modCase.caseId}`, isClosed ? 'Reopen' : 'Close', isClosed ? '🔓' : '🔒', ButtonStyle.Secondary, !canCloseCourt(interaction)));

  const components = [
    row(workspace),
    row(
      button(`mod_court_evidence:${modCase.caseId}`, 'Evidence', '➕', ButtonStyle.Primary, !canManage || isClosed),
      button(`mod_court_note:${modCase.caseId}`, 'Note', '📝', ButtonStyle.Secondary, !canManage || isClosed),
      button(`mod_court_import:${modCase.caseId}`, 'Import', '🔗', ButtonStyle.Secondary, !canManage || isClosed),
      button(`mod_court_severity:${modCase.caseId}`, 'Severity', '📊', ButtonStyle.Secondary, !canManage || isClosed),
      button(`mod_court_recommend:${modCase.caseId}`, 'Recommend', '📋', ButtonStyle.Secondary, !canManage || isClosed),
    ),
    row(...workflowButtons),
    row(...controlButtons),
    caseFileNavigationRow(interaction, modCase),
  ];
  return { embeds: [embed], components };
}

function buildEvidencePage(interaction, modCase) {
  const court = parseCourt(modCase);
  const canManage = canManageCourt(interaction) && court.stage !== 'closed';
  const judgeAuthority = isJudge(interaction);
  const lines = court.evidence.length ? court.evidence.slice(-12).reverse().map((item) => {
    const verification = item.status === 'verified' ? `\nVerified by <@${item.verifiedBy}> ${discordTime(item.verifiedAt)}` : item.status === 'rejected' ? `\nRejected by <@${item.verifiedBy}> ${discordTime(item.verifiedAt)}` : '';
    return `${EVIDENCE_STATUS[item.status] || EVIDENCE_STATUS.draft} **${item.id} • ${cleanExcerpt(item.title, 90)}**\nSource: ${cleanExcerpt(item.source || 'Internal submission', 120)}\n${cleanExcerpt(item.details, 240)}${verification}`;
  }) : ['No evidence has been added to this case.'];
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`🔎 Evidence • Case #${modCase.caseId}`).setDescription(lines.join('\n\n').slice(0, 4000)).setFooter({ text: 'Draft evidence stays internal until an authorised admin verifies it' }).setTimestamp();
  return { embeds: [embed], components: [row(button(`mod_court_evidence:${modCase.caseId}`, 'Add Evidence', '➕', ButtonStyle.Primary, !canManage), button(`mod_court_verify:${modCase.caseId}`, 'Verify Evidence', '✅', ButtonStyle.Secondary, !judgeAuthority || !court.evidence.length || court.stage === 'closed')), caseFileBackRow(modCase.caseId)] };
}
function buildNotesPage(interaction, modCase) {
  const court = parseCourt(modCase);
  const canManage = canManageCourt(interaction) && court.stage !== 'closed';
  const lines = court.notes.length ? court.notes.slice(-15).reverse().map((item) => `**${item.id || 'Note'}** • <@${item.authorId}> • ${discordTime(item.createdAt)}\n${cleanExcerpt(item.text, 300)}`) : ['No private staff notes have been added.'];
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`📝 Case Notes • #${modCase.caseId}`).setDescription(lines.join('\n\n').slice(0, 4000)).setFooter({ text: 'Private staff paperwork • never published automatically' }).setTimestamp();
  return { embeds: [embed], components: [row(button(`mod_court_note:${modCase.caseId}`, 'Add Case Note', '➕', ButtonStyle.Primary, !canManage)), caseFileBackRow(modCase.caseId)] };
}
function buildTimelinePage(interaction, modCase) {
  const rows = auditRows(interaction.guildId, modCase.caseId, 20);
  const lines = rows.length ? rows.map((entry) => `**${String(entry.event || 'case.updated').replace(/^case\.court\./, '').replaceAll('_', ' ')}** • ${discordTime(entry.created_at)}\nActor: ${entry.actor_id ? `<@${entry.actor_id}>` : 'System'}`) : ['No case audit activity recorded yet.'];
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`🕘 Case Timeline • #${modCase.caseId}`).setDescription(lines.join('\n\n').slice(0, 4000)).setFooter({ text: 'Immutable case audit trail • newest activity first' }).setTimestamp();
  return { embeds: [embed], components: [caseFileBackRow(modCase.caseId)] };
}
function recommendationModal(caseId, court) {
  return new ModalBuilder().setCustomId(`mod_court_recommend_submit:${caseId}`).setTitle('Case Recommendation').addComponents(
    modalInput('recommendation', 'Recommended outcome / next step', TextInputStyle.Paragraph, true, 1200, 'Record the moderator recommendation for the reviewing admin.', court.recommendation?.reason || ''),
  );
}

function buildReviewBriefPage(interaction, modCase) {
  const court = parseCourt(modCase);
  const verified = court.evidence.filter((item) => item.status === 'verified');
  const draft = court.evidence.filter((item) => item.status === 'draft');
  const recommendation = court.recommendation?.reason || 'No moderator recommendation recorded.';
  const reviewer = court.reviewingAdminId ? `<@${court.reviewingAdminId}>${court.reviewClaimedAt ? ` • claimed ${discordTime(court.reviewClaimedAt)}` : ''}` : 'Unassigned';
  const readiness = [
    verified.length ? '✅ Verified evidence present' : '❌ No verified evidence',
    court.recommendation ? '✅ Moderator recommendation recorded' : '⚠️ No recommendation',
    court.stage === 'review' ? '✅ Submitted for review' : `⚠️ Current stage: ${stageText(court.stage)}`,
    court.reviewingAdminId ? '✅ Reviewer assigned' : '⚠️ Awaiting reviewer claim',
  ].join('\n');
  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle(`⚖️ Review Brief • Case #${modCase.caseId}`)
    .setDescription(`**Subject:** <@${modCase.userId}> • \`${modCase.userId}\`\n**Severity:** **${severityText(court.severity)}**\n**Lead:** <@${court.leadModeratorId}>\n**Decision by:** ${reviewer}`)
    .addFields(
      { name: '📋 Allegations', value: cleanExcerpt(court.allegations || modCase.reason, 1024), inline: false },
      { name: '🔎 Evidence Position', value: `Verified **${verified.length}** • Draft **${draft.length}** • Rejected **${court.evidence.filter((item) => item.status === 'rejected').length}**\n${verified.slice(0, 6).map((item) => `• **${item.id}** ${cleanExcerpt(item.title, 90)}`).join('\n') || 'No verified evidence.'}`, inline: false },
      { name: '📋 Moderator Recommendation', value: cleanExcerpt(recommendation, 1024), inline: false },
      { name: '✅ Decision Readiness', value: readiness, inline: false },
    )
    .setFooter({ text: 'An authorised reviewer must claim the case before recording a decision' })
    .setTimestamp();
  const judgeAuthority = isJudge(interaction);
  const assignedToOther = court.reviewingAdminId && court.reviewingAdminId !== interaction.user.id;
  const controls = [];
  if (court.stage === 'review' && !court.reviewingAdminId) controls.push(button(`mod_court_claim_review:${modCase.caseId}`, 'Claim Review', '✋', ButtonStyle.Primary, !judgeAuthority));
  if (court.stage === 'review' && court.reviewingAdminId === interaction.user.id) {
    controls.push(button(`mod_court_decide:${modCase.caseId}`, 'Record Decision', '⚖️', ButtonStyle.Danger, !verified.length));
    controls.push(button(`mod_court_return:${modCase.caseId}`, 'Return for Work', '↩️', ButtonStyle.Secondary));
  }
  if (assignedToOther) controls.push(button(`mod_court_claim_review:${modCase.caseId}`, 'Assigned to Another Reviewer', '🔒', ButtonStyle.Secondary, true));
  const components = [];
  if (controls.length) components.push(row(...controls.slice(0, 5)));
  components.push(caseFileBackRow(modCase.caseId));
  return { embeds: [embed], components };
}

function uniqueHistoryItems(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items.filter(Boolean)) {
    const key = String(keyFn(item) || '');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildRecordHistoryPage(modCase) {
  const court = parseCourt(modCase);
  const decisions = uniqueHistoryItems(
    [...court.decisionHistory, ...(court.decision ? [court.decision] : [])],
    (item) => `${item.decidedAt || ''}:${item.action || ''}:${item.finding || ''}`,
  );
  const publications = uniqueHistoryItems(
    [...court.publicationHistory, ...(court.publication ? [court.publication] : [])],
    (item) => `${item.revision || ''}:${item.publishedAt || ''}:${item.summary || ''}`,
  );
  const appeals = getCourtAppeals(modCase);
  const decisionLines = decisions.length ? decisions.slice(-8).reverse().map((item, index) => `**${index === 0 ? 'Current' : 'Prior'}** • ${item.action || 'no_action'} • ${cleanExcerpt(item.finding || 'No finding', 100)}\n<@${item.decidedBy || '0'}> • ${discordTime(item.decidedAt)}`) : ['No decision history recorded.'];
  const publicationLines = publications.length ? publications.slice(-8).reverse().map((item) => `**Revision ${item.revision || 1}** • ${discordTime(item.publishedAt)} • <@${item.publishedBy || '0'}>\n${cleanExcerpt(item.summary || '', 180)}`) : ['No publication history recorded.'];
  const appealLines = appeals.length ? appeals.slice(-8).reverse().map((appeal) => `**${appealStatusText(appeal)}** • ${discordTime(appeal.submittedAt)}\n${cleanExcerpt(appeal.grounds || '', 180)}${appeal.reviewNote ? `\nReview: ${cleanExcerpt(appeal.reviewNote, 140)}` : ''}${appeal.remedy?.detail ? `\nRemedy: ${cleanExcerpt(appeal.remedy.detail, 140)}` : ''}`) : ['No appeal history recorded.'];
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📚 Official Record History • Case #${modCase.caseId}`)
    .setDescription('Decision, publication and appeal history for this case. Internal evidence and private staff notes are intentionally excluded.')
    .addFields(
      { name: '👨‍⚖️ Decision History', value: decisionLines.join('\n\n').slice(0, 1024), inline: false },
      { name: '📜 Publication Revisions', value: publicationLines.join('\n\n').slice(0, 1024), inline: false },
      { name: '⚖️ Appeal History', value: appealLines.join('\n\n').slice(0, 1024), inline: false },
    )
    .setFooter({ text: 'Case record history • newest entries first' })
    .setTimestamp();
  return { embeds: [embed], components: [caseFileBackRow(modCase.caseId)] };
}

function buildMemberPreviewPage(modCase) {
  const court = parseCourt(modCase);
  const decision = court.decision || {};
  const published = court.publication;
  const summary = published?.summary || 'No member-facing summary has been published yet. Use Publish Record to create one.';
  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle(`👁️ Member Preview • Case #${modCase.caseId}`)
    .setDescription('This preview intentionally excludes private notes, draft/rejected evidence, scan intelligence and staff deliberation.')
    .addFields(
      { name: 'Status', value: published ? `Published • Revision ${published.revision || 1}` : 'Not yet published', inline: true },
      { name: 'Severity', value: severityText(court.severity), inline: true },
      { name: 'Finding', value: cleanExcerpt(decision.finding || 'No finding recorded.', 1024), inline: false },
      { name: 'Decision', value: cleanExcerpt(decision.action || 'No action recorded.', 1024), inline: false },
      { name: 'Official Summary', value: cleanExcerpt(summary, 1800), inline: false },
      { name: 'Appeal Status', value: (() => { const appeal = latestCourtAppeal(modCase); return appeal ? `${appealStatusText(appeal)}${appeal.reviewedAt ? ` • reviewed ${discordTime(appeal.reviewedAt)}` : ''}` : 'No appeal submitted.'; })(), inline: false },
    )
    .setFooter({ text: 'Exact privacy boundary preview • staff-only material is omitted' })
    .setTimestamp();
  return { embeds: [embed], components: [caseFileBackRow(modCase.caseId)] };
}

function closeCaseModal(caseId) {
  return new ModalBuilder().setCustomId(`mod_court_close_submit:${caseId}`).setTitle('Close Case').addComponents(
    modalInput('reason', 'Closure reason', TextInputStyle.Paragraph, true, 1000, 'Why is this case being closed?'),
  );
}

function newCaseModal(targetId) {
  return new ModalBuilder().setCustomId(`mod_case_new_submit_v2:${targetId}`).setTitle('Open New Case').addComponents(
    modalInput('caseTitle', 'Case title / short summary', TextInputStyle.Short, true, 100, 'Example: Repeated harassment in #general'),
    modalInput('allegations', 'Allegations / details', TextInputStyle.Paragraph, true, 2000, 'Describe what happened, including context, dates, channels and users involved.'),
    modalInput('severity', 'Initial severity (Low–Critical)', TextInputStyle.Short, true, 8, 'Low, Medium, High, Severe, or Critical'),
    modalInput('recommendation', 'Recommended action (optional)', TextInputStyle.Paragraph, false, 800, 'What action or next step should the review team consider?'),
  );
}
function deleteCaseModal(caseId) {
  return new ModalBuilder().setCustomId(`mod_court_delete_submit:${caseId}`).setTitle(`Delete Case #${caseId}`).addComponents(
    modalInput('confirmation', 'Type DELETE to confirm', TextInputStyle.Short, true, 6, 'DELETE'),
    modalInput('reason', 'Deletion reason', TextInputStyle.Paragraph, true, 500, 'Why is this case being permanently deleted?'),
  );
}
function evidenceModal(caseId) {
  return new ModalBuilder().setCustomId(`mod_court_evidence_submit:${caseId}`).setTitle('Add Case Evidence').addComponents(
    modalInput('title', 'Evidence title', TextInputStyle.Short, true, 120, 'Message screenshot, scan result, moderator record…'),
    modalInput('source', 'Source / reference', TextInputStyle.Short, false, 300, 'Message URL, case number, upload reference…'),
    modalInput('details', 'Evidence details', TextInputStyle.Paragraph, true, 1800, 'What does this evidence establish?'),
  );
}
function noteModal(caseId) {
  return new ModalBuilder().setCustomId(`mod_court_note_submit:${caseId}`).setTitle('Add Private Case Note').addComponents(
    modalInput('note', 'Private staff note', TextInputStyle.Paragraph, true, 1500, 'Internal working note. This is never published automatically.'),
  );
}
function severityModal(caseId, court) {
  return new ModalBuilder().setCustomId(`mod_court_severity_submit:${caseId}`).setTitle('Change Case Severity').addComponents(
    modalInput('severity', 'Severity (Low–Critical)', TextInputStyle.Short, true, 8, 'Low, Medium, High, Severe, or Critical', SEVERITY[court.severity]),
    modalInput('reason', 'Reason for severity change', TextInputStyle.Paragraph, true, 1000, 'Explain why the case impact or risk level has changed.'),
  );
}
function verifyModal(caseId) {
  return new ModalBuilder().setCustomId(`mod_court_verify_submit:${caseId}`).setTitle('Verify / Reject Evidence').addComponents(
    modalInput('evidenceId', 'Evidence ID', TextInputStyle.Short, true, 40, 'Example: E3'),
    modalInput('status', 'Status: verified or rejected', TextInputStyle.Short, true, 8, 'verified'),
    modalInput('reason', 'Verification note', TextInputStyle.Paragraph, true, 800, 'Why is this evidence verified or rejected?'),
  );
}
function decisionModal(caseId, court) {
  return new ModalBuilder().setCustomId(`mod_court_decide_submit:${caseId}`).setTitle('Record Case Decision').addComponents(
    modalInput('finding', 'Finding', TextInputStyle.Short, true, 120, 'Confirmed / Not substantiated / Partially confirmed'),
    modalInput('action', 'Decision action', TextInputStyle.Short, true, 30, 'warn / timeout / quarantine / kick / ban / no_action'),
    modalInput('reason', 'Decision rationale', TextInputStyle.Paragraph, true, 1800, 'Record the reasoning behind the final decision.'),
    modalInput('recommendation', 'Moderator recommendation (optional)', TextInputStyle.Paragraph, false, 800, court.recommendation?.reason || ''),
  );
}
function sanctionExecutionModal(caseId, court) {
  const action = String(court.decision?.action || 'sanction');
  const hint = action === 'timeout' ? 'Example: 1h, 1d (max 28d)' : action === 'ban' ? 'Delete message days: 0-7' : action === 'warn' ? 'Strike weight: 1-5' : 'Leave blank for this action';
  return new ModalBuilder().setCustomId(`mod_court_execute_submit:${caseId}`).setTitle(`Execute ${action}`.slice(0, 45)).addComponents(
    modalInput('confirmation', 'Type EXECUTE to confirm', TextInputStyle.Short, true, 7, 'EXECUTE'),
    modalInput('parameter', 'Action parameter', TextInputStyle.Short, ['timeout', 'ban', 'warn'].includes(action), 20, hint),
    modalInput('note', 'Execution note (optional)', TextInputStyle.Paragraph, false, 600, 'Optional operational note for the audit trail.'),
  );
}
function parseCourtTimeout(value) {
  const match = String(value || '').trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([smhdw])$/);
  if (!match) return null;
  const units = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  const ms = Math.floor(Number(match[1]) * units[match[2]]);
  return Number.isFinite(ms) && ms > 0 && ms <= 28 * 86400000 ? ms : null;
}
function publishModal(caseId, court) {
  return new ModalBuilder().setCustomId(`mod_court_publish_submit:${caseId}`).setTitle(court.publication ? 'Update Published Record' : 'Publish Member Record').addComponents(
    modalInput('summary', 'Verified member-facing summary', TextInputStyle.Paragraph, true, 1800, 'Only include verified information the member is permitted to see.', court.publication?.summary || ''),
  );
}

async function updateCaseMessage(interaction, modCase) {
  const payload = buildCaseFile(interaction, modCase);
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.update(payload);
}
async function openCase(interaction, caseId) {
  const modCase = getCaseById(interaction.guildId, caseId);
  if (!caseIsCourt(modCase)) return false;
  await updateCaseMessage(interaction, modCase);
  return true;
}
function field(interaction, id) { try { return String(interaction.fields.getTextInputValue(id) || '').trim(); } catch { return ''; } }
function evidenceId(court) { return `E${court.evidence.length + 1}`; }
function canManageCourt(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_manage', interaction); }
function isJudge(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_review', interaction); }
function canPublishCourt(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_publish', interaction); }
function canCloseCourt(interaction) { return canUseModAction(interaction.member, interaction.guild, 'court_close', interaction); }

async function handleCourtInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (!id.startsWith('mod_court_')) return false;
  if (interaction.isStringSelectMenu?.()) {
    if (id.startsWith('mod_court_open:')) return openCase(interaction, interaction.values?.[0]);
    if (id.startsWith('mod_court_workspace:')) {
      const caseId = Number(id.split(':')[1]);
      const modCase = getCaseById(interaction.guildId, caseId);
      if (!caseIsCourt(modCase)) return false;
      const section = String(interaction.values?.[0] || '');
      if (section === 'evidence') { await interaction.update(buildEvidencePage(interaction, modCase)); return true; }
      if (section === 'notes') { await interaction.update(buildNotesPage(interaction, modCase)); return true; }
      if (section === 'timeline') { await interaction.update(buildTimelinePage(interaction, modCase)); return true; }
      if (section === 'review') { await interaction.update(buildReviewBriefPage(interaction, modCase)); return true; }
      if (section === 'preview') { await interaction.update(buildMemberPreviewPage(modCase)); return true; }
      if (section === 'history') { await interaction.update(buildRecordHistoryPage(modCase)); return true; }
      return false;
    }
  }
  if (!interaction.isButton?.()) return false;
  const parts = id.split(':');
  const key = parts[0];
  const value = parts[1];
  if (key === 'mod_court_new') { if (!canManageCourt(interaction)) { await interaction.reply({ content: '❌ Case-management authority is required to open a case.', flags: 64 }); return true; } await interaction.showModal(newCaseModal(value)); return true; }
  if (key === 'mod_court_back') {
    const target = await interaction.guild.members.fetch(value).catch(() => null);
    if (!target) return false;
    const built = buildCourtDashboard(interaction, target);
    await interaction.update({ embeds: [built.embed], components: built.components });
    return true;
  }
  if (key === 'mod_court_review_queue' || key === 'mod_court_published') {
    const target = await interaction.guild.members.fetch(value).catch(() => null);
    const wanted = key === 'mod_court_review_queue' ? 'review' : 'published';
    const all = wanted === 'review' ? getCourtCases(interaction.guildId) : (target ? getCourtCases(interaction.guildId, target.id) : []);
    const matches = all.filter((entry) => parseCourt(entry).stage === wanted);
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(wanted === 'review' ? '⚖️ Review Queue' : '📜 Published Records')
      .setDescription(matches.length ? matches.map((entry) => `**#${entry.caseId}** • Severity **${severityText(parseCourt(entry).severity)}**\n${cleanExcerpt(parseCourt(entry).allegations, 160)}`).join('\n\n') : `No ${wanted === 'review' ? 'cases awaiting review' : 'published records'} for this member.`);
    const components = [];
    if (matches.length) components.push(row(new StringSelectMenuBuilder().setCustomId(`mod_court_open:${value}`).setPlaceholder('Open a case file').addOptions(matches.slice(0, 25).map((entry) => ({ label: `Case #${entry.caseId}`, description: cleanExcerpt(parseCourt(entry).allegations, 80), value: String(entry.caseId), emoji: wanted === 'review' ? '⚖️' : '📜' })))));
    components.push(staffBackRow(value));
    await interaction.update({ embeds: [embed], components });
    return true;
  }
  const caseId = Number(value);
  const modCase = getCaseById(interaction.guildId, caseId);
  if (!caseIsCourt(modCase)) return false;
  const court = parseCourt(modCase);
  if (key === 'mod_court_file') { await updateCaseMessage(interaction, modCase); return true; }
  if (key === 'mod_court_evidence_view') { await interaction.update(buildEvidencePage(interaction, modCase)); return true; }
  if (key === 'mod_court_notes_view') { await interaction.update(buildNotesPage(interaction, modCase)); return true; }
  if (key === 'mod_court_timeline') { await interaction.update(buildTimelinePage(interaction, modCase)); return true; }
  if (key === 'mod_court_recommend') { if (!canManageCourt(interaction) || court.stage === 'closed') { await interaction.reply({ content: '❌ This case cannot be edited with your current authority or stage.', flags: 64 }); return true; } await interaction.showModal(recommendationModal(caseId, court)); return true; }
  if (key === 'mod_court_review_brief') { await interaction.update(buildReviewBriefPage(interaction, modCase)); return true; }
  if (key === 'mod_court_preview') { await interaction.update(buildMemberPreviewPage(modCase)); return true; }
  if (key === 'mod_court_record_history') { await interaction.update(buildRecordHistoryPage(modCase)); return true; }
  if (key === 'mod_court_claim_review') {
    if (!isJudge(interaction) || court.stage !== 'review') { await interaction.reply({ content: '❌ This review cannot be claimed.', flags: 64 }); return true; }
    if (court.reviewingAdminId && court.reviewingAdminId !== interaction.user.id) { await interaction.reply({ content: '❌ Another reviewer has already claimed this review.', flags: 64 }); return true; }
    const next = { ...court, reviewingAdminId: interaction.user.id, reviewClaimedAt: now() };
    const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.review_claimed', court);
    await interaction.update(buildReviewBriefPage(interaction, updated));
    return true;
  }
  if (key === 'mod_court_return') {
    if (!isJudge(interaction) || court.reviewingAdminId !== interaction.user.id || court.stage !== 'review') { await interaction.reply({ content: '❌ Only the assigned reviewer can return this case for more work.', flags: 64 }); return true; }
    const next = { ...court, stage: 'investigation', reviewingAdminId: null, reviewClaimedAt: null, submittedForReviewAt: null, submittedForReviewBy: null, notes: [...court.notes, { id: `N${court.notes.length + 1}`, text: 'Reviewer returned the case to investigation for further work.', authorId: interaction.user.id, createdAt: now() }] };
    const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.returned_to_investigation', court);
    await updateCaseMessage(interaction, updated);
    return true;
  }
  if (key === 'mod_court_approve_ban') {
    if (!isJudge(interaction) || court.decision?.action !== 'ban') { await interaction.reply({ content: '❌ There is no ban decision awaiting approval.', flags: 64 }); return true; }
    if (court.decision.decidedBy === interaction.user.id) { await interaction.reply({ content: '❌ The admin who recorded the decision cannot also approve the ban. A second admin must approve it.', flags: 64 }); return true; }
    if (court.sanctionReview?.status === 'approved') { await interaction.reply({ content: '❌ This ban decision is already approved.', flags: 64 }); return true; }
    const next = { ...court, sanctionReview: { ...(court.sanctionReview || {}), required: true, status: 'approved', approvedBy: interaction.user.id, approvedAt: now() } };
    const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.ban_approved', court);
    await updateCaseMessage(interaction, updated);
    return true;
  }
  if (key === 'mod_court_delete') {
    if (!canDeleteCourt(interaction)) { await interaction.reply({ content: '❌ Case deletion authority is required.', flags: 64 }); return true; }
    await interaction.showModal(deleteCaseModal(caseId));
    return true;
  }
  if (key === 'mod_court_close') { if (!canCloseCourt(interaction)) { await interaction.reply({ content: '❌ Case closure authority is required.', flags: 64 }); return true; } await interaction.showModal(closeCaseModal(caseId)); return true; }
  if (key === 'mod_court_reopen') { if (!canCloseCourt(interaction)) { await interaction.reply({ content: '❌ Case closure authority is required.', flags: 64 }); return true; }
    if (court.stage !== 'closed') { await interaction.reply({ content: '❌ This case cannot be reopened.', flags: 64 }); return true; }
    const next = { ...court, stage: court.previousStage || (court.publication ? 'published' : court.decision ? 'decided' : 'investigation'), previousStage: null, closedAt: null, closedBy: null, closeReason: null };
    const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.reopened', court);
    await updateCaseMessage(interaction, updated);
    return true;
  }
  if (key === 'mod_court_evidence') { if (!canManageCourt(interaction) || court.stage === 'closed') { await interaction.reply({ content: '❌ This case cannot be edited with your current authority or stage.', flags: 64 }); return true; } await interaction.showModal(evidenceModal(caseId)); return true; }
  if (key === 'mod_court_note') { if (!canManageCourt(interaction) || court.stage === 'closed') { await interaction.reply({ content: '❌ This case cannot be edited with your current authority or stage.', flags: 64 }); return true; } await interaction.showModal(noteModal(caseId)); return true; }
  if (key === 'mod_court_severity') { if (!canManageCourt(interaction) || court.stage === 'closed') { await interaction.reply({ content: '❌ This case cannot be edited with your current authority or stage.', flags: 64 }); return true; } await interaction.showModal(severityModal(caseId, court)); return true; }
  if (key === 'mod_court_verify') { if (!isJudge(interaction)) return interaction.reply({ content: '❌ Admin authority is required to verify evidence.', flags: 64 }).then(() => true); await interaction.showModal(verifyModal(caseId)); return true; }
  if (key === 'mod_court_decide') { if (!isJudge(interaction)) return interaction.reply({ content: '❌ Case-review authority is required to record a decision.', flags: 64 }).then(() => true); await interaction.showModal(decisionModal(caseId, court)); return true; }
  if (key === 'mod_court_publish') { if (!canPublishCourt(interaction)) return interaction.reply({ content: '❌ Case-publishing authority is required to publish the member record.', flags: 64 }).then(() => true); await interaction.showModal(publishModal(caseId, court)); return true; }
  if (key === 'mod_court_execute') {
    const action = String(court.decision?.action || '');
    if (!isJudge(interaction) || !action || action === 'no_action') { await interaction.reply({ content: '❌ There is no executable sanction.', flags: 64 }); return true; }
    if (court.stage !== 'published' || !court.publication) { await interaction.reply({ content: '❌ Publish the official member record before executing the sanction.', flags: 64 }); return true; }
    if (['executed', 'reversed', 'reversal_failed'].includes(court.sanctionExecution?.status)) { await interaction.reply({ content: court.sanctionExecution?.status === 'reversal_failed' ? '❌ This sanction is under an approved appeal with a failed reversal. Do not re-execute it; resolve the reversal failure instead.' : '❌ This sanction has already been finalised. Duplicate execution is blocked.', flags: 64 }); return true; }
    if (court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution)) { await interaction.reply({ content: '❌ This sanction is already being executed by another reviewer.', flags: 64 }); return true; }
    if (action === 'ban' && court.sanctionReview?.status !== 'approved') { await interaction.reply({ content: '❌ A second admin must approve this ban before execution.', flags: 64 }); return true; }
    if (!canUseModAction(interaction.member, interaction.guild, action, interaction)) { await interaction.reply({ content: `❌ You do not have authority to execute the ${action} sanction.`, flags: 64 }); return true; }
    await interaction.showModal(sanctionExecutionModal(caseId, court)); return true;
  }
  if (key === 'mod_court_import') {
    if (!canManageCourt(interaction) || court.stage === 'closed') { await interaction.reply({ content: '❌ Case-management authority is required to import records into an open case.', flags: 64 }); return true; }
    const before = court;
    const related = getCasesForUser(interaction.guildId, modCase.userId).filter((entry) => entry.caseId !== caseId && !caseIsCourt(entry));
    const linkedCases = [...new Set([...court.linkedCases, ...related.map((entry) => entry.caseId)])].slice(-50);
    const importedEvidence = related.filter((entry) => !court.evidence.some((e) => e.sourceCaseId === entry.caseId)).slice(0, 20).map((entry, index) => ({
      id: `R${court.evidence.length + index + 1}`,
      title: `${String(entry.action || 'record').toUpperCase()} Case #${entry.caseId}`,
      source: `Moderation Case #${entry.caseId}`,
      details: `${entry.reason || 'No reason recorded'} • Status: ${entry.status || 'active'}`,
      sourceCaseId: entry.caseId,
      status: 'verified',
      addedBy: interaction.user.id,
      addedAt: now(),
      verifiedBy: interaction.user.id,
      verifiedAt: now(),
      verificationNote: 'Imported from Goliath moderation records.',
    }));
    const scanRows = db.prepare("SELECT after_value, created_at FROM case_audit WHERE guild_id = ? AND event = 'moderation.member_scan.completed' ORDER BY created_at DESC LIMIT 10").all(String(interaction.guildId));
    let scanEvidence = [];
    for (const scan of scanRows) {
      try {
        const data = JSON.parse(scan.after_value || '{}');
        if (String(data?.identity?.userId || data?.targetId || '') !== String(modCase.userId)) continue;
        scanEvidence = [{ id: `S${court.evidence.length + importedEvidence.length + 1}`, title: 'Member Intelligence Scan', source: `Internal scan • ${scan.created_at}`, details: `Risk ${data?.risk?.score ?? 'unknown'} • Suspected matches ${(data?.suspectedMatches || []).length} • This scan remains draft until an admin verifies it.`, status: 'draft', addedBy: interaction.user.id, addedAt: now(), scanSnapshotAt: scan.created_at }];
        break;
      } catch {}
    }
    const next = { ...court, linkedCases, evidence: [...court.evidence, ...importedEvidence, ...scanEvidence] };
    const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.records_imported', before);
    await updateCaseMessage(interaction, updated);
    return true;
  }
  if (key === 'mod_court_submit_review') {
    if (!canManageCourt(interaction) || court.stage !== 'investigation') { await interaction.reply({ content: '❌ Only an authorised open investigation can be submitted for review.', flags: 64 }); return true; }
    if (!court.evidence.some((item) => item.status === 'verified')) {
      await interaction.reply({ content: '❌ At least one verified evidence item is required before submitting this case for review.', flags: 64 });
      return true;
    }
    const next = { ...court, stage: 'review', reviewingAdminId: null, reviewClaimedAt: null, submittedForReviewAt: now(), submittedForReviewBy: interaction.user.id };
    const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.review_submitted', court);
    await updateCaseMessage(interaction, updated);
    return true;
  }
  return false;
}

async function handleCourtModal(interaction) {
  const id = String(interaction.customId || '');
  if (!(id.startsWith('mod_court_') || id.startsWith('mod_case_new_submit_v2:')) || !interaction.isModalSubmit?.()) return false;
  const [key, raw] = id.split(':');
  if (key === 'mod_case_new_submit_v2') {
    if (!canManageCourt(interaction)) { await interaction.reply({ content: '❌ Case-management authority is required to open a case.', flags: 64 }); return true; }
    const severity = parseSeverityInput(field(interaction, 'severity'));
    if (!severity) { await interaction.reply({ content: '❌ Severity must be Low, Medium, High, Severe, or Critical.', flags: 64 }); return true; }
    const caseTitle = field(interaction, 'caseTitle');
    const allegations = field(interaction, 'allegations');
    const recommendation = field(interaction, 'recommendation');
    const created = createCase({ guildId: interaction.guildId, userId: raw, moderatorId: interaction.user.id, action: COURT_ACTION, reason: allegations, metadata: { court: { stage: 'investigation', severity, title: caseTitle, allegations, leadModeratorId: interaction.user.id, reviewingAdminId: null, evidence: [], notes: [], linkedCases: [], recommendation: recommendation ? { reason: recommendation, by: interaction.user.id, at: now() } : null, decision: null, publication: null } }, status: 'active', actorId: interaction.user.id });
    if (!created) { await interaction.reply({ content: '❌ Failed to create the case.', flags: 64 }); return true; }
    await interaction.update(buildCaseFile(interaction, created));
    return true;
  }
  const caseId = Number(raw);
  const modCase = getCaseById(interaction.guildId, caseId);
  if (!caseIsCourt(modCase)) return false;
  const court = parseCourt(modCase);
  if (key === 'mod_court_delete_submit') {
    if (!canDeleteCourt(interaction)) { await interaction.reply({ content: '❌ Case deletion authority is required.', flags: 64 }); return true; }
    if (field(interaction, 'confirmation').toUpperCase() !== 'DELETE') { await interaction.reply({ content: '❌ Deletion cancelled. Type DELETE exactly to confirm.', flags: 64 }); return true; }
    const reason = field(interaction, 'reason');
    recordCaseAudit({ guildId: interaction.guildId, caseId, actorId: interaction.user.id, event: 'case.management.deleted', before: modCase, after: null, metadata: { permanent: true, reason } });
    const deleted = db.prepare('DELETE FROM cases WHERE guild_id = ? AND case_id = ?').run(String(interaction.guildId), Number(caseId));
    if (!deleted.changes) { await interaction.reply({ content: '❌ Case could not be deleted.', flags: 64 }); return true; }
    const target = await interaction.guild.members.fetch(modCase.userId).catch(() => null);
    if (!target) { await interaction.update({ content: `✅ Case #${caseId} permanently deleted.`, embeds: [], components: [] }); return true; }
    const built = buildCourtDashboard(interaction, target);
    await interaction.update({ content: null, embeds: [built.embed], components: built.components });
    return true;
  }
  if (key === 'mod_court_recommend_submit') {
    if (!canManageCourt(interaction) || court.stage === 'closed') { await interaction.reply({ content: '❌ This case cannot be edited with your current authority or stage.', flags: 64 }); return true; }
    const recommendation = { reason: field(interaction, 'recommendation'), by: interaction.user.id, at: now() };
    const next = { ...court, recommendation };
    return updateCaseMessage(interaction, saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.recommendation_updated', court)).then(() => true);
  }
  if (key === 'mod_court_evidence_submit') {
    if (!canManageCourt(interaction) || court.stage === 'closed') { await interaction.reply({ content: '❌ This case cannot be edited with your current authority or stage.', flags: 64 }); return true; }
    const item = { id: evidenceId(court), title: field(interaction, 'title'), source: field(interaction, 'source') || null, details: field(interaction, 'details'), status: 'draft', addedBy: interaction.user.id, addedAt: now(), verifiedBy: null, verifiedAt: null, verificationNote: null };
    const next = { ...court, evidence: [...court.evidence, item] };
    return updateCaseMessage(interaction, saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.evidence_added', court)).then(() => true);
  }
  if (key === 'mod_court_note_submit') {
    if (!canManageCourt(interaction) || court.stage === 'closed') { await interaction.reply({ content: '❌ This case cannot be edited with your current authority or stage.', flags: 64 }); return true; }
    const item = { id: `N${court.notes.length + 1}`, text: field(interaction, 'note'), authorId: interaction.user.id, createdAt: now() };
    const next = { ...court, notes: [...court.notes, item] };
    return updateCaseMessage(interaction, saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.note_added', court)).then(() => true);
  }
  if (key === 'mod_court_severity_submit') {
    if (!canManageCourt(interaction) || court.stage === 'closed') { await interaction.reply({ content: '❌ This case cannot be edited with your current authority or stage.', flags: 64 }); return true; }
    const severity = parseSeverityInput(field(interaction, 'severity'));
    if (!severity) { await interaction.reply({ content: '❌ Severity must be Low, Medium, High, Severe, or Critical.', flags: 64 }); return true; }
    const next = { ...court, severity, notes: [...court.notes, { id: `N${court.notes.length + 1}`, text: `Severity changed from ${court.severity}/5 to ${severity}/5. Reason: ${field(interaction, 'reason')}`, authorId: interaction.user.id, createdAt: now() }] };
    return updateCaseMessage(interaction, saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.severity_changed', court)).then(() => true);
  }
  if (key === 'mod_court_verify_submit') {
    if (!isJudge(interaction)) { await interaction.reply({ content: '❌ Admin authority is required to verify evidence.', flags: 64 }); return true; }
    const wantedId = field(interaction, 'evidenceId').toUpperCase();
    const status = field(interaction, 'status').toLowerCase();
    if (!['verified', 'rejected'].includes(status)) { await interaction.reply({ content: '❌ Evidence status must be `verified` or `rejected`.', flags: 64 }); return true; }
    const index = court.evidence.findIndex((item) => String(item.id).toUpperCase() === wantedId);
    if (index < 0) { await interaction.reply({ content: `❌ Evidence ${wantedId} was not found in this case.`, flags: 64 }); return true; }
    const evidence = [...court.evidence];
    evidence[index] = { ...evidence[index], status, verifiedBy: interaction.user.id, verifiedAt: now(), verificationNote: field(interaction, 'reason') };
    const next = { ...court, evidence };
    return updateCaseMessage(interaction, saveCourt(interaction.guildId, caseId, next, interaction.user.id, `case.court.evidence_${status}`, court)).then(() => true);
  }
  if (key === 'mod_court_close_submit') { if (!canCloseCourt(interaction)) { await interaction.reply({ content: '❌ Case closure authority is required.', flags: 64 }); return true; }
    if (court.stage === 'closed') { await interaction.reply({ content: '❌ This case is already closed.', flags: 64 }); return true; }
    const next = { ...court, previousStage: court.stage, stage: 'closed', closedAt: now(), closedBy: interaction.user.id, closeReason: field(interaction, 'reason') };
    const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.closed', court);
    await updateCaseMessage(interaction, updated);
    return true;
  }
  if (key === 'mod_court_decide_submit') {
    if (!isJudge(interaction)) { await interaction.reply({ content: '❌ Admin authority is required to record a decision.', flags: 64 }); return true; }
    if (court.stage !== 'review' || court.reviewingAdminId !== interaction.user.id) { await interaction.reply({ content: '❌ Claim this case from the Review Brief before recording a decision.', flags: 64 }); return true; }
    const action = field(interaction, 'action').toLowerCase();
    const allowed = new Set(['warn', 'timeout', 'quarantine', 'kick', 'ban', 'no_action']);
    if (!allowed.has(action)) { await interaction.reply({ content: '❌ Decision action must be warn, timeout, quarantine, kick, ban, or no_action.', flags: 64 }); return true; }
    const decision = { finding: field(interaction, 'finding'), action, reason: field(interaction, 'reason'), decidedBy: interaction.user.id, decidedAt: now() };
    const recommendationText = field(interaction, 'recommendation');
    const decisionHistory = court.decision ? [...court.decisionHistory, court.decision].slice(-20) : court.decisionHistory;
    const sanctionReview = action === 'ban'
      ? { required: true, status: 'pending', requestedBy: interaction.user.id, requestedAt: now(), approvedBy: null, approvedAt: null }
      : null;
    const next = { ...court, stage: 'decided', reviewingAdminId: interaction.user.id, decision, decisionHistory, sanctionReview, recommendation: recommendationText ? { reason: recommendationText, by: interaction.user.id, at: now() } : court.recommendation };
    const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.decision_recorded', court);
    await updateCaseMessage(interaction, updated);
    return true;
  }
  if (key === 'mod_court_execute_submit') {
    const action = String(court.decision?.action || '');
    if (!isJudge(interaction) || !action || action === 'no_action') { await interaction.reply({ content: '❌ There is no executable sanction.', flags: 64 }); return true; }
    if (court.stage !== 'published' || !court.publication) { await interaction.reply({ content: '❌ The official member record must be published first.', flags: 64 }); return true; }
    if (court.sanctionExecution?.status === 'executed') { await interaction.reply({ content: '❌ Duplicate execution blocked: this sanction has already been executed.', flags: 64 }); return true; }
    if (action === 'ban' && court.sanctionReview?.status !== 'approved') { await interaction.reply({ content: '❌ Second-admin ban approval is still required.', flags: 64 }); return true; }
    if (!canUseModAction(interaction.member, interaction.guild, action, interaction)) { await interaction.reply({ content: `❌ You do not have authority to execute the ${action} sanction.`, flags: 64 }); return true; }
    if (field(interaction, 'confirmation').toUpperCase() !== 'EXECUTE') { await interaction.reply({ content: '❌ Execution cancelled. Type EXECUTE exactly to confirm.', flags: 64 }); return true; }
    const parameter = field(interaction, 'parameter');
    const note = field(interaction, 'note');
    const strikeWeight = action === 'warn' ? Number(parameter) : null;
    const durationMs = action === 'timeout' ? parseCourtTimeout(parameter) : null;
    const deleteDays = action === 'ban' ? Number(parameter) : null;
    if (action === 'warn' && (!Number.isInteger(strikeWeight) || strikeWeight < 1 || strikeWeight > 5)) { await interaction.reply({ content: '❌ Warning strike weight must be a whole number from 1 to 5.', flags: 64 }); return true; }
    if (action === 'timeout' && !durationMs) { await interaction.reply({ content: '❌ Invalid timeout duration. Use values such as 10m, 1h or 1d; maximum 28 days.', flags: 64 }); return true; }
    if (action === 'ban' && (!Number.isInteger(deleteDays) || deleteDays < 0 || deleteDays > 7)) { await interaction.reply({ content: '❌ Ban delete-message days must be a whole number from 0 to 7.', flags: 64 }); return true; }
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });
    const lockKey = courtExecutionLockKey(interaction.guildId, caseId);
    if (COURT_EXECUTION_LOCKS.has(lockKey)) { await interaction.editReply({ content: '❌ This sanction is already being executed. Duplicate execution is blocked.' }); return true; }
    if (court.sanctionExecution?.status === 'executing' && !executionIsStale(court.sanctionExecution)) { await interaction.editReply({ content: '❌ This sanction is already being executed by another reviewer.' }); return true; }
    COURT_EXECUTION_LOCKS.add(lockKey);
    const executionStarted = now();
    const operationId = `court_exec_${caseId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const claimedExecution = { status: 'executing', operationId, action, claimedBy: interaction.user.id, claimedAt: executionStarted, startedAt: executionStarted, executedBy: interaction.user.id, executedAt: null, linkedCaseId: null, note: note || null, error: null };
    const atomicClaim = claimCourtOperationAtomic(interaction.guildId, caseId, { mode: 'execution', claim: claimedExecution, staleMs: COURT_EXECUTION_STALE_MS });
    const claimed = atomicClaim?.case || null;
    if (!atomicClaim?.ok || !claimed) {
      COURT_EXECUTION_LOCKS.delete(lockKey);
      const message = atomicClaim?.reason === 'busy'
        ? '❌ This sanction is already being executed by another Goliath process.'
        : atomicClaim?.reason === 'finalized'
          ? '❌ This sanction was already finalised before this execution claim completed.'
          : '❌ Failed to claim the sanction execution lock. No punishment was applied.';
      await interaction.editReply({ content: message });
      return true;
    }
    recordCaseAudit({ guildId: interaction.guildId, caseId, actorId: interaction.user.id, event: 'case.court.sanction_execution_claimed', before: atomicClaim.previous || court.sanctionExecution || null, after: claimedExecution, metadata: { court: true, atomic: true, operationId } });
    const target = await interaction.guild.members.fetch(modCase.userId).catch(() => null);
    if (!target && action !== 'ban') {
      const failed = { ...claimedExecution, status: 'failed', executedAt: now(), error: 'Member is not currently available in this server.' };
      saveCourt(interaction.guildId, caseId, { ...court, sanctionExecution: failed }, interaction.user.id, 'case.court.sanction_failed', claimedExecution);
      COURT_EXECUTION_LOCKS.delete(lockKey);
      await interaction.editReply({ content: '❌ The member is not currently available in this server, so this action cannot be executed from Case Management.' }); return true;
    }
    try {
      let linkedCaseId = null;
      let resultSummary = null;
      const reason = `Case #${caseId}: ${court.decision.reason || court.decision.finding || 'Case decision'}`.slice(0, 500);
      if (action === 'warn') {
        const created = createWarningCaseAtomic({ guildId: interaction.guildId, userId: target.id, moderatorId: interaction.user.id, reason, strikeWeight, metadata: { sourceCourtCaseId: caseId, courtOrdered: true }, actorId: interaction.user.id });
        linkedCaseId = created?.modCase?.caseId || null;
        resultSummary = `Warning recorded with strike weight ${strikeWeight}.`;
      } else if (action === 'quarantine') {
        const result = await quarantineMember(interaction.guild, target, { reason, quarantinedBy: interaction.user.id });
        if (!result?.success) throw new Error(result?.error || result?.reason || 'Quarantine failed.');
        const linked = createCase({ guildId: interaction.guildId, userId: target.id, moderatorId: interaction.user.id, action: 'quarantine', reason, metadata: { sourceCourtCaseId: caseId, courtOrdered: true, quarantineResult: result }, status: 'active', actorId: interaction.user.id });
        linkedCaseId = linked?.caseId || null;
        resultSummary = result.dryRun ? 'Quarantine dry-run completed.' : 'Member quarantined.';
      } else if (action === 'ban' && !target) {
        await interaction.guild.members.ban(modCase.userId, {
          deleteMessageSeconds: deleteDays * 24 * 60 * 60,
          reason,
        });
        const linked = createCase({
          guildId: interaction.guildId,
          userId: modCase.userId,
          moderatorId: interaction.user.id,
          action: 'ban',
          reason,
          metadata: {
            sourceCourtCaseId: caseId,
            courtOrdered: true,
            deleteDays,
            executedWithoutMember: true,
          },
          status: 'active',
          actorId: interaction.user.id,
        });
        linkedCaseId = linked?.caseId || null;
        resultSummary = 'ban applied successfully to a user who was no longer in the server.';
      } else {
        const metadata = { sourceCourtCaseId: caseId, courtOrdered: true };
        if (action === 'timeout') {
          metadata.durationRaw = parameter;
          metadata.durationMs = durationMs;
        }
        if (action === 'ban') metadata.deleteDays = deleteDays;
        const result = await executeEnginePunishment(interaction, target, action, reason, metadata, { logAction: `Court ${action}`, targetId: modCase.userId });
        linkedCaseId = result?.modCase?.caseId || null;
        resultSummary = `${action} applied successfully.`;
      }
      const sanctionExecution = { ...claimedExecution, status: 'executed', action, executedBy: interaction.user.id, executedAt: now(), startedAt: executionStarted, linkedCaseId, note: note || null, result: resultSummary, error: null };
      const next = { ...court, sanctionExecution, linkedCases: linkedCaseId ? [...new Set([...court.linkedCases, linkedCaseId])] : court.linkedCases };
      const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.sanction_executed', court);
      COURT_EXECUTION_LOCKS.delete(lockKey);
      await updateCaseMessage(interaction, updated);
      return true;
    } catch (error) {
      const sanctionExecution = { ...claimedExecution, status: 'failed', action, executedBy: interaction.user.id, executedAt: now(), startedAt: executionStarted, linkedCaseId: null, note: note || null, error: String(error?.message || error || 'Unknown sanction execution failure').slice(0, 500) };
      const next = { ...court, sanctionExecution };
      const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.sanction_failed', court);
      COURT_EXECUTION_LOCKS.delete(lockKey);
      await updateCaseMessage(interaction, updated);
      return true;
    }
  }
  if (key === 'mod_court_publish_submit') {
    if (!canPublishCourt(interaction)) { await interaction.reply({ content: '❌ Case publishing authority is required to publish a record.', flags: 64 }); return true; }
    if (!court.decision) { await interaction.reply({ content: '❌ Record a decision before publishing the member record.', flags: 64 }); return true; }
    if (court.decision.action === 'ban' && court.sanctionReview?.status !== 'approved') { await interaction.reply({ content: '❌ Ban decisions require approval from a second admin before the member record can be published.', flags: 64 }); return true; }
    const summary = field(interaction, 'summary');
    const previousRevision = Number(court.publication?.revision || 0);
    const publicationHistory = court.publication ? [...court.publicationHistory, court.publication].slice(-20) : court.publicationHistory;
    const publication = { revision: previousRevision + 1, summary, publishedBy: interaction.user.id, publishedAt: court.publication?.publishedAt || now(), updatedAt: now(), verifiedEvidenceIds: court.evidence.filter((item) => item.status === 'verified').map((item) => item.id) };
    const next = { ...court, stage: 'published', publication, publicationHistory };
    const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, previousRevision ? 'case.court.publication_updated' : 'case.court.published', court);
    await updateCaseMessage(interaction, updated);
    return true;
  }
  return false;
}

function buildUserPublishedCasesPanel(interaction) {
  const cases = getCourtCases(interaction.guildId, interaction.user.id).filter((entry) => parseCourt(entry).stage === 'published' && parseCourt(entry).publication);
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📁 My Published Cases')
    .setDescription(cases.length
      ? ['These are the official records staff have published to you. Internal staff notes, drafts and rejected evidence are not shown.', '', ...cases.slice(0, 10).map((entry) => {
        const court = parseCourt(entry); const pub = court.publication; const decision = court.decision || {};
        const appeals = Array.isArray(entry.metadata?.appeals) ? entry.metadata.appeals : [];
        const latestAppeal = appeals.slice().sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))[0];
        const appealLine = latestAppeal ? `\n**Appeal:** ${latestAppeal.status === 'pending' ? '⏳ Pending' : latestAppeal.status === 'approved' ? '✅ Approved' : '❌ Denied'}` : '';
        return `**Case #${entry.caseId}** • Severity **${severityText(court.severity)}** • Revision **${pub.revision || 1}**\n**Finding:** ${decision.finding || 'Recorded'}\n**Decision:** ${decision.action || 'No action'}${appealLine}\n${cleanExcerpt(pub.summary, 350)}\nPublished ${discordTime(pub.updatedAt || pub.publishedAt)}`;
      })].join('\n\n')
      : 'No court case records have been published to you.')
    .setFooter({ text: 'Only verified, published information is visible here' })
    .setTimestamp();
  return {
    embeds: [embed],
    components: [
      row(button('user:module:appeals', 'Appeals', '📝', ButtonStyle.Primary), button('user:home', 'User Panel', '🏠')),
      row(button('user:category:account', 'Back', '⬅️')),
    ],
  };
}

module.exports = {
  COURT_ACTION,
  stageText,
  severityText,
  parseCourt,
  caseIsCourt,
  getCourtCases,
  buildCourtDashboard,
  buildCaseFile,
  buildUserPublishedCasesPanel,
  handleCourtInteraction,
  handleCourtModal,
};
