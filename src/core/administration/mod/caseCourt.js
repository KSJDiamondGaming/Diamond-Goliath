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
} = require('./storage');
const { canUseModAction } = require('./permissions');

const COURT_ACTION = 'case';
const SEVERITY = Object.freeze({
  1: 'Informational',
  2: 'Minor',
  3: 'Moderate',
  4: 'Severe',
  5: 'Critical',
});
const STAGES = Object.freeze({
  investigation: '🔎 Under Investigation',
  review: '⚖️ Awaiting Review',
  decided: '👨‍⚖️ Decision Recorded',
  published: '📜 Published',
  closed: '🔒 Closed',
});
const EVIDENCE_STATUS = Object.freeze({ draft: '🟡 Draft', verified: '🟢 Verified', rejected: '🔴 Rejected' });

function now() { return new Date().toISOString(); }
function parseCourt(modCase = {}) {
  const metadata = modCase.metadata && typeof modCase.metadata === 'object' ? modCase.metadata : {};
  const court = metadata.court && typeof metadata.court === 'object' ? metadata.court : {};
  return {
    stage: court.stage || 'investigation',
    severity: Math.min(5, Math.max(1, Number(court.severity) || 1)),
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
function severityText(value) { const n = Math.min(5, Math.max(1, Number(value) || 1)); return `${n}/5 — ${SEVERITY[n]}`; }
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

function buildCourtDashboard(interaction, target) {
  const cases = target ? getCourtCases(interaction.guildId, target.id) : [];
  const counts = courtCounts(cases);
  const latest = cases.slice(0, 5);
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(target ? `⚖️ Case Court • ${target.user.tag}` : '⚖️ Case Court')
    .setDescription(target
      ? ['Build the internal case file here. Only a **published record** is visible to the member.', '', `**Subject:** ${target.user} • \`${target.id}\``].join('\n')
      : 'Select a member to open their court case workspace.')
    .addFields(
      { name: '🔎 Investigating', value: `**${counts.investigation}**`, inline: true },
      { name: '⚖️ Review Queue', value: `**${counts.review}**`, inline: true },
      { name: '📜 Published', value: `**${counts.published}**`, inline: true },
      { name: 'Court Workflow', value: 'Investigation → Review → Decision → Published record → Appeal', inline: false },
    )
    .setFooter({ text: 'Private staff workspace • unpublished work is never shown to the member' })
    .setTimestamp();
  if (latest.length) embed.addFields({
    name: 'Recent Case Files',
    value: latest.map((entry) => {
      const court = parseCourt(entry);
      return `**#${entry.caseId}** • ${stageText(court.stage)} • Severity **${court.severity}/5**\n${cleanExcerpt(court.allegations || entry.reason, 120)}`;
    }).join('\n\n').slice(0, 1024),
    inline: false,
  });

  const components = [];
  if (target) {
    components.push(row(
      button(`mod_court_new:${target.id}`, 'New Case', '➕', ButtonStyle.Primary),
      button(`mod_court_review_queue:${target.id}`, 'Review Queue', '⚖️'),
      button(`mod_court_published:${target.id}`, 'Published', '📜'),
    ));
    if (cases.length) components.push(row(new StringSelectMenuBuilder()
      .setCustomId(`mod_court_open:${target.id}`)
      .setPlaceholder('📂 Open a case file')
      .addOptions(cases.slice(0, 25).map((entry) => {
        const court = parseCourt(entry);
        return { label: `Case #${entry.caseId} • ${SEVERITY[court.severity]}`, description: `${stageText(court.stage).replace(/^\S+\s/, '')} • ${cleanExcerpt(court.allegations || entry.reason, 65)}`, value: String(entry.caseId), emoji: court.stage === 'published' ? '📜' : court.stage === 'review' ? '⚖️' : '📂' };
      }))));
  }
  return { embed, components };
}

function buildCaseFile(interaction, modCase) {
  const court = parseCourt(modCase);
  const verified = court.evidence.filter((item) => item.status === 'verified');
  const draft = court.evidence.filter((item) => item.status === 'draft');
  const rejected = court.evidence.filter((item) => item.status === 'rejected');
  const evidenceLines = court.evidence.slice(-6).reverse().map((item) => `${EVIDENCE_STATUS[item.status] || EVIDENCE_STATUS.draft} **${item.id}** • ${cleanExcerpt(item.title, 70)}\n${cleanExcerpt(item.details || item.source, 120)}`);
  const noteLines = court.notes.slice(-4).reverse().map((item) => `• ${cleanExcerpt(item.text, 150)} — <@${item.authorId}> ${discordTime(item.createdAt)}`);
  const linked = court.linkedCases.slice(-8).map((id) => `#${id}`).join(' • ') || 'None';
  const decision = court.decision
    ? `**Finding:** ${court.decision.finding}\n**Decision:** ${court.decision.action}\n**Reason:** ${court.decision.reason}\n**Judge:** <@${court.decision.decidedBy}> • ${discordTime(court.decision.decidedAt)}`
    : 'No decision recorded.';
  const publication = court.publication
    ? `Revision **${court.publication.revision || 1}** • Published by <@${court.publication.publishedBy}> ${discordTime(court.publication.publishedAt)}\n${cleanExcerpt(court.publication.summary, 500)}`
    : 'Not published. The member cannot see this internal case file.';

  const embed = new EmbedBuilder()
    .setColor(court.stage === 'review' ? 0xFEE75C : court.stage === 'published' ? 0x57F287 : 0x5865F2)
    .setTitle(`📂 Case #${modCase.caseId} • ${stageText(court.stage)}`)
    .setDescription(`**Subject:** <@${modCase.userId}> • \`${modCase.userId}\`\n**Severity:** **${severityText(court.severity)}**\n**Lead:** <@${court.leadModeratorId}>`)
    .addFields(
      { name: '📋 Allegations / Concerns', value: cleanExcerpt(court.allegations || modCase.reason || 'No allegation recorded.', 1024), inline: false },
      { name: '🔎 Evidence', value: `Verified **${verified.length}** • Draft **${draft.length}** • Rejected **${rejected.length}**\n${evidenceLines.join('\n\n') || 'No evidence added yet.'}`.slice(0, 1024), inline: false },
      { name: '🔗 Linked Moderation Records', value: linked, inline: false },
      { name: '📝 Staff Notes', value: (noteLines.join('\n') || 'No private case notes yet.').slice(0, 1024), inline: false },
      { name: '👨‍⚖️ Decision', value: decision.slice(0, 1024), inline: false },
      { name: '📜 Member Record', value: publication.slice(0, 1024), inline: false },
    )
    .setFooter({ text: 'Internal court file • verified evidence only may be represented in the published member record' })
    .setTimestamp();

  const canManage = canUseModAction(interaction.member, interaction.guild, 'edit_case', interaction);
  const components = [
    row(
      button(`mod_court_evidence:${modCase.caseId}`, 'Add Evidence', '➕', ButtonStyle.Primary),
      button(`mod_court_note:${modCase.caseId}`, 'Case Note', '📝'),
      button(`mod_court_import:${modCase.caseId}`, 'Import Records', '🔗'),
      button(`mod_court_severity:${modCase.caseId}`, 'Severity', '⚖️'),
    ),
    row(
      button(`mod_court_verify:${modCase.caseId}`, 'Verify Evidence', '✅', ButtonStyle.Secondary, !court.evidence.length),
      button(`mod_court_submit_review:${modCase.caseId}`, court.stage === 'review' ? 'Awaiting Review' : 'Submit for Review', '👨‍⚖️', ButtonStyle.Primary, court.stage === 'review' || court.stage === 'published'),
      button(`mod_court_decide:${modCase.caseId}`, 'Decision', '⚖️', canManage ? ButtonStyle.Danger : ButtonStyle.Secondary, !canManage || court.stage === 'published'),
    ),
    row(
      button(`mod_court_publish:${modCase.caseId}`, court.publication ? 'Update Published Record' : 'Publish Record', '📜', ButtonStyle.Success, !canManage || !court.decision),
      button(`mod_court_back:${modCase.userId}`, 'Cases', '⬅️'),
    ),
  ];
  return { embeds: [embed], components };
}

function newCaseModal(targetId) {
  return new ModalBuilder().setCustomId(`mod_court_new_submit:${targetId}`).setTitle('Open Court Case').addComponents(
    modalInput('allegations', 'Allegations / concerns', TextInputStyle.Paragraph, true, 2000, 'Describe what is being investigated.'),
    modalInput('severity', 'Initial severity (1-5)', TextInputStyle.Short, true, 1, '1'),
    modalInput('recommendation', 'Initial recommendation (optional)', TextInputStyle.Paragraph, false, 800, 'What should staff consider at this stage?'),
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
    modalInput('severity', 'Severity (1-5)', TextInputStyle.Short, true, 1, String(court.severity)),
    modalInput('reason', 'Reason for severity change', TextInputStyle.Paragraph, true, 1000, 'Explain why severity is being increased or decreased.'),
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
  return new ModalBuilder().setCustomId(`mod_court_decide_submit:${caseId}`).setTitle('Record Court Decision').addComponents(
    modalInput('finding', 'Finding', TextInputStyle.Short, true, 120, 'Confirmed / Not substantiated / Partially confirmed'),
    modalInput('action', 'Decision action', TextInputStyle.Short, true, 30, 'warn / timeout / quarantine / kick / ban / no_action'),
    modalInput('reason', 'Decision rationale', TextInputStyle.Paragraph, true, 1800, 'Record the reasoning behind the final decision.'),
    modalInput('recommendation', 'Moderator recommendation (optional)', TextInputStyle.Paragraph, false, 800, court.recommendation?.reason || ''),
  );
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
function isJudge(interaction) { return canUseModAction(interaction.member, interaction.guild, 'edit_case', interaction); }

async function handleCourtInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (!id.startsWith('mod_court_')) return false;
  if (interaction.isStringSelectMenu?.() && id.startsWith('mod_court_open:')) {
    return openCase(interaction, interaction.values?.[0]);
  }
  if (!interaction.isButton?.()) return false;
  const parts = id.split(':');
  const key = parts[0];
  const value = parts[1];
  if (key === 'mod_court_new') { await interaction.showModal(newCaseModal(value)); return true; }
  if (key === 'mod_court_back') {
    const target = await interaction.guild.members.fetch(value).catch(() => null);
    if (!target) return false;
    const built = buildCourtDashboard(interaction, target);
    await interaction.update({ embeds: [built.embed], components: built.components });
    return true;
  }
  if (key === 'mod_court_review_queue' || key === 'mod_court_published') {
    const target = await interaction.guild.members.fetch(value).catch(() => null);
    const all = target ? getCourtCases(interaction.guildId, target.id) : [];
    const wanted = key === 'mod_court_review_queue' ? 'review' : 'published';
    const matches = all.filter((entry) => parseCourt(entry).stage === wanted);
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(wanted === 'review' ? '⚖️ Review Queue' : '📜 Published Records')
      .setDescription(matches.length ? matches.map((entry) => `**#${entry.caseId}** • Severity **${parseCourt(entry).severity}/5**\n${cleanExcerpt(parseCourt(entry).allegations, 160)}`).join('\n\n') : `No ${wanted === 'review' ? 'cases awaiting review' : 'published records'} for this member.`);
    const components = [];
    if (matches.length) components.push(row(new StringSelectMenuBuilder().setCustomId(`mod_court_open:${value}`).setPlaceholder('Open a case file').addOptions(matches.slice(0, 25).map((entry) => ({ label: `Case #${entry.caseId}`, description: cleanExcerpt(parseCourt(entry).allegations, 80), value: String(entry.caseId), emoji: wanted === 'review' ? '⚖️' : '📜' }))));
    components.push(row(button(`mod_court_back:${value}`, 'Cases', '⬅️')));
    await interaction.update({ embeds: [embed], components });
    return true;
  }
  const caseId = Number(value);
  const modCase = getCaseById(interaction.guildId, caseId);
  if (!caseIsCourt(modCase)) return false;
  const court = parseCourt(modCase);
  if (key === 'mod_court_evidence') { await interaction.showModal(evidenceModal(caseId)); return true; }
  if (key === 'mod_court_note') { await interaction.showModal(noteModal(caseId)); return true; }
  if (key === 'mod_court_severity') { await interaction.showModal(severityModal(caseId, court)); return true; }
  if (key === 'mod_court_verify') { if (!isJudge(interaction)) return interaction.reply({ content: '❌ Admin authority is required to verify evidence.', flags: 64 }).then(() => true); await interaction.showModal(verifyModal(caseId)); return true; }
  if (key === 'mod_court_decide') { if (!isJudge(interaction)) return interaction.reply({ content: '❌ Admin authority is required to act as case judge.', flags: 64 }).then(() => true); await interaction.showModal(decisionModal(caseId, court)); return true; }
  if (key === 'mod_court_publish') { if (!isJudge(interaction)) return interaction.reply({ content: '❌ Admin authority is required to publish the member record.', flags: 64 }).then(() => true); await interaction.showModal(publishModal(caseId, court)); return true; }
  if (key === 'mod_court_import') {
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
    if (!court.evidence.some((item) => item.status === 'verified')) {
      await interaction.reply({ content: '❌ At least one verified evidence item is required before submitting this case for review.', flags: 64 });
      return true;
    }
    const next = { ...court, stage: 'review', submittedForReviewAt: now(), submittedForReviewBy: interaction.user.id };
    const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.review_submitted', court);
    await updateCaseMessage(interaction, updated);
    return true;
  }
  return false;
}

async function handleCourtModal(interaction) {
  const id = String(interaction.customId || '');
  if (!id.startsWith('mod_court_') || !interaction.isModalSubmit?.()) return false;
  const [key, raw] = id.split(':');
  if (key === 'mod_court_new_submit') {
    const severity = Number(field(interaction, 'severity'));
    if (!Number.isInteger(severity) || severity < 1 || severity > 5) { await interaction.reply({ content: '❌ Severity must be a whole number from 1 to 5.', flags: 64 }); return true; }
    const allegations = field(interaction, 'allegations');
    const recommendation = field(interaction, 'recommendation');
    const created = createCase({ guildId: interaction.guildId, userId: raw, moderatorId: interaction.user.id, action: COURT_ACTION, reason: allegations, metadata: { court: { stage: 'investigation', severity, allegations, leadModeratorId: interaction.user.id, reviewingAdminId: null, evidence: [], notes: [], linkedCases: [], recommendation: recommendation ? { reason: recommendation, by: interaction.user.id, at: now() } : null, decision: null, publication: null } }, status: 'active', actorId: interaction.user.id });
    if (!created) { await interaction.reply({ content: '❌ Failed to create the court case.', flags: 64 }); return true; }
    await interaction.update(buildCaseFile(interaction, created));
    return true;
  }
  const caseId = Number(raw);
  const modCase = getCaseById(interaction.guildId, caseId);
  if (!caseIsCourt(modCase)) return false;
  const court = parseCourt(modCase);
  if (key === 'mod_court_evidence_submit') {
    const item = { id: evidenceId(court), title: field(interaction, 'title'), source: field(interaction, 'source') || null, details: field(interaction, 'details'), status: 'draft', addedBy: interaction.user.id, addedAt: now(), verifiedBy: null, verifiedAt: null, verificationNote: null };
    const next = { ...court, evidence: [...court.evidence, item] };
    return updateCaseMessage(interaction, saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.evidence_added', court)).then(() => true);
  }
  if (key === 'mod_court_note_submit') {
    const item = { id: `N${court.notes.length + 1}`, text: field(interaction, 'note'), authorId: interaction.user.id, createdAt: now() };
    const next = { ...court, notes: [...court.notes, item] };
    return updateCaseMessage(interaction, saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.note_added', court)).then(() => true);
  }
  if (key === 'mod_court_severity_submit') {
    const severity = Number(field(interaction, 'severity'));
    if (!Number.isInteger(severity) || severity < 1 || severity > 5) { await interaction.reply({ content: '❌ Severity must be a whole number from 1 to 5.', flags: 64 }); return true; }
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
  if (key === 'mod_court_decide_submit') {
    if (!isJudge(interaction)) { await interaction.reply({ content: '❌ Admin authority is required to record a decision.', flags: 64 }); return true; }
    const action = field(interaction, 'action').toLowerCase();
    const allowed = new Set(['warn', 'timeout', 'quarantine', 'kick', 'ban', 'no_action']);
    if (!allowed.has(action)) { await interaction.reply({ content: '❌ Decision action must be warn, timeout, quarantine, kick, ban, or no_action.', flags: 64 }); return true; }
    const decision = { finding: field(interaction, 'finding'), action, reason: field(interaction, 'reason'), decidedBy: interaction.user.id, decidedAt: now() };
    const recommendationText = field(interaction, 'recommendation');
    const next = { ...court, stage: 'decided', reviewingAdminId: interaction.user.id, decision, recommendation: recommendationText ? { reason: recommendationText, by: interaction.user.id, at: now() } : court.recommendation };
    const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.decision_recorded', court);
    await updateCaseMessage(interaction, updated);
    return true;
  }
  if (key === 'mod_court_publish_submit') {
    if (!isJudge(interaction)) { await interaction.reply({ content: '❌ Admin authority is required to publish a record.', flags: 64 }); return true; }
    if (!court.decision) { await interaction.reply({ content: '❌ Record a decision before publishing the member record.', flags: 64 }); return true; }
    const summary = field(interaction, 'summary');
    const previousRevision = Number(court.publication?.revision || 0);
    const publication = { revision: previousRevision + 1, summary, publishedBy: interaction.user.id, publishedAt: court.publication?.publishedAt || now(), updatedAt: now(), verifiedEvidenceIds: court.evidence.filter((item) => item.status === 'verified').map((item) => item.id) };
    const next = { ...court, stage: 'published', publication };
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
        return `**Case #${entry.caseId}** • Severity **${court.severity}/5** • Revision **${pub.revision || 1}**\n**Finding:** ${decision.finding || 'Recorded'}\n**Decision:** ${decision.action || 'No action'}\n${cleanExcerpt(pub.summary, 350)}\nPublished ${discordTime(pub.updatedAt || pub.publishedAt)}`;
      })].join('\n\n')
      : 'No court case records have been published to you.')
    .setFooter({ text: 'Only verified, published information is visible here' })
    .setTimestamp();
  return {
    embeds: [embed],
    components: [row(
      button('user:module:appeals', 'Appeals', '📝', ButtonStyle.Primary),
      button('user:category:account', 'Account', '⬅️'),
      button('user:home', 'User Panel', '🏠'),
    )],
  };
}

module.exports = {
  COURT_ACTION,
  parseCourt,
  caseIsCourt,
  getCourtCases,
  buildCourtDashboard,
  buildCaseFile,
  buildUserPublishedCasesPanel,
  handleCourtInteraction,
  handleCourtModal,
};
