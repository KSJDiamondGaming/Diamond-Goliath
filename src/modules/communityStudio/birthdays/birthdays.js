'use strict';

const { PermissionFlagsBits } = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const { getModuleSection, saveModuleSection, updateModuleSection } = require('../../../core/guild/moduleSectionManager');

const SECTION = 'birthdays';
const TICK_MS = 60 * 1000;
const UPCOMING_WINDOW_DAYS = 30;
const now = () => new Date().toISOString();
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const cleanId = (value) => {
  const id = String(value || '').replace(/[<@&#!>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
};

function validTimezone(value) {
  try { new Intl.DateTimeFormat('en-GB', { timeZone: value }).format(new Date()); return true; }
  catch { return false; }
}

function validTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function defaultSection() {
  return {
    settings: {
      announcementChannelId: null,
      announcementTime: '09:00',
      timezone: 'UTC',
      messageTemplate: '🎂 Happy Birthday {mention}! We hope you have a fantastic day! 🎉',
      birthdayRoleId: null,
      roleDurationHours: 24,
      showAgeByDefault: false,
      announceByDefault: true,
      leapDayMode: 'feb28',
    },
    members: {},
    analytics: {
      birthdaysStored: 0,
      announcementsSent: 0,
      rolesAssigned: 0,
      rolesRemoved: 0,
      failures: 0,
      lastProcessedAt: null,
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizeMember(input = {}, userId = null, settings = defaultSection().settings) {
  const id = cleanId(input.userId || userId);
  if (!id) throw new Error('A valid Discord user is required.');
  const month = Math.floor(Number(input.month));
  const day = Math.floor(Number(input.day));
  const year = input.year == null || input.year === '' ? null : Math.floor(Number(input.year));
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Birthday month must be between 1 and 12.');
  const maxDay = new Date(Date.UTC(2024, month, 0)).getUTCDate();
  if (!Number.isInteger(day) || day < 1 || day > maxDay) throw new Error('Birthday day is invalid for that month.');
  const currentYear = new Date().getUTCFullYear();
  if (year != null && (!Number.isInteger(year) || year < 1900 || year > currentYear)) throw new Error('Birthday year is invalid.');
  return {
    userId: id,
    month,
    day,
    year,
    announce: input.announce == null ? settings.announceByDefault !== false : input.announce !== false,
    showAge: input.showAge == null ? settings.showAgeByDefault === true : input.showAge === true,
    lastAnnouncedKey: clean(input.lastAnnouncedKey, 20) || null,
    roleAssignedAt: input.roleAssignedAt || null,
    createdAt: input.createdAt || now(),
    updatedAt: now(),
  };
}

function normalizeSection(section = {}) {
  const base = defaultSection();
  const raw = section && typeof section === 'object' ? section : {};
  const settings = {
    ...base.settings,
    ...(raw.settings || {}),
    announcementChannelId: cleanId(raw.settings?.announcementChannelId),
    announcementTime: validTime(raw.settings?.announcementTime) ? raw.settings.announcementTime : base.settings.announcementTime,
    timezone: validTimezone(raw.settings?.timezone) ? raw.settings.timezone : base.settings.timezone,
    messageTemplate: clean(raw.settings?.messageTemplate || base.settings.messageTemplate, 1800) || base.settings.messageTemplate,
    birthdayRoleId: cleanId(raw.settings?.birthdayRoleId),
    roleDurationHours: Math.max(1, Math.min(168, Math.floor(Number(raw.settings?.roleDurationHours || 24)))),
    showAgeByDefault: raw.settings?.showAgeByDefault === true,
    announceByDefault: raw.settings?.announceByDefault !== false,
    leapDayMode: raw.settings?.leapDayMode === 'mar1' ? 'mar1' : 'feb28',
  };
  const members = {};
  for (const [userId, record] of Object.entries(raw.members || {})) {
    try { members[userId] = normalizeMember(record, userId, settings); } catch {}
  }
  return {
    ...base,
    ...clone(raw),
    settings,
    members,
    analytics: { ...base.analytics, ...(raw.analytics || {}) },
    updatedAt: raw.updatedAt || now(),
  };
}

function getSection(guildId) {
  return normalizeSection(getModuleSection(guildId, SECTION, defaultSection()));
}

function saveSection(guildId, section, meta = {}) {
  return normalizeSection(saveModuleSection(guildId, SECTION, normalizeSection(section), meta));
}

function updateSection(guildId, updater, meta = {}) {
  return normalizeSection(updateModuleSection(guildId, SECTION, (current) => {
    const normalized = normalizeSection(current);
    const next = typeof updater === 'function' ? updater(clone(normalized)) : updater;
    return { ...normalizeSection(next), updatedAt: now() };
  }, defaultSection(), meta));
}

function incrementAnalytics(guildId, patch, meta = {}) {
  return updateSection(guildId, (section) => {
    const analytics = { ...section.analytics };
    for (const [key, value] of Object.entries(patch)) analytics[key] = typeof value === 'number' ? Number(analytics[key] || 0) + value : value;
    return { ...section, analytics };
  }, meta).analytics;
}

function updateSettings(guildId, patch = {}, meta = {}) {
  return updateSection(guildId, (section) => ({ ...section, settings: { ...section.settings, ...patch } }), meta).settings;
}

function getBirthday(guildId, userId) {
  return getSection(guildId).members[String(userId)] || null;
}

function setBirthday(guildId, userId, input = {}, meta = {}) {
  const section = getSection(guildId);
  const existing = section.members[String(userId)] || {};
  const member = normalizeMember({ ...existing, ...input, userId }, userId, section.settings);
  const created = !section.members[member.userId];
  updateSection(guildId, (current) => ({ ...current, members: { ...current.members, [member.userId]: member } }), meta);
  if (created) incrementAnalytics(guildId, { birthdaysStored: 1 }, meta);
  return getBirthday(guildId, member.userId);
}

function removeBirthday(guildId, userId, meta = {}) {
  let removed = null;
  updateSection(guildId, (section) => {
    const members = { ...section.members };
    removed = members[String(userId)] || null;
    delete members[String(userId)];
    return { ...section, members };
  }, meta);
  return removed;
}

function zonedParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function effectiveBirthday(member, year, settings) {
  if (member.month !== 2 || member.day !== 29 || isLeapYear(year)) return { month: member.month, day: member.day };
  return settings.leapDayMode === 'mar1' ? { month: 3, day: 1 } : { month: 2, day: 28 };
}

function birthdayKey(member, year, settings) {
  const date = effectiveBirthday(member, year, settings);
  return `${year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function ageFor(member, year) {
  if (!member.year) return null;
  return Math.max(0, year - member.year);
}

function nextBirthday(member, settings, from = new Date()) {
  const timezone = settings.timezone;
  const parts = zonedParts(from, timezone);
  let year = Number(parts.year);
  for (let guard = 0; guard < 3; guard += 1, year += 1) {
    const effective = effectiveBirthday(member, year, settings);
    const key = `${year}-${String(effective.month).padStart(2, '0')}-${String(effective.day).padStart(2, '0')}`;
    const todayKey = `${parts.year}-${parts.month}-${parts.day}`;
    if (key >= todayKey) return { year, month: effective.month, day: effective.day, key };
  }
  return null;
}

function dateKeyToUtcMs(key) {
  const match = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function listUpcoming(guildId, limit = 20, withinDays = UPCOMING_WINDOW_DAYS) {
  const section = getSection(guildId);
  const local = zonedParts(new Date(), section.settings.timezone);
  const todayKey = `${local.year}-${local.month}-${local.day}`;
  const todayMs = dateKeyToUtcMs(todayKey);
  const maxDays = Math.max(0, Math.min(366, Number(withinDays) || UPCOMING_WINDOW_DAYS));
  return Object.values(section.members)
    .filter((member) => member.announce !== false)
    .map((member) => ({ member, next: nextBirthday(member, section.settings) }))
    .filter((item) => item.next)
    .map((item) => ({ ...item, daysUntil: Math.round((dateKeyToUtcMs(item.next.key) - todayMs) / 86400000) }))
    .filter((item) => item.daysUntil >= 0 && item.daysUntil <= maxDays)
    .sort((a, b) => a.next.key.localeCompare(b.next.key))
    .slice(0, Math.max(1, Math.min(100, Number(limit) || 20)));
}

function renderMessage(template, guild, member, year) {
  const discordMember = guild.members.cache.get(member.userId);
  const display = discordMember?.displayName || discordMember?.user?.username || 'member';
  const age = member.showAge ? ageFor(member, year) : null;
  return clean(template, 1800)
    .replaceAll('{mention}', `<@${member.userId}>`)
    .replaceAll('{user}', display)
    .replaceAll('{server}', guild.name || 'this server')
    .replaceAll('{age}', age == null ? '' : String(age));
}

function canManageBirthdayRole(guild, role) {
  const me = guild.members.me;
  return Boolean(
    me
    && role
    && role.id !== guild.id
    && !role.managed
    && me.permissions.has(PermissionFlagsBits.ManageRoles)
    && role.position < me.roles.highest.position
  );
}

async function assignBirthdayRole(guild, section, member, meta = {}) {
  const roleId = section.settings.birthdayRoleId;
  if (!roleId) return false;
  const discordMember = await guild.members.fetch(member.userId).catch(() => null);
  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!discordMember) throw new Error('Birthday member is unavailable.');
  if (!role) throw new Error('Birthday role is unavailable.');
  if (!canManageBirthdayRole(guild, role)) throw new Error('Birthday role cannot be managed. Check Manage Roles permission and role hierarchy.');
  if (!discordMember.roles.cache.has(roleId)) {
    await discordMember.roles.add(roleId, 'Goliath birthday role');
  }
  setBirthday(guild.id, member.userId, { roleAssignedAt: now() }, { ...meta, action: 'birthday_role_assigned' });
  incrementAnalytics(guild.id, { rolesAssigned: 1 }, meta);
  return true;
}

async function cleanupBirthdayRoles(guild, section, meta = {}) {
  const roleId = section.settings.birthdayRoleId;
  if (!roleId) return 0;
  const maxAgeMs = section.settings.roleDurationHours * 3600000;
  let removed = 0;
  for (const member of Object.values(section.members)) {
    if (!member.roleAssignedAt || Date.now() - new Date(member.roleAssignedAt).getTime() < maxAgeMs) continue;
    const discordMember = await guild.members.fetch(member.userId).catch(() => null);
    if (discordMember?.roles?.cache?.has(roleId)) {
      await discordMember.roles.remove(roleId, 'Goliath birthday role expired');
    }
    setBirthday(guild.id, member.userId, { roleAssignedAt: null }, { ...meta, action: 'birthday_role_removed' });
    removed += 1;
  }
  if (removed) incrementAnalytics(guild.id, { rolesRemoved: removed }, meta);
  return removed;
}

async function processGuild(guild, meta = {}) {
  if (!guildManager.isModuleEnabled(guild.id, SECTION)) return { disabled: true, announced: 0, rolesAssigned: 0, rolesRemoved: 0, failures: 0 };
  let section = getSection(guild.id);
  const local = zonedParts(new Date(), section.settings.timezone);
  const year = Number(local.year);
  const currentTime = `${local.hour}:${local.minute}`;
  const today = `${local.year}-${local.month}-${local.day}`;
  const result = { announced: 0, rolesAssigned: 0, rolesRemoved: 0, failures: 0 };
  result.rolesRemoved = await cleanupBirthdayRoles(guild, section, meta);
  section = getSection(guild.id);

  for (const member of Object.values(section.members)) {
    if (birthdayKey(member, year, section.settings) !== today) continue;
    const currentMember = getBirthday(guild.id, member.userId);
    const currentSection = getSection(guild.id);
    if (currentSection.settings.birthdayRoleId && !currentMember?.roleAssignedAt) {
      try {
        const assigned = await assignBirthdayRole(guild, currentSection, currentMember, meta);
        if (assigned) result.rolesAssigned += 1;
      } catch (error) {
        result.failures += 1;
        incrementAnalytics(guild.id, { failures: 1 }, meta);
        console.warn(`[Birthdays] ${guild.id}/${member.userId} role: ${error.message}`);
      }
    }
  }

  if (currentTime < section.settings.announcementTime) {
    incrementAnalytics(guild.id, { lastProcessedAt: now() }, meta);
    return result;
  }

  const channelId = section.settings.announcementChannelId;
  const channel = channelId ? (guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null)) : null;
  for (const member of Object.values(section.members)) {
    if (birthdayKey(member, year, section.settings) !== today) continue;

    if (member.announce !== false && member.lastAnnouncedKey !== today) {
      try {
        if (!channel?.send) throw new Error('Birthday announcement channel is unavailable.');
        const content = renderMessage(section.settings.messageTemplate, guild, member, year);
        await channel.send({ content, allowedMentions: { users: [member.userId] } });
        setBirthday(guild.id, member.userId, { lastAnnouncedKey: today }, { ...meta, action: 'birthday_announced' });
        incrementAnalytics(guild.id, { announcementsSent: 1 }, meta);
        result.announced += 1;
      } catch (error) {
        result.failures += 1;
        incrementAnalytics(guild.id, { failures: 1 }, meta);
        console.warn(`[Birthdays] ${guild.id}/${member.userId} announcement: ${error.message}`);
      }
    }
  }
  incrementAnalytics(guild.id, { lastProcessedAt: now() }, meta);
  return result;
}

async function buildHealth(guild) {
  const section = getSection(guild.id);
  const issues = [];
  const warnings = [];
  const me = guild.members.me;
  if (!section.settings.announcementChannelId) warnings.push({ code: 'announcement_channel_missing' });
  else {
    const channel = guild.channels.cache.get(section.settings.announcementChannelId) || await guild.channels.fetch(section.settings.announcementChannelId).catch(() => null);
    if (!channel?.send) issues.push({ code: 'announcement_channel_unavailable', channelId: section.settings.announcementChannelId });
    else {
      const permissions = channel.permissionsFor?.(me);
      if (permissions && !permissions.has(PermissionFlagsBits.SendMessages)) issues.push({ code: 'announcement_send_messages_missing', channelId: channel.id });
    }
  }
  if (section.settings.birthdayRoleId) {
    const role = guild.roles.cache.get(section.settings.birthdayRoleId) || await guild.roles.fetch(section.settings.birthdayRoleId).catch(() => null);
    if (!role) warnings.push({ code: 'birthday_role_missing' });
    else if (!canManageBirthdayRole(guild, role)) warnings.push({ code: 'birthday_role_unmanageable' });
  }
  return { module: SECTION, guildId: guild.id, enabled: guildManager.isModuleEnabled(guild.id, SECTION), healthy: issues.length === 0, memberCount: Object.keys(section.members).length, issues, warnings, checkedAt: now() };
}

module.exports = {
  SECTION, TICK_MS, defaultSection, normalizeSection, normalizeMember,
  getSection, saveSection, updateSection, updateSettings, incrementAnalytics,
  getBirthday, setBirthday, removeBirthday, listUpcoming, nextBirthday, ageFor,
  processGuild, buildHealth, validTimezone, validTime,
  reset: (guildId, meta = {}) => saveSection(guildId, defaultSection(), meta),
};