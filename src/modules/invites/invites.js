'use strict';

const { PermissionFlagsBits } = require('discord.js');
const { getModuleSection, saveModuleSection, updateModuleSection } = require('../../core/guild/moduleSectionManager');

const SECTION = 'invites';
const now = () => new Date().toISOString();
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const cleanId = (value) => { const id = String(value || '').replace(/[<@&#!>]/g, '').trim(); return /^\d{15,25}$/.test(id) ? id : null; };
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

const inviteCache = new Map();

function defaults() {
  return {
    enabled: false,
    settings: {
      trackingEnabled: true,
      autoRepair: true,
      managedInviteEnabled: false,
      managedInviteChannelId: null,
      managedInviteCode: null,
      logChannelId: null,
      removeOnLeave: true,
      ignoreBots: true,
      rewardRoles: [],
    },
    inviters: {},
    members: {},
    history: [],
    analytics: {
      joins: 0,
      leaves: 0,
      tracked: 0,
      unknown: 0,
      vanity: 0,
      fake: 0,
      rewardsGranted: 0,
      failures: 0,
      lastJoinAt: null,
      lastLeaveAt: null,
      lastSyncAt: null,
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizeReward(item = {}) {
  return {
    roleId: cleanId(item.roleId),
    invites: Math.max(1, Math.min(100000, Math.floor(Number(item.invites || item.requiredInvites || 1)))),
  };
}

function normalize(section = {}) {
  const base = defaults();
  const settings = section.settings || section;
  return {
    ...base,
    ...clone(section),
    enabled: section.enabled === true,
    settings: {
      ...base.settings,
      ...settings,
      trackingEnabled: settings.trackingEnabled !== false,
      autoRepair: settings.autoRepair !== false,
      managedInviteEnabled: settings.managedInviteEnabled === true || Boolean(settings.inviteCode),
      managedInviteChannelId: cleanId(settings.managedInviteChannelId || settings.channelId),
      managedInviteCode: clean(settings.managedInviteCode || settings.inviteCode, 100) || null,
      logChannelId: cleanId(settings.logChannelId),
      removeOnLeave: settings.removeOnLeave !== false,
      ignoreBots: settings.ignoreBots !== false,
      rewardRoles: (Array.isArray(settings.rewardRoles) ? settings.rewardRoles : []).map(normalizeReward).filter((item) => item.roleId).sort((a, b) => a.invites - b.invites),
    },
    inviters: section.inviters && typeof section.inviters === 'object' ? clone(section.inviters) : {},
    members: section.members && typeof section.members === 'object' ? clone(section.members) : {},
    history: (Array.isArray(section.history) ? section.history : []).slice(-1000),
    analytics: { ...base.analytics, ...(section.analytics || {}) },
    createdAt: section.createdAt || base.createdAt,
    updatedAt: section.updatedAt || now(),
  };
}

function getSection(guildId) { return normalize(getModuleSection(guildId, SECTION, defaults())); }
function saveSection(guildId, section, meta = {}) { return normalize(saveModuleSection(guildId, SECTION, normalize(section), meta)); }
function updateSection(guildId, updater, meta = {}) {
  return normalize(updateModuleSection(guildId, SECTION, (current) => {
    const normalized = normalize(current);
    return normalize(typeof updater === 'function' ? updater(clone(normalized)) : updater);
  }, defaults(), meta));
}

function setEnabled(guildId, enabled, meta = {}) { return updateSection(guildId, (section) => ({ ...section, enabled: enabled === true }), meta); }
function updateSettings(guildId, patch = {}, meta = {}) { return updateSection(guildId, (section) => ({ ...section, settings: { ...section.settings, ...patch } }), meta); }
function addHistory(guildId, entry, meta = {}) {
  return updateSection(guildId, (section) => ({
    ...section,
    history: [...section.history, { id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, at: now(), ...entry }].slice(-1000),
  }), meta);
}
function addAnalytics(guildId, patch, meta = {}) {
  return updateSection(guildId, (section) => {
    const analytics = { ...section.analytics };
    for (const [key, value] of Object.entries(patch)) analytics[key] = typeof value === 'number' ? Number(analytics[key] || 0) + value : value;
    return { ...section, analytics };
  }, meta).analytics;
}

async function fetchInviteSnapshot(guild) {
  const map = new Map();
  const invites = await guild.invites.fetch();
  for (const invite of invites.values()) map.set(invite.code, {
    code: invite.code,
    uses: Number(invite.uses || 0),
    inviterId: invite.inviter?.id || null,
    channelId: invite.channelId || null,
    maxUses: invite.maxUses || 0,
    expiresAt: invite.expiresAt?.toISOString?.() || null,
  });
  return map;
}

async function syncGuild(guild, meta = {}) {
  const snapshot = await fetchInviteSnapshot(guild);
  inviteCache.set(guild.id, snapshot);
  addAnalytics(guild.id, { lastSyncAt: now() }, meta);
  return snapshot;
}

async function resolveUsedInvite(guild) {
  const before = inviteCache.get(guild.id) || new Map();
  const after = await fetchInviteSnapshot(guild);
  inviteCache.set(guild.id, after);
  const candidates = [];
  for (const [code, invite] of after.entries()) {
    const previous = before.get(code);
    const delta = invite.uses - Number(previous?.uses || 0);
    if (delta > 0) candidates.push({ ...invite, delta });
  }
  candidates.sort((a, b) => b.delta - a.delta);
  return candidates[0] || null;
}

function inviterStats(section, inviterId) {
  const current = section.inviters[inviterId] || {};
  return {
    inviterId,
    total: Math.max(0, Number(current.total || 0)),
    active: Math.max(0, Number(current.active || 0)),
    left: Math.max(0, Number(current.left || 0)),
    fake: Math.max(0, Number(current.fake || 0)),
    bonus: Number(current.bonus || 0),
    rewards: Array.isArray(current.rewards) ? current.rewards : [],
    lastInviteAt: current.lastInviteAt || null,
  };
}

async function applyRewards(guild, inviterId, meta = {}) {
  const section = getSection(guild.id);
  const stats = inviterStats(section, inviterId);
  const member = await guild.members.fetch(inviterId).catch(() => null);
  if (!member) return [];
  const granted = [];
  for (const reward of section.settings.rewardRoles) {
    if (stats.active + stats.bonus < reward.invites || stats.rewards.includes(reward.roleId)) continue;
    const role = guild.roles.cache.get(reward.roleId) || await guild.roles.fetch(reward.roleId).catch(() => null);
    if (!role || role.managed || guild.members.me.roles.highest.position <= role.position) continue;
    await member.roles.add(role, `Goliath invite reward: ${reward.invites} invites`);
    stats.rewards.push(reward.roleId);
    granted.push(reward.roleId);
  }
  if (granted.length) {
    updateSection(guild.id, (current) => ({ ...current, inviters: { ...current.inviters, [inviterId]: stats } }), meta);
    addAnalytics(guild.id, { rewardsGranted: granted.length }, meta);
  }
  return granted;
}

async function trackJoin(member, meta = {}) {
  const guild = member.guild;
  const section = getSection(guild.id);
  if (!section.enabled || !section.settings.trackingEnabled || (member.user.bot && section.settings.ignoreBots)) return null;
  let used = null;
  try { used = await resolveUsedInvite(guild); }
  catch (error) { addAnalytics(guild.id, { failures: 1 }, meta); }
  const inviterId = cleanId(used?.inviterId);
  const fake = member.user.createdTimestamp && Date.now() - member.user.createdTimestamp < 24 * 60 * 60 * 1000;
  const attribution = inviterId ? 'invite' : 'unknown';
  updateSection(guild.id, (current) => {
    const inviters = { ...current.inviters };
    if (inviterId) {
      const stats = inviterStats(current, inviterId);
      stats.total += 1;
      stats.active += 1;
      if (fake) stats.fake += 1;
      stats.lastInviteAt = now();
      inviters[inviterId] = stats;
    }
    return {
      ...current,
      inviters,
      members: { ...current.members, [member.id]: { memberId: member.id, inviterId, inviteCode: used?.code || null, attribution, fake, joinedAt: now(), leftAt: null } },
    };
  }, meta);
  addHistory(guild.id, { type: 'join', memberId: member.id, inviterId, inviteCode: used?.code || null, attribution, fake }, meta);
  addAnalytics(guild.id, { joins: 1, tracked: inviterId ? 1 : 0, unknown: inviterId ? 0 : 1, fake: fake ? 1 : 0, lastJoinAt: now() }, meta);
  const rewards = inviterId ? await applyRewards(guild, inviterId, meta) : [];
  return { inviterId, inviteCode: used?.code || null, attribution, fake, rewards };
}

async function trackLeave(member, meta = {}) {
  const section = getSection(member.guild.id);
  const record = section.members[member.id];
  if (!record || record.leftAt) return null;
  updateSection(member.guild.id, (current) => {
    const inviters = { ...current.inviters };
    if (record.inviterId && current.settings.removeOnLeave) {
      const stats = inviterStats(current, record.inviterId);
      stats.active = Math.max(0, stats.active - 1);
      stats.left += 1;
      inviters[record.inviterId] = stats;
    }
    return { ...current, inviters, members: { ...current.members, [member.id]: { ...record, leftAt: now() } } };
  }, meta);
  addHistory(member.guild.id, { type: 'leave', memberId: member.id, inviterId: record.inviterId, inviteCode: record.inviteCode }, meta);
  addAnalytics(member.guild.id, { leaves: 1, lastLeaveAt: now() }, meta);
  return record;
}

function leaderboard(guildId, limit = 25) {
  const section = getSection(guildId);
  return Object.values(section.inviters).map((entry) => ({ ...entry, score: Number(entry.active || 0) + Number(entry.bonus || 0) })).sort((a, b) => b.score - a.score || b.total - a.total).slice(0, Math.max(1, Math.min(100, Number(limit || 25))));
}

function setBonus(guildId, inviterId, bonus, meta = {}) {
  const id = cleanId(inviterId); if (!id) throw new Error('A valid inviter is required.');
  return updateSection(guildId, (section) => {
    const stats = inviterStats(section, id); stats.bonus = Math.max(-100000, Math.min(100000, Number(bonus || 0)));
    return { ...section, inviters: { ...section.inviters, [id]: stats } };
  }, meta).inviters[id];
}

async function createManagedInvite(guild, channelId, meta = {}) {
  const section = getSection(guild.id);
  const id = cleanId(channelId || section.settings.managedInviteChannelId);
  const channel = id ? (guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null)) : null;
  if (!channel?.createInvite) throw new Error('Select a channel where Goliath can create invites.');
  const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, temporary: false, unique: true, reason: 'Goliath managed invite' });
  updateSettings(guild.id, { managedInviteEnabled: true, managedInviteChannelId: channel.id, managedInviteCode: invite.code }, meta);
  await syncGuild(guild, meta);
  return invite;
}

async function validateManagedInvite(guild, meta = {}) {
  const section = getSection(guild.id);
  if (!section.settings.managedInviteEnabled) return { valid: false, reason: 'disabled' };
  const invites = await guild.invites.fetch();
  const existing = invites.get(section.settings.managedInviteCode);
  if (existing) return { valid: true, invite: existing };
  if (!section.settings.autoRepair) return { valid: false, reason: 'missing' };
  const invite = await createManagedInvite(guild, section.settings.managedInviteChannelId, meta);
  return { valid: true, repaired: true, invite };
}

async function buildHealth(guild) {
  const section = getSection(guild.id);
  const issues = []; const warnings = [];
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageGuild)) issues.push({ code: 'manage_guild_missing' });
  if (section.settings.managedInviteEnabled && !me?.permissions.has(PermissionFlagsBits.CreateInstantInvite)) issues.push({ code: 'create_invite_missing' });
  if (section.settings.logChannelId) {
    const channel = guild.channels.cache.get(section.settings.logChannelId) || await guild.channels.fetch(section.settings.logChannelId).catch(() => null);
    if (!channel?.send) issues.push({ code: 'log_channel_unavailable', channelId: section.settings.logChannelId });
  }
  if (section.settings.managedInviteEnabled) {
    const result = await validateManagedInvite(guild).catch((error) => ({ valid: false, reason: error.message }));
    if (!result.valid) warnings.push({ code: 'managed_invite_invalid', reason: result.reason });
  }
  return { module: SECTION, healthy: issues.length === 0, enabled: section.enabled, inviters: Object.keys(section.inviters).length, members: Object.keys(section.members).length, issues, warnings, checkedAt: now() };
}

async function repair(guild, meta = {}) {
  await syncGuild(guild, meta).catch(() => null);
  const section = getSection(guild.id);
  if (section.settings.managedInviteEnabled) await validateManagedInvite(guild, meta).catch(() => null);
  return buildHealth(guild);
}

async function startup(client) {
  if (client.__goliathInvitesStarted) return;
  client.__goliathInvitesStarted = true;
  for (const guild of client.guilds.cache.values()) await syncGuild(guild, { action: 'invites_startup_sync' }).catch(() => null);
}

module.exports = {
  SECTION, defaults, getSection, setEnabled, updateSettings, addHistory, syncGuild, trackJoin, trackLeave,
  leaderboard, setBonus, createManagedInvite, validateManagedInvite, buildHealth, repair, startup,
  exportConfiguration: getSection,
  reset: (guildId, meta = {}) => saveSection(guildId, defaults(), meta),
};