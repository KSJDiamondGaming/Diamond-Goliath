'use strict';
const fs = require('fs');

function replaceOnce(file, before, after) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes(before)) throw new Error(`Anchor not found in ${file}: ${before.slice(0, 120)}`);
  const next = source.replace(before, after);
  if (next === source) throw new Error(`No change made in ${file}`);
  fs.writeFileSync(file, next);
}

replaceOnce(
  'src/core/administration/mod/panel.js',
  "function buildIntelligenceRows(targetId, member, guild) {\n  if (!targetId) return [];\n  const id = targetId; const rows = []; const first = [];\n  if (canUseModAction(member, guild, 'scan_run')) first.push(createPrimaryButton(`mod_member_scan:${id}`, 'Full Member Scan', '🔎'));\n  if (canUseModAction(member, guild, 'scan_history')) first.push(createSecondaryButton(`mod_scan_history:${id}`, 'Scan History', '📜'));\n  if (canUseModAction(member, guild, 'scan_compare')) first.push(createSecondaryButton(`mod_scan_compare:${id}`, 'Compare Member', '⚖️'));\n  const second = [];\n  if (canUseModAction(member, guild, 'scan_links')) second.push(createSecondaryButton(`mod_scan_links:${id}`, 'Link Evidence', '🔗'));\n  if (canUseModAction(member, guild, 'scan_notes')) second.push(createSecondaryButton(`mod_scan_note:${id}`, 'Add Note', '📝'));\n  if (canUseModAction(member, guild, 'scan_watch')) second.push(createSecondaryButton(`mod_scan_watch:${id}`, 'Watch Status', '👁️'));\n  for (const row of [buttonRow(first), buttonRow(second)]) if (row) rows.push(row);\n  return rows;\n}",
  "function buildIntelligenceRows(targetId, member, guild) {\n  if (!targetId) return [];\n  const id = targetId; const primary = [];\n  if (canUseModAction(member, guild, 'scan_run')) primary.push(createPrimaryButton(`mod_member_scan:${id}`, 'Full Member Scan', '🔎'));\n  if (canUseModAction(member, guild, 'scan_history')) primary.push(createSecondaryButton(`mod_scan_history:${id}`, 'Scan History', '🕘'));\n  return buttonRow(primary) ? [buttonRow(primary)] : [];\n}"
);

replaceOnce(
  'src/core/administration/mod/panel.js',
  "function buildIntelligenceEmbed(interaction, target, member, guild) { const capabilities = []; if (canUseModAction(member, guild, 'scan_suspects')) capabilities.push('Suspected-account correlation'); if (canUseModAction(member, guild, 'scan_network')) capabilities.push('Goliath network intelligence'); if (canUseModAction(member, guild, 'scan_links')) capabilities.push('Persistent link evidence'); if (canUseModAction(member, guild, 'scan_notes')) capabilities.push('Investigation notes'); if (canUseModAction(member, guild, 'scan_watch')) capabilities.push('Watch status'); return baseEmbed(interaction.client, COLORS.PRIMARY).setTitle('🧠 Member Intelligence').setDescription([target ? `**Active Member:** ${target.user} • \\`${target.id}\\`` : '**No member selected.**', '', 'Run Goliath Intelligence Scan to assemble the information this viewer is authorized to access.', '', capabilities.length ? `**Available Intelligence:**\\n${capabilities.map((value) => `• ${value}`).join('\\n')}` : 'Your authority profile provides basic scan access only.', '', 'Correlation results are evidence-led and never presented as confirmed identity unless Goliath has verified evidence.'].join('\\n')); }",
  "function buildIntelligenceEmbed(interaction, target, member, guild) { const capabilities = []; if (canUseModAction(member, guild, 'scan_suspects')) capabilities.push('Suspected-account correlation'); if (canUseModAction(member, guild, 'scan_network')) capabilities.push('Network reputation and cross-guild intelligence'); if (canUseModAction(member, guild, 'scan_links')) capabilities.push('Persistent link evidence'); if (canUseModAction(member, guild, 'scan_notes')) capabilities.push('Investigation notes'); if (canUseModAction(member, guild, 'scan_watch')) capabilities.push('Investigation watch and Watchlist state'); return baseEmbed(interaction.client, COLORS.PRIMARY).setTitle('🧠 Member Intelligence').setDescription([target ? `**Active Member:** ${target.user} • \\`${target.id}\\`` : '**No member selected.**', '', 'Run **Full Member Scan** to open the complete intelligence workspace. Scan History remains available separately for previous snapshots and account comparison.', '', capabilities.length ? `**Included Intelligence:**\\n${capabilities.map((value) => `• ${value}`).join('\\n')}` : 'Your authority profile provides basic scan access only.', '', 'Evidence controls are kept inside the scan workspace so Back always returns to the correct panel and no duplicate scan is recorded unless you explicitly choose Rescan.'].join('\\n')); }"
);

replaceOnce(
  'src/core/administration/mod/interactions.js',
  "  if (canScanCapability(i, 'scan_run')) return runMemberScan(i, target.id);\n  return safeReply(i, { content: `✅ Investigation watch ${enabled ? 'enabled' : 'removed'} for ${target.user}.`, flags: 64 });",
  "  if (canScanCapability(i, 'scan_run')) return runMemberScan(i, target.id, { record: false });\n  return safeReply(i, { content: `✅ Investigation watch ${enabled ? 'enabled' : 'removed'} for ${target.user}.`, flags: 64 });"
);

replaceOnce(
  'src/core/administration/mod/interactions.js',
  "  if (canScanCapability(i, 'scan_run')) return runMemberScan(i, target.id);\n  return safeReply(i, { content: `✅ Investigation note added for ${target.user}.`, flags: 64 });",
  "  if (canScanCapability(i, 'scan_run')) return runMemberScan(i, target.id, { record: false });\n  return safeReply(i, { content: `✅ Investigation note added for ${target.user}.`, flags: 64 });"
);

replaceOnce(
  'src/core/administration/mod/permissions.js',
  "  if (id.startsWith('mod_scan_compare:') || id.startsWith('mod_scan_compare_select:')) return 'scan_compare';",
  "  if (id.startsWith('mod_scan_history_compare:') || id.startsWith('mod_scan_history_compare_select:')) return 'scan_compare';"
);

console.log('Member Intelligence routing cleanup applied.');
