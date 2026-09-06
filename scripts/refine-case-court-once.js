'use strict';

const fs = require('node:fs');

const path = 'src/core/administration/mod/caseCourt.js';
let text = fs.readFileSync(path, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (!text.includes(oldText)) throw new Error(`Missing patch anchor: ${label}`);
  text = text.replace(oldText, newText);
}

replaceOnce(
"function cleanExcerpt(value, max = 220) {\n  const text = String(value || '').replace(/\\s+/g, ' ').trim();\n  return text.length > max ? `${text.slice(0, max - 1)}…` : text;\n}\n",
"function cleanExcerpt(value, max = 220) {\n  const text = String(value || '').replace(/\\s+/g, ' ').trim();\n  return text.length > max ? `${text.slice(0, max - 1)}…` : text;\n}\nfunction staffBackRow(targetId) { return row(button(`mod_court_back:${targetId}`, 'Back', '⬅️')); }\nfunction caseFileBackRow(caseId) { return row(button(`mod_court_file:${caseId}`, 'Back', '⬅️')); }\nfunction auditRows(guildId, caseId, limit = 25) {\n  try { return db.prepare('SELECT actor_id, event, after_value, metadata, created_at FROM case_audit WHERE guild_id = ? AND case_id = ? ORDER BY audit_id DESC LIMIT ?').all(String(guildId), Number(caseId), Math.max(1, Math.min(50, Number(limit) || 25))); }\n  catch { return []; }\n}\n",
'helpers');

replaceOnce(
"    .setTitle(target ? `⚖️ Case Court • ${target.user.tag}` : '⚖️ Case Court')",
"    .setTitle(target ? `⚖️ Case Court • ${target.displayName || target.user.globalName || target.user.username || target.user.tag}` : '⚖️ Case Court')",
'title');

const oldComponents = `  const canManage = canUseModAction(interaction.member, interaction.guild, 'edit_case', interaction);\n  const components = [\n    row(\n      button(\`mod_court_evidence:\${modCase.caseId}\`, 'Add Evidence', '➕', ButtonStyle.Primary),\n      button(\`mod_court_note:\${modCase.caseId}\`, 'Case Note', '📝'),\n      button(\`mod_court_import:\${modCase.caseId}\`, 'Import Records', '🔗'),\n      button(\`mod_court_severity:\${modCase.caseId}\`, 'Severity', '⚖️'),\n    ),\n    row(\n      button(\`mod_court_verify:\${modCase.caseId}\`, 'Verify Evidence', '✅', ButtonStyle.Secondary, !court.evidence.length),\n      button(\`mod_court_submit_review:\${modCase.caseId}\`, court.stage === 'review' ? 'Awaiting Review' : 'Submit for Review', '👨‍⚖️', ButtonStyle.Primary, court.stage === 'review' || court.stage === 'published'),\n      button(\`mod_court_decide:\${modCase.caseId}\`, 'Decision', '⚖️', canManage ? ButtonStyle.Danger : ButtonStyle.Secondary, !canManage || court.stage === 'published'),\n    ),\n    row(\n      button(\`mod_court_publish:\${modCase.caseId}\`, court.publication ? 'Update Published Record' : 'Publish Record', '📜', ButtonStyle.Success, !canManage || !court.decision),\n      button(\`mod_court_back:\${modCase.userId}\`, 'Cases', '⬅️'),\n    ),\n  ];`;

const newComponents = `  const canManage = canUseModAction(interaction.member, interaction.guild, 'edit_case', interaction);\n  const canDecide = canManage && ['review', 'decided'].includes(court.stage);\n  const components = [\n    row(\n      button(\`mod_court_evidence:\${modCase.caseId}\`, 'Add Evidence', '➕', ButtonStyle.Primary),\n      button(\`mod_court_note:\${modCase.caseId}\`, 'Case Note', '📝'),\n      button(\`mod_court_import:\${modCase.caseId}\`, 'Import Records', '🔗'),\n      button(\`mod_court_severity:\${modCase.caseId}\`, 'Severity', '⚖️'),\n      button(\`mod_court_recommend:\${modCase.caseId}\`, 'Recommendation', '📋'),\n    ),\n    row(\n      button(\`mod_court_evidence_view:\${modCase.caseId}\`, 'Evidence', '🔎'),\n      button(\`mod_court_notes_view:\${modCase.caseId}\`, 'Notes', '📝'),\n      button(\`mod_court_timeline:\${modCase.caseId}\`, 'Timeline', '🕘'),\n      button(\`mod_court_submit_review:\${modCase.caseId}\`, court.stage === 'review' ? 'Awaiting Review' : 'Submit for Review', '👨‍⚖️', ButtonStyle.Primary, court.stage === 'review' || court.stage === 'published'),\n    ),\n    row(\n      button(\`mod_court_verify:\${modCase.caseId}\`, 'Verify Evidence', '✅', ButtonStyle.Secondary, !court.evidence.length),\n      button(\`mod_court_decide:\${modCase.caseId}\`, 'Decision', '⚖️', canManage ? ButtonStyle.Danger : ButtonStyle.Secondary, !canDecide),\n      button(\`mod_court_publish:\${modCase.caseId}\`, court.publication ? 'Update Published Record' : 'Publish Record', '📜', ButtonStyle.Success, !canManage || !court.decision),\n    ),\n    staffBackRow(modCase.userId),\n  ];`;
replaceOnce(oldComponents, newComponents, 'case file controls');

replaceOnce(
"function newCaseModal(targetId) {",
`function buildEvidencePage(interaction, modCase) {\n  const court = parseCourt(modCase);\n  const lines = court.evidence.length ? court.evidence.slice(-12).reverse().map((item) => {\n    const verification = item.status === 'verified' ? \`\\nVerified by <@\${item.verifiedBy}> \${discordTime(item.verifiedAt)}\` : item.status === 'rejected' ? \`\\nRejected by <@\${item.verifiedBy}> \${discordTime(item.verifiedAt)}\` : '';\n    return \`\${EVIDENCE_STATUS[item.status] || EVIDENCE_STATUS.draft} **\${item.id} • \${cleanExcerpt(item.title, 90)}**\\nSource: \${cleanExcerpt(item.source || 'Internal submission', 120)}\\n\${cleanExcerpt(item.details, 240)}\${verification}\`;\n  }) : ['No evidence has been added to this case.'];\n  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(\`🔎 Evidence • Case #\${modCase.caseId}\`).setDescription(lines.join('\\n\\n').slice(0, 4000)).setFooter({ text: 'Draft evidence stays internal until an authorised admin verifies it' }).setTimestamp();\n  return { embeds: [embed], components: [row(button(\`mod_court_evidence:\${modCase.caseId}\`, 'Add Evidence', '➕', ButtonStyle.Primary), button(\`mod_court_verify:\${modCase.caseId}\`, 'Verify Evidence', '✅', ButtonStyle.Secondary, !court.evidence.length)), caseFileBackRow(modCase.caseId)] };\n}\nfunction buildNotesPage(modCase) {\n  const court = parseCourt(modCase);\n  const lines = court.notes.length ? court.notes.slice(-15).reverse().map((item) => \`**\${item.id || 'Note'}** • <@\${item.authorId}> • \${discordTime(item.createdAt)}\\n\${cleanExcerpt(item.text, 300)}\`) : ['No private staff notes have been added.'];\n  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(\`📝 Case Notes • #\${modCase.caseId}\`).setDescription(lines.join('\\n\\n').slice(0, 4000)).setFooter({ text: 'Private staff paperwork • never published automatically' }).setTimestamp();\n  return { embeds: [embed], components: [row(button(\`mod_court_note:\${modCase.caseId}\`, 'Add Case Note', '➕', ButtonStyle.Primary)), caseFileBackRow(modCase.caseId)] };\n}\nfunction buildTimelinePage(interaction, modCase) {\n  const rows = auditRows(interaction.guildId, modCase.caseId, 20);\n  const lines = rows.length ? rows.map((entry) => \`**\${String(entry.event || 'case.updated').replace(/^case\\.court\\./, '').replaceAll('_', ' ')}** • \${discordTime(entry.created_at)}\\nActor: \${entry.actor_id ? \`<@\${entry.actor_id}>\` : 'System'}\`) : ['No case audit activity recorded yet.'];\n  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(\`🕘 Case Timeline • #\${modCase.caseId}\`).setDescription(lines.join('\\n\\n').slice(0, 4000)).setFooter({ text: 'Immutable case audit trail • newest activity first' }).setTimestamp();\n  return { embeds: [embed], components: [caseFileBackRow(modCase.caseId)] };\n}\nfunction recommendationModal(caseId, court) {\n  return new ModalBuilder().setCustomId(\`mod_court_recommend_submit:\${caseId}\`).setTitle('Case Recommendation').addComponents(\n    modalInput('recommendation', 'Recommended outcome / next step', TextInputStyle.Paragraph, true, 1200, 'Record the moderator recommendation for the reviewing admin.', court.recommendation?.reason || ''),\n  );\n}\n\nfunction newCaseModal(targetId) {`,
'case subpages');

replaceOnce(
"    const all = target ? getCourtCases(interaction.guildId, target.id) : [];\n    const wanted = key === 'mod_court_review_queue' ? 'review' : 'published';",
"    const wanted = key === 'mod_court_review_queue' ? 'review' : 'published';\n    const all = wanted === 'review' ? getCourtCases(interaction.guildId) : (target ? getCourtCases(interaction.guildId, target.id) : []);",
'global review queue');

replaceOnce(
"    components.push(row(button(`mod_court_back:${value}`, 'Cases', '⬅️')));",
"    components.push(staffBackRow(value));",
'queue nav');

replaceOnce(
"  const court = parseCourt(modCase);\n  if (key === 'mod_court_evidence')",
"  const court = parseCourt(modCase);\n  if (key === 'mod_court_file') { await updateCaseMessage(interaction, modCase); return true; }\n  if (key === 'mod_court_evidence_view') { await interaction.update(buildEvidencePage(interaction, modCase)); return true; }\n  if (key === 'mod_court_notes_view') { await interaction.update(buildNotesPage(modCase)); return true; }\n  if (key === 'mod_court_timeline') { await interaction.update(buildTimelinePage(interaction, modCase)); return true; }\n  if (key === 'mod_court_recommend') { await interaction.showModal(recommendationModal(caseId, court)); return true; }\n  if (key === 'mod_court_evidence')",
'route subpages');

replaceOnce(
"  if (key === 'mod_court_evidence_submit') {",
"  if (key === 'mod_court_recommend_submit') {\n    const recommendation = { reason: field(interaction, 'recommendation'), by: interaction.user.id, at: now() };\n    const next = { ...court, recommendation };\n    return updateCaseMessage(interaction, saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.recommendation_updated', court)).then(() => true);\n  }\n  if (key === 'mod_court_evidence_submit') {",
'recommendation submit');

replaceOnce(
"    components: [row(\n      button('user:module:appeals', 'Appeals', '📝', ButtonStyle.Primary),\n      button('user:category:account', 'Account', '⬅️'),\n      button('user:home', 'User Panel', '🏠'),\n    )],",
"    components: [\n      row(button('user:module:appeals', 'Appeals', '📝', ButtonStyle.Primary)),\n      row(button('user:category:account', 'Back', '⬅️'), button('user:home', 'User Panel', '🏠')),\n    ],",
'user nav row');

fs.writeFileSync(path, text);
console.log('Case Court refinement applied.');
