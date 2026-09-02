'use strict';

const fs = require('node:fs');

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
}

const interactionsPath = 'src/core/administration/mod/interactions.js';
let interactions = fs.readFileSync(interactionsPath, 'utf8');
interactions = replaceOnce(
  interactions,
  "const { openCaseSearch, handleCaseSearchAction, handleCaseSearchSelect, handleCaseSearchModal } = require('./caseSearch');\n",
  "const { openCaseSearch, handleCaseSearchAction, handleCaseSearchSelect, handleCaseSearchModal } = require('./caseSearch');\nconst memberIntelligence = require('./intelligence');\n",
  'member intelligence import'
);
interactions = replaceOnce(
  interactions,
  '  const report = buildMemberScanPayload(i, target);\n  recordModerationSystemEvent({',
  '  const report = buildMemberScanPayload(i, target);\n  await memberIntelligence.decorateScan(i, target, report);\n  recordModerationSystemEvent({',
  'scan decoration'
);
interactions = replaceOnce(
  interactions,
  "  if (id.startsWith('mod_scan_watch:')) return toggleMemberWatch(i, id.split(':')[1]);\n",
  "  const intelligenceHandled = await memberIntelligence.handleInteraction(i, { ensureCapability: ensureScanCapability, canCapability: canScanCapability });\n  if (intelligenceHandled) return true;\n  if (id.startsWith('mod_scan_watch:')) return toggleMemberWatch(i, id.split(':')[1]);\n",
  'intelligence routing'
);
fs.writeFileSync(interactionsPath, interactions);

const intelligencePath = 'src/core/administration/mod/intelligence.js';
let intelligence = fs.readFileSync(intelligencePath, 'utf8');
intelligence = replaceOnce(
  intelligence,
  'async function handleInteraction(interaction, { ensureCapability } = {}) {',
  'async function handleInteraction(interaction, { ensureCapability, canCapability } = {}) {',
  'handler capability signature'
);
intelligence = replaceOnce(
  intelligence,
  "    const canManage = await need('scan_watch', '');\n    const context = await buildContext(interaction.client, target, {});\n    await safeReply(interaction, { embeds: [watchlistEmbed(target, context)], components: watchlistRows(targetId, Boolean(canManage)), flags: 64 }); return true;",
  "    const canManage = typeof canCapability === 'function' ? Boolean(canCapability(interaction, 'scan_watch')) : false;\n    const context = await buildContext(interaction.client, target, {});\n    await safeReply(interaction, { embeds: [watchlistEmbed(target, context)], components: watchlistRows(targetId, canManage), flags: 64 }); return true;",
  'watchlist capability check'
);
fs.writeFileSync(intelligencePath, intelligence);

console.log('Member Intelligence wiring applied.');
