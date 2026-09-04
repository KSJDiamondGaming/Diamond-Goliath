'use strict';

const fs = require('fs');

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Patch target not found: ${label}`);
  return source.replace(from, to);
}

const corePath = 'src/owner/dev/duplicator/core.js';
let core = fs.readFileSync(corePath, 'utf8');

const snapshotOld = `function snapshot(guild, selectedOptions = [...ACTIVE_OPTIONS]) {
  const selected = new Set(selectedOptions);
  const channels = selected.has('categories') || selected.has('channels') || selected.has('permissions') ? guild.channels.cache.filter((c) => selected.has('channels') || c.type === ChannelType.GuildCategory).sort((a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0)).map(serializeChannel) : [];
  const roles = selected.has('roles') || selected.has('permissions') ? guild.roles.cache.filter((r) => r.id !== guild.id && !r.managed).sort((a, b) => a.position - b.position).map((r) => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(), position: r.position })) : [];
  const emojis = selected.has('emojis') ? guild.emojis.cache.map((e) => ({ id: e.id, name: e.name, animated: e.animated, url: typeof e.imageURL === 'function' ? e.imageURL({ extension: e.animated ? 'gif' : 'png' }) : e.url })) : [];
  const settings = selected.has('serverSettings') ? { name: guild.name, description: guild.description || null, verificationLevel: guild.verificationLevel, explicitContentFilter: guild.explicitContentFilter, defaultMessageNotifications: guild.defaultMessageNotifications, afkTimeout: guild.afkTimeout, iconURL: guild.iconURL({ extension: 'png', size: 1024 }) || null, bannerURL: guild.bannerURL({ extension: 'png', size: 2048 }) || null, splashURL: guild.splashURL({ extension: 'png', size: 2048 }) || null } : null;
  const future = {}; for (const key of FUTURE_OPTIONS) if (selected.has(key)) future[key] = { requested: true, supported: false, reason: 'Reserved for Duplicator API expansion.' };
  return { sourceGuild: { id: guild.id, name: guild.name }, options: [...selected], settings, roles, channels, emojis, future, stats: { roles: roles.length, categories: channels.filter((c) => c.type === ChannelType.GuildCategory).length, channels: channels.filter((c) => c.type !== ChannelType.GuildCategory).length, permissionOverwrites: channels.reduce((total, c) => total + (c.permissionOverwrites?.length || 0), 0), emojis: emojis.length } };
}`;
const snapshotNew = `function serializeManagedRole(role) {
  const tags = role.tags || {};
  return {
    id: role.id,
    name: role.name,
    managed: true,
    permissions: role.permissions.bitfield.toString(),
    position: role.position,
    tags: {
      botId: tags.botId || null,
      integrationId: tags.integrationId || null,
      subscriptionListingId: tags.subscriptionListingId || null,
    },
  };
}
function snapshot(guild, selectedOptions = [...ACTIVE_OPTIONS]) {
  const selected = new Set(selectedOptions);
  const channels = selected.has('categories') || selected.has('channels') || selected.has('permissions') ? guild.channels.cache.filter((c) => selected.has('channels') || c.type === ChannelType.GuildCategory).sort((a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0)).map(serializeChannel) : [];
  const roles = selected.has('roles') || selected.has('permissions') ? guild.roles.cache.filter((r) => r.id !== guild.id && !r.managed).sort((a, b) => a.position - b.position).map((r) => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(), position: r.position })) : [];
  const managedRoles = selected.has('permissions') ? guild.roles.cache.filter((r) => r.id !== guild.id && r.managed).sort((a, b) => a.position - b.position).map(serializeManagedRole) : [];
  const emojis = selected.has('emojis') ? guild.emojis.cache.map((e) => ({ id: e.id, name: e.name, animated: e.animated, url: typeof e.imageURL === 'function' ? e.imageURL({ extension: e.animated ? 'gif' : 'png' }) : e.url })) : [];
  const settings = selected.has('serverSettings') ? { name: guild.name, description: guild.description || null, verificationLevel: guild.verificationLevel, explicitContentFilter: guild.explicitContentFilter, defaultMessageNotifications: guild.defaultMessageNotifications, afkTimeout: guild.afkTimeout, iconURL: guild.iconURL({ extension: 'png', size: 1024 }) || null, bannerURL: guild.bannerURL({ extension: 'png', size: 2048 }) || null, splashURL: guild.splashURL({ extension: 'png', size: 2048 }) || null } : null;
  const future = {}; for (const key of FUTURE_OPTIONS) if (selected.has(key)) future[key] = { requested: true, supported: false, reason: 'Reserved for Duplicator API expansion.' };
  return { sourceGuild: { id: guild.id, name: guild.name, botUserId: guild.client.user?.id || null }, options: [...selected], settings, roles, managedRoles, channels, emojis, future, stats: { roles: roles.length, managedRoles: managedRoles.length, categories: channels.filter((c) => c.type === ChannelType.GuildCategory).length, channels: channels.filter((c) => c.type !== ChannelType.GuildCategory).length, permissionOverwrites: channels.reduce((total, c) => total + (c.permissionOverwrites?.length || 0), 0), emojis: emojis.length } };
}`;
core = replaceOnce(core, snapshotOld, snapshotNew, 'snapshot managed roles');

const applyMarker = 'async function applyRoles(guild, snap, maps, log, conflictMode) {';
const managedFunction = `async function applyManagedRoleMappings(guild, snap, maps, log) {
  const dependencies = snap.managedRoles || [];
  if (!dependencies.length) return;
  const destinationManaged = [...guild.roles.cache.values()].filter((role) => role.managed);
  for (const sourceRole of dependencies) {
    let target = null;
    const sourceBotId = sourceRole.tags?.botId || null;
    if (sourceBotId && sourceBotId === snap.sourceGuild?.botUserId) {
      target = destinationManaged.find((role) => role.tags?.botId === guild.client.user?.id) || null;
    }
    if (!target && sourceBotId) target = destinationManaged.find((role) => role.tags?.botId === sourceBotId) || null;
    if (!target) {
      const sameName = destinationManaged.filter((role) => role.name.toLowerCase() === String(sourceRole.name || '').toLowerCase());
      if (sameName.length === 1) target = sameName[0];
    }
    if (target) {
      maps.roles.set(sourceRole.id, target.id);
      log.notes.push(\`Managed role remapped: \${sourceRole.name} (\${sourceRole.id}) -> \${target.name} (\${target.id}).\`);
    } else {
      const message = \`Managed permission role could not be remapped: \${sourceRole.name} (\${sourceRole.id}). Discord-managed roles cannot be recreated; the matching bot/integration must exist in the destination.\`;
      log.errors.push(message);
      log.notes.push(message);
    }
  }
}
`;
core = replaceOnce(core, applyMarker, managedFunction + applyMarker, 'managed mapping function');
core = replaceOnce(
  core,
  "  await executeStage('Server settings', log, () => applySettings(guild, snap, log));\n  await executeStage('Roles', log, () => applyRoles(guild, snap, maps, log, session.conflictMode));",
  "  await executeStage('Server settings', log, () => applySettings(guild, snap, log));\n  await executeStage('Managed role remap', log, () => applyManagedRoleMappings(guild, snap, maps, log));\n  await executeStage('Roles', log, () => applyRoles(guild, snap, maps, log, session.conflictMode));",
  'managed role execution stage',
);
fs.writeFileSync(corePath, core);

const selectivePath = 'src/owner/dev/duplicator/selective.js';
let selective = fs.readFileSync(selectivePath, 'utf8');
selective = replaceOnce(
  selective,
  "  const channels = (snapshot.channels || []).filter((channel) => requiredChannels.has(channel.id));\n  const roles = (snapshot.roles || []).filter((role) => roleIds.has(role.id));\n  const permissionOverwrites = channels.reduce((sum, channel) => sum + (channel.permissionOverwrites || []).length, 0);",
  "  const channels = (snapshot.channels || []).filter((channel) => requiredChannels.has(channel.id));\n  const roles = (snapshot.roles || []).filter((role) => roleIds.has(role.id));\n  const managedRoles = (snapshot.managedRoles || []).filter((role) => roleIds.has(role.id));\n  const permissionOverwrites = channels.reduce((sum, channel) => sum + (channel.permissionOverwrites || []).length, 0);",
  'selective managed dependencies',
);
selective = replaceOnce(selective, '    roles,\n    channels,', '    roles,\n    managedRoles,\n    channels,', 'filtered managed roles');
selective = replaceOnce(selective, '      roles: roles.length,\n      categories:', '      roles: roles.length,\n      managedRoles: managedRoles.length,\n      roleDependencies: roles.length + managedRoles.length,\n      categories:', 'managed stats');
selective = replaceOnce(
  selective,
  "  const roleNames = snap.roles.slice(0, 15).map((role) => `• ${role.name}`).join('\\n') || '• None';",
  "  const roleNames = [...snap.roles.map((role) => `• ${role.name}`), ...(snap.managedRoles || []).map((role) => `• 🔗 ${role.name} (managed → remap only)`)].slice(0, 15).join('\\n') || '• None';",
  'review role names',
);
selective = replaceOnce(selective, '`Required roles: **${snap.stats.roles}**`, `Permission overwrites:', '`Required role dependencies: **${snap.stats.roleDependencies ?? snap.stats.roles}**`, `Managed role remaps: **${snap.stats.managedRoles || 0}**`, `Permission overwrites:', 'review stats');
selective = replaceOnce(selective, '**${snap.stats.roles} required roles**, and rebuild', '**${snap.stats.roleDependencies ?? snap.stats.roles} required role dependencies** (${snap.stats.managedRoles || 0} managed/remapped), and rebuild', 'confirmation stats');
selective = replaceOnce(selective, '  const roleMappings = filtered.roles.map((role) => {', '  const standardRoleMappings = filtered.roles.map((role) => {', 'standard mappings rename');
selective = replaceOnce(
  selective,
  '  });\n  const categoryMap = new Map();',
  `  });
  const managedRoleMappings = (filtered.managedRoles || []).map((role) => {
    const managed = destinationSnapshot.managedRoles || [];
    let candidates = [];
    if (role.tags?.botId && role.tags.botId === filtered.sourceGuild?.botUserId && destinationSnapshot.sourceGuild?.botUserId) {
      candidates = managed.filter((dest) => dest.tags?.botId === destinationSnapshot.sourceGuild.botUserId);
    }
    if (!candidates.length && role.tags?.botId) candidates = managed.filter((dest) => dest.tags?.botId === role.tags.botId);
    if (!candidates.length) candidates = managed.filter((dest) => dest.name === role.name);
    const match = candidates.length === 1 ? candidates[0] : null;
    return {
      sourceId: role.id,
      sourceName: role.name,
      sourcePermissions: role.permissions,
      managed: true,
      destinationId: match?.id || null,
      destinationName: match?.name || null,
      status: match ? 'mapped' : candidates.length > 1 ? 'ambiguous-managed' : 'missing-managed',
    };
  });
  const roleMappings = [...standardRoleMappings, ...managedRoleMappings];
  const categoryMap = new Map();`,
  'managed manifest mappings',
);
selective = replaceOnce(selective, 'Required Roles `\${manifest.stats.roles}`', 'Role Dependencies `\${manifest.stats.roleDependencies ?? manifest.stats.roles}`', 'result role label');
selective = replaceOnce(
  selective,
  "new ButtonBuilder().setCustomId(componentId(session, 'delete-manifest-view')).setLabel('Delete Transfer Channels').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(manifest.type !== 'selective-copy')",
  "new ButtonBuilder().setCustomId(componentId(session, 'delete-manifest-view')).setLabel('Delete Transfer Channels').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(manifest.type !== 'selective-copy' || !(manifest.channels || []).some((item) => item.destinationId))",
  'disable empty transfer delete',
);
fs.writeFileSync(selectivePath, selective);
console.log('Managed role remapping patch applied.');
