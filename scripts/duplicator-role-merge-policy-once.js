'use strict';
const fs = require('node:fs');

const path = 'src/owner/dev/duplicator/core.js';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error('Anchor not found: ' + label);
  source = source.replace(oldText, newText);
}

replaceOnce(
"function existingRole(guild, name) { return guild.roles.cache.find((r) => !r.managed && r.id !== guild.id && r.name.toLowerCase() === String(name).toLowerCase()); }",
"function sameNameRoles(guild, name) { return [...guild.roles.cache.values()].filter((r) => !r.managed && r.id !== guild.id && r.name.toLowerCase() === String(name).toLowerCase()); }\nfunction existingRole(guild, name) { const matches = sameNameRoles(guild, name); return matches.length === 1 ? matches[0] : null; }",
'existingRole deterministic lookup');

replaceOnce(
"    const sameName = [...guild.roles.cache.values()].filter((role) => !role.managed && role.id !== guild.id && role.name.toLowerCase() === String(sourceRole.name || '').toLowerCase());\n    if (conflictMode === 'skip' && sameName.length > 1) issues.push('Role mapping is ambiguous for ' + sourceRole.name + ': ' + sameName.length + ' destination roles have that name.');\n    const found = sameName.length === 1 ? sameName[0] : null;\n    if (found && conflictMode === 'skip' && found.permissions.bitfield !== BigInt(sourceRole.permissions || 0) && (!found.editable || found.position >= botHighest)) issues.push('Existing role ' + found.name + ' has different base permissions and is not editable below Goliath.');",
"    const sameName = sameNameRoles(guild, sourceRole.name);\n    if (conflictMode === 'skip' && sameName.length > 1) issues.push('Role ' + sourceRole.name + ' has ' + sameName.length + ' same-name destination roles. Goliath refuses to guess or create another duplicate; resolve the duplicate roles first.');\n    const found = sameName.length === 1 ? sameName[0] : null;\n    if (found && conflictMode === 'skip' && found.permissions.bitfield !== BigInt(sourceRole.permissions || 0) && (!found.editable || found.position >= botHighest)) issues.push('Role ' + found.name + ' already exists but cannot be safely merged because it is at/above Goliath or otherwise not editable. Goliath refuses to create a duplicate role; move Goliath above it or align the existing role manually.');",
'preflight merge-or-refuse');

replaceOnce(
"      if (found && conflictMode === 'skip') {\n        let verified = await guild.roles.fetch(found.id).catch(() => found);\n        if (verified.permissions.bitfield !== requested) {",
"      if (found && conflictMode === 'skip') {\n        let verified = await guild.roles.fetch(found.id).catch(() => found);\n        const originalPosition = verified.position;\n        const neededMerge = verified.permissions.bitfield !== requested;\n        if (neededMerge) {",
'apply role merge setup');

replaceOnce(
"        maps.roles.set(role.id, verified.id); log.skipped.push('Role exists/reused with all permission bits Goliath can safely apply: ' + role.name); continue;",
"        maps.roles.set(role.id, verified.id);\n        if (neededMerge) log.notes.push('Merged source role into existing destination role without creating a duplicate: ' + role.name + '. Destination hierarchy position preserved at ' + originalPosition + '.');\n        else log.skipped.push('Role exists and already matches exactly; reused without duplication: ' + role.name);\n        continue;",
'apply role merge note');

replaceOnce(
"    const sameName = [...guild.roles.cache.values()].filter((role) => !role.managed && role.id !== guild.id && role.name.toLowerCase() === String(normalSource.name || '').toLowerCase());\n    if (sameName.length > 1 && conflictMode === 'skip') { issues.push('Permission role mapping is ambiguous for ' + normalSource.name + '.'); continue; }\n    const target = sameName.length === 1 ? sameName[0] : null;\n    if (target && target.position >= botHighest) issues.push('Permission role ' + target.name + ' is at/above Goliath and cannot be edited in channel overwrites.');",
"    const sameName = sameNameRoles(guild, normalSource.name);\n    if (sameName.length > 1 && conflictMode === 'skip') { issues.push('Permission role ' + normalSource.name + ' has multiple same-name destination roles. Goliath refuses to guess or add another duplicate.'); continue; }\n    const target = sameName.length === 1 ? sameName[0] : null;\n    if (target && target.position >= botHighest) issues.push('Permission role ' + target.name + ' is at/above Goliath. Exact overwrite reproduction is impossible while preserving hierarchy, so Goliath refuses the transfer instead of duplicating or moving the role.');",
'permission role hierarchy refusal');

replaceOnce(
"      else if (target.position >= botHighest) issues.push('Permission role ' + target.name + ' is at/above Goliath and Discord will reject that overwrite. Add/map a lower Goliath operator role or move Goliath above it.');",
"      else if (target.position >= botHighest) issues.push('Managed/operator permission role ' + target.name + ' is at/above Goliath. Exact overwrite reproduction is impossible while preserving hierarchy, so Goliath refuses the transfer instead of duplicating or moving the role.');",
'managed hierarchy refusal');

fs.writeFileSync(path, source);

const testPath = 'test/verification/duplicatorRoleMergePolicy.test.js';
const test = `'use strict';\nconst test = require('node:test');\nconst assert = require('node:assert/strict');\nconst fs = require('node:fs');\n\nconst source = fs.readFileSync('src/owner/dev/duplicator/core.js', 'utf8');\n\ntest('same-name role policy is merge-or-refuse and never duplicate-by-default', () => {\n  assert.match(source, /function sameNameRoles\\(/);\n  assert.match(source, /refuses to guess or create another duplicate/);\n  assert.match(source, /Merged source role into existing destination role without creating a duplicate/);\n  assert.match(source, /already matches exactly; reused without duplication/);\n});\n\ntest('protected hierarchy conflicts refuse instead of moving or duplicating roles', () => {\n  assert.match(source, /Exact overwrite reproduction is impossible while preserving hierarchy/);\n  assert.match(source, /refuses the transfer instead of duplicating or moving the role/);\n});\n\ntest('existingRole only resolves a unique same-name role', () => {\n  assert.match(source, /function existingRole\\(guild, name\\) \\{ const matches = sameNameRoles\\(guild, name\\); return matches.length === 1 \\? matches\\[0\\] : null; \\}/);\n});\n`;
fs.writeFileSync(testPath, test);
console.log('Duplicator role merge-or-refuse policy applied.');
