'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { buildAuditEmbed, buildUserIntelligenceEmbed } = require('./auditEmbeds');
const { buildReport } = require('./userIntelligence');

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
  return String(process.env.OWNER_AUDIT_GUILD_ID || '').trim();
}

function autoProvisionEnabled() {
  return process.env.OWNER_AUDIT_AUTO_PROVISION === 'true';
}

function privateOverwrites(ownerGuild) {
  return [{ id: ownerGuild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }];
}

function guildMarker(sourceGuild) {
  return `GOLIATH_AUDIT_GUILD:${sourceGuild.id}`;
}

function userMarker(sourceGuild, userId) {
  return `GOLIATH_AUDIT_USER:${sourceGuild.id}:${userId}`;
}

function profileMarker(messageId) {
  return `GOLIATH_AUDIT_PROFILE:${messageId}`;
}

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

function findSystemChannel(ownerGuild, sourceGuild) {
  const marker = guildMarker(sourceGuild);
  return ownerGuild.channels.cache.find((channel) => (
    channel.type === ChannelType.GuildText
    && String(channel.topic || '').includes(marker)
    && !String(channel.topic || '').includes('GOLIATH_AUDIT_USER:')
  )) || null;
}

function findGuildCategories(ownerGuild, sourceGuild) {
  const base = categoryBaseName(sourceGuild);
  return ownerGuild.channels.cache
    .filter((channel) => channel.type === ChannelType.GuildCategory && (channel.name === base || channel.name.startsWith(`${base}-`)))
    .sort((a, b) => a.rawPosition - b.rawPosition);
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

  return ownerGuild.channels.create({
    name: preferredName,
    type: ChannelType.GuildCategory,
    permissionOverwrites: privateOverwrites(ownerGuild),
    reason: `Goliath audit category for ${sourceGuild.name}`,
  });
}

async function ensureSystemChannel(ownerGuild, sourceGuild, category) {
  let channel = findSystemChannel(ownerGuild, sourceGuild);

  if (channel) {
    if (category && channel.parentId !== category.id && autoProvisionEnabled()) {
      await channel.setParent(category.id, { lockPermissions: true, reason: `Move Goliath audit channel for ${sourceGuild.name}` }).catch(() => null);
    }
    return channel;
  }

  if (!autoProvisionEnabled()) return null;

  channel = await ownerGuild.channels.create({
    name: 'guild-events',
    type: ChannelType.GuildText,
    parent: category?.id || null,
    topic: `${guildMarker(sourceGuild)} • ${sourceGuild.name} • ${sourceGuild.id} • Guild/system audit events`.slice(0, 1024),
    permissionOverwrites: category ? undefined : privateOverwrites(ownerGuild),
    reason: `Goliath guild audit stream for ${sourceGuild.name}`,
  });

  return channel;
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

function eventUserId(event) {
  const id = event?.user?.id;
  return id ? String(id) : null;
}

function eventUserLabel(event, userId) {
  return event?.user?.displayName
    || event?.user?.globalName
    || event?.user?.username
    || `user-${String(userId).slice(-6)}`;
}

function findUserChannel(ownerGuild, sourceGuild, userId) {
  const marker = userMarker(sourceGuild, userId);
  return ownerGuild.channels.cache.find((channel) => (
    channel.type === ChannelType.GuildText
    && String(channel.topic || '').includes(marker)
  )) || null;
}

async function chooseUserCategory(ownerGuild, sourceGuild, firstCategory) {
  const categories = findGuildCategories(ownerGuild, sourceGuild);
  if (firstCategory && !categories.has(firstCategory.id)) categories.set(firstCategory.id, firstCategory);

  const available = categories.find((category) => categoryChildCount(ownerGuild, category.id) < MAX_CATEGORY_CHILDREN);
  if (available) return available;
  if (!autoProvisionEnabled()) return firstCategory || categories.first?.() || null;

  const nextPage = Math.max(1, categories.size + 1);
  return ensureGuildCategory(ownerGuild, sourceGuild, nextPage);
}

function profileMessageId(channel) {
  const match = String(channel?.topic || '').match(/GOLIATH_AUDIT_PROFILE:(\d+)/);
  return match?.[1] || null;
}

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
    const embed = buildUserIntelligenceEmbed(report, sourceGuild);
    let message = await findProfileMessage(channel, userId);

    if (message) {
      await message.edit({ embeds: [embed], allowedMentions: { parse: [] } });
      return true;
    }

    message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
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
  if (existing) {
    await refreshUserSummary(client, sourceGuild, existing, userId).catch(() => null);
    return existing;
  }
  if (!autoProvisionEnabled()) return context.systemChannel;

  const category = await chooseUserCategory(context.ownerGuild, sourceGuild, context.category);
  const label = eventUserLabel(event, userId);
  const channelName = `user-${slug(label, 'user').slice(0, 70)}-${userId.slice(-6)}`.slice(0, 100);

  const channel = await context.ownerGuild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category?.id || null,
    topic: `${userMarker(sourceGuild, userId)} • ${label} • ${userId} • Individual user audit history`.slice(0, 1024),
    permissionOverwrites: category ? undefined : privateOverwrites(context.ownerGuild),
    reason: `Goliath user audit stream for ${label} in ${sourceGuild.name}`,
  });

  await refreshUserSummary(client, sourceGuild, channel, userId, true).catch(() => null);
  return channel;
}

async function ensureAuditChannel(client, sourceGuild) {
  const context = await ensureAuditContext(client, sourceGuild);
  return context?.systemChannel || null;
}

async function deliver(client, sourceGuild, event) {
  if (!sourceGuild || sourceGuild.id === getOwnerAuditGuildId()) return false;

  const userId = eventUserId(event);
  const channel = userId
    ? await ensureUserAuditChannel(client, sourceGuild, event)
    : await ensureAuditChannel(client, sourceGuild);

  if (!channel?.isTextBased?.()) return false;
  await channel.send({ embeds: [buildAuditEmbed(event)], allowedMentions: { parse: [] } });
  if (userId) refreshUserSummary(client, sourceGuild, channel, userId).catch(() => null);
  return true;
}

module.exports = {
  deliver,
  ensureAuditChannel,
  ensureUserAuditChannel,
  refreshUserSummary,
  getOwnerAuditGuildId,
};
