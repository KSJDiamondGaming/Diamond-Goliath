'use strict';
const fs = require('fs');
const path = 'src/core/administration/mod/quarantineInteractions.js';
let s = fs.readFileSync(path, 'utf8');
function replaceOnce(oldText, newText) {
  if (!s.includes(oldText)) throw new Error(`Patch anchor not found: ${oldText.slice(0, 80)}`);
  s = s.replace(oldText, newText);
}
replaceOnce(
  "const { safeReply } = require('../../../core/ui/interactionResponse');",
  "const { safeReply, safeEditReply } = require('../../../core/ui/interactionResponse');"
);
replaceOnce(
  "  const reason = fieldValue(interaction, 'reason');\n  if (!reason) return safeReply(interaction, { content: '❌ An investigation reason is required.', flags: 64 });\n\n  const result = await quarantineMember(interaction.guild, target, {",
  "  const reason = fieldValue(interaction, 'reason');\n  if (!reason) return safeReply(interaction, { content: '❌ An investigation reason is required.', flags: 64 });\n\n  // Isolation performs several Discord API writes and can exceed the 3-second modal deadline.\n  if (!interaction.deferred && !interaction.replied) {\n    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });\n  }\n\n  const result = await quarantineMember(interaction.guild, target, {"
);
replaceOnce(
  "    return safeReply(interaction, {\n      content: `❌ Failed to investigate **${target.user.tag}**: ${result?.error || result?.reason || 'Unknown error'}`,\n      flags: 64,\n    });",
  "    return safeEditReply(interaction, {\n      content: `❌ Failed to investigate **${target.user.tag}**: ${result?.error || result?.reason || 'Unknown error'}`,\n      flags: 64,\n    });"
);
replaceOnce(
  "  await safeReply(interaction, { content, flags: 64 });\n  await refreshDashboard(Discord, interaction, target, { view: 'actions' });",
  "  await safeEditReply(interaction, { content, flags: 64 });\n  await refreshDashboard(Discord, interaction, target, { view: 'actions' });"
);
fs.writeFileSync(path, s);
