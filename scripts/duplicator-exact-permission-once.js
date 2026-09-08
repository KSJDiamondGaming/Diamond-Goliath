'use strict';

const fs = require('node:fs');

function replaceOnce(path, oldText, newText, label) {
  let source = fs.readFileSync(path, 'utf8');
  if (!source.includes(oldText)) throw new Error(`Anchor not found (${label}) in ${path}`);
  source = source.replace(oldText, newText);
  fs.writeFileSync(path, source);
}

const corePath = 'src/owner/dev/duplicator/core.js';

replaceOnce(corePath,
`      const sourceRequested = BigInt(role.permissions || 0);
      const found = existingRole(guild, role.name);
      const missing = permissionGapNames(guild, sourceRequested);
      if (missing.length) addDeferred(log, { scope: 'role', sourceId: role.id, targetId: found?.id || null, kind: 'base', missing });
      const requested = copyablePermissionBits(guild, sourceRequested);`,
`      const sourceRequested = BigInt(role.permissions || 0);
      const found = existingRole(guild, role.name);
      let requested = sourceRequested;
      const deferRoleFallback = () => {
        const missing = permissionGapNames(guild, sourceRequested);
        if (missing.length) addDeferred(log, { scope: 'role', sourceId: role.id, targetId: found?.id || staged?.id || null, kind: 'base', missing });
        requested = copyablePermissionBits(guild, sourceRequested);
        return requested;
      };`,
'roles exact-first setup');

replaceOnce(corePath,
`          await verified.setPermissions(requested, 'Goliath duplicator: exact role permission repair');
          verified = await guild.roles.fetch(found.id).catch(() => null);`,
`          try {
            await verified.setPermissions(requested, 'Goliath duplicator: exact role permission repair');
          } catch (error) {
            if (Number(error?.code) !== 50013) throw error;
            deferRoleFallback();
            await verified.setPermissions(requested, 'Goliath duplicator: permission-safe role permission fallback');
          }
          verified = await guild.roles.fetch(found.id).catch(() => null);`,
'roles existing exact-first fallback');

replaceOnce(corePath,
`      try {
        staged = await guild.roles.create({ name, color: Number(role.color || 0), hoist: Boolean(role.hoist), mentionable: Boolean(role.mentionable), permissions: requested, reason: 'Goliath duplicator: permission-safe role copy' });
      } catch (error) {
        if (Number(error?.code) !== 50013) throw error;
        staged = await guild.roles.create({ name, color: Number(role.color || 0), hoist: Boolean(role.hoist), mentionable: Boolean(role.mentionable), permissions: 0n, reason: 'Goliath duplicator: stage role before transferable permissions' });
        try { await staged.setPermissions(requested, 'Goliath duplicator: apply transferable staged role permissions'); } catch (setError) { await staged.delete('Goliath duplicator: remove incomplete staged role').catch(() => null); staged = null; throw setError; }
      }`,
`      try {
        staged = await guild.roles.create({ name, color: Number(role.color || 0), hoist: Boolean(role.hoist), mentionable: Boolean(role.mentionable), permissions: requested, reason: 'Goliath duplicator: exact role copy' });
      } catch (error) {
        if (Number(error?.code) !== 50013) throw error;
        deferRoleFallback();
        staged = await guild.roles.create({ name, color: Number(role.color || 0), hoist: Boolean(role.hoist), mentionable: Boolean(role.mentionable), permissions: 0n, reason: 'Goliath duplicator: stage role before permission-safe fallback' });
        try { await staged.setPermissions(requested, 'Goliath duplicator: apply permission-safe role fallback'); } catch (setError) { await staged.delete('Goliath duplicator: remove incomplete staged role').catch(() => null); staged = null; throw setError; }
      }`,
'roles create exact-first fallback');

replaceOnce(corePath,
`async function buildExactOverwrites(guild, snap, sourceChannel, maps, log) {`,
`async function buildExactOverwrites(guild, snap, sourceChannel, maps, log, permissionSafeFallback = false) {`,
'overwrite builder mode');

replaceOnce(corePath,
`    const allowMissing = permissionGapNames(guild, overwrite.allow);
    const denyMissing = permissionGapNames(guild, overwrite.deny);
    if (allowMissing.length) addDeferred(log, { scope: 'overwrite', sourceId: sourceChannel.id, targetId: overwrite.id, kind: 'allow', missing: allowMissing });
    if (denyMissing.length) addDeferred(log, { scope: 'overwrite', sourceId: sourceChannel.id, targetId: overwrite.id, kind: 'deny', missing: denyMissing });
    overwrites.push({
      id: mappedId,
      type,
      allow: copyablePermissionBits(guild, overwrite.allow),
      deny: copyablePermissionBits(guild, overwrite.deny),
    });`,
`    if (permissionSafeFallback) {
      const allowMissing = permissionGapNames(guild, overwrite.allow);
      const denyMissing = permissionGapNames(guild, overwrite.deny);
      if (allowMissing.length) addDeferred(log, { scope: 'overwrite', sourceId: sourceChannel.id, targetId: overwrite.id, kind: 'allow', missing: allowMissing });
      if (denyMissing.length) addDeferred(log, { scope: 'overwrite', sourceId: sourceChannel.id, targetId: overwrite.id, kind: 'deny', missing: denyMissing });
    }
    overwrites.push({
      id: mappedId,
      type,
      allow: permissionSafeFallback ? copyablePermissionBits(guild, overwrite.allow) : BigInt(overwrite.allow || 0),
      deny: permissionSafeFallback ? copyablePermissionBits(guild, overwrite.deny) : BigInt(overwrite.deny || 0),
    });`,
'overwrite exact-first bits');

replaceOnce(corePath,
`      const overwrites = await buildExactOverwrites(guild, snap, sourceChannel, maps, log);
      await channel.permissionOverwrites.set(overwrites, 'Goliath duplicator: permission-safe channel/category permissions');
      log.copied.permissionOverwrites += await verifyOverwrites(channel, overwrites, sourceChannel.name);`,
`      let overwrites = await buildExactOverwrites(guild, snap, sourceChannel, maps, log, false);
      try {
        await channel.permissionOverwrites.set(overwrites, 'Goliath duplicator: exact channel/category permissions');
      } catch (error) {
        if (Number(error?.code) !== 50013) throw error;
        overwrites = await buildExactOverwrites(guild, snap, sourceChannel, maps, log, true);
        await channel.permissionOverwrites.set(overwrites, 'Goliath duplicator: permission-safe channel/category fallback');
        log.notes.push('Discord rejected one or more exact overwrite permission bits on ' + sourceChannel.name + '; only those rejected capabilities were deferred.');
      }
      log.copied.permissionOverwrites += await verifyOverwrites(channel, overwrites, sourceChannel.name);`,
'overwrite exact-first apply');

replaceOnce(corePath,
`  const log = runLog(session, snap);
  recordCapabilityDeferrals(guild, snap, log);
  const capabilityGaps = transferCapabilityGaps(guild, snap);
  if (capabilityGaps.length) log.notes.push('Destination capability gap: deferred permission bits ' + capabilityGaps.join(', ') + ' instead of blocking the whole transfer.');
  const preflightIssues = await exactPermissionPreflight(guild, snap, session.conflictMode);`,
`  const log = runLog(session, snap);
  const capabilityGaps = transferCapabilityGaps(guild, snap);
  if (capabilityGaps.length) log.notes.push('Potential destination capability gaps: ' + capabilityGaps.join(', ') + '. Goliath will attempt the exact copy first and defer a bit only if Discord rejects it.');
  const preflightIssues = await exactPermissionPreflight(guild, snap, session.conflictMode);`,
'no eager deferrals');

const core = fs.readFileSync(corePath, 'utf8');
if (core.includes('recordCapabilityDeferrals(guild, snap, log);')) throw new Error('Eager capability deferrals are still active.');
if (!core.includes("permissionSafeFallback ? copyablePermissionBits(guild, overwrite.allow) : BigInt(overwrite.allow || 0)")) throw new Error('Exact-first overwrite path missing.');
if (!core.includes("await channel.permissionOverwrites.set(overwrites, 'Goliath duplicator: exact channel/category permissions')")) throw new Error('Exact overwrite attempt missing.');
if (!core.includes('if (Number(error?.code) !== 50013) throw error;')) throw new Error('Discord 50013 fallback missing.');
if (!core.includes('let requested = sourceRequested;')) throw new Error('Exact-first role path missing.');

console.log('Duplicator exact-first permission repair applied.');
