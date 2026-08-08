'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { buildAuditEmbed, buildUserIntelligenceEmbed, buildUserIntelligenceControls, buildCommandCenterHome } = require('./auditEmbeds');
const { buildReport } = require('./userIntelligence');
const auditStore = require('./auditStore');
const security = require('../../core/security/securityCore');

const MAX_CATEGORY_CHILDREN = 50;
const SUMMARY_REFRESH_MS = 60000;
const summaryRefresh = new Map();

function slug(value, fallback = 'item') {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;
}

function getOwnerAuditGuildId() {
  return String(auditStore.getConfig().commandCenter?.guildId || '').trim();
}

function autoProvisionEnabled() {
  return auditStore.getConfig().autoProvision !== false;
}

function privateOverwrites(ownerGuild) {
  const ownerId = security.getBotOwnerId();
  const botId = ownerGuild.members.me?.id;
  const overwrites = [{ id: ownerGuild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }];
  if (ownerId) overwrites.push({ id: ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  if (botId) overwrites.push({ id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] });
  return overwrites;
}

function guildMarker(sourceGuild) { return `GOLIATH_AUDIT_GUILD:${sourceGuild.id}`; }
function userMarker(sourceGuild, userId) { return `GOLIATH_AUDIT_USER:${sourceGuild.id}:${userId}`; }
function profileMarker(messageId) { return `GOLIATH_AUDIT_PROFILE:${messageId}`; }
function categoryBaseName(sourceGuild) {
  const guildName = slug(sourceGuild.name, 'guild').slice(0, 70);
  return `audit-${guildName}-${String(sourceGuild.id).slice(-6)}`.slice(0, 100);
}
function categoryName(sourceGuild, page = 1) {
  const base = categoryBaseName(sourceGuild);
  return page <= 1 ? base : `${base}-${page}`.slice(0, 100);
}
function categoryChildCount(ownerGuild, categoryId) {
  return ownerGuild.channels.cache.filter((channel) => channel.parentId === categoryId).size;
}

async function getOwnerGuild(client) {
  const ownerGuildId = getOwnerAuditGuildId();
  if (!ownerGuildId || !client?.guilds?.cache) return null;
  return client.guilds.cache.get(ownerGuildId) || await client.guilds.fetch(ownerGuildId).catch(() => null);
}

async function ensureCommandCenter(client, ownerGuild = null) {
  const config = auditStore.getConfig();
  const guildId = String(ownerGuild?.id || config.commandCenter?.guildId || '');
  if (!guildId) return null;
  const guild = ownerGuild || client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;

  let channel = config.commandCenter?.channelId ? guild.channels.cache.get(config.commandCenter.channelId) : null;
  if (!channel && config.commandCenter?.channelId) channel = await guild.channels.fetch(config.commandCenter.channelId).catch(() => null);
  let category = channel?.parent?.type === ChannelType.GuildCategory ? channel.parent : null;

  if (!channel || channel.type !== ChannelType.GuildText) {
    category = config.commandCenter?.categoryId ? guild.channels.cache.get(config.commandCenter.categoryId) : null;
    if (!category && config.commandCenter?.categoryId) category = await guild.channels.fetch(config.commandCenter.categoryId).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) category = guild.channels.cache.find((item) => item.type === ChannelType.GuildCategory && item.name === 'GOLIATH CONTROL') || null;
    if (!category) {
      category = await guild.channels.create({ name: 'GOLIATH CONTROL', type: ChannelType.GuildCategory, permissionOverwrites: privateOverwrites(guild), reason: 'Goliath private owner command center' });
    }
    channel = guild.channels.cache.find((item) => item.type === ChannelType.GuildText && item.parentId === category.id && item.name === 'command-center') || null;
    if (!channel) {
      channel = await guild.channels.create({ name: 'command-center', type: ChannelType.GuildText, parent: category.id, topic: 'GOLIATH_COMMAND_CENTER • Private owner control plane'.slice(0, 1024), permissionOverwrites: privateOverwrites(guild), reason: 'Goliath private owner command center' });
    }
  }

  category = channel.parent?.type === ChannelType.GuildCategory ? channel.parent : null;
  const nextConfig = auditStore.updateConfig({ commandCenter: { guildId: guild.id, categoryId: category?.id || null, channelId: channel.id } });
  const homePayload = buildCommandCenterHome(client, guild, nextConfig);
  let message = nextConfig.commandCenter?.messageId ? await channel.messages.fetch(nextConfig.commandCenter.messageId).catch(() => null) : null;
  if (!message) {
    const recent = await channel.messages.fetch({ limit: 25 }).catch(() => null);
    message = recent?.find((item) => item.author?.id === client.user?.id && item.embeds?.some((embed) => String(embed.footer?.text || '').includes('Goliath Command Center'))) || null;
  }
  if (message) await message.edit(homePayload).catch(() => null);
  else message = await channel.send(homePayload);
  auditStore.updateConfig({ commandCenter: { guildId: guild.id, categoryId: category?.id || null, channelId: channel.id, messageId: message.id } });
  await message.pin('Goliath Command Center').catch(() => null);
  return { guild, category, channel, message };
}

function findSystemChannel(ownerGuild, sourceGuild) {
  const marker = guildMarker(sourceGuild);
  return ownerGuild.channels.cache.find((channel) => channel.type === ChannelType.GuildText && String(channel.topic || '').includes(marker) && !String(channel.topic || '').includes('GOLIATH_AUDIT_USER:')) || null;
}
function findGuildCategories(ownerGuild, sourceGuild) {
  const base = categoryBaseName(sourceGuild);
  return ownerGuild.channels.cache.filter((channel) => channel.type === ChannelType.GuildCategory && (channel.name === base || channel.name.startsWith(`${base}-`))).sort((a, b) => a.rawPosition - b.rawPosition);
}
function isSourceGuildCategory(category, sourceGuild) {
  if (!category || category.type !== ChannelType.GuildCategory) return false;
  const base = categoryBaseName(sourceGuild);
  return category.name === base || category.name.startsWith(`${base}-`);
}
async function ensureGuildCategory(ownerGuild, sourceGuild, preferredPage = 1) {
  const existing = findGuildCategories(ownerGuild, sourceGuild);
  const preferredName = categoryName(sourceGuild, preferredPage);
  const preferred = existing.find((category) => category.name === preferredName);
  if (preferred) return preferred;
  if (!autoProvisionEnabled()) return existing.first?.() || null;
  return ownerGuild.channels.create({ name: preferredName, type: ChannelType.GuildCategory, permissionOverwrites: privateOverwrites(ownerGuild), reason: `Goliath audit category for ${sourceGuild.name}` });
}
async function ensureSystemChannel(ownerGuild, sourceGuild, category) {
  let channel = findSystemChannel(ownerGuild, sourceGuild);
  if (channel) {
    if (category && channel.parentId !== category.id && autoProvisionEnabled()) await channel.setParent(category.id, { lockPermissions: true, reason: `Move Goliath audit channel for ${sourceGuild.name}` }).catch(() => null);
    return channel;
  }
  if (!autoProvisionEnabled()) return null;
  return ownerGuild.channels.create({ name: 'guild-events', type: ChannelType.GuildText, parent: category?.id || null, topic: `${guildMarker(sourceGuild)} • ${sourceGuild.name} • ${sourceGuild.id} • Guild/system audit events`.slice(0, 1024), permissionOverwrites: category ? undefined : privateOverwrites(ownerGuild), reason: `Goliath guild audit stream for ${sourceGuild.name}` });
}
async function ensureAuditContext(client, sourceGuild) {
  const ownerGuild = await getOwnerGuild(client);
  if (!ownerGuild) return null;
  let systemChannel = findSystemChannel(ownerGuild, sourceGuild);
  let category = isSourceGuildCategory(systemChannel?.parent, sourceGuild) ? systemChannel.parent : null;
  if (!category) category = await ensureGuildCategory(ownerGuild, sourceGuild, 1);
  systemChannel = await ensureSystemChannel(ownerGuild, sourceGuild, category);
  return { ownerGuild, category, systemChannel };
}

function eventUserId(event) { const id = event?.user?.id; return id ? String(id) : null; }
function eventUserLabel(event, userId) { return event?.user?.displayName || event?.user?.globalName || event?.user?.username || `user-${String(userId).slice(-6)}`; }
function findUserChannel(ownerGuild, sourceGuild, userId) {
  const marker = userMarker(sourceGuild, userId);
  return ownerGuild.channels.cache.find((channel) => channel.type === ChannelType.GuildText && String(channel.topic || '').includes(marker)) || null;
}
async function chooseUserCategory(ownerGuild, sourceGuild, firstCategory) {
  const categories = findGuildCategories(ownerGuild, sourceGuild);
  if (firstCategory && !categories.has(firstCategory.id)) categories.set(firstCategory.id, firstCategory);
  const available = categories.find((category) => categoryChildCount(ownerGuild, category.id) < MAX_CATEGORY_CHILDREN);
  if (available) return available;
  if (!autoProvisionEnabled()) return firstCategory || categories.first?.() || null;
  return ensureGuildCategory(ownerGuild, sourceGuild, Math.max(1, categories.size + 1));
}
function profileMessageId(channel) { const match = String(channel?.topic || '').match(/GOLIATH_AUDIT_PROFILE:(\d+)/); return match?.[1] || null; }
async function findProfileMessage(channel, userId) {
  const knownId = profileMessageId(channel);
  if (knownId) {
    const known = await channel.messages.fetch(knownId).catch(() => null);
    if (known) return known;
  }
  const pinned = await channel.messages.fetchPinned().catch(() => null);
  if (!pinned) return null;
  return pinned.find((message) => message.embeds?.some((embed) => String(embed.footer?.text || '') === `Goliath User Intelligence • ${userId}`)) || null;
}
async function refreshUserSummary(client, sourceGuild, channel, userId, force = false) {
  if (!channel?.isTextBased?.() || !userId) return false;
  const now = Date.now();
  if (!force && now - Number(summaryRefresh.get(channel.id) || 0) < SUMMARY_REFRESH_MS) return true;
  summaryRefresh.set(channel.id, now);
  try {
    const report = await buildReport(client, userId);
    const payload = { embeds: [buildUserIntelligenceEmbed(report, sourceGuild)], components: buildUserIntelligenceControls(), allowedMentions: { parse: [] } };
    let message = await findProfileMessage(channel, userId);
    if (message) { await message.edit(payload); return true; }
    message = await channel.send(payload);
    await message.pin('Goliath User Intelligence summary').catch(() => null);
    const baseTopic = String(channel.topic || '').replace(/\s*•?\s*GOLIATH_AUDIT_PROFILE:\d+/g, '').trim();
    const nextTopic = `${baseTopic} • ${profileMarker(message.id)}`.slice(0, 1024);
    if (nextTopic !== channel.topic) await channel.setTopic(nextTopic, 'Track Goliath User Intelligence summary').catch(() => null);
    return true;
  } catch (error) {
    console.warn('[Audit Intelligence] user summary refresh failed:', error?.message || error);
    return false;
  }
}
async function ensureUserAuditChannel(client, sourceGuild, event) {
  const userId = eventUserId(event);
  if (!userId) return null;
  const context = await ensureAuditContext(client, sourceGuild);
  if (!context) return null;
  const existing = findUserChannel(context.ownerGuild, sourceGuild, userId);
  if (existing) { await refreshUserSummary(client, sourceGuild, existing, userId).catch(() => null); return existing; }
  if (!autoProvisionEnabled()) return context.systemChannel;
  const category = await chooseUserCategory(context.ownerGuild, sourceGuild, context.category);
  const label = eventUserLabel(event, userId);
  const channel = await context.ownerGuild.channels.create({ name: `user-${slug(label, 'user').slice(0, 70)}-${userId.slice(-6)}`.slice(0, 100), type: ChannelType.GuildText, parent: category?.id || null, topic: `${userMarker(sourceGuild, userId)} • ${label} • ${userId} • Individual user audit history`.slice(0, 1024), permissionOverwrites: category ? undefined : privateOverwrites(context.ownerGuild), reason: `Goliath user audit stream for ${label} in ${sourceGuild.name}` });
  await refreshUserSummary(client, sourceGuild, channel, userId, true).catch(() => null);
  return channel;
}
async function ensureAuditChannel(client, sourceGuild) { const context = await ensureAuditContext(client, sourceGuild); return context?.systemChannel || null; }

function routeKeyForEvent(event) {
  const category = String(event?.category || '').toLowerCase();
  const type = String(event?.type || '').toLowerCase();
  if (category === 'moderation' || /^member\.(ban|unban|kick|timeout|prune)/.test(type)) return 'moderation';
  if (category === 'automod' || category === 'security') return 'security';
  if (category === 'message' || type.startsWith('reaction.')) return 'messages';
  if (category === 'role' || type === 'member.roles' || type.includes('permission')) return 'roles';
  if (category === 'goliath' || type.startsWith('goliath.')) return 'goliath';
  return 'default';
}

function monitorKeyForEvent(event) {
  const category = String(event?.category || '').toLowerCase();
  const type = String(event?.type || '').toLowerCase();
  if (category === 'moderation' || /^member\.(ban|unban|kick|timeout|prune)/.test(type)) return 'moderation';
  if (category === 'automod' || category === 'security') return 'security';
  if (category === 'message' || type.startsWith('reaction.')) return 'messages';
  if (category === 'role' || type === 'member.roles' || type.includes('permission')) return 'roles';
  if (category === 'goliath' || type.startsWith('goliath.')) return 'goliath';
  if (category === 'voice' || type.startsWith('voice.')) return 'voice';
  if (category === 'member' || type.startsWith('member.')) return 'members';
  return 'guild';
}

function monitoringEnabled(sourceGuild, event) {
  const config = auditStore.getConfig();
  const guildConfig = config.guilds?.[String(sourceGuild?.id || '')] || {};
  if (guildConfig.enabled === false) return false;
  const monitoring = guildConfig.monitoring && typeof guildConfig.monitoring === 'object' ? guildConfig.monitoring : {};
  return monitoring[monitorKeyForEvent(event)] !== false;
}

async function configuredRouteChannel(client, sourceGuild, event) {
  const config = auditStore.getConfig();
  const guildConfig = config.guilds?.[String(sourceGuild?.id || '')] || {};
  const routes = guildConfig.routes && typeof guildConfig.routes === 'object' ? guildConfig.routes : {};
  const key = routeKeyForEvent(event);
  const channelId = routes[key] || (key !== 'default' ? routes.default : null);
  if (!channelId) return null;
  const ownerGuild = await getOwnerGuild(client);
  if (!ownerGuild) return null;
  const channel = ownerGuild.channels.cache.get(String(channelId)) || await ownerGuild.channels.fetch(String(channelId)).catch(() => null);
  return channel?.isTextBased?.() ? channel : null;
}

async function deliver(client, sourceGuild, event) {
  if (!sourceGuild || sourceGuild.id === getOwnerAuditGuildId()) return false;
  if (!monitoringEnabled(sourceGuild, event)) return false;
  const userId = eventUserId(event);
  const routedChannel = await configuredRouteChannel(client, sourceGuild, event);
  const primary = userId ? await ensureUserAuditChannel(client, sourceGuild, event) : (routedChannel || await ensureAuditChannel(client, sourceGuild));
  if (!primary?.isTextBased?.()) return false;
  const payload = { embeds: [buildAuditEmbed(event)], allowedMentions: { parse: [] } };
  await primary.send(payload);
  if (userId && routedChannel?.isTextBased?.() && routedChannel.id !== primary.id) await routedChannel.send(payload).catch(() => null);
  if (userId) refreshUserSummary(client, sourceGuild, primary, userId).catch(() => null);
  return true;
}

module.exports = {
  deliver,
  ensureAuditChannel,
  ensureUserAuditChannel,
  refreshUserSummary,
  getOwnerAuditGuildId,
  ensureCommandCenter,
  routeKeyForEvent,
  monitorKeyForEvent,
  monitoringEnabled,
  configuredRouteChannel,
};
