'use strict';

const fs = require('fs');
const path = 'src/core/administration/mod/caseCourt.js';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(oldText, newText, label) {
  const index = source.indexOf(oldText);
  if (index < 0) throw new Error(`Anchor not found: ${label}`);
  if (source.indexOf(oldText, index + oldText.length) >= 0) throw new Error(`Anchor not unique: ${label}`);
  source = source.slice(0, index) + newText + source.slice(index + oldText.length);
}

replaceOnce(
  "      button(`mod_court_verify:${modCase.caseId}`, 'Verify Evidence', '✅', ButtonStyle.Secondary, !court.evidence.length),",
  "      button(`mod_court_verify:${modCase.caseId}`, 'Verify Evidence', '✅', ButtonStyle.Secondary, !judgeAuthority || !court.evidence.length),",
  'case file verify authority',
);

replaceOnce(
  "    const parameter = field(interaction, 'parameter');\n    const note = field(interaction, 'note');\n    const lockKey = courtExecutionLockKey(interaction.guildId, caseId);",
  "    const parameter = field(interaction, 'parameter');\n    const note = field(interaction, 'note');\n    const strikeWeight = action === 'warn' ? Number(parameter) : null;\n    const durationMs = action === 'timeout' ? parseCourtTimeout(parameter) : null;\n    const deleteDays = action === 'ban' ? Number(parameter) : null;\n    if (action === 'warn' && (!Number.isInteger(strikeWeight) || strikeWeight < 1 || strikeWeight > 5)) { await interaction.reply({ content: '❌ Warning strike weight must be a whole number from 1 to 5.', flags: 64 }); return true; }\n    if (action === 'timeout' && !durationMs) { await interaction.reply({ content: '❌ Invalid timeout duration. Use values such as 10m, 1h or 1d; maximum 28 days.', flags: 64 }); return true; }\n    if (action === 'ban' && (!Number.isInteger(deleteDays) || deleteDays < 0 || deleteDays > 7)) { await interaction.reply({ content: '❌ Ban delete-message days must be a whole number from 0 to 7.', flags: 64 }); return true; }\n    const lockKey = courtExecutionLockKey(interaction.guildId, caseId);",
  'execution parameter preflight',
);

replaceOnce(
  "      if (action === 'warn') {\n        const strikeWeight = Number(parameter);\n        if (!Number.isInteger(strikeWeight) || strikeWeight < 1 || strikeWeight > 5) { await interaction.reply({ content: '❌ Warning strike weight must be a whole number from 1 to 5.', flags: 64 }); return true; }\n        const created = createWarningCaseAtomic({ guildId: interaction.guildId, userId: target.id, moderatorId: interaction.user.id, reason, strikeWeight, metadata: { sourceCourtCaseId: caseId, courtOrdered: true }, actorId: interaction.user.id });",
  "      if (action === 'warn') {\n        const created = createWarningCaseAtomic({ guildId: interaction.guildId, userId: target.id, moderatorId: interaction.user.id, reason, strikeWeight, metadata: { sourceCourtCaseId: caseId, courtOrdered: true }, actorId: interaction.user.id });",
  'warn post-claim validation removal',
);

replaceOnce(
  "        if (action === 'timeout') {\n          const durationMs = parseCourtTimeout(parameter);\n          if (!durationMs) { await interaction.reply({ content: '❌ Invalid timeout duration. Use values such as 10m, 1h or 1d; maximum 28 days.', flags: 64 }); return true; }\n          metadata.durationRaw = parameter;\n          metadata.durationMs = durationMs;\n        }\n        if (action === 'ban') {\n          const deleteDays = Number(parameter);\n          if (!Number.isInteger(deleteDays) || deleteDays < 0 || deleteDays > 7) { await interaction.reply({ content: '❌ Ban delete-message days must be a whole number from 0 to 7.', flags: 64 }); return true; }\n          metadata.deleteDays = deleteDays;\n        }",
  "        if (action === 'timeout') {\n          metadata.durationRaw = parameter;\n          metadata.durationMs = durationMs;\n        }\n        if (action === 'ban') metadata.deleteDays = deleteDays;",
  'timeout ban post-claim validation removal',
);

replaceOnce(
  "  if (key === 'mod_court_publish_submit') {\n    if (!isJudge(interaction)) { await interaction.reply({ content: '❌ Admin authority is required to publish a record.', flags: 64 }); return true; }",
  "  if (key === 'mod_court_publish_submit') {\n    if (!canPublishCourt(interaction)) { await interaction.reply({ content: '❌ Court publishing authority is required to publish a record.', flags: 64 }); return true; }",
  'publish modal dedicated authority',
);

fs.writeFileSync(path, source);
console.log('Applied Phase 16 Court execution preflight hardening.');
