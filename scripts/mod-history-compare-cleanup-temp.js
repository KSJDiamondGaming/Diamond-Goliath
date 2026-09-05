'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src/core/administration/mod/interactions.js');
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`${label} anchor not found`);
  source = source.replace(oldText, newText);
}

replaceOnce("    compare: canScanCapability(i, 'scan_compare'),\n", '', 'main scan compare capability');
replaceOnce("  if (access.compare) primaryButtons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_compare:${target.id}`).setLabel('Compare Member').setEmoji('⚖️').setStyle(Discord.ButtonStyle.Secondary));\n", '', 'main scan compare button');
replaceOnce("  if (canScanCapability(i, 'scan_compare')) buttons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_compare:${target.id}`).setLabel('Compare Account').setEmoji('🧬').setStyle(Discord.ButtonStyle.Secondary));\n", "  if (canScanCapability(i, 'scan_compare')) buttons.push(new Discord.ButtonBuilder().setCustomId(`mod_scan_history_compare:${target.id}`).setLabel('Compare Account').setEmoji('🧬').setStyle(Discord.ButtonStyle.Secondary));\n", 'history compare button');

const oldComparisonButtons = `  const buttons = [];
  if (canScanCapability(i, 'scan_run')) {
    buttons.push(new Discord.ButtonBuilder().setCustomId(\`mod_member_scan:\${primary.id}\`).setLabel(\`Scan \${primary.user.username}\`.slice(0, 80)).setStyle(Discord.ButtonStyle.Secondary));
    buttons.push(new Discord.ButtonBuilder().setCustomId(\`mod_member_scan:\${secondary.id}\`).setLabel(\`Scan \${secondary.user.username}\`.slice(0, 80)).setStyle(Discord.ButtonStyle.Secondary));
  }
  if (canScanCapability(i, 'scan_compare')) buttons.push(new Discord.ButtonBuilder().setCustomId(\`mod_scan_compare:\${primary.id}\`).setLabel('Compare Another').setEmoji('🧬').setStyle(Discord.ButtonStyle.Primary));
  return { correlation, embed, components: buttons.length ? [new Discord.ActionRowBuilder().addComponents(...buttons)] : [] };`;
const newComparisonButtons = `  const buttons = [
    new Discord.ButtonBuilder().setCustomId(\`mod_scan_history:\${primary.id}\`).setLabel('⬅️ Back to Scan History').setStyle(Discord.ButtonStyle.Secondary),
  ];
  return { correlation, embed, components: [new Discord.ActionRowBuilder().addComponents(...buttons)] };`;
replaceOnce(oldComparisonButtons, newComparisonButtons, 'comparison result navigation');

replaceOnce("  if (String(i.customId || '').startsWith('mod_scan_compare_select:')) {\n    const primaryId = String(i.customId).split(':')[1];\n", "  if (String(i.customId || '').startsWith('mod_scan_history_compare_select:')) {\n    const primaryId = String(i.customId).split(':')[1];\n", 'history compare select route');

const oldCompareHandler = `  if (id.startsWith('mod_scan_compare:')) {
    const primaryId = id.split(':')[1];
    const allowed = await ensureScanCapability(i, 'scan_compare', '❌ You do not have permission to compare member intelligence.');
    if (!allowed) return true;
    const select = new Discord.UserSelectMenuBuilder().setCustomId(\`mod_scan_compare_select:\${primaryId}\`).setPlaceholder('🧬 Select another member to compare').setMinValues(1).setMaxValues(1);
    return safeUpdate(i, { content: \`🧬 **Compare Accounts** — select another server member to compare against <@\${primaryId}>.\`, embeds: [], components: [new Discord.ActionRowBuilder().addComponents(select)] });
  }
`;
const newCompareHandler = `  if (id.startsWith('mod_scan_history_compare:')) {
    const primaryId = id.split(':')[1];
    const allowed = await ensureScanCapability(i, 'scan_compare', '❌ You do not have permission to compare member intelligence.');
    if (!allowed) return true;
    const select = new Discord.UserSelectMenuBuilder().setCustomId(\`mod_scan_history_compare_select:\${primaryId}\`).setPlaceholder('🧬 Select another member to compare').setMinValues(1).setMaxValues(1);
    const back = new Discord.ButtonBuilder().setCustomId(\`mod_scan_history:\${primaryId}\`).setLabel('⬅️ Back to Scan History').setStyle(Discord.ButtonStyle.Secondary);
    return safeUpdate(i, {
      content: \`🧬 **Compare Accounts** — select another server member to compare against <@\${primaryId}>.\`,
      embeds: [],
      components: [new Discord.ActionRowBuilder().addComponents(select), new Discord.ActionRowBuilder().addComponents(back)],
    });
  }
`;
replaceOnce(oldCompareHandler, newCompareHandler, 'history compare handler');

fs.writeFileSync(file, source);
console.log('✅ Scan History compare cleanup applied');
