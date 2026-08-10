'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  Events,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const audit = require('./auditIntelligence');
const auditRouter = require('./auditRouter');
const auditStore = require('./auditStore');
const security = require('../../core/security/securityCore');
const { snapshotMember, buildReport } = require('./userIntelligence');
const { buildUserIntelligenceEmbed, buildUserIntelligenceSectionEmbed, buildCommandCenterSetup } = require('./auditEmbeds');

const wired = new WeakSet();
const routingSessions = new Map();
const monitoringSessions = new Map();
const structureSessions = new Map();
const intelligenceSessions = new Map();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ROUTE_LABELS = {
  guild: 'Guild / System Events',
  members: 'Member Events',
  moderation: 'Moderation',
  security: 'Security / AutoMod',
  messages: 'Messages / Reactions',
  voice: 'Voice Activity',
  roles: 'Roles / Permissions',
  goliath: 'Goliath Actions',
  default: 'Fallback / All Other Events',
};
const MONITOR_LABELS = {
  guild: 'Guild / System Events',
  members: 'Member Events',
  moderation: 'Moderation',
  messages: 'Messages / Reactions',
  voice: 'Voice',
  roles: 'Roles / Permissions',
  security: 'Security / AutoMod',
  goliath: 'Goliath Actions',
};
const roleState = (role) => role ? { id: role.id, name: role.name, color: role.hexColor, position: role.position, hoist: role.hoist, mentionable: role.mentionable, permissions: role.permissions?.bitfield?.toString?.() || null } : null;
const channelState = (channel) => channel ? {
  id: channel.id,
  name: channel.name,
  type: channel.type,
  parentId: channel.parentId || null,
  position: channel.rawPosition ?? channel.position ?? null,
  topic: channel.topic || null,
  nsfw: channel.nsfw || false,
  rateLimitPerUser: channel.rateLimitPerUser ?? null,
  bitrate: channel.bitrate ?? null,
  userLimit: channel.userLimit ?? null,
  permissionOverwrites: channel.permissionOverwrites?.cache
    ? channel.permissionOverwrites.cache.map((overwrite) => ({ id: overwrite.id, type: overwrite.type, allow: overwrite.allow.bitfield.toString(), deny: overwrite.deny.bitfield.toString() }))
    : [],
} : null;
const guildState = (guild) => guild ? { id: guild.id, name: guild.name, ownerId: guild.ownerId, verificationLevel: guild.verificationLevel, explicitContentFilter: guild.explicitContentFilter, preferredLocale: guild.preferredLocale, afkChannelId: guild.afkChannelId || null, systemChannelId: guild.systemChannelId || null, rulesChannelId: guild.rulesChannelId || null, publicUpdatesChannelId: guild.publicUpdatesChannelId || null } : null;
const messageState = (message) => message ? { id: message.id, content: message.content || null, authorId: message.author?.id || null, authorTag: message.author?.tag || message.author?.username || null, channelId: message.channelId || null, createdAt: message.createdAt?.toISOString?.() || null, editedAt: message.editedAt?.toISOString?.() || null, pinned: Boolean(message.pinned), attachments: [...(message.attachments?.values?.() || [])].map((item) => ({ id: item.id, name: item.name, url: item.url, size: item.size })) } : null;
const threadState = (thread) => thread ? { id: thread.id, name: thread.name, parentId: thread.parentId || null, ownerId: thread.ownerId || null, archived: Boolean(thread.archived), locked: Boolean(thread.locked), autoArchiveDuration: thread.autoArchiveDuration ?? null, rateLimitPerUser: thread.rateLimitPerUser ?? null } : null;
const emojiState = (emoji) => emoji ? { id: emoji.id, name: emoji.name, animated: Boolean(emoji.animated), available: emoji.available !== false, managed: Boolean(emoji.managed), roles: emoji.roles?.cache?.map?.((role) => ({ id: role.id, name: role.name })) || [] } : null;
const stickerState = (sticker) => sticker ? { id: sticker.id, name: sticker.name, description: sticker.description || null, tags: sticker.tags || null, format: sticker.format ?? null, available: sticker.available !== false } : null;
const scheduledEventState = (event) => event ? { id: event.id, name: event.name, description: event.description || null, channelId: event.channelId || null, creatorId: event.creatorId || null, status: event.status, privacyLevel: event.privacyLevel, entityType: event.entityType, scheduledStartAt: event.scheduledStartAt?.toISOString?.() || null, scheduledEndAt: event.scheduledEndAt?.toISOString?.() || null, entityMetadata: event.entityMetadata || null } : null;

function ownerIds() { return security.getBotOwnerIds(); }
function commandCenterUiEnabled() { return String(process.env.BOT_MODE || 'DEV').trim().toUpperCase() === 'DEV'; }
function sessionKey(interaction) { return `${interaction.guildId}:${interaction.user?.id || 'unknown'}`; }
function getRoutingSession(interaction) { return routingSessions.get(sessionKey(interaction)) || { sourceGuildId: null, routeKey: 'default' }; }
function setRoutingSession(interaction, patch) { const next = { ...getRoutingSession(interaction), ...patch }; routingSessions.set(sessionKey(interaction), next); return next; }
function getMonitoringSession(interaction) { return monitoringSessions.get(sessionKey(interaction)) || { sourceGuildId: null, family: 'members' }; }
function setMonitoringSession(interaction, patch) { const next = { ...getMonitoringSession(interaction), ...patch }; monitoringSessions.set(sessionKey(interaction), next); return next; }
function getStructureSession(interaction) { return structureSessions.get(sessionKey(interaction)) || { sourceGuildId: null }; }
function setStructureSession(interaction, patch) { const next = { ...getStructureSession(interaction), ...patch }; structureSessions.set(sessionKey(interaction), next); return next; }
function getIntelligenceSession(interaction) { return intelligenceSessions.get(sessionKey(interaction)) || { sourceGuildId: null, userId: null, matches: [] }; }
function setIntelligenceSession(interaction, patch) { const next = { ...getIntelligenceSession(interaction), ...patch }; intelligenceSessions.set(sessionKey(interaction), next); return next; }
function configuredGuild(client, id) { return client.guilds.cache.get(String(id || '')) || null; }
function sourceGuildOptions(client, destinationId) {
  return [...client.guilds.cache.values()]
    .filter((guild) => guild.id !== String(destinationId || ''))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    .slice(0, 25);
}
function registryEnvironments(guild) {
  return Object.keys(guild?.environments || {}).filter(Boolean);
}
function registryGuildOptions(client, destinationId) {
  const destination = String(destinationId || '');
  const merged = new Map();
  for (const item of auditStore.getGuildRegistry?.() || []) {
    const id = String(item?.guildId || '');
    if (!id || id === destination) continue;
    merged.set(id, { ...item, id, name: item.name || id, live: Boolean(client.guilds.cache.has(id)) });
  }
  for (const guild of client.guilds.cache.values()) {
    if (guild.id === destination) continue;
    const current = merged.get(guild.id) || {};
    merged.set(guild.id, { ...current, id: guild.id, name: guild.name || current.name || guild.id, live: true });
  }
  return [...merged.values()]
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    .slice(0, 25);
}
function registryGuild(client, id) {
  const key = String(id || '');
  if (!key) return null;
  const live = configuredGuild(client, key);
  const stored = (auditStore.getGuildRegistry?.() || []).find((item) => String(item.guildId || '') === key);
  if (!live && !stored) return null;
  return { ...(stored || {}), id: key, name: live?.name || stored?.name || key, live: Boolean(live) };
}
function guildEnvironmentLabel(guild) {
  const modes = registryEnvironments(guild);
  return modes.length ? modes.join(' • ') : (guild?.live ? 'DEV' : 'Registry');
}
function liveProbeStatus(result) {
  const environment = String(result?.environment || (result?.remote ? 'remote collector' : process.env.BOT_MODE || 'DEV')).toUpperCase();
  const collector = result?.remote ? ` by **${environment}**` : ` by **${environment}**`;
  if (result?.started) return `🟢 **Live event probe:** executed${collector} via temporary hidden channel \`${result.channelName || result.channelId}\`. Expect real **Channel Created** and **Channel Deleted** reports in Guild / System Events.`;
  switch (result?.reason) {
    case 'registry-only': return result?.remote
      ? `🟡 **Live event probe:** requested from **${environment}**, but no completed live result was returned before the verification window closed. The configured route test still ran normally.`
      : '🟡 **Live event probe:** skipped — this collector does not have live access to the guild and no remote collector was available. The configured route test still ran normally.';
    case 'cooldown': return `🟡 **Live event probe:** skipped${collector} — the 15-second safety cooldown is active. Wait briefly before another live probe.`;
    case 'missing-manage-channels': return `🔴 **Live event probe:** blocked${collector} — Goliath does not have **Manage Channels** in the source guild.`;
    case 'create-failed': return `🔴 **Live event probe:** failed${collector} — Goliath could not create the temporary hidden verification channel.`;
    case 'invalid-guild': return `🔴 **Live event probe:** unavailable${collector} — the selected guild could not be resolved for live verification.`;
    default: return `🟠 **Live event probe:** status unavailable${collector}. The normal route-delivery result below is still authoritative.`;
  }
}
