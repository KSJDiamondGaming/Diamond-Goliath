'use strict';

const fs = require('node:fs');
const path = 'src/owner/dev/duplicatorV2.js';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(label, pattern, replacement) {
  const before = source;
  source = source.replace(pattern, replacement);
  if (source === before) throw new Error(`Patch anchor not found: ${label}`);
}

replaceOnce(
  'channel type normalizer',
  /function duplicatorCreateChannelType\(type\) \{[^\n]*\}/,
  `function duplicatorCreateChannelType(guild, type) {
  const numeric = Number(type);
  const supported = new Set([ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory, ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice, ChannelType.GuildForum, ChannelType.GuildMedia]);
  if (!supported.has(numeric)) return ChannelType.GuildText;
  const features = new Set(guild?.features || []);
  if (numeric === ChannelType.GuildAnnouncement && !features.has('COMMUNITY')) return ChannelType.GuildText;
  return numeric;
}`
);

replaceOnce(
  'existing channel matcher',
  /function existingChannel\(guild, channel\) \{[^\n]*\}/,
  `function existingChannel(guild, channel) {
  const type = duplicatorCreateChannelType(guild, channel.type);
  return guild.channels.cache.find((c) => c.type === type && c.name.toLowerCase() === String(channel.name).toLowerCase());
}`
);

replaceOnce(
  'run log',
  /function runLog\(session, snap\) \{[^\n]*\}/,
  `function runLog(session, snap) { return { status: session.dryRun ? 'dry-run' : 'running', dryRun: Boolean(session.dryRun), conflictMode: session.conflictMode, sourceGuildId: snap.sourceGuild?.id || null, destinationGuildId: session.destinationGuildId || null, rollbackBackupId: null, snapshotStats: snap.stats, copied: { serverSettings: 0, roles: 0, categories: 0, channels: 0, permissionOverwrites: 0, emojis: 0 }, deleted: { roles: 0, channels: 0 }, skipped: [], errors: [], notes: [], verification: null }; }`
);

replaceOnce(
  'channel payload',
  /function channelPayload\(channel, parentId = null, name = null\) \{[^\n]*\}/,
  `function channelPayload(guild, channel, parentId = null, name = null) {
  const type = duplicatorCreateChannelType(guild, channel.type);
  const payload = { name: name || channel.name, type, reason: 'Goliath duplicator: channel' };
  if (parentId) payload.parent = parentId;
  if ([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(type)) {
    payload.topic = channel.topic || undefined;
    payload.nsfw = Boolean(channel.nsfw);
    payload.rateLimitPerUser = channel.rateLimitPerUser || 0;
  }
  if ([ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(type)) {
    payload.bitrate = channel.bitrate || undefined;
    payload.userLimit = channel.userLimit || 0;
    payload.rtcRegion = channel.rtcRegion || undefined;
    payload.videoQualityMode = channel.videoQualityMode || undefined;
  }
  if ([ChannelType.GuildForum, ChannelType.GuildMedia].includes(type)) {
    payload.defaultAutoArchiveDuration = channel.defaultAutoArchiveDuration || undefined;
    payload.defaultThreadRateLimitPerUser = channel.defaultThreadRateLimitPerUser || 0;
    if (channel.availableTags?.length) payload.availableTags = channel.availableTags;
  }
  return payload;
}`
);

replaceOnce(
  'apply roles',
  /async function applyRoles\(guild, snap, maps, log, conflictMode\) \{[\s\S]*?\nfunction channelPayload/,
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
      let created;
      const requestedPermissions = safeRolePermissions(guild, role.permissions, role.name, log);
      try {
        created = await guild.roles.create({ name, color: Number(role.color || 0), hoist: Boolean(role.hoist), mentionable: Boolean(role.mentionable), permissions: requestedPermissions, reason: 'Goliath duplicator: role' });
      } catch (error) {
        if (Number(error?.code) !== 50013) throw error;
        created = await guild.roles.create({ name, color: Number(role.color || 0), hoist: Boolean(role.hoist), mentionable: Boolean(role.mentionable), permissions: 0n, reason: 'Goliath duplicator: role (permission-safe retry)' });
        log.notes.push(\`Role \${role.name}: created with permissions stripped because Discord rejected source permissions.\`);
      }
      const verified = await guild.roles.fetch(created.id).catch(() => null);
      if (!verified || verified.guild.id !== guild.id) throw new Error(\`Role create verification failed for \${role.name}\`);
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
}
function channelPayload`
);

replaceOnce(
  'apply channels',
  /async function applyChannels\(guild, snap, maps, log, conflictMode\) \{[\s\S]*?\nasync function applyPermissions/,
  `async function applyChannels(guild, snap, maps, log, conflictMode) {
  const names = new Set(guild.channels.cache.map((c) => c.name.toLowerCase()));
  const categories = (snap.channels || []).filter((c) => c.type === ChannelType.GuildCategory).sort((a, b) => a.position - b.position);
  const channels = (snap.channels || []).filter((c) => c.type !== ChannelType.GuildCategory).sort((a, b) => a.position - b.position);
  for (const category of categories) {
    try {
      const found = existingChannel(guild, category);
      if (found && conflictMode === 'skip') { maps.channels.set(category.id, found.id); log.skipped.push(\`Category exists: \${category.name}\`); continue; }
      if (found && conflictMode === 'replace' && found.deletable) { await found.delete('Goliath duplicator: replace category'); log.deleted.channels += 1; }
      const name = found && conflictMode === 'rename' ? uniqueName(names, category.name, 100) : category.name;
      const created = await guild.channels.create(channelPayload(guild, category, null, name));
      const verified = await guild.channels.fetch(created.id).catch(() => null);
      if (!verified || verified.guild.id !== guild.id) throw new Error(\`Category create verification failed for \${category.name}\`);
      maps.channels.set(category.id, verified.id);
      maps.createdCategories.add(verified.id);
      maps.channelPositions.set(verified.id, Number(category.position || 0));
      names.add(verified.name.toLowerCase());
    } catch (error) { pushError(log, \`Category \${category.name}\`, error); log.skipped.push(\`Category failed: \${category.name}\`); }
  }
  for (const channel of channels) {
    try {
      const found = existingChannel(guild, channel);
      if (found && conflictMode === 'skip') { maps.channels.set(channel.id, found.id); log.skipped.push(\`Channel exists: \${channel.name}\`); continue; }
      if (found && conflictMode === 'replace' && found.deletable) { await found.delete('Goliath duplicator: replace channel'); log.deleted.channels += 1; }
      const parentId = channel.parentId ? maps.channels.get(channel.parentId) : null;
      const name = found && conflictMode === 'rename' ? uniqueName(names, channel.name, 100) : channel.name;
      const created = await guild.channels.create(channelPayload(guild, channel, parentId, name));
      const verified = await guild.channels.fetch(created.id).catch(() => null);
      if (!verified || verified.guild.id !== guild.id) throw new Error(\`Channel create verification failed for \${channel.name}\`);
      maps.channels.set(channel.id, verified.id);
      maps.createdChannels.add(verified.id);
      maps.channelPositions.set(verified.id, Number(channel.position || 0));
      names.add(verified.name.toLowerCase());
    } catch (error) { pushError(log, \`Channel \${channel.name}\`, error); log.skipped.push(\`Channel failed: \${channel.name}\`); }
  }
  for (const [channelId, position] of maps.channelPositions.entries()) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.setPosition) continue;
    try { await channel.setPosition(position, { reason: 'Goliath duplicator: channel order' }); }
    catch (error) { log.notes.push(\`Channel order not fully restored for \${channel.name}: \${error.message}\`); }
  }
}
async function applyPermissions`
);

replaceOnce(
  'permissions',
  /async function applyPermissions\(guild, snap, maps, log\) \{[\s\S]*?\nasync function applyEmojis/,
  `function sanitizedOverwriteBits(guild, value) {
  const bits = BigInt(value || 0);
  const botBits = BigInt(guild.members.me?.permissions?.bitfield || 0n);
  return bits & botBits;
}
async function applyPermissions(guild, snap, maps, log) {
  for (const sourceChannel of snap.channels || []) {
    try {
      const targetId = maps.channels.get(sourceChannel.id);
      if (!targetId) continue;
      const channel = guild.channels.cache.get(targetId) || await guild.channels.fetch(targetId).catch(() => null);
      if (!channel?.permissionOverwrites?.set) continue;
      const overwrites = [];
      for (const overwrite of sourceChannel.permissionOverwrites || []) {
        if (Number(overwrite.type) === 1) continue;
        const mappedId = overwrite.id === snap.sourceGuild?.id ? guild.id : maps.roles.get(overwrite.id);
        if (!mappedId) continue;
        overwrites.push({ id: mappedId, type: overwrite.type, allow: BigInt(overwrite.allow || 0), deny: BigInt(overwrite.deny || 0) });
      }
      try {
        await channel.permissionOverwrites.set(overwrites, 'Goliath duplicator: permissions');
      } catch (error) {
        if (Number(error?.code) !== 50013) throw error;
        const sanitized = overwrites.map((overwrite) => ({ ...overwrite, allow: sanitizedOverwriteBits(guild, overwrite.allow), deny: sanitizedOverwriteBits(guild, overwrite.deny) }));
        await channel.permissionOverwrites.set(sanitized, 'Goliath duplicator: permission-safe retry');
        log.notes.push(\`Permissions for \${sourceChannel.name}: unsupported permission bits were stripped on retry.\`);
      }
      const verified = await guild.channels.fetch(targetId).catch(() => null);
      if (!verified) throw new Error(\`Permission verification failed for \${sourceChannel.name}\`);
      log.copied.permissionOverwrites += overwrites.length;
    } catch (error) { pushError(log, \`Permissions \${sourceChannel.name}\`, error); log.skipped.push(\`Permissions failed: \${sourceChannel.name}\`); }
  }
}
async function applyEmojis`
);

replaceOnce(
  'emojis',
  /async function applyEmojis\(guild, snap, log, conflictMode\) \{[\s\S]*?\nfunction resultEmbed/,
  `async function applyEmojis(guild, snap, maps, log, conflictMode) {
  const names = new Set(guild.emojis.cache.map((e) => e.name.toLowerCase()));
  for (const emoji of snap.emojis || []) {
    try {
      if (!emoji.url || !emoji.name) continue;
      if (names.has(emoji.name.toLowerCase()) && conflictMode === 'skip') { log.skipped.push(\`Emoji exists: \${emoji.name}\`); continue; }
      const name = names.has(emoji.name.toLowerCase()) && conflictMode === 'rename' ? uniqueName(names, emoji.name, 32).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32) : emoji.name;
      const created = await guild.emojis.create({ attachment: emoji.url, name, reason: 'Goliath duplicator: emoji' });
      const verified = await guild.emojis.fetch(created.id).catch(() => null);
      if (!verified) throw new Error(\`Emoji create verification failed for \${emoji.name}\`);
      maps.createdEmojis.add(verified.id);
      names.add(verified.name.toLowerCase());
    } catch (error) { pushError(log, \`Emoji \${emoji.name}\`, error); log.skipped.push(\`Emoji failed: \${emoji.name}\`); }
  }
}
async function verifyCopyResult(guild, snap, maps, log) {
  await fetchGuildState(guild);
  if (String(guild.id) !== String(log.destinationGuildId)) throw new Error(\`Destination verification mismatch: expected \${log.destinationGuildId}, got \${guild.id}\`);
  const roleIds = [...maps.createdRoles];
  const categoryIds = [...maps.createdCategories];
  const channelIds = [...maps.createdChannels];
  const emojiIds = [...maps.createdEmojis];
  const verifiedRoles = roleIds.filter((id) => guild.roles.cache.has(id));
  const verifiedCategories = categoryIds.filter((id) => guild.channels.cache.has(id));
  const verifiedChannels = channelIds.filter((id) => guild.channels.cache.has(id));
  const verifiedEmojis = emojiIds.filter((id) => guild.emojis.cache.has(id));
  log.copied.roles = verifiedRoles.length;
  log.copied.categories = verifiedCategories.length;
  log.copied.channels = verifiedChannels.length;
  log.copied.emojis = verifiedEmojis.length;
  log.verification = { destinationGuildId: guild.id, destinationGuildName: guild.name, roles: verifiedRoles.length, categories: verifiedCategories.length, channels: verifiedChannels.length, emojis: verifiedEmojis.length };
  if (verifiedRoles.length !== roleIds.length) log.errors.push(\`Post-copy verification: \${roleIds.length - verifiedRoles.length} created role(s) missing from destination.\`);
  if (verifiedCategories.length !== categoryIds.length) log.errors.push(\`Post-copy verification: \${categoryIds.length - verifiedCategories.length} created categor\${categoryIds.length - verifiedCategories.length === 1 ? 'y is' : 'ies are'} missing from destination.\`);
  if (verifiedChannels.length !== channelIds.length) log.errors.push(\`Post-copy verification: \${channelIds.length - verifiedChannels.length} created channel(s) missing from destination.\`);
  if (verifiedEmojis.length !== emojiIds.length) log.errors.push(\`Post-copy verification: \${emojiIds.length - verifiedEmojis.length} created emoji(s) missing from destination.\`);
}
function resultEmbed`
);

replaceOnce(
  'result embed',
  /function resultEmbed\(title, guild, log\) \{[^\n]*\}/,
  `function resultEmbed(title, guild, log) { return embed(title, [\`**Destination:** \${guild.name} (\${guild.id || log.destinationGuildId})\`, \`**Source ID:** \\\`\${log.sourceGuildId || 'unknown'}\\\`\`, \`**Status:** \\\`\${log.status}\\\`\`, \`**Conflict:** \\\`\${log.conflictMode}\\\`\`, \`**Rollback:** \\\`\${log.rollbackBackupId || (log.dryRun ? 'dry-run' : 'none')}\\\`\`, '', \`Verified: Settings \\\`\${log.copied.serverSettings}\\\` • Roles \\\`\${log.copied.roles}\\\` • Categories \\\`\${log.copied.categories}\\\` • Channels \\\`\${log.copied.channels}\\\` • Permissions \\\`\${log.copied.permissionOverwrites}\\\` • Emojis \\\`\${log.copied.emojis}\\\`\`, log.deleted.roles || log.deleted.channels ? \`Deleted: roles \\\`\${log.deleted.roles}\\\`, channels \\\`\${log.deleted.channels}\\\`\` : '', log.skipped.length ? \`Skipped:\\n\${log.skipped.slice(0, 8).map((i) => \`• \${i}\`).join('\\n')}\` : '', log.notes.length ? \`Notes:\\n\${log.notes.slice(0, 8).map((i) => \`• \${i}\`).join('\\n')}\` : '', log.errors.length ? \`Warnings/Errors:\\n\${log.errors.slice(0, 8).map((e) => \`⚠️ \${e}\`).join('\\n')}\` : ''].filter(Boolean).join('\\n'), log.errors.length ? 0xf59e0b : 0x22c55e); }`
);

replaceOnce(
  'execute maps/stages',
  /const maps = \{ roles: new Map\(\[\[snap\.sourceGuild\?\.id, guild\.id\]\]\), channels: new Map\(\) \};\n  await executeStage\('Server settings'[\s\S]*?log\.status = log\.errors\.length \? 'completed-with-warnings' : 'success'; return log;/,
  `if (String(guild.id) !== String(session.destinationGuildId)) throw new Error(\`Destination mismatch before copy: expected \${session.destinationGuildId}, got \${guild.id}\`);
  const maps = { roles: new Map([[snap.sourceGuild?.id, guild.id]]), channels: new Map(), createdRoles: new Set(), createdCategories: new Set(), createdChannels: new Set(), createdEmojis: new Set(), rolePositions: new Map(), channelPositions: new Map() };
  await executeStage('Server settings', log, () => applySettings(guild, snap, log));
  await executeStage('Roles', log, () => applyRoles(guild, snap, maps, log, session.conflictMode));
  await executeStage('Channels', log, () => applyChannels(guild, snap, maps, log, session.conflictMode));
  await executeStage('Permissions', log, () => applyPermissions(guild, snap, maps, log));
  await executeStage('Emojis', log, () => applyEmojis(guild, snap, maps, log, session.conflictMode));
  await executeStage('Verify destination', log, () => verifyCopyResult(guild, snap, maps, log));
  log.status = log.errors.length ? 'completed-with-warnings' : 'success'; return log;`
);

fs.writeFileSync(path, source);
console.log('Duplicator reliability patch applied.');
