'use strict';

const fs = require('fs');

function replaceOnce(source, oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`Missing anchor: ${label}`);
  return source.replace(oldText, newText);
}

const courtPath = 'src/core/administration/mod/caseCourt.js';
let court = fs.readFileSync(courtPath, 'utf8');

court = replaceOnce(court,
`    previousStage: court.previousStage || null,\n  };`,
`    previousStage: court.previousStage || null,\n    decisionHistory: Array.isArray(court.decisionHistory) ? court.decisionHistory : [],\n    publicationHistory: Array.isArray(court.publicationHistory) ? court.publicationHistory : [],\n    sanctionReview: court.sanctionReview && typeof court.sanctionReview === 'object' ? court.sanctionReview : null,\n  };`,
'court history metadata');

court = replaceOnce(court,
`  const decision = court.decision\n    ? \`**Finding:** \${court.decision.finding}\\n**Decision:** \${court.decision.action}\\n**Reason:** \${court.decision.reason}\\n**Judge:** <@\${court.decision.decidedBy}> • \${discordTime(court.decision.decidedAt)}\`\n    : 'No decision recorded.';`,
`  const sanctionGate = court.decision?.action === 'ban'\n    ? court.sanctionReview?.status === 'approved'\n      ? \`\\n**Ban Approval:** ✅ Approved by <@\${court.sanctionReview.approvedBy}> • \${discordTime(court.sanctionReview.approvedAt)}\`\n      : '\\n**Ban Approval:** ⏳ Second-admin approval required before publication.'\n    : '';\n  const decision = court.decision\n    ? \`**Finding:** \${court.decision.finding}\\n**Decision:** \${court.decision.action}\\n**Reason:** \${court.decision.reason}\\n**Judge:** <@\${court.decision.decidedBy}> • \${discordTime(court.decision.decidedAt)}\${sanctionGate}\`\n    : 'No decision recorded.';`,
'ban gate display');

court = replaceOnce(court,
`      button(\`mod_court_publish:\${modCase.caseId}\`, court.publication ? 'Update Published Record' : 'Publish Record', '📜', ButtonStyle.Success, !canManage || !court.decision || isClosed),\n      button(isClosed ? \`mod_court_reopen:\${modCase.caseId}\` : \`mod_court_close:\${modCase.caseId}\`, isClosed ? 'Reopen' : 'Close Case', isClosed ? '🔓' : '🔒', ButtonStyle.Secondary, !canManage),`,
`      button(\`mod_court_publish:\${modCase.caseId}\`, court.publication ? 'Update Published Record' : 'Publish Record', '📜', ButtonStyle.Success, !canManage || !court.decision || isClosed || (court.decision?.action === 'ban' && court.sanctionReview?.status !== 'approved')),\n      button(\`mod_court_approve_ban:\${modCase.caseId}\`, 'Approve Ban', '🛡️', ButtonStyle.Danger, !canManage || court.decision?.action !== 'ban' || court.sanctionReview?.status === 'approved' || court.decision?.decidedBy === interaction.user.id),\n      button(isClosed ? \`mod_court_reopen:\${modCase.caseId}\` : \`mod_court_close:\${modCase.caseId}\`, isClosed ? 'Reopen' : 'Close Case', isClosed ? '🔓' : '🔒', ButtonStyle.Secondary, !canManage),`,
'approve ban button');

court = replaceOnce(court,
`  if (key === 'mod_court_close') { if (!isJudge(interaction)) { await interaction.reply({ content: '❌ Admin authority is required to close a case.', flags: 64 }); return true; } await interaction.showModal(closeCaseModal(caseId)); return true; }`,
`  if (key === 'mod_court_approve_ban') {\n    if (!isJudge(interaction) || court.decision?.action !== 'ban') { await interaction.reply({ content: '❌ There is no ban decision awaiting approval.', flags: 64 }); return true; }\n    if (court.decision.decidedBy === interaction.user.id) { await interaction.reply({ content: '❌ The deciding judge cannot also approve the ban. A second admin must approve it.', flags: 64 }); return true; }\n    if (court.sanctionReview?.status === 'approved') { await interaction.reply({ content: '❌ This ban decision is already approved.', flags: 64 }); return true; }\n    const next = { ...court, sanctionReview: { ...(court.sanctionReview || {}), required: true, status: 'approved', approvedBy: interaction.user.id, approvedAt: now() } };\n    const updated = saveCourt(interaction.guildId, caseId, next, interaction.user.id, 'case.court.ban_approved', court);\n    await updateCaseMessage(interaction, updated);\n    return true;\n  }\n  if (key === 'mod_court_close') { if (!isJudge(interaction)) { await interaction.reply({ content: '❌ Admin authority is required to close a case.', flags: 64 }); return true; } await interaction.showModal(closeCaseModal(caseId)); return true; }`,
'ban approval handler');

court = replaceOnce(court,
`    const decision = { finding: field(interaction, 'finding'), action, reason: field(interaction, 'reason'), decidedBy: interaction.user.id, decidedAt: now() };\n    const recommendationText = field(interaction, 'recommendation');\n    const next = { ...court, stage: 'decided', reviewingAdminId: interaction.user.id, decision, recommendation: recommendationText ? { reason: recommendationText, by: interaction.user.id, at: now() } : court.recommendation };`,
`    const decision = { finding: field(interaction, 'finding'), action, reason: field(interaction, 'reason'), decidedBy: interaction.user.id, decidedAt: now() };\n    const recommendationText = field(interaction, 'recommendation');\n    const decisionHistory = court.decision ? [...court.decisionHistory, court.decision].slice(-20) : court.decisionHistory;\n    const sanctionReview = action === 'ban'\n      ? { required: true, status: 'pending', requestedBy: interaction.user.id, requestedAt: now(), approvedBy: null, approvedAt: null }\n      : null;\n    const next = { ...court, stage: 'decided', reviewingAdminId: interaction.user.id, decision, decisionHistory, sanctionReview, recommendation: recommendationText ? { reason: recommendationText, by: interaction.user.id, at: now() } : court.recommendation };`,
'decision history and ban gate');

court = replaceOnce(court,
`    if (!court.decision) { await interaction.reply({ content: '❌ Record a decision before publishing the member record.', flags: 64 }); return true; }\n    const summary = field(interaction, 'summary');\n    const previousRevision = Number(court.publication?.revision || 0);\n    const publication = { revision: previousRevision + 1, summary, publishedBy: interaction.user.id, publishedAt: court.publication?.publishedAt || now(), updatedAt: now(), verifiedEvidenceIds: court.evidence.filter((item) => item.status === 'verified').map((item) => item.id) };\n    const next = { ...court, stage: 'published', publication };`,
`    if (!court.decision) { await interaction.reply({ content: '❌ Record a decision before publishing the member record.', flags: 64 }); return true; }\n    if (court.decision.action === 'ban' && court.sanctionReview?.status !== 'approved') { await interaction.reply({ content: '❌ Ban decisions require approval from a second admin before the member record can be published.', flags: 64 }); return true; }\n    const summary = field(interaction, 'summary');\n    const previousRevision = Number(court.publication?.revision || 0);\n    const publicationHistory = court.publication ? [...court.publicationHistory, court.publication].slice(-20) : court.publicationHistory;\n    const publication = { revision: previousRevision + 1, summary, publishedBy: interaction.user.id, publishedAt: court.publication?.publishedAt || now(), updatedAt: now(), verifiedEvidenceIds: court.evidence.filter((item) => item.status === 'verified').map((item) => item.id) };\n    const next = { ...court, stage: 'published', publication, publicationHistory };`,
'publication history and ban gate');

court = replaceOnce(court,
`        return \`**Case #\${entry.caseId}** • Severity **\${court.severity}/5** • Revision **\${pub.revision || 1}**\\n**Finding:** \${decision.finding || 'Recorded'}\\n**Decision:** \${decision.action || 'No action'}\\n\${cleanExcerpt(pub.summary, 350)}\\nPublished \${discordTime(pub.updatedAt || pub.publishedAt)}\`;`,
`        const appeals = Array.isArray(entry.metadata?.appeals) ? entry.metadata.appeals : [];\n        const latestAppeal = appeals.slice().sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))[0];\n        const appealLine = latestAppeal ? \`\\n**Appeal:** \${latestAppeal.status === 'pending' ? '⏳ Pending' : latestAppeal.status === 'approved' ? '✅ Approved' : '❌ Denied'}\` : '';\n        return \`**Case #\${entry.caseId}** • Severity **\${court.severity}/5** • Revision **\${pub.revision || 1}**\\n**Finding:** \${decision.finding || 'Recorded'}\\n**Decision:** \${decision.action || 'No action'}\${appealLine}\\n\${cleanExcerpt(pub.summary, 350)}\\nPublished \${discordTime(pub.updatedAt || pub.publishedAt)}\`;`,
'user appeal status');

court = replaceOnce(court,
`      row(button('user:module:appeals', 'Appeals', '📝', ButtonStyle.Primary)),\n      row(button('user:category:account', 'Back', '⬅️'), button('user:home', 'User Panel', '🏠')),`,
`      row(button('user:module:appeals', 'Appeals', '📝', ButtonStyle.Primary), button('user:home', 'User Panel', '🏠')),\n      row(button('user:category:account', 'Back', '⬅️')),`,
'user final back row');

fs.writeFileSync(courtPath, court);

const casesPath = 'src/core/administration/mod/cases.js';
let cases = fs.readFileSync(casesPath, 'utf8');
cases = replaceOnce(cases,
`const APPEALABLE_ACTIONS = new Set(['warn', 'timeout', 'kick', 'ban']);`,
`const APPEALABLE_ACTIONS = new Set(['warn', 'timeout', 'kick', 'ban', 'case']);`,
'court appealable action');

cases = replaceOnce(cases,
`  if (!APPEALABLE_ACTIONS.has(String(modCase.action || '').toLowerCase())) return { ok: false, error: 'This case type is not appealable.' };\n  if (getStatus(modCase) !== 'active') return { ok: false, error: \`This case is \${getStatus(modCase)} and is no longer eligible for appeal.\` };`,
`  if (!APPEALABLE_ACTIONS.has(String(modCase.action || '').toLowerCase())) return { ok: false, error: 'This case type is not appealable.' };\n  if (String(modCase.action || '').toLowerCase() === 'case') {\n    const court = modCase.metadata?.court;\n    if (!court?.publication || court.stage !== 'published' || !court.decision) return { ok: false, error: 'Court cases become appealable only after an official decision is published.' };\n  }\n  if (getStatus(modCase) !== 'active') return { ok: false, error: \`This case is \${getStatus(modCase)} and is no longer eligible for appeal.\` };`,
'court appeal eligibility');

fs.writeFileSync(casesPath, cases);
console.log('Case Court phase 4 applied.');
