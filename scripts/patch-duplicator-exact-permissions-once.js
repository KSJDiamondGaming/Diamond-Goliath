'use strict';

const fs = require('node:fs');
const path = 'src/owner/dev/duplicatorV2.js';
let source = fs.readFileSync(path, 'utf8');

function replaceBetween(startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Missing end marker: ${endMarker}`);
  source = source.slice(0, start) + replacement + '\n' + source.slice(end);
}

replaceBetween(
  'function safeRolePermissions(',
  'async function clearDestination(',
`function permissionNamesFromBits(value) {
  try { return new PermissionsBitField(BigInt(value || 0)).toArray(); }
  catch { return []; }
}
function permissionGapNames(guild, value) {
  return permissionNamesFromBits(value).filter((name) => {
    const bit = PermissionFlagsBits[name];
    return bit && !guild.members.me?.permissions?.has(bit);
  });
}
function exactPermissionPreflight(guild, snap) {
  const missing = new Set();
  for (const role of snap.roles || []) for (const name of permissionGapNames(guild, role.permissions)) missing.add(name);
  for (const channel of snap.channels || []) {
    for (const overwrite of channel.permissionOverwrites || []) {
      for (const name of permissionGapNames(guild, overwrite.allow)) missing.add(name);
      for (const name of permissionGapNames(guild, overwrite.deny)) missing.add(name);
    }
  }
  return [...missing].sort();
}
function exactRolePermissions(raw) { return new PermissionsBitField(BigInt(raw || 0)); }`
);

replaceBetween(
  'async function applyRoles(',
  'function channelPayload(',
`async function applyRoles(guild, snap, maps, log, conflictMode) {
  const names = new Set(guild.roles.cache.map((r) => r.name.toLowerCase()));
  const botHighest = guild.members.me?.roles?.highest?.position ?? 0;
  for (const role of [...(snap.roles || [])].sort((a, b) => a.position - b.position)) {
    try {
      const found = existingRole(guild, role.name);
      if (found && conflictMode === 'skip') { maps.roles.set(role.id, found.id); log.skipped.push(\`Role exists: \${role.name}\`); continue; }
      if (found && conflictMode === 'replace') {
        if (found.editable && found.position < botHighest) { await found.delete('Goliath duplicator: replace role'); log.deleted.roles += 1; }
        else { maps.roles.set(role.id, found.id); log.skipped.push(\`Role not editable due to Discord hierarchy: \${role.name}\`); continue; }
      }
      const name = found && conflictMode === 'rename' ? uniqueName(names, role.name, 100) : role.name;
      const requestedPermissions = exactRolePermissions(role.permissions);
      let created;
      try {
        created = await guild.roles.create({ name, color: Number(role.color || 0), hoist: Boolean(role.hoist), mentionable: Boolean(role.mentionable), permissions: requestedPermissions, reason: 'Goliath duplicator: exact role copy' });
      } catch (error) {
        if (Number(error?.code) !== 50013) throw error;
        created = await guild.roles.create({ name, color: Number(role.color || 0), hoist: Boolean(role.hoist), mentionable: Boolean(role.mentionable), permissions: 0n, reason: 'Goliath duplicator: exact role copy staging' });
        try {
          await created.setPermissions(requestedPermissions, 'Goliath duplicator: restore exact role permissions');
        } catch (setError) {
          await created.delete('Goliath duplicator: remove incomplete role').catch(() => null);
          const missing = permissionGapNames(guild, role.permissions);
          throw new Error(\`Exact role permission copy rejected for \${role.name}\${missing.length ? \`; Goliath lacks: \${missing.join(', ')}\` : \`: \${setError.message}\`}\`);
        }
      }
      let verified = await guild.roles.fetch(created.id).catch(() => null);
      if (!verified || verified.guild.id !== guild.id) throw new Error(\`Role create verification failed for \${role.name}\`);
      if (verified.permissions.bitfield !== requestedPermissions.bitfield) {
        await verified.setPermissions(requestedPermissions, 'Goliath duplicator: exact role permission verification repair');
        verified = await guild.roles.fetch(created.id).catch(() => null);
      }
      if (!verified || verified.permissions.bitfield !== requestedPermissions.bitfield) {
        await verified?.delete('Goliath duplicator: remove permission-mismatched role').catch(() => null);
        throw new Error(\`Role permission verification mismatch for \${role.name}\`);
      }
      maps.roles.set(role.id, verified.id);
      maps.createdRoles.add(verified.id);
      maps.rolePositions.set(verified.id, Number(role.position || 0));
      names.add(verified.name.toLowerCase());
    } catch (error) {
      pushError(log, \`Role \${role.name}\`, error);
      log.skipped.push(\`Role failed: \${role.name}\`);
    }
  }
  for (const [roleId, position] of maps.rolePositions.entries()) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    try { await role.setPosition(Math.min(Math.max(1, position), Math.max(1, botHighest - 1)), 'Goliath duplicator: role order'); }
    catch (error) { log.notes.push(\`Role order not fully restored for \${role.name}: \${error.message}\`); }
  }
}`
);

replaceBetween(
  'function sanitizedOverwriteBits(',
  'async function applyEmojis(',
`async function buildExactOverwrites(guild, snap, sourceChannel, maps, log) {
  const overwrites = [];
  const botHighest = guild.members.me?.roles?.highest?.position ?? 0;
  for (const overwrite of sourceChannel.permissionOverwrites || []) {
    const type = Number(overwrite.type);
    let mappedId = null;
    if (overwrite.id === snap.sourceGuild?.id) mappedId = guild.id;
    else if (type === 0) mappedId = maps.roles.get(overwrite.id);
    else if (type === 1) {
      const member = guild.members.cache.get(overwrite.id) || await guild.members.fetch(overwrite.id).catch(() => null);
      if (member) mappedId = member.id;
    }
    if (!mappedId) {
      log.notes.push(\`Permission target skipped on \${sourceChannel.name}: source target \${overwrite.id} is not present/mapped in destination.\`);
      continue;
    }
    if (type === 0 && mappedId !== guild.id) {
      const targetRole = guild.roles.cache.get(mappedId) || await guild.roles.fetch(mappedId).catch(() => null);
      if (!targetRole) throw new Error(\`Mapped permission role missing for \${sourceChannel.name}: \${mappedId}\`);
      if (targetRole.position >= botHighest) throw new Error(\`Cannot manage permission overwrite for role \${targetRole.name}; move Goliath above it.\`);
    }
    overwrites.push({ id: mappedId, type, allow: BigInt(overwrite.allow || 0), deny: BigInt(overwrite.deny || 0) });
  }
  return overwrites;
}
async function verifyExactOverwrites(channel, expected, sourceChannelName) {
  const refreshed = await channel.guild.channels.fetch(channel.id).catch(() => null);
  if (!refreshed) throw new Error(\`Permission verification failed for \${sourceChannelName}\`);
  let verifiedCount = 0;
  for (const item of expected) {
    const actual = refreshed.permissionOverwrites.cache.get(item.id);
    if (!actual) throw new Error(\`Permission overwrite missing after copy on \${sourceChannelName}: \${item.id}\`);
    if (actual.allow.bitfield !== BigInt(item.allow) || actual.deny.bitfield !== BigInt(item.deny)) {
      throw new Error(\`Permission overwrite mismatch after copy on \${sourceChannelName}: \${item.id}\`);
    }
    verifiedCount += 1;
  }
  return verifiedCount;
}
async function applyPermissions(guild, snap, maps, log) {
  for (const sourceChannel of snap.channels || []) {
    try {
      const targetId = maps.channels.get(sourceChannel.id);
      if (!targetId) continue;
      const channel = guild.channels.cache.get(targetId) || await guild.channels.fetch(targetId).catch(() => null);
      if (!channel?.permissionOverwrites?.set) continue;
      const overwrites = await buildExactOverwrites(guild, snap, sourceChannel, maps, log);
      try {
        await channel.permissionOverwrites.set(overwrites, 'Goliath duplicator: exact channel/category permissions');
      } catch (error) {
        const missing = new Set();
        for (const overwrite of sourceChannel.permissionOverwrites || []) {
          for (const name of permissionGapNames(guild, overwrite.allow)) missing.add(name);
          for (const name of permissionGapNames(guild, overwrite.deny)) missing.add(name);
        }
        const suffix = missing.size ? \`; Goliath lacks: \${[...missing].sort().join(', ')}\` : '';
        throw new Error(\`Exact permission overwrite copy rejected for \${sourceChannel.name}\${suffix}: \${error.message}\`);
      }
      log.copied.permissionOverwrites += await verifyExactOverwrites(channel, overwrites, sourceChannel.name);
    } catch (error) {
      pushError(log, \`Permissions \${sourceChannel.name}\`, error);
      log.skipped.push(\`Permissions failed: \${sourceChannel.name}\`);
    }
  }
}`
);

const needle = "  await fetchGuildState(guild); const log = runLog(session, snap); const missing = missingPermissions(guild); if (missing.length) log.errors.push(`Preflight missing permissions: ${missing.join(', ')}`); const hierarchy = hierarchyWarning(guild); if (hierarchy) log.errors.push(`Preflight hierarchy warning: ${hierarchy} Discord does not allow bots to bypass role hierarchy.`); for (const [key, item] of Object.entries(snap.future || {})) if (item?.requested && !item.supported) log.notes.push(`${COPY_OPTIONS[key] || key}: ${item.reason}`); if (session.dryRun) { applyDryRunPlan(log, dryRunPlan(guild, snap, session.conflictMode)); log.status = 'dry-run'; return log; }";
const replacement = "  await fetchGuildState(guild); const log = runLog(session, snap); const missing = missingPermissions(guild); if (missing.length) log.errors.push(`Preflight missing permissions: ${missing.join(', ')}`); const hierarchy = hierarchyWarning(guild); if (hierarchy) log.errors.push(`Preflight hierarchy warning: ${hierarchy} Discord does not allow bots to bypass role hierarchy.`); const exactGaps = exactPermissionPreflight(guild, snap); if (exactGaps.length) log.errors.push(`Full-fidelity permission copy blocked: Goliath lacks source permissions: ${exactGaps.join(', ')}. Grant Goliath Administrator (recommended for Duplicator) or every listed permission before running the real copy.`); for (const [key, item] of Object.entries(snap.future || {})) if (item?.requested && !item.supported) log.notes.push(`${COPY_OPTIONS[key] || key}: ${item.reason}`); if (session.dryRun) { applyDryRunPlan(log, dryRunPlan(guild, snap, session.conflictMode)); log.status = 'dry-run'; return log; } if (exactGaps.length) { log.status = 'blocked-permissions'; return log; }";
if (!source.includes(needle)) throw new Error('Could not find executeSnapshotOnGuild preflight block');
source = source.replace(needle, replacement);

fs.writeFileSync(path, source);
console.log('Exact role/channel permission copy patch applied.');
