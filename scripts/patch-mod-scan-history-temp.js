'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src/core/administration/mod/interactions.js');
let source = fs.readFileSync(file, 'utf8');

const oldHistoryUi = `  const buttons = [];
  if (canScanCapability(i, 'scan_run')) buttons.push(new Discord.ButtonBuilder().setCustomId(\`mod_scan_view:\${target.id}\`).setLabel('Back to Scan').setEmoji('🔎').setStyle(Discord.ButtonStyle.Primary));
  if (canScanCapability(i, 'scan_compare')) buttons.push(new Discord.ButtonBuilder().setCustomId(\`mod_scan_compare:\${target.id}\`).setLabel('Compare Account').setEmoji('🧬').setStyle(Discord.ButtonStyle.Secondary));
  return { embed, components: buttons.length ? [new Discord.ActionRowBuilder().addComponents(...buttons)] : [] };
}`;

const newHistoryUi = `  const components = [];
  const canManageHistory = rows.length && canScanCapability(i, 'scan_notes', 'add_case_note');
  if (canManageHistory) {
    const select = new Discord.StringSelectMenuBuilder()
      .setCustomId(\`mod_scan_delete_select:\${target.id}\`)
      .setPlaceholder('🗑️ Select a scan to delete')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(rows.slice(0, 10).map((row) => {
        const after = parseJson(row.after_value, {});
        const identityRow = after.identity || {};
        return {
          label: \`Scan \${String(after.scanId || row.audit_id).slice(0, 70)}\`,
          description: \`\${identityRow.username || target.user.username} • \${after.caseCount || 0} case(s)\`.slice(0, 100),
          value: String(row.audit_id),
        };
      }));
    components.push(new Discord.ActionRowBuilder().addComponents(select));
  }
  const buttons = [];
  if (canScanCapability(i, 'scan_run')) buttons.push(new Discord.ButtonBuilder().setCustomId(\`mod_scan_view:\${target.id}\`).setLabel('Back to Scan').setEmoji('🔎').setStyle(Discord.ButtonStyle.Primary));
  if (canScanCapability(i, 'scan_compare')) buttons.push(new Discord.ButtonBuilder().setCustomId(\`mod_scan_compare:\${target.id}\`).setLabel('Compare Account').setEmoji('🧬').setStyle(Discord.ButtonStyle.Secondary));
  if (canManageHistory) buttons.push(new Discord.ButtonBuilder().setCustomId(\`mod_scan_clear_history:\${target.id}\`).setLabel('Clear History').setEmoji('🧹').setStyle(Discord.ButtonStyle.Danger));
  if (buttons.length) components.push(new Discord.ActionRowBuilder().addComponents(...buttons));
  return { embed, components };
}`;

if (!source.includes(oldHistoryUi)) throw new Error('scan history UI anchor not found');
source = source.replace(oldHistoryUi, newHistoryUi);

const comparisonAnchor = 'async function runMemberComparison(i, primaryId, secondaryId) {';
const managementFunctions = `async function showScanDeleteConfirmation(i, targetId, auditId) {
  const allowed = await ensureScanCapability(i, 'scan_notes', '❌ You do not have permission to delete intelligence scan snapshots.', 'add_case_note');
  if (!allowed) return true;
  const row = db.prepare("SELECT audit_id, after_value, metadata FROM case_audit WHERE guild_id = ? AND audit_id = ? AND event = 'moderation.member_scan.completed' LIMIT 1").get(String(i.guild.id), String(auditId));
  if (!row || String(parseJson(row.metadata, {}).targetId || '') !== String(targetId)) return safeUpdate(i, { content: '❌ That scan snapshot no longer exists.', embeds: [], components: [] });
  const after = parseJson(row.after_value, {});
  const label = after.scanId || row.audit_id;
  const components = [new Discord.ActionRowBuilder().addComponents(
    new Discord.ButtonBuilder().setCustomId(\`mod_scan_delete_confirm:\${targetId}:\${row.audit_id}\`).setLabel('Delete Scan').setEmoji('🗑️').setStyle(Discord.ButtonStyle.Danger),
    new Discord.ButtonBuilder().setCustomId(\`mod_scan_history:\${targetId}\`).setLabel('Cancel').setStyle(Discord.ButtonStyle.Secondary),
  )];
  return safeUpdate(i, { content: \`⚠️ Delete scan snapshot \\\`\${String(label).slice(0, 80)}\\\`? This removes only the stored scan snapshot, not cases, warnings, evidence, notes, watchlist records or other audit history.\`, embeds: [], components });
}

async function deleteScanSnapshot(i, targetId, auditId) {
  const allowed = await ensureScanCapability(i, 'scan_notes', '❌ You do not have permission to delete intelligence scan snapshots.', 'add_case_note');
  if (!allowed) return true;
  const row = db.prepare("SELECT audit_id, metadata FROM case_audit WHERE guild_id = ? AND audit_id = ? AND event = 'moderation.member_scan.completed' LIMIT 1").get(String(i.guild.id), String(auditId));
  if (!row || String(parseJson(row.metadata, {}).targetId || '') !== String(targetId)) return safeUpdate(i, { content: '❌ That scan snapshot no longer exists.', embeds: [], components: [] });
  db.prepare("DELETE FROM case_audit WHERE guild_id = ? AND audit_id = ? AND event = 'moderation.member_scan.completed'").run(String(i.guild.id), String(auditId));
  recordModerationSystemEvent({ interaction: i, event: 'moderation.member_scan.snapshot_deleted', action: 'member_scan_history_delete', targetId, metadata: { deletedAuditId: String(auditId) } });
  return showMemberScanHistory(i, targetId);
}

async function showClearScanHistoryConfirmation(i, targetId) {
  const allowed = await ensureScanCapability(i, 'scan_notes', '❌ You do not have permission to clear intelligence scan history.', 'add_case_note');
  if (!allowed) return true;
  const count = scanAuditRows(i.guild.id, targetId, 100).length;
  if (!count) return showMemberScanHistory(i, targetId);
  const components = [new Discord.ActionRowBuilder().addComponents(
    new Discord.ButtonBuilder().setCustomId(\`mod_scan_clear_history_confirm:\${targetId}\`).setLabel('Clear All Scan History').setEmoji('🧹').setStyle(Discord.ButtonStyle.Danger),
    new Discord.ButtonBuilder().setCustomId(\`mod_scan_history:\${targetId}\`).setLabel('Cancel').setStyle(Discord.ButtonStyle.Secondary),
  )];
  return safeUpdate(i, { content: \`⚠️ Clear all **\${count}** stored Member Intelligence scan snapshot(s) for <@\${targetId}>? Cases, warnings, evidence, notes, watchlist records and other moderation audit events will be retained.\`, embeds: [], components });
}

async function clearScanHistory(i, targetId) {
  const allowed = await ensureScanCapability(i, 'scan_notes', '❌ You do not have permission to clear intelligence scan history.', 'add_case_note');
  if (!allowed) return true;
  const rows = db.prepare("SELECT audit_id, metadata FROM case_audit WHERE guild_id = ? AND event = 'moderation.member_scan.completed'").all(String(i.guild.id));
  const ids = rows.filter((row) => String(parseJson(row.metadata, {}).targetId || '') === String(targetId)).map((row) => String(row.audit_id));
  const remove = db.prepare("DELETE FROM case_audit WHERE guild_id = ? AND audit_id = ? AND event = 'moderation.member_scan.completed'");
  const tx = db.transaction((auditIds) => { for (const auditId of auditIds) remove.run(String(i.guild.id), auditId); });
  tx(ids);
  recordModerationSystemEvent({ interaction: i, event: 'moderation.member_scan.history_cleared', action: 'member_scan_history_clear', targetId, metadata: { deletedSnapshots: ids.length } });
  return showMemberScanHistory(i, targetId);
}

async function handleMemberScanStringSelect(i) {
  const id = String(i.customId || '');
  if (!id.startsWith('mod_scan_delete_select:')) return false;
  const targetId = id.split(':')[1];
  const auditId = i.values?.[0];
  if (!targetId || !auditId) return safeUpdate(i, { content: '❌ Select a scan snapshot to delete.', embeds: [], components: [] });
  return showScanDeleteConfirmation(i, targetId, auditId);
}

`;

if (!source.includes(comparisonAnchor)) throw new Error('comparison anchor not found');
source = source.replace(comparisonAnchor, managementFunctions + comparisonAnchor);

const oldButtons = `  if (id.startsWith('mod_scan_history:')) return showMemberScanHistory(i, id.split(':')[1]);
  if (id.startsWith('mod_scan_links:')) return showPersistentLinkEvidence(i, id.split(':')[1]);`;
const newButtons = `  if (id.startsWith('mod_scan_history:')) return showMemberScanHistory(i, id.split(':')[1]);
  if (id.startsWith('mod_scan_delete_confirm:')) { const parts = id.split(':'); return deleteScanSnapshot(i, parts[1], parts[2]); }
  if (id.startsWith('mod_scan_clear_history_confirm:')) return clearScanHistory(i, id.split(':')[1]);
  if (id.startsWith('mod_scan_clear_history:')) return showClearScanHistoryConfirmation(i, id.split(':')[1]);
  if (id.startsWith('mod_scan_links:')) return showPersistentLinkEvidence(i, id.split(':')[1]);`;
if (!source.includes(oldButtons)) throw new Error('button routing anchor not found');
source = source.replace(oldButtons, newButtons);

const oldSelectRoute = "  if (i.isStringSelectMenu?.()) return routeHandlers(i, [handleCaseSearchSelect]);";
const newSelectRoute = "  if (i.isStringSelectMenu?.()) return routeHandlers(i, [handleMemberScanStringSelect, handleCaseSearchSelect]);";
if (!source.includes(oldSelectRoute)) throw new Error('string-select routing anchor not found');
source = source.replace(oldSelectRoute, newSelectRoute);

fs.writeFileSync(file, source);
console.log('✅ Scan history management patch applied');
