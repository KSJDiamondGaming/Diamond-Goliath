'use strict';

const fs = require('fs');
const path = 'src/core/security/protection/quarantine.js';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`Anchor not found: ${label}`);
  source = source.replace(oldText, newText);
}

replaceOnce(`  const channels = await guild.channels.fetch().catch(() => guild.channels.cache);\n  let updated = 0;\n  let skipped = 0;\n  let failed = 0;\n  const failures = [];\n\n  for (const [, channel] of channels || []) {\n    if (!channel?.permissionOverwrites?.edit || channel.isThread?.()) continue;\n\n    // If the quarantine role already cannot view this channel, there is nothing`, `  const channels = await guild.channels.fetch().catch(() => guild.channels.cache);\n  let updated = 0;\n  let skipped = 0;\n  let failed = 0;\n  const failures = [];\n  const targetMemberId = options.targetMemberId ? String(options.targetMemberId) : null;\n\n  for (const [, channel] of channels || []) {\n    if (!channel?.permissionOverwrites?.edit || channel.isThread?.()) continue;\n\n    // A member-specific ViewChannel allow wins over a role-level deny in Discord's\n    // overwrite hierarchy. Refuse to claim guaranteed isolation if one exists.\n    // This check runs before the role-level skip so private channels cannot leak\n    // through a personal allow that would otherwise override the quarantine role.\n    if (targetMemberId) {\n      const memberOverwrite = channel.permissionOverwrites.cache?.get(targetMemberId);\n      if (memberOverwrite?.allow?.has(PermissionFlagsBits.ViewChannel)) {\n        failed += 1;\n        failures.push({\n          channelId: channel.id,\n          channelName: channel.name || null,\n          error: 'Target has an explicit member View Channel allow that overrides role quarantine isolation.',\n        });\n        continue;\n      }\n    }\n\n    // If the quarantine role already cannot view this channel, there is nothing`, 'target member overwrite guard');

const oldCall = `const isolation = await syncQuarantineIsolation(guild, { ...options, role });`;
const newCall = `const isolation = await syncQuarantineIsolation(guild, { ...options, role, targetMemberId: member.id });`;
const callCount = source.split(oldCall).length - 1;
if (callCount !== 2) throw new Error(`Expected 2 quarantine sync member calls, found ${callCount}.`);
source = source.split(oldCall).join(newCall);

fs.writeFileSync(path, source);

if (!source.includes('Target has an explicit member View Channel allow that overrides role quarantine isolation.')) {
  throw new Error('Target overwrite guard was not installed.');
}
if ((source.match(/targetMemberId: member\.id/g) || []).length !== 2) {
  throw new Error('Target member ID was not propagated to both quarantine enforcement paths.');
}
console.log('Quarantine target overwrite guard applied.');
