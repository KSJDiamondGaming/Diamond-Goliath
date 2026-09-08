'use strict';

const fs = require('node:fs');

function patchFile(path, edits) {
  let source = fs.readFileSync(path, 'utf8');
  for (const [label, oldText, newText] of edits) {
    if (!source.includes(oldText)) throw new Error(`Anchor not found in ${path}: ${label}`);
    source = source.replace(oldText, newText);
  }
  fs.writeFileSync(path, source);
}

patchFile('src/owner/dev/duplicator/core.js', [
  [
    'permission-safe bit helpers',
    "function permissionGapNames(guild, value) { return permissionNamesFromBits(value).filter((name) => { const bit = PermissionFlagsBits[name]; return bit && !hasBotPermission(guild, bit); }); }\nfunction namesForBits(bits) { try { return new PermissionsBitField(BigInt(bits || 0)).toArray(); } catch { return []; } }",
    "function permissionGapNames(guild, value) { return permissionNamesFromBits(value).filter((name) => { const bit = PermissionFlagsBits[name]; return bit && !hasBotPermission(guild, bit); }); }\nfunction copyablePermissionBits(guild, value) {\n  let bits = 0n;\n  for (const name of permissionNamesFromBits(value)) {\n    const bit = PermissionFlagsBits[name];\n    if (bit && hasBotPermission(guild, bit)) bits |= bit;\n  }\n  return bits;\n}\nfunction namesForBits(bits) { try { return new PermissionsBitField(BigInt(bits || 0)).toArray(); } catch { return []; } }"
  ],
  [
    'record capability deferrals',
    "function transferCapabilityGaps(guild, snap) {\n  const missing = new Set();\n  for (const role of snap.roles || []) for (const name of permissionGapNames(guild, role.permissions)) missing.add(name);\n  for (const channel of snap.channels || []) for (const overwrite of channel.permissionOverwrites || []) {\n    for (const name of permissionGapNames(guild, overwrite.allow)) missing.add(name);\n    for (const name of permissionGapNames(guild, overwrite.deny)) missing.add(name);\n  }\n  return [...missing].sort();\n}",
    "function transferCapabilityGaps(guild, snap) {\n  const missing = new Set();\n  for (const role of snap.roles || []) for (const name of permissionGapNames(guild, role.permissions)) missing.add(name);\n  for (const channel of snap.channels || []) for (const overwrite of channel.permissionOverwrites || []) {\n    for (const name of permissionGapNames(guild, overwrite.allow)) missing.add(name);\n    for (const name of permissionGapNames(guild, overwrite.deny)) missing.add(name);\n  }\n  return [...missing].sort();\n}\nfunction recordCapabilityDeferrals(guild, snap, log) {\n  for (const role of snap.roles || []) {\n    const missing = permissionGapNames(guild, role.permissions);\n    if (missing.length) addDeferred(log, { scope: 'role', sourceId: role.id, kind: 'base', missing });\n  }\n  for (const channel of snap.channels || []) {\n    for (const overwrite of channel.permissionOverwrites || []) {\n      const allowMissing = permissionGapNames(guild, overwrite.allow);\n      const denyMissing = permissionGapNames(guild, overwrite.deny);\n      if (allowMissing.length) addDeferred(log, { scope: 'overwrite', sourceId: channel.id, targetId: overwrite.id, kind: 'allow', missing: allowMissing });\n      if (denyMissing.length) addDeferred(log, { scope: 'overwrite', sourceId: channel.id, targetId: overwrite.id, kind: 'deny', missing: denyMissing });\n    }\n  }\n}"
  ],
  [
    'capability gaps no longer hard-block',
    "  const capabilityGaps = transferCapabilityGaps(guild, snap);\n  if (capabilityGaps.length) issues.push('Goliath cannot reproduce source permission bits exactly: ' + capabilityGaps.join(', '));\n",
    ""
  ],
  [
    'mask role permissions safely',
    "      const requested = BigInt(role.permissions || 0);\n      const found = existingRole(guild, role.name);",
    "      const sourceRequested = BigInt(role.permissions || 0);\n      const found = existingRole(guild, role.name);\n      const missing = permissionGapNames(guild, sourceRequested);\n      if (missing.length) addDeferred(log, { scope: 'role', sourceId: role.id, targetId: found?.id || null, kind: 'base', missing });\n      const requested = copyablePermissionBits(guild, sourceRequested);"
  ],
  [
    'role reuse wording',
    "        maps.roles.set(role.id, verified.id); log.skipped.push('Role exists/reused with exact permissions: ' + role.name); continue;",
    "        maps.roles.set(role.id, verified.id); log.skipped.push('Role exists/reused with all permission bits Goliath can safely apply: ' + role.name); continue;"
  ],
  [
    'role create wording',
    "permissions: requested, reason: 'Goliath duplicator: exact role copy'",
    "permissions: requested, reason: 'Goliath duplicator: permission-safe role copy'"
  ],
  [
    'staged role wording',
    "reason: 'Goliath duplicator: stage role before exact permissions'",
    "reason: 'Goliath duplicator: stage role before transferable permissions'"
  ],
  [
    'staged role permissions wording',
    "'Goliath duplicator: apply exact staged role permissions'",
    "'Goliath duplicator: apply transferable staged role permissions'"
  ],
  [
    'verification repair wording',
    "'Goliath duplicator: exact permission verification repair'",
    "'Goliath duplicator: transferable permission verification repair'"
  ],
  [
    'permission-safe overwrite builder',
    "async function buildExactOverwrites(guild, snap, sourceChannel, maps) {",
    "async function buildExactOverwrites(guild, snap, sourceChannel, maps, log) {"
  ],
  [
    'mask overwrite bits and defer missing',
    "    overwrites.push({ id: mappedId, type, allow: BigInt(overwrite.allow || 0), deny: BigInt(overwrite.deny || 0) });",
    "    const allowMissing = permissionGapNames(guild, overwrite.allow);\n    const denyMissing = permissionGapNames(guild, overwrite.deny);\n    if (allowMissing.length) addDeferred(log, { scope: 'overwrite', sourceId: sourceChannel.id, targetId: overwrite.id, kind: 'allow', missing: allowMissing });\n    if (denyMissing.length) addDeferred(log, { scope: 'overwrite', sourceId: sourceChannel.id, targetId: overwrite.id, kind: 'deny', missing: denyMissing });\n    overwrites.push({\n      id: mappedId,\n      type,\n      allow: copyablePermissionBits(guild, overwrite.allow),\n      deny: copyablePermissionBits(guild, overwrite.deny),\n    });"
  ],
  [
    'pass log to overwrite builder',
    "      const overwrites = await buildExactOverwrites(guild, snap, sourceChannel, maps);",
    "      const overwrites = await buildExactOverwrites(guild, snap, sourceChannel, maps, log);"
  ],
  [
    'permission apply wording',
    "'Goliath duplicator: exact channel/category permissions'",
    "'Goliath duplicator: permission-safe channel/category permissions'"
  ],
  [
    'record deferrals before preflight',
    "  const log = runLog(session, snap);\n  const preflightIssues = await exactPermissionPreflight(guild, snap, session.conflictMode);",
    "  const log = runLog(session, snap);\n  recordCapabilityDeferrals(guild, snap, log);\n  const capabilityGaps = transferCapabilityGaps(guild, snap);\n  if (capabilityGaps.length) log.notes.push('Destination capability gap: deferred permission bits ' + capabilityGaps.join(', ') + ' instead of blocking the whole transfer.');\n  const preflightIssues = await exactPermissionPreflight(guild, snap, session.conflictMode);"
  ],
  [
    'partial status when permissions deferred',
    "  if (log.errors.length) log.status = log.copied.categories + log.copied.channels + log.copied.roles + log.copied.permissionOverwrites > 0 ? 'partial' : 'failed'; else log.status = 'success';",
    "  if (log.errors.length) log.status = log.copied.categories + log.copied.channels + log.copied.roles + log.copied.permissionOverwrites > 0 ? 'partial' : 'failed';\n  else if (log.deferredPermissions.length) log.status = 'partial';\n  else log.status = 'success';"
  ],
  [
    'copy panel permission-safe wording',
    "Exact-copy preflight blocks the transfer before mutation when required role/channel permissions cannot be reproduced safely.",
    "Safety preflight blocks only structural/operation failures. Permission bits Goliath cannot grant on the destination are deferred, the rest of the transfer continues, and every deferred bit is recorded."
  ],
]);

patchFile('src/owner/dev/duplicator/selective.js', [
  [
    'confirm copy deferred wording',
    "      '', 'Missing permission roles are created before channel/category overwrites are applied.',",
    "      '', 'Missing permission roles are created before channel/category overwrites are applied.',\n      'If the destination Goliath instance cannot grant a source permission bit, that bit is deferred and recorded instead of blocking the entire copy.',"
  ],
  [
    'persist deferred permissions in manifest',
    "    warnings: response.log?.errors || [], notes: response.log?.notes || [],",
    "    warnings: response.log?.errors || [], notes: response.log?.notes || [],\n    deferredPermissions: response.log?.deferredPermissions || [],"
  ],
  [
    'result payload deferred summary',
    "  const verification = response.log?.verification || {};\n  const title = ok ? '✅ Selective Copy Verified' : failed ? (status === 'blocked-preflight' ? '🛑 Selective Copy Blocked' : '❌ Selective Copy Failed') : '⚠️ Selective Copy Partial';",
    "  const verification = response.log?.verification || {};\n  const deferredNames = [...new Set((response.log?.deferredPermissions || []).flatMap((item) => item.missing || []))].sort();\n  const title = ok ? '✅ Selective Copy Verified' : failed ? (status === 'blocked-preflight' ? '🛑 Selective Copy Blocked' : '❌ Selective Copy Failed') : '⚠️ Selective Copy Partial';"
  ],
  [
    'result payload engine verification deferred count',
    "      verification.structureExpected != null ? 'Engine verification: Structure ' + (verification.structureMapped || 0) + '/' + verification.structureExpected + ' • Permissions ' + (verification.permissionOverwritesVerified || 0) + '/' + (verification.permissionOverwritesExpected || 0) + ' • Roles ' + (verification.roleMappingsVerified || 0) + '/' + (verification.roleMappingsExpected || 0) : null,",
    "      verification.structureExpected != null ? 'Engine verification: Structure ' + (verification.structureMapped || 0) + '/' + verification.structureExpected + ' • Permissions ' + (verification.permissionOverwritesVerified || 0) + '/' + (verification.permissionOverwritesExpected || 0) + ' • Roles ' + (verification.roleMappingsVerified || 0) + '/' + (verification.roleMappingsExpected || 0) + ' • Deferred ' + (verification.deferredPermissions || 0) : null,\n      deferredNames.length ? 'Deferred permission bits: **' + deferredNames.join(', ') + '**' : null,"
  ],
]);

const core = fs.readFileSync('src/owner/dev/duplicator/core.js', 'utf8');
const selective = fs.readFileSync('src/owner/dev/duplicator/selective.js', 'utf8');
if (core.includes("issues.push('Goliath cannot reproduce source permission bits exactly:")) throw new Error('Capability gap hard-block still present.');
if (!core.includes('recordCapabilityDeferrals(guild, snap, log);')) throw new Error('Deferral recorder not installed.');
if (!core.includes('copyablePermissionBits(guild, overwrite.allow)')) throw new Error('Permission-safe overwrite masking not installed.');
if (!core.includes("else if (log.deferredPermissions.length) log.status = 'partial';")) throw new Error('Deferred partial status not installed.');
if (!selective.includes('deferredPermissions: response.log?.deferredPermissions || []')) throw new Error('Selective manifest deferrals not persisted.');
console.log('Duplicator permission-safe selective-copy repair applied.');
