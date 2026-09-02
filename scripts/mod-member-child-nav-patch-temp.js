'use strict';

const fs = require('fs');
const path = 'src/core/administration/mod/panel.js';
let text = fs.readFileSync(path, 'utf8');

const oldIntel = `function buildIntelligenceRows(targetId, member, guild) {
  if (!targetId) return [];
  const id = targetId; const rows = []; const first = [];
  if (canUseModAction(member, guild, 'scan_run')) first.push(createPrimaryButton(\`mod_member_scan:\${id}\`, 'Full Member Scan', '🔎'));
  if (canUseModAction(member, guild, 'scan_history')) first.push(createSecondaryButton(\`mod_scan_history:\${id}\`, 'Scan History', '📜'));
  if (canUseModAction(member, guild, 'scan_compare')) first.push(createSecondaryButton(\`mod_scan_compare:\${id}\`, 'Compare', '⚖️'));
  if (canUseModAction(member, guild, 'scan_links')) first.push(createSecondaryButton(\`mod_scan_links:\${id}\`, 'Link Evidence', '🔗'));
  const second = [];
  if (canUseModAction(member, guild, 'scan_notes')) second.push(createSecondaryButton(\`mod_scan_note:\${id}\`, 'Add Note', '📝'));
  if (canUseModAction(member, guild, 'scan_watch')) second.push(createSecondaryButton(\`mod_scan_watch:\${id}\`, 'Watch Status', '👁️'));
  for (const row of [buttonRow(first), buttonRow(second)]) if (row) rows.push(row);
  return rows;
}`;

const newIntel = `function buildIntelligenceRows(targetId, member, guild) {
  if (!targetId) return [];
  const id = targetId; const rows = []; const first = [];
  if (canUseModAction(member, guild, 'scan_run')) first.push(createPrimaryButton(\`mod_member_scan:\${id}\`, 'Full Member Scan', '🔎'));
  if (canUseModAction(member, guild, 'scan_history')) first.push(createSecondaryButton(\`mod_scan_history:\${id}\`, 'Scan History', '📜'));
  if (canUseModAction(member, guild, 'scan_compare')) first.push(createSecondaryButton(\`mod_scan_compare:\${id}\`, 'Compare Member', '⚖️'));
  const second = [];
  if (canUseModAction(member, guild, 'scan_links')) second.push(createSecondaryButton(\`mod_scan_links:\${id}\`, 'Link Evidence', '🔗'));
  if (canUseModAction(member, guild, 'scan_notes')) second.push(createSecondaryButton(\`mod_scan_note:\${id}\`, 'Add Note', '📝'));
  if (canUseModAction(member, guild, 'scan_watch')) second.push(createSecondaryButton(\`mod_scan_watch:\${id}\`, 'Watch Status', '👁️'));
  for (const row of [buttonRow(first), buttonRow(second)]) if (row) rows.push(row);
  return rows;
}`;

const oldNav = `  if (active !== 'actions' && active !== 'analytics' && targetId) {
    const candidates = [
      ['actions', '⚡ Moderation'],
      ['intelligence', '🧠 Intelligence'],
      ['cases', '📁 Cases'],
    ].filter(([view]) => canViewDashboardSection(member, guild, view)).filter(([view]) => view !== active);
    const buttons = candidates.map(([view, label]) => new ButtonBuilder().setCustomId(\`mod_dashboard:\${id}:\${view}\`).setLabel(label).setStyle(ButtonStyle.Secondary));
    if (buttons.length) rows.push(new ActionRowBuilder().addComponents(buttons));
  }
`;

if (!text.includes(oldIntel)) throw new Error('Expected buildIntelligenceRows block not found; refusing stale patch.');
if (!text.includes(oldNav)) throw new Error('Expected child-navigation block not found; refusing stale patch.');

text = text.replace(oldIntel, newIntel).replace(oldNav, '');
fs.writeFileSync(path, text);

if (!text.includes("'Compare Member'")) throw new Error('Compare Member label was not applied.');
if (text.includes("['actions', '⚡ Moderation']")) throw new Error('Duplicate child navigation row still exists.');
console.log('Member child navigation patch applied.');
