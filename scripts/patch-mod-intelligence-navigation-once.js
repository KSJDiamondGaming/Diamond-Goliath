'use strict';
const fs = require('fs');

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing anchor: ${label}`);
  return text.replace(from, to);
}

const panelPath = 'src/core/administration/mod/panel.js';
let panel = fs.readFileSync(panelPath, 'utf8');
panel = replaceOnce(
  panel,
  "if (canUseModAction(member, guild, 'scan_history')) primary.push(createSecondaryButton(`mod_scan_history:${id}`, 'Scan History', '🕘'));",
  "if (canUseModAction(member, guild, 'scan_history')) primary.push(createSecondaryButton(`mod_scan_history:${id}:landing`, 'Scan History', '🕘'));",
  'landing scan-history origin'
);
fs.writeFileSync(panelPath, panel);

const interactionsPath = 'src/core/administration/mod/interactions.js';
let src = fs.readFileSync(interactionsPath, 'utf8');

src = replaceOnce(src,
  'function buildScanHistoryPayload(i, target) {',
  "function buildScanHistoryPayload(i, target, origin = 'scan') {",
  'history payload origin'
);
src = replaceOnce(src,
  '.setCustomId(`mod_scan_delete_select:${target.id}`)',
  '.setCustomId(`mod_scan_delete_select:${target.id}:${origin}`)',
  'delete select origin'
);
src = replaceOnce(src,
  "  if (canScanCapability(i, 'scan_run')) buttons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_view:${target.id}`).setLabel('Back to Scan').setEmoji('🔎').setStyle(Discord.ButtonStyle.Primary));\n  if (canScanCapability(i, 'scan_compare')) buttons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_history_compare:${target.id}`).setLabel('Compare Account').setEmoji('🧬').setStyle(Discord.ButtonStyle.Secondary));\n  if (canManageHistory) buttons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_clear_history:${target.id}`).setLabel('Clear History').setEmoji('🧹').setStyle(Discord.ButtonStyle.Danger));",
  "  if (origin === 'landing') buttons.push(new Discord.ButtonBuilder().setCustomId(`mod_dashboard:${target.id}:intelligence`).setLabel('⬅️ Back to Intelligence').setStyle(Discord.ButtonStyle.Secondary));\n  else if (canScanCapability(i, 'scan_run')) buttons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_view:${target.id}`).setLabel('⬅️ Back to Scan').setStyle(Discord.ButtonStyle.Secondary));\n  if (canScanCapability(i, 'scan_compare')) buttons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_history_compare:${target.id}:${origin}`).setLabel('Compare Account').setEmoji('🧬').setStyle(Discord.ButtonStyle.Secondary));\n  if (canManageHistory) buttons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_clear_history:${target.id}:${origin}`).setLabel('Clear History').setEmoji('🧹').setStyle(Discord.ButtonStyle.Danger));",
  'history navigation buttons'
);
src = replaceOnce(src,
  'function buildComparisonPayload(i, primary, secondary) {',
  "function buildComparisonPayload(i, primary, secondary, origin = 'scan') {",
  'comparison origin'
);
src = replaceOnce(src,
  'new Discord.ButtonBuilder().setCustomId(`mod_scan_history:${primary.id}`).setLabel(\'⬅️ Back to Scan History\').setStyle(Discord.ButtonStyle.Secondary),',
  "new Discord.ButtonBuilder().setCustomId(`mod_scan_history:${primary.id}:${origin}`).setLabel('⬅️ Back to Scan History').setStyle(Discord.ButtonStyle.Secondary),",
  'comparison back origin'
);
src = replaceOnce(src,
  'async function showMemberScanHistory(i, targetId) {',
  "async function showMemberScanHistory(i, targetId, origin = 'scan') {",
  'show history origin'
);
src = replaceOnce(src,
  '  const payload = buildScanHistoryPayload(i, target);',
  '  const payload = buildScanHistoryPayload(i, target, origin);',
  'history payload call'
);
src = replaceOnce(src,
  'async function showScanDeleteConfirmation(i, targetId, auditId) {',
  "async function showScanDeleteConfirmation(i, targetId, auditId, origin = 'scan') {",
  'delete confirmation origin'
);
src = replaceOnce(src,
  "new Discord.ButtonBuilder().setCustomId(`mod_scan_delete_confirm:${targetId}:${row.audit_id}`).setLabel('Delete Scan').setEmoji('🗑️').setStyle(Discord.ButtonStyle.Danger),\n    new Discord.ButtonBuilder().setCustomId(`mod_scan_history:${targetId}`).setLabel('Cancel').setStyle(Discord.ButtonStyle.Secondary),",
  "new Discord.ButtonBuilder().setCustomId(`mod_scan_delete_confirm:${targetId}:${row.audit_id}:${origin}`).setLabel('Delete Scan').setEmoji('🗑️').setStyle(Discord.ButtonStyle.Danger),\n    new Discord.ButtonBuilder().setCustomId(`mod_scan_history:${targetId}:${origin}`).setLabel('Cancel').setStyle(Discord.ButtonStyle.Secondary),",
  'delete confirmation controls'
);
src = replaceOnce(src,
  'async function deleteScanSnapshot(i, targetId, auditId) {',
  "async function deleteScanSnapshot(i, targetId, auditId, origin = 'scan') {",
  'delete snapshot origin'
);
src = replaceOnce(src,
  '  return showMemberScanHistory(i, targetId);\n}\n\nasync function showClearScanHistoryConfirmation',
  '  return showMemberScanHistory(i, targetId, origin);\n}\n\nasync function showClearScanHistoryConfirmation',
  'delete return history origin'
);
src = replaceOnce(src,
  'async function showClearScanHistoryConfirmation(i, targetId) {',
  "async function showClearScanHistoryConfirmation(i, targetId, origin = 'scan') {",
  'clear confirmation origin'
);
src = replaceOnce(src,
  '  if (!count) return showMemberScanHistory(i, targetId);',
  '  if (!count) return showMemberScanHistory(i, targetId, origin);',
  'empty clear return origin'
);
src = replaceOnce(src,
  "new Discord.ButtonBuilder().setCustomId(`mod_scan_clear_history_confirm:${targetId}`).setLabel('Clear All Scan History').setEmoji('🧹').setStyle(Discord.ButtonStyle.Danger),\n    new Discord.ButtonBuilder().setCustomId(`mod_scan_history:${targetId}`).setLabel('Cancel').setStyle(Discord.ButtonStyle.Secondary),",
  "new Discord.ButtonBuilder().setCustomId(`mod_scan_clear_history_confirm:${targetId}:${origin}`).setLabel('Clear All Scan History').setEmoji('🧹').setStyle(Discord.ButtonStyle.Danger),\n    new Discord.ButtonBuilder().setCustomId(`mod_scan_history:${targetId}:${origin}`).setLabel('Cancel').setStyle(Discord.ButtonStyle.Secondary),",
  'clear confirmation controls'
);
src = replaceOnce(src,
  'async function clearScanHistory(i, targetId) {',
  "async function clearScanHistory(i, targetId, origin = 'scan') {",
  'clear history origin'
);
src = replaceOnce(src,
  '  return showMemberScanHistory(i, targetId);\n}\n\nasync function handleMemberScanStringSelect',
  '  return showMemberScanHistory(i, targetId, origin);\n}\n\nasync function handleMemberScanStringSelect',
  'clear return history origin'
);
src = replaceOnce(src,
  "  const targetId = id.split(':')[1];\n  const auditId = i.values?.[0];\n  if (!targetId || !auditId) return safeUpdate(i, { content: '❌ Select a scan snapshot to delete.', embeds: [], components: [] });\n  return showScanDeleteConfirmation(i, targetId, auditId);",
  "  const parts = id.split(':');\n  const targetId = parts[1];\n  const origin = parts[2] || 'scan';\n  const auditId = i.values?.[0];\n  if (!targetId || !auditId) return safeUpdate(i, { content: '❌ Select a scan snapshot to delete.', embeds: [], components: [] });\n  return showScanDeleteConfirmation(i, targetId, auditId, origin);",
  'delete select routing origin'
);
src = replaceOnce(src,
  'async function runMemberComparison(i, primaryId, secondaryId) {',
  "async function runMemberComparison(i, primaryId, secondaryId, origin = 'scan') {",
  'comparison handler origin'
);
src = replaceOnce(src,
  '  const payload = buildComparisonPayload(i, primary, secondary);',
  '  const payload = buildComparisonPayload(i, primary, secondary, origin);',
  'comparison payload origin call'
);

const oldToggle = `async function toggleMemberWatch(i, targetId) {\n  const allowed = await ensureScanCapability(i, 'scan_watch', '❌ You do not have permission to change investigation watch state.');\n  if (!allowed) return true;\n  const target = await fetchTarget(i.guild, targetId);\n  if (!target) return safeReply(i, { content: '❌ Could not find that member in this server.', flags: 64 });\n  const state = getInvestigationState(i.guild.id, target.id);\n  const enabled = !state.watched;\n  recordModerationSystemEvent({ interaction: i, event: 'moderation.member_scan.watch_updated', action: 'member_watch', targetId: target.id, before: { enabled: state.watched }, after: { enabled, reason: enabled ? 'Manual staff investigation watch.' : 'Removed from manual investigation watch.' } });\n  if (canScanCapability(i, 'scan_run')) return runMemberScan(i, target.id, { record: false });\n  return safeReply(i, { content: \`✅ Investigation watch \${enabled ? 'enabled' : 'removed'} for \${target.user}.\`, flags: 64 });\n}`;
const newToggle = `async function showInvestigationWatch(i, targetId) {\n  const allowed = await ensureScanCapability(i, 'scan_watch', '❌ You do not have permission to view investigation watch state.');\n  if (!allowed) return true;\n  const target = await fetchTarget(i.guild, targetId);\n  if (!target) return safeReply(i, { content: '❌ Could not find that member in this server.', flags: 64 });\n  const state = getInvestigationState(i.guild.id, target.id);\n  const embed = new Discord.EmbedBuilder()\n    .setColor(state.watched ? 0xF0A202 : 0x5865F2)\n    .setTitle(\`👁️ Investigation Watch • \${target.user.tag}\`)\n    .setDescription([\n      \`**Status:** \${state.watched ? '🟠 ON' : '⚪ OFF'}\`,\n      state.watch?.reason ? \`**Reason:** \${state.watch.reason}\` : '**Reason:** No active investigation watch reason.',\n      state.watch?.at ? \`**Updated:** \${scanTimestamp(new Date(state.watch.at).getTime())}\` : '**Updated:** Never',\n      '',\n      'Investigation Watch is a management review flag. It is separate from the persistent Goliath Watchlist state.',\n    ].join('\\n'))\n    .setTimestamp();\n  const buttons = [\n    new Discord.ButtonBuilder().setCustomId(\`mod_scan_watch_toggle:\${target.id}\`).setLabel(state.watched ? 'Remove Investigation Watch' : 'Enable Investigation Watch').setEmoji('👁️').setStyle(state.watched ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Primary),\n    new Discord.ButtonBuilder().setCustomId(\`mod_scan_view:\${target.id}\`).setLabel('⬅️ Back to Scan').setStyle(Discord.ButtonStyle.Secondary),\n  ];\n  return safeUpdate(i, { content: null, embeds: [embed], components: [new Discord.ActionRowBuilder().addComponents(...buttons)] });\n}\nasync function toggleMemberWatch(i, targetId) {\n  const allowed = await ensureScanCapability(i, 'scan_watch', '❌ You do not have permission to change investigation watch state.');\n  if (!allowed) return true;\n  const target = await fetchTarget(i.guild, targetId);\n  if (!target) return safeReply(i, { content: '❌ Could not find that member in this server.', flags: 64 });\n  const state = getInvestigationState(i.guild.id, target.id);\n  const enabled = !state.watched;\n  recordModerationSystemEvent({ interaction: i, event: 'moderation.member_scan.watch_updated', action: 'member_watch', targetId: target.id, before: { enabled: state.watched }, after: { enabled, reason: enabled ? 'Manual management investigation watch.' : 'Removed from manual management investigation watch.' } });\n  return showInvestigationWatch(i, target.id);\n}`;
src = replaceOnce(src, oldToggle, newToggle, 'investigation watch page');

src = replaceOnce(src,
  "    const primaryId = String(i.customId).split(':')[1];\n    const secondaryId = i.values?.[0];\n    if (!secondaryId) return safeReply(i, { content: '❌ No comparison member selected.', flags: 64 });\n    return runMemberComparison(i, primaryId, secondaryId);",
  "    const parts = String(i.customId).split(':');\n    const primaryId = parts[1];\n    const origin = parts[2] || 'scan';\n    const secondaryId = i.values?.[0];\n    if (!secondaryId) return safeReply(i, { content: '❌ No comparison member selected.', flags: 64 });\n    return runMemberComparison(i, primaryId, secondaryId, origin);",
  'comparison select origin'
);
src = replaceOnce(src,
  "  if (id.startsWith('mod_scan_history:')) return showMemberScanHistory(i, id.split(':')[1]);\n  if (id.startsWith('mod_scan_delete_confirm:')) { const parts = id.split(':'); return deleteScanSnapshot(i, parts[1], parts[2]); }\n  if (id.startsWith('mod_scan_clear_history_confirm:')) return clearScanHistory(i, id.split(':')[1]);\n  if (id.startsWith('mod_scan_clear_history:')) return showClearScanHistoryConfirmation(i, id.split(':')[1]);",
  "  if (id.startsWith('mod_scan_history:')) { const parts = id.split(':'); return showMemberScanHistory(i, parts[1], parts[2] || 'scan'); }\n  if (id.startsWith('mod_scan_delete_confirm:')) { const parts = id.split(':'); return deleteScanSnapshot(i, parts[1], parts[2], parts[3] || 'scan'); }\n  if (id.startsWith('mod_scan_clear_history_confirm:')) { const parts = id.split(':'); return clearScanHistory(i, parts[1], parts[2] || 'scan'); }\n  if (id.startsWith('mod_scan_clear_history:')) { const parts = id.split(':'); return showClearScanHistoryConfirmation(i, parts[1], parts[2] || 'scan'); }",
  'history button routing origins'
);
src = replaceOnce(src,
  "  if (id.startsWith('mod_scan_watch:')) return toggleMemberWatch(i, id.split(':')[1]);",
  "  if (id.startsWith('mod_scan_watch_toggle:')) return toggleMemberWatch(i, id.split(':')[1]);\n  if (id.startsWith('mod_scan_watch:')) return showInvestigationWatch(i, id.split(':')[1]);",
  'watch routing'
);
src = replaceOnce(src,
  "    const primaryId = id.split(':')[1];\n    const allowed = await ensureScanCapability(i, 'scan_compare', '❌ You do not have permission to compare member intelligence.');\n    if (!allowed) return true;\n    const select = new Discord.UserSelectMenuBuilder().setCustomId(`mod_scan_history_compare_select:${primaryId}`).setPlaceholder('🧬 Select another member to compare').setMinValues(1).setMaxValues(1);\n    const back = new Discord.ButtonBuilder().setCustomId(`mod_scan_history:${primaryId}`).setLabel('⬅️ Back to Scan History').setStyle(Discord.ButtonStyle.Secondary);",
  "    const parts = id.split(':');\n    const primaryId = parts[1];\n    const origin = parts[2] || 'scan';\n    const allowed = await ensureScanCapability(i, 'scan_compare', '❌ You do not have permission to compare member intelligence.');\n    if (!allowed) return true;\n    const select = new Discord.UserSelectMenuBuilder().setCustomId(`mod_scan_history_compare_select:${primaryId}:${origin}`).setPlaceholder('🧬 Select another member to compare').setMinValues(1).setMaxValues(1);\n    const back = new Discord.ButtonBuilder().setCustomId(`mod_scan_history:${primaryId}:${origin}`).setLabel('⬅️ Back to Scan History').setStyle(Discord.ButtonStyle.Secondary);",
  'compare button origin'
);
fs.writeFileSync(interactionsPath, src);

const permissionsPath = 'src/core/administration/mod/permissions.js';
let perms = fs.readFileSync(permissionsPath, 'utf8');
perms = replaceOnce(perms,
  "  if (id.startsWith('mod_scan_watch:')) return 'scan_watch';",
  "  if (id.startsWith('mod_scan_watch:') || id.startsWith('mod_scan_watch_toggle:')) return 'scan_watch';",
  'watch permission routing'
);
fs.writeFileSync(permissionsPath, perms);

console.log('Applied moderation intelligence navigation fixes.');
