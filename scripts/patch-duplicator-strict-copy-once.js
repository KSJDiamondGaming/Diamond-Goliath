'use strict';

const fs = require('node:fs');

function replaceRange(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${label}: start marker not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`${label}: end marker not found: ${endMarker}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

const corePath = 'src/owner/dev/duplicator/core.js';
let core = fs.readFileSync(corePath, 'utf8');

core = replaceRange(core, 'function botPermissionMask', 'function hierarchyWarning', `function namesForBits(bits) { try { return new PermissionsBitField(BigInt(bits || 0)).toArray(); } catch { return []; } }
function addDeferred(log, entry) {
  log.deferredPermissions ||= [];
  const key = \`${'${entry.scope}'}:${'${entry.sourceId || \'\'}'}:${'${entry.targetId || \'\'}'}:${'${entry.kind || \'\'}'}\`;
  const existing = log.deferredPermissions.find((item) => item.key === key);
  const missingNames = [...new Set(entry.missing || [])].sort();
  if (existing) existing.missing = [...new Set([...(existing.missing || []), ...missingNames])].sort();
  else log.deferredPermissions.push({ key, ...entry, missing: missingNames });
}
function requestedOperationPermissions(snap) {
  const required = [...BASE_REQUIRED_PERMISSIONS];
  const options = new Set(snap.options || []);
  if (options.has('serverSettings')) required.push(['ManageGuild', PermissionFlagsBits.ManageGuild]);
  if (options.has('emojis')) required.push(['ManageEmojisAndStickers', PermissionFlagsBits.ManageEmojisAndStickers]);
  return required;
}
function missingOperationPermissions(guild, snap) { return requestedOperationPermissions(snap).filter(([, bit]) => !hasBotPermission(guild, bit)).map(([name]) => name); }
function transferCapabilityGaps(guild, snap) {
  const missing = new Set();
  for (const role of snap.roles || []) for (const name of permissionGapNames(guild, role.permissions)) missing.add(name);
  for (const channel of snap.channels || []) for (const overwrite of channel.permissionOverwrites || []) {
    for (const name of permissionGapNames(guild, overwrite.allow)) missing.add(name);
    for (const name of permissionGapNames(guild, overwrite.deny)) missing.add(name);
  }
  return [...missing].sort();
}
function referencedPermissionRoleIds(snap) {
  const ids = new Set();
  for (const channel of snap.channels || []) for (const overwrite of channel.permissionOverwrites || []) {
    if (Number(overwrite.type) === 0 && overwrite.id !== snap.sourceGuild?.id) ids.add(String(overwrite.id));
  }
  return ids;
}
function referencedPermissionMemberIds(snap) {
  const ids = new Set();
  for (const channel of snap.channels || []) for (const overwrite of channel.permissionOverwrites || []) if (Number(overwrite.type) === 1) ids.add(String(overwrite.id));
  return ids;
}
function resolveManagedRoleTarget(guild, snap, sourceRole) {
  const destinationManaged = [...guild.roles.cache.values()].filter((role) => role.managed);
  const sourceBotId = sourceRole.tags?.botId || null;
  let target = null;
  if (sourceBotId && sourceBotId === snap.sourceGuild?.botUserId) target = destinationManaged.find((role) => role.tags?.botId === guild.client.user?.id) || null;
  if (!target && sourceBotId) target = destinationManaged.find((role) => role.tags?.botId === sourceBotId) || null;
  if (!target) {
    const sameName = destinationManaged.filter((role) => role.name.toLowerCase() === String(sourceRole.name || '').toLowerCase());
    if (sameName.length === 1) target = sameName[0];
  }
  return target;
}
async function exactPermissionPreflight(guild, snap, conflictMode) {
  const issues = [];
  const operationMissing = missingOperationPermissions(guild, snap);
  if (operationMissing.length) issues.push(\`Goliath is missing required operation permissions: ${'${operationMissing.join(\', \')}'}\`);

  const capabilityGaps = transferCapabilityGaps(guild, snap);
  if (capabilityGaps.length) issues.push(\`Goliath cannot reproduce source permission bits exactly: ${'${capabilityGaps.join(\', \')}'}\`);

  const roleRefs = referencedPermissionRoleIds(snap);
  const memberRefs = referencedPermissionMemberIds(snap);
  const sourceNormal = new Map((snap.roles || []).map((role) => [String(role.id), role]));
  const sourceManaged = new Map((snap.managedRoles || []).map((role) => [String(role.id), role]));
  const botHighest = guild.members.me?.roles?.highest?.position ?? 0;

  for (const sourceRole of snap.roles || []) {
    const sameName = [...guild.roles.cache.values()].filter((role) => !role.managed && role.id !== guild.id && role.name.toLowerCase() === String(sourceRole.name || '').toLowerCase());
    if (conflictMode === 'skip' && sameName.length > 1) issues.push(\`Role mapping is ambiguous for ${'${sourceRole.name}'}: ${'${sameName.length}'} destination roles have that name.\`);
    const found = sameName.length === 1 ? sameName[0] : null;
    if (found && conflictMode === 'skip' && found.permissions.bitfield !== BigInt(sourceRole.permissions || 0) && (!found.editable || found.position >= botHighest)) {
      issues.push(\`Existing role ${'${found.name}'} has different base permissions and is not editable below Goliath.\`);
    }
  }

  for (const sourceId of roleRefs) {
    const managedSource = sourceManaged.get(sourceId);
    if (managedSource) {
      const target = resolveManagedRoleTarget(guild, snap, managedSource);
      if (!target) issues.push(\`Managed permission role ${'${managedSource.name}'} has no matching bot/integration role in the destination.\`);
      else if (target.position >= botHighest) issues.push(\`Permission role ${'${target.name}'} is at/above Goliath. Move a Goliath operator role above it before copying.\`);
      continue;
    }
    const normalSource = sourceNormal.get(sourceId);
    if (!normalSource) { issues.push(\`Source permission role ${'${sourceId}'} is not present in the role snapshot.\`); continue; }
    const sameName = [...guild.roles.cache.values()].filter((role) => !role.managed && role.id !== guild.id && role.name.toLowerCase() === String(normalSource.name || '').toLowerCase());
    if (sameName.length > 1 && conflictMode === 'skip') { issues.push(\`Permission role mapping is ambiguous for ${'${normalSource.name}'}.\`); continue; }
    const target = sameName.length === 1 ? sameName[0] : null;
    if (target && target.position >= botHighest) issues.push(\`Permission role ${'${target.name}'} is at/above Goliath and cannot be edited in channel overwrites.\`);
  }

  for (const memberId of memberRefs) {
    const member = guild.members.cache.get(memberId) || await guild.members.fetch(memberId).catch(() => null);
    if (!member) issues.push(\`Member-specific permission target ${'${memberId}'} is not a member of the destination server.\`);
  }

  return [...new Set(issues)];
}
`, 'core permission helpers');

core = replaceRange(core, 'async function applyManagedRoleMappings', 'async function applyRoles', `async function applyManagedRoleMappings(guild, snap, maps, log) {
  for (const sourceRole of snap.managedRoles || []) {
    const target = resolveManagedRoleTarget(guild, snap, sourceRole);
    if (target) { maps.roles.set(sourceRole.id, target.id); log.notes.push(\`Managed role remapped: ${'${sourceRole.name}'} -> ${'${target.name}'}.\`); }
    else log.notes.push(\`Managed role not transferable: ${'${sourceRole.name}'}. Matching bot/integration is absent from destination.\`);
  }
}
`, 'managed role mapping');

core = replaceRange(core, 'async function applyRoles', 'function channelPayload', `async function applyRoles(guild, snap, maps, log, conflictMode) {
  const names = new Set(guild.roles.cache.map((r) => r.name.toLowerCase()));
  const botHighest = guild.members.me?.roles?.highest?.position ?? 0;
  if (!hasBotPermission(guild, PermissionFlagsBits.ManageRoles)) {
    log.errors.push('Cannot create/map normal roles: Goliath lacks ManageRoles.');
    return;
  }
  for (const role of [...(snap.roles || [])].sort((a, b) => a.position - b.position)) {
    let staged = null;
    try {
      const requested = BigInt(role.permissions || 0);
      const found = existingRole(guild, role.name);
      if (found && conflictMode === 'skip') {
        let verified = await guild.roles.fetch(found.id).catch(() => found);
        if (verified.permissions.bitfield !== requested) {
          if (!verified.editable || verified.position >= botHighest) throw new Error(\`Existing role ${'${role.name}'} cannot be repaired to exact permissions because it is at/above Goliath.\`);
          await verified.setPermissions(requested, 'Goliath duplicator: exact role permission repair');
          verified = await guild.roles.fetch(found.id).catch(() => null);
        }
        if (!verified || verified.permissions.bitfield !== requested) throw new Error(\`Existing role permission verification mismatch for ${'${role.name}'}\`);
        maps.roles.set(role.id, verified.id); log.skipped.push(\`Role exists/reused with exact permissions: ${'${role.name}'}\`); continue;
      }
      if (found && conflictMode === 'replace') {
        if (found.editable && found.position < botHighest) { await found.delete('Goliath duplicator: replace role'); log.deleted.roles += 1; }
        else throw new Error(\`Role ${'${role.name}'} cannot be replaced because it is not editable below Goliath.\`);
      }
      const name = found && conflictMode === 'rename' ? uniqueName(names, role.name, 100) : role.name;
      try {
        staged = await guild.roles.create({ name, color: Number(role.color || 0), hoist: Boolean(role.hoist), mentionable: Boolean(role.mentionable), permissions: requested, reason: 'Goliath duplicator: exact role copy' });
      } catch (error) {
        if (Number(error?.code) !== 50013) throw error;
        staged = await guild.roles.create({ name, color: Number(role.color || 0), hoist: Boolean(role.hoist), mentionable: Boolean(role.mentionable), permissions: 0n, reason: 'Goliath duplicator: stage role before exact permissions' });
        try { await staged.setPermissions(requested, 'Goliath duplicator: apply exact staged role permissions'); }
        catch (setError) { await staged.delete('Goliath duplicator: remove incomplete staged role').catch(() => null); staged = null; throw setError; }
      }
      let verified = staged ? await guild.roles.fetch(staged.id).catch(() => null) : null;
      if (!verified || verified.guild.id !== guild.id) throw new Error(\`Role create verification failed for ${'${role.name}'}\`);
      if (verified.permissions.bitfield !== requested) {
        await verified.setPermissions(requested, 'Goliath duplicator: exact permission verification repair');
        verified = await guild.roles.fetch(verified.id).catch(() => null);
      }
      if (!verified || verified.permissions.bitfield !== requested) {
        await verified?.delete('Goliath duplicator: remove role with mismatched permissions').catch(() => null);
        throw new Error(\`Role permission verification mismatch for ${'${role.name}'}\`);
      }
      maps.roles.set(role.id, verified.id);
      maps.createdRoles.add(verified.id);
      maps.rolePositions.set(verified.id, Number(role.position || 0));
      names.add(verified.name.toLowerCase());
    } catch (error) { pushError(log, \`Role ${'${role.name}'}\`, error); log.skipped.push(\`Role failed: ${'${role.name}'}\`); }
  }
  for (const [roleId, position] of maps.rolePositions.entries()) {
    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null); if (!role) continue;
    try { await role.setPosition(Math.min(Math.max(1, position), Math.max(1, botHighest - 1)), 'Goliath duplicator: role order'); }
    catch (error) { log.notes.push(\`Role order not fully restored for ${'${role.name}'}: ${'${error.message}'}\`); }
  }
}
`, 'exact role application');

core = replaceRange(core, 'async function buildTransferableOverwrites', 'async function applyEmojis', `async function buildExactOverwrites(guild, snap, sourceChannel, maps) {
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
    if (!mappedId) throw new Error(\`Permission target ${'${overwrite.id}'} on ${'${sourceChannel.name}'} is not mapped/present in the destination.\`);
    if (type === 0 && mappedId !== guild.id) {
      const targetRole = guild.roles.cache.get(mappedId) || await guild.roles.fetch(mappedId).catch(() => null);
      if (!targetRole) throw new Error(\`Permission role ${'${mappedId}'} on ${'${sourceChannel.name}'} is missing in the destination.\`);
      if (targetRole.position >= botHighest) throw new Error(\`Permission role ${'${targetRole.name}'} on ${'${sourceChannel.name}'} is at/above Goliath hierarchy.\`);
    }
    overwrites.push({ id: mappedId, type, allow: BigInt(overwrite.allow || 0), deny: BigInt(overwrite.deny || 0) });
  }
  return overwrites;
}
async function verifyOverwrites(channel, expected, sourceChannelName) {
  const refreshed = await channel.guild.channels.fetch(channel.id).catch(() => null);
  if (!refreshed) throw new Error(\`Permission verification failed for ${'${sourceChannelName}'}\`);
  const expectedIds = new Set(expected.map((item) => String(item.id)));
  const actualIds = new Set(refreshed.permissionOverwrites.cache.map((item) => String(item.id)));
  if (actualIds.size !== expectedIds.size || [...actualIds].some((id) => !expectedIds.has(id))) {
    throw new Error(\`Permission overwrite set mismatch after copy on ${'${sourceChannelName}'}: expected ${'${expectedIds.size}'}, found ${'${actualIds.size}'}.\`);
  }
  let verifiedCount = 0;
  for (const item of expected) {
    const actual = refreshed.permissionOverwrites.cache.get(item.id);
    if (!actual) throw new Error(\`Permission overwrite missing after copy on ${'${sourceChannelName}'}: ${'${item.id}'}\`);
    if (actual.allow.bitfield !== BigInt(item.allow) || actual.deny.bitfield !== BigInt(item.deny)) throw new Error(\`Permission overwrite mismatch after copy on ${'${sourceChannelName}'}: ${'${item.id}'}\`);
    verifiedCount += 1;
  }
  return verifiedCount;
}
function overwriteTargetName(guild, item) {
  if (String(item.id) === String(guild.id)) return '@everyone';
  if (Number(item.type) === 0) return guild.roles.cache.get(item.id)?.name || \`role:${'${item.id}'}\`;
  return guild.members.cache.get(item.id)?.user?.tag || guild.members.cache.get(item.id)?.displayName || \`member:${'${item.id}'}\`;
}
async function applyExactOverwriteSet(channel, expected, sourceChannelName) {
  try {
    await channel.permissionOverwrites.set(expected, 'Goliath duplicator: exact channel/category permissions');
    return;
  } catch (error) {
    if (Number(error?.code) !== 50013) throw error;
  }

  await channel.permissionOverwrites.set([], 'Goliath duplicator: diagnose exact permission targets');
  const applied = [];
  const failed = [];
  for (const item of expected) {
    try {
      await channel.permissionOverwrites.set([...applied, item], 'Goliath duplicator: exact permission target diagnostic');
      applied.push(item);
    } catch (error) {
      failed.push(\`${'${overwriteTargetName(channel.guild, item)}'} (${ '${item.id}' }): ${'${error?.code ? `Discord ${error.code}` : \'Error\'}'} ${'${error?.message || String(error)}'}\`);
    }
  }
  if (failed.length) throw new Error(\`Permission targets failed on ${'${sourceChannelName}'}: ${'${failed.join(\'; \')}'}\`);
}
async function applyPermissions(guild, snap, maps, log) {
  if (!hasBotPermission(guild, PermissionFlagsBits.ManageRoles)) { log.errors.push('Channel/category overwrites cannot be copied: Goliath lacks ManageRoles.'); return; }
  for (const sourceChannel of snap.channels || []) {
    try {
      const targetId = maps.channels.get(sourceChannel.id); if (!targetId) throw new Error(\`Destination channel mapping is missing for ${'${sourceChannel.name}'}.\`);
      const channel = guild.channels.cache.get(targetId) || await guild.channels.fetch(targetId).catch(() => null);
      if (!channel?.permissionOverwrites?.set) throw new Error(\`Destination channel ${'${targetId}'} cannot accept permission overwrites.\`);
      const overwrites = await buildExactOverwrites(guild, snap, sourceChannel, maps);
      await applyExactOverwriteSet(channel, overwrites, sourceChannel.name);
      log.copied.permissionOverwrites += await verifyOverwrites(channel, overwrites, sourceChannel.name);
    } catch (error) { pushError(log, \`Permissions ${'${sourceChannel.name}'}\`, error); }
  }
}
`, 'exact channel permissions');

core = replaceRange(core, 'async function verifyCopyResult', 'function resultEmbed', `async function verifyCopyResult(guild, snap, maps, log) {
  await fetchGuildState(guild);
  if (String(guild.id) !== String(log.destinationGuildId)) throw new Error(\`Destination verification mismatch: expected ${'${log.destinationGuildId}'}, got ${'${guild.id}'}\`);

  const roleIds = [...maps.createdRoles], categoryIds = [...maps.createdCategories], channelIds = [...maps.createdChannels], emojiIds = [...maps.createdEmojis];
  const verifiedRoles = roleIds.filter((id) => guild.roles.cache.has(id));
  const verifiedCategories = categoryIds.filter((id) => guild.channels.cache.has(id));
  const verifiedChannels = channelIds.filter((id) => guild.channels.cache.has(id));
  const verifiedEmojis = emojiIds.filter((id) => guild.emojis.cache.has(id));
  log.copied.roles = verifiedRoles.length; log.copied.categories = verifiedCategories.length; log.copied.channels = verifiedChannels.length; log.copied.emojis = verifiedEmojis.length;

  const referencedManaged = referencedPermissionRoleIds(snap);
  const expectedRoleSources = [...(snap.roles || []), ...(snap.managedRoles || []).filter((role) => referencedManaged.has(String(role.id)))];
  const missingRoleMappings = expectedRoleSources.filter((role) => {
    const targetId = maps.roles.get(role.id);
    return !targetId || !guild.roles.cache.has(targetId);
  });
  const missingStructure = (snap.channels || []).filter((source) => {
    const targetId = maps.channels.get(source.id);
    return !targetId || !guild.channels.cache.has(targetId);
  });
  const permissionExpected = (snap.channels || []).reduce((sum, channel) => sum + (channel.permissionOverwrites || []).length, 0);

  log.verification = {
    destinationGuildId: guild.id, destinationGuildName: guild.name,
    rolesCreated: verifiedRoles.length, categoriesCreated: verifiedCategories.length, channelsCreated: verifiedChannels.length, emojisCreated: verifiedEmojis.length,
    roleMappingsExpected: expectedRoleSources.length, roleMappingsVerified: expectedRoleSources.length - missingRoleMappings.length,
    structureExpected: (snap.channels || []).length, structureMapped: (snap.channels || []).length - missingStructure.length,
    permissionOverwritesExpected: permissionExpected, permissionOverwritesVerified: log.copied.permissionOverwrites,
    deferredPermissions: log.deferredPermissions.length,
  };

  if (verifiedRoles.length !== roleIds.length) log.errors.push(\`Post-copy verification: ${'${roleIds.length - verifiedRoles.length}'} created role(s) missing.\`);
  if (verifiedCategories.length !== categoryIds.length) log.errors.push(\`Post-copy verification: ${'${categoryIds.length - verifiedCategories.length}'} created category(s) missing.\`);
  if (verifiedChannels.length !== channelIds.length) log.errors.push(\`Post-copy verification: ${'${channelIds.length - verifiedChannels.length}'} created channel(s) missing.\`);
  if (missingRoleMappings.length) log.errors.push(\`Role mapping verification failed for: ${'${missingRoleMappings.slice(0, 10).map((role) => role.name).join(\', \')}'}${'${missingRoleMappings.length > 10 ? \' …\' : \'\'}'}\`);
  if (missingStructure.length) log.errors.push(\`Structure mapping verification failed for: ${'${missingStructure.slice(0, 10).map((channel) => channel.name).join(\', \')}'}${'${missingStructure.length > 10 ? \' …\' : \'\'}'}\`);
  if (log.copied.permissionOverwrites !== permissionExpected) log.errors.push(\`Permission verification incomplete: ${'${log.copied.permissionOverwrites}'}/${'${permissionExpected}'} overwrites verified exactly.\`);
}
`, 'strict destination verification');

core = replaceRange(core,
  '  const operationMissing = missingOperationPermissions(guild, snap);',
  '  try { const rollback = await createServerBackup',
`  const preflightIssues = await exactPermissionPreflight(guild, snap, session.conflictMode);
  const hierarchy = hierarchyWarning(guild); if (hierarchy) preflightIssues.push(hierarchy);
  for (const [key, item] of Object.entries(snap.future || {})) if (item?.requested && !item.supported) log.notes.push(\`${'${COPY_OPTIONS[key] || key}'}: ${'${item.reason}'}\`);
  if (session.dryRun) {
    applyDryRunPlan(log, dryRunPlan(guild, snap, session.conflictMode));
    if (preflightIssues.length) log.errors.push(...preflightIssues.map((issue) => \`[Preflight] ${'${issue}'}\`));
    log.status = preflightIssues.length ? 'dry-run-blocked' : 'dry-run';
    return log;
  }
  if (preflightIssues.length) {
    log.errors.push(...preflightIssues.map((issue) => \`[Preflight] ${'${issue}'}\`));
    log.status = 'blocked-preflight';
    return log;
  }
`, 'strict preflight');

core = core.replace(
  "  if (log.errors.length) log.status = log.copied.categories + log.copied.channels + log.copied.roles > 0 ? 'completed-with-warnings' : 'failed';\n  else if (log.deferredPermissions.length) log.status = 'partial-permissions';\n  else log.status = 'success';",
  "  if (log.errors.length) log.status = log.copied.categories + log.copied.channels + log.copied.roles + log.copied.permissionOverwrites > 0 ? 'partial' : 'failed';\n  else log.status = 'success';"
);

fs.writeFileSync(corePath, core);

const selectivePath = 'src/owner/dev/duplicator/selective.js';
let selective = fs.readFileSync(selectivePath, 'utf8');

selective = selective.replace(
  "function reviewPayload(session, dryRun = null) {\n  const snap = filteredSnapshot(session.snapshot, session.selected);",
  "function reviewPayload(session, dryRun = null) {\n  const snap = filteredSnapshot(session.snapshot, session.selected);\n  const blocked = Boolean(dryRun && String(dryRun.status || '').includes('blocked'));"
);
selective = selective.replace(
  "new ButtonBuilder().setCustomId(componentId(session, 'confirm-view')).setLabel('Continue').setEmoji('➡️').setStyle(ButtonStyle.Success),",
  "new ButtonBuilder().setCustomId(componentId(session, 'confirm-view')).setLabel('Continue').setEmoji('➡️').setStyle(ButtonStyle.Success).setDisabled(blocked),"
);

selective = replaceRange(selective, 'function destinationMappings', 'function copyOutcome', `function destinationMappings(sourceSnapshot, destinationSnapshot, selected, transferObjects = {}) {
  const filtered = filteredSnapshot(sourceSnapshot, selected);
  const roleMap = transferObjects.roleMap || {};
  const channelMap = transferObjects.channelMap || {};
  const allDestinationRoles = [...(destinationSnapshot.roles || []), ...(destinationSnapshot.managedRoles || [])];
  const roleById = new Map(allDestinationRoles.map((role) => [String(role.id), role]));
  const channelById = new Map((destinationSnapshot.channels || []).map((channel) => [String(channel.id), channel]));

  const standardRoleMappings = filtered.roles.map((role) => {
    const directId = roleMap[role.id] ? String(roleMap[role.id]) : null;
    const direct = directId ? roleById.get(directId) : null;
    if (direct) return { sourceId: role.id, sourceName: role.name, sourcePermissions: role.permissions, destinationId: direct.id, destinationName: direct.name, status: 'mapped' };
    const candidates = (destinationSnapshot.roles || []).filter((dest) => dest.name === role.name);
    const match = candidates.length === 1 ? candidates[0] : null;
    return { sourceId: role.id, sourceName: role.name, sourcePermissions: role.permissions, destinationId: match?.id || null, destinationName: match?.name || null, status: match ? 'mapped' : candidates.length > 1 ? 'ambiguous' : 'missing' };
  });

  const managedRoleMappings = (filtered.managedRoles || []).map((role) => {
    const directId = roleMap[role.id] ? String(roleMap[role.id]) : null;
    const direct = directId ? roleById.get(directId) : null;
    if (direct) return { sourceId: role.id, sourceName: role.name, sourcePermissions: role.permissions, managed: true, destinationId: direct.id, destinationName: direct.name, status: 'mapped' };
    const managed = destinationSnapshot.managedRoles || [];
    let candidates = [];
    if (role.tags?.botId && role.tags.botId === filtered.sourceGuild?.botUserId && destinationSnapshot.sourceGuild?.botUserId) candidates = managed.filter((dest) => dest.tags?.botId === destinationSnapshot.sourceGuild.botUserId);
    if (!candidates.length && role.tags?.botId) candidates = managed.filter((dest) => dest.tags?.botId === role.tags.botId);
    if (!candidates.length) candidates = managed.filter((dest) => dest.name === role.name);
    const match = candidates.length === 1 ? candidates[0] : null;
    return { sourceId: role.id, sourceName: role.name, sourcePermissions: role.permissions, managed: true, destinationId: match?.id || null, destinationName: match?.name || null, status: match ? 'mapped' : candidates.length > 1 ? 'ambiguous-managed' : 'missing-managed' };
  });

  const roleMappings = [...standardRoleMappings, ...managedRoleMappings];
  const channelMappings = filtered.channels.map((source) => {
    const directId = channelMap[source.id] ? String(channelMap[source.id]) : null;
    const direct = directId ? channelById.get(directId) : null;
    if (direct) return {
      sourceId: source.id, sourceName: source.name, sourceParentId: source.parentId || null,
      destinationId: direct.id, destinationName: direct.name, destinationParentId: direct.parentId || null,
      permissionOverwrites: source.permissionOverwrites || [], status: 'mapped',
    };
    let candidates = (destinationSnapshot.channels || []).filter((dest) => dest.name === source.name);
    if (source.type === ChannelType.GuildCategory) candidates = candidates.filter((dest) => dest.type === ChannelType.GuildCategory);
    const mappedParentId = source.parentId ? channelMap[source.parentId] : null;
    if (source.type !== ChannelType.GuildCategory && mappedParentId) candidates = candidates.filter((dest) => String(dest.parentId || '') === String(mappedParentId));
    const match = candidates.length === 1 ? candidates[0] : null;
    return {
      sourceId: source.id, sourceName: source.name, sourceParentId: source.parentId || null,
      destinationId: match?.id || null, destinationName: match?.name || null, destinationParentId: match?.parentId || null,
      permissionOverwrites: source.permissionOverwrites || [], status: match ? 'mapped' : candidates.length > 1 ? 'ambiguous' : 'missing',
    };
  });
  return { roleMappings, channelMappings };
}
`, 'selective destination mappings');

selective = replaceRange(selective, 'function copyOutcome', 'async function recordTransfer', `function copyOutcome(response, mappings) {
  const status = String(response?.log?.status || 'unknown').toLowerCase();
  const created = response?.log?.transferObjects || {};
  const changed = (created.createdChannelIds || []).length + (created.createdCategoryIds || []).length + (created.createdRoleIds || []).length;
  const unresolved = [...mappings.roleMappings, ...mappings.channelMappings].filter((item) => item.status !== 'mapped').length;
  if (status === 'success' && !unresolved) return 'success';
  if (status === 'blocked-preflight' || status === 'failed') return 'failed';
  if (status === 'partial' || status.includes('warning') || unresolved) return changed ? 'partial' : 'failed';
  if (!changed && status !== 'success') return 'no-changes';
  return 'partial';
}

`, 'selective outcome');

selective = selective.replace(
  '  const mappings = destinationMappings(session.snapshot, destinationSnapshot, session.selected);\n  const transferObjects = response.log?.transferObjects || {};',
  '  const transferObjects = response.log?.transferObjects || {};\n  const mappings = destinationMappings(session.snapshot, destinationSnapshot, session.selected, transferObjects);'
);

selective = replaceRange(selective, 'function resultPayload', 'function inferOutcome', `function resultPayload(session, response, manifest) {
  const unresolvedRoles = manifest.roles.filter((item) => item.status !== 'mapped').length;
  const unresolvedChannels = manifest.channels.filter((item) => item.status !== 'mapped').length;
  const status = String(response.log?.status || 'unknown');
  const outcome = manifest.outcome || copyOutcome(response, { roleMappings: manifest.roles, channelMappings: manifest.channels });
  const ok = outcome === 'success';
  const failed = outcome === 'failed';
  const verification = response.log?.verification || {};
  const title = ok ? '✅ Selective Copy Verified' : failed ? (status === 'blocked-preflight' ? '🛑 Selective Copy Blocked' : '❌ Selective Copy Failed') : '⚠️ Selective Copy Partial';
  const color = ok ? 0x22c55e : failed ? 0xed4245 : 0xf59e0b;
  return {
    embeds: [embed(title, [
      \`**Transfer:** \\`${'${manifest.id}'}\\`\`, \`**Destination:** ${'${manifest.destinationGuildName || manifest.destinationGuildId}'} (${'${manifest.destinationGuildId}'})\`,
      \`**Status:** \\`${'${status}'}\\`\`, \`**Outcome:** **${'${outcome.toUpperCase()}'}**\`, '',
      \`Transfer plan: Categories \\`${'${manifest.stats.categories}'}\\` • Channels \\`${'${manifest.stats.channels}'}\\` • Required Roles \\`${'${manifest.stats.roleDependencies ?? manifest.stats.roles}'}\\` • Permission Overwrites \\`${'${manifest.stats.permissionOverwrites}'}\\`\`,
      \`Manifest mapping: Roles \\`${'${manifest.roles.length - unresolvedRoles}'}/${'${manifest.roles.length}'}\\` • Structure \\`${'${manifest.channels.length - unresolvedChannels}'}/${'${manifest.channels.length}'}\\`\`,
      verification.structureExpected != null ? \`Engine verification: Structure \\`${'${verification.structureMapped || 0}'}/${'${verification.structureExpected}'}\\` • Permissions \\`${'${verification.permissionOverwritesVerified || 0}'}/${'${verification.permissionOverwritesExpected || 0}'}\\` • Roles \\`${'${verification.roleMappingsVerified || 0}'}/${'${verification.roleMappingsExpected || 0}'}\\`\` : null,
      '', failed && status === 'blocked-preflight' ? '**No destination mutation was started because exact-copy preflight failed.**' : 'This transfer is permanently recorded in **Transfer History** with source → destination IDs and source permission data.',
      ...(manifest.warnings || []).slice(0, 8).map((warning) => \`⚠️ ${'${warning}'}\`),
    ].filter(Boolean).join('\\n'), color)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(componentId(session, 'manifest-last')).setLabel('View Transfer Manifest').setEmoji('📜').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(componentId(session, 'home')).setLabel('New Transfer').setStyle(ButtonStyle.Secondary),
    )],
  };
}
`, 'selective result payload');

fs.writeFileSync(selectivePath, selective);
console.log('Strict Duplicator patch applied.');
