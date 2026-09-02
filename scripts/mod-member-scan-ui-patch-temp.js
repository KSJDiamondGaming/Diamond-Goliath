'use strict';
const fs = require('fs');
const path = 'src/core/administration/mod/interactions.js';
let src = fs.readFileSync(path, 'utf8');
const start = src.indexOf('function buildMemberScanPayload(i, target) {');
const end = src.indexOf('function buildScanHistoryPayload(i, target) {');
if (start < 0 || end < 0 || end <= start) throw new Error('Member scan payload block not found');
let block = src.slice(start, end);

block = block.replace('.setTitle(`🔎 Goliath Member Scan • ${target.user.tag}`)', '.setTitle(`🔎 Member Intelligence Scan • ${target.user.tag}`)');
block = block.replace('This report is permission-filtered for the viewing staff member. Suspected-account matches are investigation signals, not proof of ownership.', 'Permission-filtered intelligence for authorized management. Correlation signals are investigation aids, not proof of identity or ownership.');
block = block.replace(".setFooter({ text: `Scanned by ${i.user?.tag || i.user?.username || i.user?.id || 'Unknown staff'} • evidence-based intelligence only` })", ".setFooter({ text: `Scanned by ${i.user?.tag || i.user?.username || i.user?.id || 'Unknown'} • evidence-based intelligence` })");
block = block.replace("fields.push({ name: '📡 Data Sources', value: sources.join(' • '), inline: false });", "// Data-source provenance remains in the scan audit metadata rather than consuming viewer space.");
block = block.replace(/(\{ name: '🪪 Identity',[\s\S]*?inline:) false \}/, '$1 true }');
block = block.replace(/(\{ name: '🏠 Guild Membership',[\s\S]*?inline:) false \}/, '$1 true }');
block = block.replace(/(\{ name: `🎭 Roles \(\$\{roles\.length\}\)`,[\s\S]*?inline:) false \}/, '$1 true }');
block = block.replace(/(\{ name: '🔐 Key Permissions',[\s\S]*?inline:) false \}/, '$1 true }');
block = block.replace(/(\{ name: '🚩 Account Flags',[\s\S]*?inline:) false \}/, '$1 true }');
block = block.replace("value: 'No confirmed Goliath identity-link provider is currently connected to this scan. This section only shows verified links when Goliath has a legitimate stored verification/OAuth relationship.'", "value: 'No verified linked account is currently available for this member.'");
block = block.replace("if (access.compare) primaryButtons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_compare:${target.id}`).setLabel('Compare').setEmoji('🧬').setStyle(Discord.ButtonStyle.Secondary));", "if (access.compare) primaryButtons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_compare:${target.id}`).setLabel('Compare Member').setEmoji('⚖️').setStyle(Discord.ButtonStyle.Secondary));");
block = block.replace(/\n  if \(access\.cases\) \{\n    primaryButtons\.push\(new Discord\.ButtonBuilder\(\)\.setCustomId\(`mod_case_detail:\$\{target\.id\}`\)[\s\S]*?\n  \}/, '');
block = block.replace("if (access.notes) intelligenceButtons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_note:${target.id}`).setLabel('Add Note').setEmoji('📝').setStyle(Discord.ButtonStyle.Secondary));\n  if (access.watch) intelligenceButtons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_watch:${target.id}`).setLabel(investigation.watched ? 'Remove Watch' : 'Watch Member').setEmoji('👁️').setStyle(investigation.watched ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Secondary));\n  if (access.links) intelligenceButtons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_links:${target.id}`).setLabel(`Link Evidence (${persistentLinks.length})`.slice(0, 80)).setEmoji('🔗').setStyle(Discord.ButtonStyle.Secondary));", "if (access.links) intelligenceButtons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_links:${target.id}`).setLabel(`Link Evidence (${persistentLinks.length})`.slice(0, 80)).setEmoji('🔗').setStyle(Discord.ButtonStyle.Secondary));\n  if (access.notes) intelligenceButtons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_note:${target.id}`).setLabel('Add Note').setEmoji('📝').setStyle(Discord.ButtonStyle.Secondary));\n  if (access.watch) intelligenceButtons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_watch:${target.id}`).setLabel(investigation.watched ? 'Remove Watch' : 'Watch Status').setEmoji('👁️').setStyle(investigation.watched ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Secondary));");
block = block.replace("if (intelligenceButtons.length) components.push(new Discord.ActionRowBuilder().addComponents(...intelligenceButtons));\n  return { scanId, cases, suspects, history, crossGuild, investigation, persistentLinks, risk, access, embed, components };", "if (intelligenceButtons.length) components.push(new Discord.ActionRowBuilder().addComponents(...intelligenceButtons));\n  const navButtons = [new Discord.ButtonBuilder().setCustomId(`mod_dashboard:${target.id}:intelligence`).setLabel('⬅️ Back').setStyle(Discord.ButtonStyle.Secondary)];\n  if (access.cases) navButtons.push(new Discord.ButtonBuilder().setCustomId(`mod_export_cases:${target.id}`).setLabel('📤 Export').setStyle(Discord.ButtonStyle.Secondary));\n  components.push(new Discord.ActionRowBuilder().addComponents(...navButtons));\n  return { scanId, cases, suspects, history, crossGuild, investigation, persistentLinks, risk, access, embed, components };");

if (!block.includes("setLabel('⬅️ Back')") || block.includes("setLabel('Case Detail')") || block.includes("setLabel('Cases')")) throw new Error('Member scan navigation patch did not apply cleanly');
src = src.slice(0, start) + block + src.slice(end);
fs.writeFileSync(path, src);
console.log('Patched member scan UI');
