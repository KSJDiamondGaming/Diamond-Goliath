'use strict';

const http = require('node:http');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
  StringSelectMenuBuilder,
} = require('discord.js');

const fetch = global.fetch;
const security = require('../../../core/security/protection/core');
const guildManager = require('../../../core/guild/guildManager');
const { createServerBackup } = require('../../../core/security/restoreBackup/backup');

const COPY_PREFIX = 'duplicator-copy';
const BUILD_PREFIX = 'duplicator-build';
const ANALYSE_PREFIX = 'duplicator-analyse';
const SESSION_TTL_MS = 20 * 60 * 1000;
const BRIDGE_HOST = '127.0.0.1';
const BRIDGE_PORTS = Object.freeze({ DEV: 3002, BETA: 3012, PRODUCTION: 3022 });
const copySessions = new Map();
const buildSessions = new Map();
const analyseSessions = new Map();
let bridgeServer = null;
let bridgeClient = null;

const COPY_OPTIONS = Object.freeze({
  roles: 'Roles', categories: 'Categories', channels: 'Channels', permissions: 'Channel Permissions',
  serverSettings: 'Server Settings + Branding', emojis: 'Emojis', stickers: 'Stickers',
  scheduledEvents: 'Scheduled Events', webhooks: 'Webhooks', automod: 'AutoMod Rules',
});
const ACTIVE_OPTIONS = new Set(['roles', 'categories', 'channels', 'permissions', 'serverSettings', 'emojis']);
const FUTURE_OPTIONS = new Set(['stickers', 'scheduledEvents', 'webhooks', 'automod']);
const CONFLICT_MODES = Object.freeze({ skip: 'Skip Existing', rename: 'Rename Duplicates', replace: 'Replace Destination' });

// These are operation permissions, not an Administrator requirement. Optional feature
// permissions are checked only when that feature is actually requested.
const BASE_REQUIRED_PERMISSIONS = Object.freeze([
  ['ManageRoles', PermissionFlagsBits.ManageRoles],
  ['ManageChannels', PermissionFlagsBits.ManageChannels],
]);

function mode() { return String(process.env.BOT_MODE || 'DEV').trim().toUpperCase(); }
function splitIds(value) { return String(value || '').split(',').map((v) => v.trim()).filter((v) => /^\d{16,25}$/.test(v)); }
function ownerIds() {
  return [...new Set([
    ...splitIds(process.env.DUPLICATOR_OWNER_IDS), ...splitIds(process.env.SERVER_COPY_OWNER_IDS),
    ...splitIds(process.env.OWNER_ID), ...splitIds(process.env.OWNER_IDS),
    ...splitIds(process.env.BOT_OWNER_ID), ...splitIds(process.env.BOT_OWNER_IDS), ...(security.getBotOwnerIds?.() || []),
  ])];
}
function slugify(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }
function moduleConfig(guildId) { const modules = guildManager.getGuildSection(guildId, 'modules', {}); return modules.duplicator || modules.serverCopy || {}; }
function assertAccess(interaction) {
  if (!interaction?.guild) return { allowed: false, reason: 'This command can only be used inside a server.' };
  if (!ownerIds().includes(String(interaction.user?.id))) return { allowed: false, reason: 'This command is restricted to the bot owner.' };
  if (moduleConfig(interaction.guild.id).enabled === false) return { allowed: false, reason: 'Duplicator is disabled for this guild.' };
  return { allowed: true };
}
function embed(title, description, color = 0x5865f2) { return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp(new Date()); }
function guildById(client, id) { return client.guilds.cache.get(String(id || '').trim()) || null; }
async function fetchGuildById(client, id) {
  const guildId = String(id || '').trim();
  if (!/^\d{16,25}$/.test(guildId)) return { guild: null, reason: 'invalid' };
  const cached = guildById(client, guildId); if (cached) return { guild: cached, reason: null };
  try { return { guild: await client.guilds.fetch(guildId), reason: null }; }
  catch (error) { return { guild: null, reason: 'unavailable', error }; }
}
async function fetchGuildState(guild) {
  await guild.roles.fetch().catch(() => null);
  await guild.channels.fetch().catch(() => null);
  await guild.emojis.fetch().catch(() => null);
  await guild.members.fetchMe().catch(() => null);
}
function localGuildDirectory(client) { return [...client.guilds.cache.values()].map((guild) => ({ id: guild.id, name: guild.name, environment: mode() })); }
function bridgePort(environment) { return Number(process.env[`DUPLICATOR_BRIDGE_PORT_${environment}`] || BRIDGE_PORTS[environment]); }
function bridgeSecret() { return String(process.env.DUPLICATOR_BRIDGE_SECRET || '').trim(); }
function bridgeRequest(environment, method, path, payload = null, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const body = payload == null ? null : Buffer.from(JSON.stringify(payload));
    const headers = { accept: 'application/json' };
    if (body) { headers['content-type'] = 'application/json'; headers['content-length'] = String(body.length); }
    if (bridgeSecret()) headers['x-goliath-duplicator-secret'] = bridgeSecret();
    const req = http.request({ host: BRIDGE_HOST, port: bridgePort(environment), method, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        let data = {};
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch {}
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(data.error || `Bridge ${environment} returned ${res.statusCode}`));
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Bridge ${environment} timed out`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
async function getGuildDirectory(client) {
  const byId = new Map();
  for (const item of localGuildDirectory(client)) byId.set(item.id, { ...item, environments: [item.environment] });
  await Promise.all(Object.keys(BRIDGE_PORTS).filter((env) => env !== mode()).map(async (environment) => {
    try {
      const response = await bridgeRequest(environment, 'GET', '/guilds', null, 1200);
      for (const item of response.guilds || []) {
        const existing = byId.get(item.id);
        if (existing) existing.environments = [...new Set([...(existing.environments || [existing.environment]), item.environment || environment])];
        else byId.set(item.id, { ...item, environment: item.environment || environment, environments: [item.environment || environment] });
      }
    } catch (error) { console.warn(`[Duplicator] ${environment} bridge unavailable: ${error.message}`); }
  }));
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
async function refreshSessionDirectory(client, session) { session.guildDirectory = await getGuildDirectory(client); return session.guildDirectory; }
function directoryGuild(session, id) { return (session.guildDirectory || []).find((item) => item.id === String(id || '')) || null; }
function guildDisplay(session, client, id) {
  if (!id) return '`Not selected`';
  const local = guildById(client, id); if (local) return `${local.name} · ${mode()}`;
  const found = directoryGuild(session, id); return found ? `${found.name} · ${(found.environments || [found.environment]).join('/')}` : id;
}
function guildChoices(session, selectedId = null) {
  return (session.guildDirectory || []).slice(0, 25).map((guild) => ({
    label: guild.name.slice(0, 100),
    description: `${(guild.environments || [guild.environment]).join('/')} • ${guild.id}`.slice(0, 100),
    value: guild.id,
    default: guild.id === selectedId,
  }));
}
async function resolveGuildRoute(client, guildId, session = null) {
  if (guildById(client, guildId)) return { environment: mode(), local: true, id: guildId };
  const directory = session?.guildDirectory?.length ? session.guildDirectory : await getGuildDirectory(client);
  const item = directory.find((entry) => entry.id === String(guildId));
  if (!item) return null;
  const environments = item.environments || [item.environment];
  if (environments.includes(mode())) return { environment: mode(), local: true, id: guildId };
  return { environment: environments[0] || item.environment, local: false, id: guildId };
}
function componentId(prefix, sessionId, action) { return `${prefix}:${sessionId}:${action}`; }
function parseComponentId(customId, prefix) { const parts = String(customId || '').split(':'); return parts[0] === prefix && parts[1] && parts[2] ? { sessionId: parts[1], action: parts.slice(2).join(':') } : null; }
function cleanupSessions(map) { const now = Date.now(); for (const [id, session] of map.entries()) if (!session || session.expiresAt <= now) map.delete(id); }
function getSession(map, interaction, sessionId) { cleanupSessions(map); const session = map.get(sessionId); return session?.ownerId === interaction.user?.id ? session : null; }
function makeSession(interaction, type) {
  const session = {
    id: `${interaction.user.id}-${Date.now().toString(36)}`,
    ownerId: interaction.user.id,
    controlGuildId: interaction.guild.id,
    sourceGuildId: null,
    destinationGuildId: interaction.options?.getString?.('destination_server') || interaction.guild.id,
    templateId: null,
    selectedOptions: [...ACTIVE_OPTIONS],
    conflictMode: 'skip',
    dryRun: false,
    pendingConfirm: false,
    guildDirectory: [],
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  (type === 'build' ? buildSessions : copySessions).set(session.id, session);
  return session;
}
function makeAnalyseSession(interaction) {
  const session = { id: `${interaction.user.id}-${Date.now().toString(36)}`, ownerId: interaction.user.id, controlGuildId: interaction.guild.id, sourceGuildId: null, destinationGuildId: interaction.guild.id, guildDirectory: [], expiresAt: Date.now() + SESSION_TTL_MS };
  analyseSessions.set(session.id, session);
  return session;
}

function channelTemplate(id, name, type, parentId, position) { return { id, name, type, parentId, position, topic: null, nsfw: false, rateLimitPerUser: 0, bitrate: null, userLimit: 0, rtcRegion: null, videoQualityMode: null, defaultAutoArchiveDuration: null, defaultThreadRateLimitPerUser: 0, availableTags: [], permissionOverwrites: [] }; }
function makeTemplate(templateId, name, description, roleDefs, categoryDefs) {
  const roles = roleDefs.map(([roleName, color], index) => ({ id: `template:${templateId}:role:${slugify(roleName)}`, name: roleName, color, hoist: index < 3, mentionable: false, permissions: '0', position: index + 1 }));
  const channels = []; let position = 0;
  for (const [categoryName, children] of categoryDefs) {
    const categoryId = `template:${templateId}:category:${slugify(categoryName)}`;
    channels.push(channelTemplate(categoryId, categoryName, ChannelType.GuildCategory, null, position++));
    for (const [channelName, type] of children) channels.push(channelTemplate(`template:${templateId}:channel:${slugify(channelName)}`, channelName, type, categoryId, position++));
  }
  return { meta: { id: templateId, name, description, version: '1.0.0', createdAt: 'system-default', updatedAt: 'system-default', createdBy: 'Goliath', updatedBy: 'Goliath', sourceGuildId: `template:${templateId}`, sourceGuildName: name, environment: 'DEFAULT', schemaVersion: 2, defaultTemplate: true }, snapshot: { sourceGuild: { id: `template:${templateId}`, name }, options: ['roles', 'categories', 'channels', 'permissions'], settings: null, roles, managedRoles: [], channels, emojis: [], future: {}, stats: { roles: roles.length, managedRoles: 0, categories: channels.filter((c) => c.type === ChannelType.GuildCategory).length, channels: channels.filter((c) => c.type !== ChannelType.GuildCategory).length, permissionOverwrites: 0, emojis: 0 } } };
}
const DEFAULT_TEMPLATES = Object.freeze({
  'basic-gaming': makeTemplate('basic-gaming', 'Basic Gaming', 'Starter gaming community layout.', [['Owner', 0xffc107], ['Admin', 0xef4444], ['Moderator', 0x3b82f6], ['Member', 0x22c55e]], [['INFORMATION', [['welcome', ChannelType.GuildText], ['rules', ChannelType.GuildText], ['announcements', ChannelType.GuildAnnouncement]]], ['COMMUNITY', [['general', ChannelType.GuildText], ['clips-and-media', ChannelType.GuildText], ['looking-for-group', ChannelType.GuildText], ['General Voice', ChannelType.GuildVoice]]]]),
  'community-server': makeTemplate('community-server', 'Community Server', 'Clean public community layout.', [['Owner', 0xffc107], ['Admin', 0xef4444], ['Staff', 0x3b82f6], ['Member', 0x22c55e]], [['START HERE', [['welcome', ChannelType.GuildText], ['rules', ChannelType.GuildText], ['server-info', ChannelType.GuildText]]], ['COMMUNITY', [['general', ChannelType.GuildText], ['introductions', ChannelType.GuildText], ['Community Voice', ChannelType.GuildVoice]]]]),
});

function serializeChannel(channel) {
  return {
    id: channel.id, name: channel.name, type: channel.type, parentId: channel.parentId || null,
    position: channel.rawPosition ?? channel.position ?? 0, topic: channel.topic || null, nsfw: Boolean(channel.nsfw),
    rateLimitPerUser: channel.rateLimitPerUser || 0, bitrate: channel.bitrate || null, userLimit: channel.userLimit || 0,
    rtcRegion: channel.rtcRegion || null, videoQualityMode: channel.videoQualityMode || null,
    defaultAutoArchiveDuration: channel.defaultAutoArchiveDuration || null,
    defaultThreadRateLimitPerUser: channel.defaultThreadRateLimitPerUser || 0,
    availableTags: Array.isArray(channel.availableTags) ? channel.availableTags.map((tag) => ({ name: tag.name, moderated: Boolean(tag.moderated), emojiId: tag.emojiId || null, emojiName: tag.emojiName || null })) : [],
    permissionOverwrites: channel.permissionOverwrites?.cache ? channel.permissionOverwrites.cache.map((o) => ({ id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() })) : [],
  };
}
function serializeManagedRole(role) {
  const tags = role.tags || {};
  return { id: role.id, name: role.name, managed: true, permissions: role.permissions.bitfield.toString(), position: role.position, tags: { botId: tags.botId || null, integrationId: tags.integrationId || null, subscriptionListingId: tags.subscriptionListingId || null } };
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
}

function readTemplates(guildId) { const cfg = moduleConfig(guildId); return cfg.templates && typeof cfg.templates === 'object' && !Array.isArray(cfg.templates) ? cfg.templates : {}; }
function saveTemplates(guildId, value, guildOrMeta = {}) { guildManager.updateGuildSection(guildId, 'modules', (modules) => ({ ...modules, duplicator: { ...(modules.duplicator || {}), enabled: modules.duplicator?.enabled ?? true, hidden: true, ownerOnly: true, templates: value } }), {}, guildOrMeta); return value; }
function templates(guildId, guildOrMeta = {}) { const stored = readTemplates(guildId); return Object.keys(stored).length ? stored : saveTemplates(guildId, JSON.parse(JSON.stringify(DEFAULT_TEMPLATES)), guildOrMeta); }
function templateList(guildId) { return Object.entries(templates(guildId)).filter(([, t]) => t?.snapshot).map(([id, t]) => ({ id, ...t })).sort((a, b) => String(a.meta?.name || a.id).localeCompare(String(b.meta?.name || b.id))); }

function existingRole(guild, name) { return guild.roles.cache.find((r) => !r.managed && r.id !== guild.id && r.name.toLowerCase() === String(name).toLowerCase()); }
function duplicatorCreateChannelType(guild, type) {
  const numeric = Number(type);
  const supported = new Set([ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory, ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice, ChannelType.GuildForum, ChannelType.GuildMedia]);
  if (!supported.has(numeric)) return ChannelType.GuildText;
  if (numeric === ChannelType.GuildAnnouncement && !new Set(guild?.features || []).has('COMMUNITY')) return ChannelType.GuildText;
  return numeric;
}
function existingChannel(guild, channel, parentId = undefined) {
  const type = duplicatorCreateChannelType(guild, channel.type);
  return guild.channels.cache.find((c) => c.type === type && c.name.toLowerCase() === String(channel.name).toLowerCase() && (parentId === undefined || (c.parentId || null) === (parentId || null)));
}
function uniqueName(existingNames, baseName, maxLength = 100) { const base = String(baseName || 'copy').slice(0, maxLength - 8); let candidate = `${base}-copy`; let index = 2; while (existingNames.has(candidate.toLowerCase())) candidate = `${base}-copy-${index++}`.slice(0, maxLength); existingNames.add(candidate.toLowerCase()); return candidate; }
async function bufferFromUrl(url) { if (!url) return null; const response = await fetch(url); if (!response.ok) throw new Error(`Failed to fetch asset: ${response.status}`); return Buffer.from(await response.arrayBuffer()); }
function errorLabel(error) { return `${error?.code ? `Discord ${error.code}` : 'Error'}: ${error?.message || String(error)}`; }
function pushError(log, stage, error) { const message = `[${stage}] ${errorLabel(error)}`; log.errors.push(message); console.error(`[Duplicator] ${message}`, error); }
function hasBotPermission(guild, bit) { return Boolean(guild.members.me?.permissions?.has(bit)); }
function permissionNamesFromBits(value) { try { return new PermissionsBitField(BigInt(value || 0)).toArray(); } catch { return []; } }
function permissionGapNames(guild, value) { return permissionNamesFromBits(value).filter((name) => { const bit = PermissionFlagsBits[name]; return bit && !hasBotPermission(guild, bit); }); }
function botPermissionMask(guild) { return guild.members.me?.permissions?.bitfield || 0n; }
function permittedBits(guild, raw) { return BigInt(raw || 0) & botPermissionMask(guild); }
function deferredBits(guild, raw) { return BigInt(raw || 0) & ~botPermissionMask(guild); }
function namesForBits(bits) { try { return new PermissionsBitField(BigInt(bits || 0)).toArray(); } catch { return []; } }
function addDeferred(log, entry) {
  log.deferredPermissions ||= [];
  const key = `${entry.scope}:${entry.sourceId || ''}:${entry.targetId || ''}:${entry.kind || ''}`;
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
function hierarchyWarning(guild) { const highest = guild.members.me?.roles?.highest; return !highest || Number(highest.position || 0) <= 1 ? 'Goliath role is too low. Move it above roles it needs to create/manage.' : null; }
function runLog(session, snap) {
  return {
    status: session.dryRun ? 'dry-run' : 'running', dryRun: Boolean(session.dryRun), conflictMode: session.conflictMode,
    sourceGuildId: snap.sourceGuild?.id || null, destinationGuildId: session.destinationGuildId || null, rollbackBackupId: null,
    snapshotStats: snap.stats, copied: { serverSettings: 0, roles: 0, categories: 0, channels: 0, permissionOverwrites: 0, emojis: 0 },
    deleted: { roles: 0, channels: 0 }, skipped: [], errors: [], notes: [], deferredPermissions: [], verification: null,
  };
}
function dryRunPlan(guild, snap, conflictMode) {
  const plan = { create: { serverSettings: snap.settings ? 1 : 0, roles: 0, categories: 0, channels: 0, permissionOverwrites: 0, emojis: 0 }, rename: { roles: 0, categories: 0, channels: 0, emojis: 0 }, skip: { roles: 0, categories: 0, channels: 0, emojis: 0 }, delete: { roles: 0, channels: 0 } };
  for (const role of snap.roles || []) {
    const found = existingRole(guild, role.name);
    if (!found) plan.create.roles += 1;
    else if (conflictMode === 'skip') plan.skip.roles += 1;
    else if (conflictMode === 'rename') { plan.rename.roles += 1; plan.create.roles += 1; }
    else { plan.delete.roles += 1; plan.create.roles += 1; }
  }
  for (const channel of snap.channels || []) {
    const found = existingChannel(guild, channel);
    const key = channel.type === ChannelType.GuildCategory ? 'categories' : 'channels';
    if (!found) plan.create[key] += 1;
    else if (conflictMode === 'skip') plan.skip[key] += 1;
    else if (conflictMode === 'rename') { plan.rename[key] += 1; plan.create[key] += 1; }
    else { plan.delete.channels += 1; plan.create[key] += 1; }
  }
  plan.create.permissionOverwrites = (snap.channels || []).reduce((total, channel) => total + (channel.permissionOverwrites?.length || 0), 0);
  plan.create.emojis = (snap.emojis || []).length;
  return plan;
}
function applyDryRunPlan(log, plan) {
  log.copied = { ...log.copied, ...plan.create };
  log.deleted = { ...log.deleted, ...plan.delete };
  log.notes.push('Dry run only — no changes were made.');
}

async function clearDestination(guild, log) {
  for (const channel of [...guild.channels.cache.values()].sort((a, b) => b.position - a.position)) {
    try { await channel.delete('Goliath duplicator: replace destination'); log.deleted.channels += 1; } catch (error) { pushError(log, `Delete channel ${channel.name}`, error); }
  }
  const botHighest = guild.members.me?.roles?.highest?.position ?? 0;
  const roles = guild.roles.cache.filter((r) => r.id !== guild.id && !r.managed && r.editable && r.position < botHighest).sort((a, b) => b.position - a.position);
  for (const role of roles.values()) { try { await role.delete('Goliath duplicator: replace roles'); log.deleted.roles += 1; } catch (error) { pushError(log, `Delete role ${role.name}`, error); } }
}
async function applySettings(guild, snap, log) {
  if (!snap.settings) return;
  if (!hasBotPermission(guild, PermissionFlagsBits.ManageGuild)) { log.notes.push('Server settings skipped: Goliath lacks ManageGuild.'); return; }
  const s = snap.settings; const payload = {};
  if (s.name) payload.name = s.name;
  if (s.description !== undefined) payload.description = s.description || null;
  if (Number.isFinite(s.verificationLevel)) payload.verificationLevel = s.verificationLevel;
  if (Number.isFinite(s.explicitContentFilter)) payload.explicitContentFilter = s.explicitContentFilter;
  if (Number.isFinite(s.defaultMessageNotifications)) payload.defaultMessageNotifications = s.defaultMessageNotifications;
  if (Number.isFinite(s.afkTimeout)) payload.afkTimeout = s.afkTimeout;
  if (s.iconURL) payload.icon = await bufferFromUrl(s.iconURL).catch(() => null);
  if (s.bannerURL) payload.banner = await bufferFromUrl(s.bannerURL).catch(() => null);
  if (s.splashURL) payload.splash = await bufferFromUrl(s.splashURL).catch(() => null);
  if (Object.keys(payload).length) { await guild.edit(payload, 'Goliath duplicator: settings'); log.copied.serverSettings = Object.keys(payload).length; }
}
async function applyManagedRoleMappings(guild, snap, maps, log) {
  const destinationManaged = [...guild.roles.cache.values()].filter((role) => role.managed);
  for (const sourceRole of snap.managedRoles || []) {
    let target = null;
    const sourceBotId = sourceRole.tags?.botId || null;
    if (sourceBotId && sourceBotId === snap.sourceGuild?.botUserId) target = destinationManaged.find((role) => role.tags?.botId === guild.client.user?.id) || null;
    if (!target && sourceBotId) target = destinationManaged.find((role) => role.tags?.botId === sourceBotId) || null;
    if (!target) {
      const sameName = destinationManaged.filter((role) => role.name.toLowerCase() === String(sourceRole.name || '').toLowerCase());
      if (sameName.length === 1) target = sameName[0];
    }
    if (target) { maps.roles.set(sourceRole.id, target.id); log.notes.push(`Managed role remapped: ${sourceRole.name} -> ${target.name}.`); }
    else log.notes.push(`Managed role not transferable: ${sourceRole.name}. Matching bot/integration is absent from destination.`);
  }
}
async function applyRoles(guild, snap, maps, log, conflictMode) {
  const names = new Set(guild.roles.cache.map((r) => r.name.toLowerCase()));
  const botHighest = guild.members.me?.roles?.highest?.position ?? 0;
  if (!hasBotPermission(guild, PermissionFlagsBits.ManageRoles)) {
    log.errors.push('Cannot create/map normal roles: Goliath lacks ManageRoles.');
    return;
  }
  for (const role of [...(snap.roles || [])].sort((a, b) => a.position - b.position)) {
    try {
      const found = existingRole(guild, role.name);
      if (found && conflictMode === 'skip') { maps.roles.set(role.id, found.id); log.skipped.push(`Role exists/reused: ${role.name}`); continue; }
      if (found && conflictMode === 'replace') {
        if (found.editable && found.position < botHighest) { await found.delete('Goliath duplicator: replace role'); log.deleted.roles += 1; }
        else { maps.roles.set(role.id, found.id); log.skipped.push(`Role reused because hierarchy prevents replacement: ${role.name}`); continue; }
      }
      const name = found && conflictMode === 'rename' ? uniqueName(names, role.name, 100) : role.name;
      const requested = BigInt(role.permissions || 0);
      const allowed = permittedBits(guild, requested);
      const deferred = deferredBits(guild, requested);
      if (deferred) addDeferred(log, { scope: 'role', sourceId: role.id, sourceName: role.name, kind: 'base-permissions', requested: requested.toString(), applied: allowed.toString(), missing: namesForBits(deferred) });
      const created = await guild.roles.create({ name, color: Number(role.color || 0), hoist: Boolean(role.hoist), mentionable: Boolean(role.mentionable), permissions: allowed, reason: 'Goliath duplicator: least-privilege role copy' });
      let verified = await guild.roles.fetch(created.id).catch(() => null);
      if (!verified || verified.guild.id !== guild.id) throw new Error(`Role create verification failed for ${role.name}`);
      if (verified.permissions.bitfield !== allowed) {
        await verified.setPermissions(allowed, 'Goliath duplicator: permission verification repair');
        verified = await guild.roles.fetch(created.id).catch(() => null);
      }
      if (!verified || verified.permissions.bitfield !== allowed) throw new Error(`Role permission verification mismatch for ${role.name}`);
      maps.roles.set(role.id, verified.id);
      maps.createdRoles.add(verified.id);
      maps.rolePositions.set(verified.id, Number(role.position || 0));
      names.add(verified.name.toLowerCase());
    } catch (error) { pushError(log, `Role ${role.name}`, error); log.skipped.push(`Role failed: ${role.name}`); }
  }
  for (const [roleId, position] of maps.rolePositions.entries()) {
    const role = guild.roles.cache.get(roleId); if (!role) continue;
    try { await role.setPosition(Math.min(Math.max(1, position), Math.max(1, botHighest - 1)), 'Goliath duplicator: role order'); }
    catch (error) { log.notes.push(`Role order not fully restored for ${role.name}: ${error.message}`); }
  }
}
function channelPayload(guild, channel, parentId = null, name = null) {
  const type = duplicatorCreateChannelType(guild, channel.type);
  const payload = { name: name || channel.name, type, reason: 'Goliath duplicator: channel' };
  if (parentId) payload.parent = parentId;
  if ([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(type)) { payload.topic = channel.topic || undefined; payload.nsfw = Boolean(channel.nsfw); payload.rateLimitPerUser = channel.rateLimitPerUser || 0; }
  if ([ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(type)) { payload.bitrate = channel.bitrate || undefined; payload.userLimit = channel.userLimit || 0; payload.rtcRegion = channel.rtcRegion || undefined; payload.videoQualityMode = channel.videoQualityMode || undefined; }
  if ([ChannelType.GuildForum, ChannelType.GuildMedia].includes(type)) { payload.defaultAutoArchiveDuration = channel.defaultAutoArchiveDuration || undefined; payload.defaultThreadRateLimitPerUser = channel.defaultThreadRateLimitPerUser || 0; if (channel.availableTags?.length) payload.availableTags = channel.availableTags; }
  return payload;
}
async function applyChannels(guild, snap, maps, log, conflictMode) {
  if (!hasBotPermission(guild, PermissionFlagsBits.ManageChannels)) { log.errors.push('Cannot create channels/categories: Goliath lacks ManageChannels.'); return; }
  const names = new Set(guild.channels.cache.map((c) => c.name.toLowerCase()));
  const categories = (snap.channels || []).filter((c) => c.type === ChannelType.GuildCategory).sort((a, b) => a.position - b.position);
  const channels = (snap.channels || []).filter((c) => c.type !== ChannelType.GuildCategory).sort((a, b) => a.position - b.position);
  for (const category of categories) {
    try {
      const found = existingChannel(guild, category, null);
      if (found && conflictMode === 'skip') { maps.channels.set(category.id, found.id); log.skipped.push(`Category exists/reused: ${category.name}`); continue; }
      if (found && conflictMode === 'replace' && found.deletable) { await found.delete('Goliath duplicator: replace category'); log.deleted.channels += 1; }
      const name = found && conflictMode === 'rename' ? uniqueName(names, category.name, 100) : category.name;
      const created = await guild.channels.create(channelPayload(guild, category, null, name));
      const verified = await guild.channels.fetch(created.id).catch(() => null);
      if (!verified || verified.guild.id !== guild.id) throw new Error(`Category create verification failed for ${category.name}`);
      maps.channels.set(category.id, verified.id); maps.createdCategories.add(verified.id); maps.channelPositions.set(verified.id, Number(category.position || 0)); names.add(verified.name.toLowerCase());
    } catch (error) { pushError(log, `Category ${category.name}`, error); }
  }
  for (const channel of channels) {
    try {
      const parentId = channel.parentId ? maps.channels.get(channel.parentId) || null : null;
      const found = existingChannel(guild, channel, parentId);
      if (found && conflictMode === 'skip') { maps.channels.set(channel.id, found.id); log.skipped.push(`Channel exists/reused: ${channel.name}`); continue; }
      if (found && conflictMode === 'replace' && found.deletable) { await found.delete('Goliath duplicator: replace channel'); log.deleted.channels += 1; }
      const name = found && conflictMode === 'rename' ? uniqueName(names, channel.name, 100) : channel.name;
      const created = await guild.channels.create(channelPayload(guild, channel, parentId, name));
      const verified = await guild.channels.fetch(created.id).catch(() => null);
      if (!verified || verified.guild.id !== guild.id) throw new Error(`Channel create verification failed for ${channel.name}`);
      maps.channels.set(channel.id, verified.id); maps.createdChannels.add(verified.id); maps.channelPositions.set(verified.id, Number(channel.position || 0)); names.add(verified.name.toLowerCase());
    } catch (error) { pushError(log, `Channel ${channel.name}`, error); }
  }
}
async function buildTransferableOverwrites(guild, snap, sourceChannel, maps, log) {
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
    if (!mappedId) { log.notes.push(`Permission target skipped on ${sourceChannel.name}: ${overwrite.id} is not mapped/present.`); continue; }
    if (type === 0 && mappedId !== guild.id) {
      const targetRole = guild.roles.cache.get(mappedId) || await guild.roles.fetch(mappedId).catch(() => null);
      if (!targetRole) { log.notes.push(`Permission role missing on ${sourceChannel.name}: ${mappedId}.`); continue; }
      if (targetRole.position >= botHighest) { log.notes.push(`Permission overwrite deferred on ${sourceChannel.name}: ${targetRole.name} is at/above Goliath hierarchy.`); continue; }
    }
    const requestedAllow = BigInt(overwrite.allow || 0);
    const requestedDeny = BigInt(overwrite.deny || 0);
    const appliedAllow = permittedBits(guild, requestedAllow);
    const appliedDeny = permittedBits(guild, requestedDeny);
    const missing = [...new Set([...namesForBits(deferredBits(guild, requestedAllow)), ...namesForBits(deferredBits(guild, requestedDeny))])].sort();
    if (missing.length) addDeferred(log, { scope: 'overwrite', sourceId: sourceChannel.id, sourceName: sourceChannel.name, targetId: overwrite.id, mappedTargetId: mappedId, kind: type === 0 ? 'role-overwrite' : 'member-overwrite', requestedAllow: requestedAllow.toString(), requestedDeny: requestedDeny.toString(), appliedAllow: appliedAllow.toString(), appliedDeny: appliedDeny.toString(), missing });
    overwrites.push({ id: mappedId, type, allow: appliedAllow, deny: appliedDeny });
  }
  return overwrites;
}
async function verifyOverwrites(channel, expected, sourceChannelName) {
  const refreshed = await channel.guild.channels.fetch(channel.id).catch(() => null);
  if (!refreshed) throw new Error(`Permission verification failed for ${sourceChannelName}`);
  let verifiedCount = 0;
  for (const item of expected) {
    const actual = refreshed.permissionOverwrites.cache.get(item.id);
    if (!actual) throw new Error(`Permission overwrite missing after copy on ${sourceChannelName}: ${item.id}`);
    if (actual.allow.bitfield !== BigInt(item.allow) || actual.deny.bitfield !== BigInt(item.deny)) throw new Error(`Permission overwrite mismatch after copy on ${sourceChannelName}: ${item.id}`);
    verifiedCount += 1;
  }
  return verifiedCount;
}
async function applyPermissions(guild, snap, maps, log) {
  if (!hasBotPermission(guild, PermissionFlagsBits.ManageRoles)) { log.errors.push('Channel/category overwrites skipped: Goliath lacks ManageRoles.'); return; }
  for (const sourceChannel of snap.channels || []) {
    try {
      const targetId = maps.channels.get(sourceChannel.id); if (!targetId) continue;
      const channel = guild.channels.cache.get(targetId) || await guild.channels.fetch(targetId).catch(() => null);
      if (!channel?.permissionOverwrites?.set) continue;
      const overwrites = await buildTransferableOverwrites(guild, snap, sourceChannel, maps, log);
      await channel.permissionOverwrites.set(overwrites, 'Goliath duplicator: least-privilege channel/category permissions');
      log.copied.permissionOverwrites += await verifyOverwrites(channel, overwrites, sourceChannel.name);
    } catch (error) { pushError(log, `Permissions ${sourceChannel.name}`, error); }
  }
}
async function applyEmojis(guild, snap, maps, log, conflictMode) {
  if (!(snap.emojis || []).length) return;
  if (!hasBotPermission(guild, PermissionFlagsBits.ManageEmojisAndStickers)) { log.notes.push('Emojis skipped: Goliath lacks ManageEmojisAndStickers.'); return; }
  const names = new Set(guild.emojis.cache.map((e) => e.name.toLowerCase()));
  for (const emoji of snap.emojis || []) {
    try {
      if (!emoji.url || !emoji.name) continue;
      if (names.has(emoji.name.toLowerCase()) && conflictMode === 'skip') continue;
      const name = names.has(emoji.name.toLowerCase()) && conflictMode === 'rename' ? uniqueName(names, emoji.name, 32).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32) : emoji.name;
      const created = await guild.emojis.create({ attachment: emoji.url, name, reason: 'Goliath duplicator: emoji' });
      const verified = await guild.emojis.fetch(created.id).catch(() => null); if (!verified) throw new Error(`Emoji create verification failed for ${emoji.name}`);
      maps.createdEmojis.add(verified.id); names.add(verified.name.toLowerCase());
    } catch (error) { pushError(log, `Emoji ${emoji.name}`, error); }
  }
}
async function verifyCopyResult(guild, snap, maps, log) {
  await fetchGuildState(guild);
  if (String(guild.id) !== String(log.destinationGuildId)) throw new Error(`Destination verification mismatch: expected ${log.destinationGuildId}, got ${guild.id}`);
  const roleIds = [...maps.createdRoles], categoryIds = [...maps.createdCategories], channelIds = [...maps.createdChannels], emojiIds = [...maps.createdEmojis];
  const verifiedRoles = roleIds.filter((id) => guild.roles.cache.has(id));
  const verifiedCategories = categoryIds.filter((id) => guild.channels.cache.has(id));
  const verifiedChannels = channelIds.filter((id) => guild.channels.cache.has(id));
  const verifiedEmojis = emojiIds.filter((id) => guild.emojis.cache.has(id));
  log.copied.roles = verifiedRoles.length; log.copied.categories = verifiedCategories.length; log.copied.channels = verifiedChannels.length; log.copied.emojis = verifiedEmojis.length;
  log.verification = { destinationGuildId: guild.id, destinationGuildName: guild.name, roles: verifiedRoles.length, categories: verifiedCategories.length, channels: verifiedChannels.length, emojis: verifiedEmojis.length, deferredPermissions: log.deferredPermissions.length };
  if (verifiedRoles.length !== roleIds.length) log.errors.push(`Post-copy verification: ${roleIds.length - verifiedRoles.length} created role(s) missing.`);
  if (verifiedCategories.length !== categoryIds.length) log.errors.push(`Post-copy verification: ${categoryIds.length - verifiedCategories.length} created category(s) missing.`);
  if (verifiedChannels.length !== channelIds.length) log.errors.push(`Post-copy verification: ${channelIds.length - verifiedChannels.length} created channel(s) missing.`);
}
function resultEmbed(title, guild, log) {
  const deferredNames = [...new Set((log.deferredPermissions || []).flatMap((item) => item.missing || []))].sort();
  return embed(title, [
    `**Destination:** ${guild.name} (${guild.id || log.destinationGuildId})`,
    `**Source ID:** \`${log.sourceGuildId || 'unknown'}\``,
    `**Status:** \`${log.status}\``,
    `**Conflict:** \`${log.conflictMode}\``,
    `**Rollback:** \`${log.rollbackBackupId || (log.dryRun ? 'dry-run' : 'none')}\``,
    '',
    `Verified: Settings \`${log.copied.serverSettings}\` • Roles \`${log.copied.roles}\` • Categories \`${log.copied.categories}\` • Channels \`${log.copied.channels}\` • Permissions \`${log.copied.permissionOverwrites}\` • Emojis \`${log.copied.emojis}\``,
    deferredNames.length ? `Deferred permission bits (${deferredNames.length}): ${deferredNames.join(', ')}` : '',
    log.notes.length ? `Notes:\n${log.notes.slice(0, 8).map((i) => `• ${i}`).join('\n')}` : '',
    log.errors.length ? `Warnings/Errors:\n${log.errors.slice(0, 8).map((e) => `⚠️ ${e}`).join('\n')}` : '',
  ].filter(Boolean).join('\n'), log.errors.length || deferredNames.length ? 0xf59e0b : 0x22c55e);
}
async function executeStage(name, log, fn) { console.log(`[Duplicator] Stage start: ${name}`); try { await fn(); console.log(`[Duplicator] Stage complete: ${name}`); } catch (error) { pushError(log, name, error); } }
async function executeSnapshotOnGuild(guild, session, snap, title, actorId = 'bridge') {
  await fetchGuildState(guild);
  const log = runLog(session, snap);
  const operationMissing = missingOperationPermissions(guild, snap);
  const capabilityGaps = transferCapabilityGaps(guild, snap);
  if (operationMissing.length) log.errors.push(`Operational permissions missing: ${operationMissing.join(', ')}. Administrator is NOT required; grant only these permissions if you want those operations to run.`);
  if (capabilityGaps.length) log.notes.push(`Least-privilege mode: unsupported source permission bits will be deferred, not block the copy: ${capabilityGaps.join(', ')}.`);
  const hierarchy = hierarchyWarning(guild); if (hierarchy) log.notes.push(hierarchy);
  for (const [key, item] of Object.entries(snap.future || {})) if (item?.requested && !item.supported) log.notes.push(`${COPY_OPTIONS[key] || key}: ${item.reason}`);
  if (session.dryRun) {
    applyDryRunPlan(log, dryRunPlan(guild, snap, session.conflictMode));
    for (const name of capabilityGaps) addDeferred(log, { scope: 'preflight', kind: 'capability', missing: [name] });
    log.status = operationMissing.includes('ManageRoles') || operationMissing.includes('ManageChannels') ? 'dry-run-limited' : capabilityGaps.length ? 'dry-run-partial-permissions' : 'dry-run';
    return log;
  }
  try { const rollback = await createServerBackup(guild, { createdBy: `duplicator:${actorId}`, requestedBy: actorId, reason: `Rollback before ${title}`, type: 'rollback' }); log.rollbackBackupId = rollback.backupId; } catch (error) { pushError(log, 'Rollback backup', error); }
  if (session.conflictMode === 'replace' && hasBotPermission(guild, PermissionFlagsBits.ManageChannels) && hasBotPermission(guild, PermissionFlagsBits.ManageRoles)) await executeStage('Replace destination', log, async () => { await clearDestination(guild, log); await fetchGuildState(guild); });
  if (String(guild.id) !== String(session.destinationGuildId)) throw new Error(`Destination mismatch before copy: expected ${session.destinationGuildId}, got ${guild.id}`);
  const maps = { roles: new Map([[snap.sourceGuild?.id, guild.id]]), channels: new Map(), createdRoles: new Set(), createdCategories: new Set(), createdChannels: new Set(), createdEmojis: new Set(), rolePositions: new Map(), channelPositions: new Map() };
  await executeStage('Server settings', log, () => applySettings(guild, snap, log));
  await executeStage('Managed role remap', log, () => applyManagedRoleMappings(guild, snap, maps, log));
  await executeStage('Roles', log, () => applyRoles(guild, snap, maps, log, session.conflictMode));
  await executeStage('Channels', log, () => applyChannels(guild, snap, maps, log, session.conflictMode));
  await executeStage('Permissions', log, () => applyPermissions(guild, snap, maps, log));
  await executeStage('Emojis', log, () => applyEmojis(guild, snap, maps, log, session.conflictMode));
  await executeStage('Verify destination', log, () => verifyCopyResult(guild, snap, maps, log));
  if (log.errors.length) log.status = log.copied.categories + log.copied.channels + log.copied.roles > 0 ? 'completed-with-warnings' : 'failed';
  else if (log.deferredPermissions.length) log.status = 'partial-permissions';
  else log.status = 'success';
  return log;
}

async function snapshotForGuild(client, guildId, selectedOptions, session = null) {
  const route = await resolveGuildRoute(client, guildId, session); if (!route) throw new Error('Source server is unavailable to every Goliath environment.');
  if (route.local) { const result = await fetchGuildById(client, guildId); if (!result.guild) throw new Error('Source server is unavailable.'); await fetchGuildState(result.guild); return snapshot(result.guild, selectedOptions); }
  const response = await bridgeRequest(route.environment, 'POST', '/snapshot', { guildId, selectedOptions }, 10000); return response.snapshot;
}
async function executeSnapshot(interaction, session, snap, title) {
  const route = await resolveGuildRoute(interaction.client, session.destinationGuildId, session); if (!route) throw new Error('Destination server is unavailable to every Goliath environment.');
  let guildInfo, log;
  if (route.local) {
    const result = await fetchGuildById(interaction.client, session.destinationGuildId); if (!result.guild) throw new Error('Destination server is unavailable.');
    guildInfo = { id: result.guild.id, name: result.guild.name };
    log = await executeSnapshotOnGuild(result.guild, session, snap, title, interaction.user.id);
  } else {
    const response = await bridgeRequest(route.environment, 'POST', '/apply', { guildId: session.destinationGuildId, session: { dryRun: session.dryRun, conflictMode: session.conflictMode, destinationGuildId: session.destinationGuildId }, snapshot: snap, title, actorId: interaction.user.id }, 120000);
    guildInfo = response.guild; log = response.log;
  }
  if (String(log.status || '').startsWith('dry-run')) { session.lastDryRun = { guildInfo, log }; session.expiresAt = Date.now() + SESSION_TTL_MS; }
  return log;
}

async function readBridgeBody(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; }
function bridgeAuthorized(req) { const configured = bridgeSecret(); return !configured || req.headers['x-goliath-duplicator-secret'] === configured; }
function bridgeJson(res, status, value) { const body = Buffer.from(JSON.stringify(value)); res.writeHead(status, { 'content-type': 'application/json', 'content-length': String(body.length) }); res.end(body); }
function initializeBridge(client) {
  bridgeClient = client;
  if (bridgeServer) return bridgeServer;
  const port = Number(process.env.BOT_API_PORT || bridgePort(mode()));
  bridgeServer = http.createServer(async (req, res) => {
    try {
      if (!bridgeAuthorized(req)) return bridgeJson(res, 403, { error: 'Forbidden' });
      if (req.method === 'GET' && req.url === '/guilds') return bridgeJson(res, 200, { environment: mode(), guilds: localGuildDirectory(bridgeClient) });
      if (req.method === 'POST' && req.url === '/snapshot') { const body = await readBridgeBody(req); const result = await fetchGuildById(bridgeClient, body.guildId); if (!result.guild) return bridgeJson(res, 404, { error: 'Guild unavailable' }); await fetchGuildState(result.guild); return bridgeJson(res, 200, { snapshot: snapshot(result.guild, body.selectedOptions || [...ACTIVE_OPTIONS]) }); }
      if (req.method === 'POST' && req.url === '/apply') { const body = await readBridgeBody(req); const result = await fetchGuildById(bridgeClient, body.guildId); if (!result.guild) return bridgeJson(res, 404, { error: 'Guild unavailable' }); const bridgeSession = { dryRun: true, conflictMode: 'skip', ...(body.session || {}), destinationGuildId: body.guildId }; const log = await executeSnapshotOnGuild(result.guild, bridgeSession, body.snapshot, body.title || 'Copy', body.actorId || 'bridge'); return bridgeJson(res, 200, { guild: { id: result.guild.id, name: result.guild.name }, log }); }
      return bridgeJson(res, 404, { error: 'Not found' });
    } catch (error) { console.error('[Duplicator Bridge]', error); return bridgeJson(res, 500, { error: error.message || String(error) }); }
  });
  bridgeServer.on('error', (error) => { console.error(`[Duplicator] Bridge failed on ${BRIDGE_HOST}:${port}:`, error); bridgeServer = null; });
  bridgeServer.listen(port, BRIDGE_HOST, () => console.log(`[Duplicator] ${mode()} bridge listening on ${BRIDGE_HOST}:${port}`));
  bridgeServer.unref?.();
  return bridgeServer;
}

function conflictChoices(selected = 'skip') { return Object.entries(CONFLICT_MODES).map(([value, label]) => ({ label, value, default: selected === value })); }
function copyOptionChoices(selectedOptions = []) { const selected = new Set(selectedOptions); return Object.entries(COPY_OPTIONS).map(([value, label]) => ({ label, value, default: selected.has(value) })); }
async function copyPanel(interaction, session) {
  if (!session.guildDirectory?.length) await refreshSessionDirectory(interaction.client, session);
  return { embeds: [embed('🛠️ Server Duplicator — Copy', `Source: ${guildDisplay(session, interaction.client, session.sourceGuildId)}\nDestination: ${guildDisplay(session, interaction.client, session.destinationGuildId)}\n\nAdministrator is not required. Goliath will use least-privilege capability-aware copying.`)], components: [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(COPY_PREFIX, session.id, 'source')).setPlaceholder('Source server').addOptions(guildChoices(session, session.sourceGuildId))),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(COPY_PREFIX, session.id, 'destination')).setPlaceholder('Destination server').addOptions(guildChoices(session, session.destinationGuildId))),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(COPY_PREFIX, session.id, 'options')).setPlaceholder('What to copy').setMinValues(1).setMaxValues(Object.keys(COPY_OPTIONS).length).addOptions(copyOptionChoices(session.selectedOptions))),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(COPY_PREFIX, session.id, 'conflict')).setPlaceholder('Conflict mode').addOptions(conflictChoices(session.conflictMode))),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(componentId(COPY_PREFIX, session.id, 'start')).setLabel('Start Copy').setStyle(ButtonStyle.Success).setDisabled(!session.sourceGuildId || !session.destinationGuildId || session.sourceGuildId === session.destinationGuildId), new ButtonBuilder().setCustomId(componentId(COPY_PREFIX, session.id, 'cancel')).setLabel('Cancel').setStyle(ButtonStyle.Danger)),
  ], flags: MessageFlags.Ephemeral };
}
async function analysePanel(interaction, session) {
  if (!session.guildDirectory?.length) await refreshSessionDirectory(interaction.client, session);
  return { embeds: [embed('🔎 Server Duplicator — Analyse', 'Choose source and destination.')], components: [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(ANALYSE_PREFIX, session.id, 'source')).setPlaceholder('Source server').addOptions(guildChoices(session, session.sourceGuildId))),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(componentId(ANALYSE_PREFIX, session.id, 'destination')).setPlaceholder('Destination server').addOptions(guildChoices(session, session.destinationGuildId))),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(componentId(ANALYSE_PREFIX, session.id, 'start')).setLabel('Analyse Servers').setStyle(ButtonStyle.Primary).setDisabled(!session.sourceGuildId || !session.destinationGuildId || session.sourceGuildId === session.destinationGuildId)),
  ], flags: MessageFlags.Ephemeral };
}
async function startCopy(interaction) { const access = assertAccess(interaction); if (!access.allowed) return interaction.reply({ content: `❌ ${access.reason}`, flags: MessageFlags.Ephemeral }); initializeBridge(interaction.client); const session = makeSession(interaction, 'copy'); await refreshSessionDirectory(interaction.client, session); return interaction.reply(await copyPanel(interaction, session)); }
async function startBuild(interaction) { const access = assertAccess(interaction); if (!access.allowed) return interaction.reply({ content: `❌ ${access.reason}`, flags: MessageFlags.Ephemeral }); return interaction.reply({ content: '🏗️ Build remains available through saved templates; selective Copy is the recommended DEV workflow.', flags: MessageFlags.Ephemeral }); }
async function exportTemplate(interaction) {
  const access = assertAccess(interaction); if (!access.allowed) return interaction.reply({ content: `❌ ${access.reason}`, flags: MessageFlags.Ephemeral });
  initializeBridge(interaction.client);
  const name = interaction.options.getString('name'); if (!name) return interaction.reply({ content: '❌ Export needs `name`.', flags: MessageFlags.Ephemeral });
  const sourceGuildId = interaction.options.getString('source_server') || interaction.guild.id;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const directory = await getGuildDirectory(interaction.client);
  const snap = await snapshotForGuild(interaction.client, sourceGuildId, [...ACTIVE_OPTIONS], { guildDirectory: directory });
  const templateId = slugify(interaction.options.getString('template_id') || name);
  const all = templates(interaction.guild.id, interaction.guild);
  all[templateId] = { meta: { id: templateId, name, description: interaction.options.getString('description') || '', version: interaction.options.getString('version') || '2.0.0', sourceGuildId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: interaction.user.id, updatedBy: interaction.user.id, environment: mode(), schemaVersion: 2, defaultTemplate: false }, snapshot: snap };
  saveTemplates(interaction.guild.id, all, interaction.guild);
  return interaction.editReply({ embeds: [embed('✅ Template Exported', `**Template:** ${name}\n**ID:** \`${templateId}\``)] });
}
async function analyse(interaction) {
  const access = assertAccess(interaction); if (!access.allowed) return interaction.reply({ content: `❌ ${access.reason}`, flags: MessageFlags.Ephemeral });
  initializeBridge(interaction.client);
  const sourceGuildId = String(interaction.options.getString('source_server') || '').trim();
  const destinationGuildId = String(interaction.options.getString('destination_server') || '').trim();
  if (!sourceGuildId || !destinationGuildId) { const session = makeAnalyseSession(interaction); await refreshSessionDirectory(interaction.client, session); return interaction.reply(await analysePanel(interaction, session)); }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const directory = await getGuildDirectory(interaction.client);
  const snap = await snapshotForGuild(interaction.client, sourceGuildId, [...ACTIVE_OPTIONS], { guildDirectory: directory });
  const route = await resolveGuildRoute(interaction.client, destinationGuildId, { guildDirectory: directory });
  if (!route) return interaction.editReply('❌ Destination unavailable.');
  let response;
  if (route.local) { const result = await fetchGuildById(interaction.client, destinationGuildId); const session = { dryRun: true, conflictMode: 'skip', destinationGuildId }; response = { guild: { id: result.guild.id, name: result.guild.name }, log: await executeSnapshotOnGuild(result.guild, session, snap, 'Analyse', interaction.user.id) }; }
  else response = await bridgeRequest(route.environment, 'POST', '/apply', { guildId: destinationGuildId, session: { dryRun: true, conflictMode: 'skip', destinationGuildId }, snapshot: snap, title: 'Analyse', actorId: interaction.user.id }, 120000);
  return interaction.editReply({ embeds: [resultEmbed('🔎 Duplicator Analyse', response.guild, response.log)] });
}
async function run(interaction) { const action = interaction.options.getString('action', true); if (action === 'copy') return startCopy(interaction); if (action === 'analyse') return analyse(interaction); if (action === 'export') return exportTemplate(interaction); if (action === 'build') return startBuild(interaction); return interaction.reply({ content: '❌ Unknown server action.', flags: MessageFlags.Ephemeral }); }
async function handleCopy(interaction, data) {
  const session = getSession(copySessions, interaction, data.sessionId); if (!session) return false;
  if (data.action === 'source') session.sourceGuildId = interaction.values?.[0];
  else if (data.action === 'destination') session.destinationGuildId = interaction.values?.[0];
  else if (data.action === 'options') session.selectedOptions = interaction.values || [...ACTIVE_OPTIONS];
  else if (data.action === 'conflict') session.conflictMode = interaction.values?.[0] || 'skip';
  else if (data.action === 'cancel') { copySessions.delete(session.id); return interaction.update({ embeds: [embed('❌ Copy Cancelled', 'No changes were made.', 0xef4444)], components: [] }); }
  else if (data.action === 'start') {
    const snap = await snapshotForGuild(interaction.client, session.sourceGuildId, session.selectedOptions, session);
    await interaction.update({ embeds: [embed('🚧 Copy Running', 'Working...')], components: [] });
    const log = await executeSnapshot(interaction, session, snap, 'Copy');
    const destination = directoryGuild(session, session.destinationGuildId) || { id: session.destinationGuildId, name: session.destinationGuildId };
    copySessions.delete(session.id);
    return interaction.editReply({ embeds: [resultEmbed('✅ Copy Complete', destination, log)], components: [] });
  }
  return interaction.update(await copyPanel(interaction, session));
}
async function handleAnalyse(interaction, data) {
  const session = getSession(analyseSessions, interaction, data.sessionId); if (!session) return false;
  if (data.action === 'source') session.sourceGuildId = interaction.values?.[0];
  else if (data.action === 'destination') session.destinationGuildId = interaction.values?.[0];
  else if (data.action === 'start') {
    await interaction.update({ embeds: [embed('🔎 Analysing Servers', 'Working...')], components: [] });
    const snap = await snapshotForGuild(interaction.client, session.sourceGuildId, [...ACTIVE_OPTIONS], session);
    const route = await resolveGuildRoute(interaction.client, session.destinationGuildId, session);
    let response;
    if (route.local) { const result = await fetchGuildById(interaction.client, session.destinationGuildId); response = { guild: { id: result.guild.id, name: result.guild.name }, log: await executeSnapshotOnGuild(result.guild, { dryRun: true, conflictMode: 'skip', destinationGuildId: session.destinationGuildId }, snap, 'Analyse', interaction.user.id) }; }
    else response = await bridgeRequest(route.environment, 'POST', '/apply', { guildId: session.destinationGuildId, session: { dryRun: true, conflictMode: 'skip', destinationGuildId: session.destinationGuildId }, snapshot: snap, title: 'Analyse', actorId: interaction.user.id }, 120000);
    analyseSessions.delete(session.id);
    return interaction.editReply({ embeds: [resultEmbed('🔎 Duplicator Analyse', response.guild, response.log)], components: [] });
  }
  return interaction.update(await analysePanel(interaction, session));
}
async function handleInteraction(interaction) {
  if (!interaction?.customId) return false;
  const analyseData = parseComponentId(interaction.customId, ANALYSE_PREFIX); if (analyseData) { await handleAnalyse(interaction, analyseData); return true; }
  const copyData = parseComponentId(interaction.customId, COPY_PREFIX); if (copyData) { await handleCopy(interaction, copyData); return true; }
  return false;
}

module.exports = {
  run,
  handleInteraction,
  assertAccess,
  snapshot,
  templates,
  templateList,
  DEFAULT_TEMPLATES,
  initializeBridge,
  getGuildDirectory,
};
