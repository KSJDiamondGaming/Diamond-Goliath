'use strict';

const fs = require('fs');

function replaceOnce(file, from, to) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes(from)) throw new Error(`Expected source block not found in ${file}`);
  const updated = source.replace(from, to);
  fs.writeFileSync(file, updated);
}

// 1) The legacy dashboard intelligence route should fall through to the scan handler.
replaceOnce(
  'src/core/administration/mod/panel.js',
  "  if (id.startsWith('mod_dashboard:') || id.startsWith('mod_refresh:')) { const [, targetId = 'none', requested = DEFAULT_VIEW] = id.split(':'); return renderDashboard(interaction, normalizeView(requested) === 'analytics' ? 'none' : targetId, requested, normalizeView(requested) === 'analytics' ? { ...DEFAULT_ANALYTICS_CONTEXT, analyticsReturnTargetId: targetId === 'none' ? null : targetId } : {}); }",
  "  if (id.startsWith('mod_dashboard:') || id.startsWith('mod_refresh:')) { const [, targetId = 'none', requested = DEFAULT_VIEW] = id.split(':'); if (normalizeView(requested) === 'intelligence') return false; return renderDashboard(interaction, normalizeView(requested) === 'analytics' ? 'none' : targetId, requested, normalizeView(requested) === 'analytics' ? { ...DEFAULT_ANALYTICS_CONTEXT, analyticsReturnTargetId: targetId === 'none' ? null : targetId } : {}); }"
);

// 2) Treat all intelligence dashboard navigation as the canonical unified scan workspace.
replaceOnce(
  'src/core/administration/mod/interactions.js',
  "async function handleMemberScanButton(i) {\n  const id = String(i.customId || '');\n  if (id === 'mod_select_user' || id === 'mod_member_scan') {",
  "async function handleMemberScanButton(i) {\n  const id = String(i.customId || '');\n  if (id.startsWith('mod_dashboard:') || id.startsWith('mod_refresh:')) {\n    const [, targetId = 'none', requested = 'actions'] = id.split(':');\n    if (requested === 'intelligence') {\n      if (targetId && targetId !== 'none') return runMemberScan(i, targetId, { record: false });\n      const allowed = await ensureScanCapability(i, 'scan_run', '❌ You do not have permission to run a member intelligence scan.');\n      if (!allowed) return true;\n      const select = new Discord.UserSelectMenuBuilder().setCustomId('mod_scan_user_select').setPlaceholder('👤 Select a member to investigate').setMinValues(1).setMaxValues(1);\n      const back = new Discord.ButtonBuilder().setCustomId('mod_dashboard:none:actions').setLabel('⬅️ Back').setStyle(Discord.ButtonStyle.Secondary);\n      return safeUpdate(i, { content: '🧠 **Member Intelligence** — select a server member to open the unified intelligence workspace.', embeds: [], components: [new Discord.ActionRowBuilder().addComponents(select), new Discord.ActionRowBuilder().addComponents(back)] });\n    }\n  }\n  if (id === 'mod_select_user' || id === 'mod_member_scan') {"
);

// 3) Merge member selector, scan message, controls and navigation into one panel.
replaceOnce(
  'src/core/administration/mod/intelligence.js',
  "    .setTitle(`🔎 Member Intelligence • ${target.user.tag}`)",
  "    .setTitle(`🧠 Member Intelligence • ${target.user.tag}`)"
);
replaceOnce(
  'src/core/administration/mod/intelligence.js',
  "  const components = [];\n  const primary = [",
  "  const components = [\n    new Discord.ActionRowBuilder().addComponents(\n      new Discord.UserSelectMenuBuilder()\n        .setCustomId('mod_scan_user_select')\n        .setPlaceholder('👤 Select another member to investigate')\n        .setMinValues(1)\n        .setMaxValues(1)\n    ),\n  ];\n  const primary = ["
);
replaceOnce(
  'src/core/administration/mod/intelligence.js',
  ".setLabel(report.investigation?.watched ? 'Remove Investigation Watch' : 'Investigation Watch')",
  ".setLabel(report.investigation?.watched ? 'Investigation Watch: ON' : 'Investigation Watch: OFF')"
);
replaceOnce(
  'src/core/administration/mod/intelligence.js',
  "  const nav = [new Discord.ButtonBuilder().setCustomId(`mod_dashboard:${target.id}:intelligence`).setLabel('⬅️ Back').setStyle(Discord.ButtonStyle.Secondary)];",
  "  const nav = [new Discord.ButtonBuilder().setCustomId(`mod_dashboard:${target.id}:actions`).setLabel('⬅️ Back').setStyle(Discord.ButtonStyle.Secondary)];"
);

// 4) Lock the architecture note to the merged design.
const docs = 'docs/architecture/moderation-workspace.md';
let text = fs.readFileSync(docs, 'utf8');
const marker = 'Member Intelligence component navigation reuses the current ephemeral interaction message wherever Discord permits.';
if (!text.includes('Member Intelligence is a single unified workspace')) {
  text = text.replace(marker, 'Member Intelligence is a single unified workspace: selecting Intelligence for an active member opens the live intelligence scan directly rather than a separate landing panel. The member selector remains at the top of that same message, followed by the scan summary, drill-down/action controls, and the final Back/Export navigation row. Opening the workspace does not create a scan-history snapshot; changing member or explicitly choosing Rescan performs the scan flow, while Rescan remains the explicit snapshot-producing action.\n\n' + marker);
  fs.writeFileSync(docs, text);
}

console.log('Unified Member Intelligence workspace patch applied.');
