'use strict';

const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const { getModuleSection, saveModuleSection, updateModuleSection } = require('../../../core/guild/moduleSectionManager');

const SECTION = 'birthdays';
const TICK_MS = 60 * 1000;
const UPCOMING_WINDOW_DAYS = 30;
const LEGACY_MESSAGE_TEMPLATE = '🎂 Happy Birthday {mention}! We hope you have a fantastic day! 🎉';
const DEFAULT_MESSAGE_TEMPLATE = '🎂 Happy Birthday {mention}! From everyone at {server}, we hope you have a fantastic day! 🎉';
const now = () => new Date().toISOString();
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const cleanId = (value) => {
  const id = String(value || '').replace(/[<@&#!>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
};

function normalizeTimezone(value) {
  const timezone = String(value || '').trim();
  if (!timezone) return null;
  if (/^(?:GMT|BST)$/i.test(timezone)) return 'Europe/London';
  return timezone;
}

function validTimezone(value) {
  try { new Intl.DateTimeFormat('en-GB', { timeZone: normalizeTimezone(value) || value }).format(new Date()); return true; }
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
      timezone: 'Europe/London',
      messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
      birthdayRoleId: null,
      roleDurationHours: 24,
      showAgeByDefault: false,
      announceByDefault: true,
      leapDayMode: 'feb28',
      monthlyBoardChannelId: null,
      monthlyBoardTime: '09:00',
    },
    members: {},
    monthlyBoard: {
      lastPostedKey: null,
    },
    analytics: {
      birthdaysStored: 0,
      announcementsSent: 0,
      monthlyBoardsSent: 0,
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
    roleAssignedRoleId: cleanId(input.roleAssignedRoleId),
    createdAt: input.createdAt || now(),
    updatedAt: now(),
  };
}

function normalizeSection(section = {}) {
  const base = defaultSection();
  const raw = section && typeof section === 'object' ? section : {};
  const rawTimezone = normalizeTimezone(raw.settings?.timezone);
  const rawMessageTemplate = clean(raw.settings?.messageTemplate, 1800);
  const settings = {
    ...base.settings,
    ...(raw.settings || {}),
    announcementChannelId: cleanId(raw.settings?.announcementChannelId),
    announcementTime: validTime(raw.settings?.announcementTime) ? raw.settings.announcementTime : base.settings.announcementTime,
    timezone: rawTimezone && validTimezone(rawTimezone) ? rawTimezone : base.settings.timezone,
    messageTemplate: !rawMessageTemplate || rawMessageTemplate === LEGACY_MESSAGE_TEMPLATE ? base.settings.messageTemplate : rawMessageTemplate,
    birthdayRoleId: cleanId(raw.settings?.birthdayRoleId),
    roleDurationHours: Math.max(1, Math.min(168, Math.floor(Number(raw.settings?.roleDurationHours || 24)))),
    showAgeByDefault: raw.settings?.showAgeByDefault === true,
    announceByDefault: raw.settings?.announceByDefault !== false,
    leapDayMode: raw.settings?.leapDayMode === 'mar1' ? 'mar1' : 'feb28',
    monthlyBoardChannelId: cleanId(raw.settings?.monthlyBoardChannelId),
    monthlyBoardTime: validTime(raw.settings?.monthlyBoardTime) ? raw.settings.monthlyBoardTime : base.settings.monthlyBoardTime,
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
    monthlyBoard: { ...base.monthlyBoard, ...(raw.monthlyBoard || {}) },
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
  const normalizedPatch = { ...patch };
  if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'timezone')) normalizedPatch.timezone = normalizeTimezone(normalizedPatch.timezone);
  return updateSection(guildId, (section) => ({ ...section, settings: { ...section.settings, ...normalizedPatch } }), meta).settings;
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

function monthlyWindow(section, from = new Date(), months = 2) {
  const local = zonedParts(from, section.settings.timezone);
  const startYear = Number(local.year);
  const startMonth = Number(local.month);
  const groups = [];
  for (let offset = 0; offset < Math.max(1, Math.min(12, Number(months) || 2)); offset += 1) {
    const zeroBased = (startMonth - 1) + offset;
    const year = startYear + Math.floor(zeroBased / 12);
    const month = (zeroBased % 12) + 1;
    const birthdays = Object.values(section.members)
      .filter((member) => member.announce !== false)
      .map((member) => ({ member, effective: effectiveBirthday(member, year, section.settings) }))
      .filter((item) => item.effective.month === month)
      .sort((a, b) => a.effective.day - b.effective.day || a.member.userId.localeCompare(b.member.userId));
    groups.push({ year, month, birthdays });
  }
  return groups;
}

function monthLabel(year, month) {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function monthlyBoardEmbed(guild, section) {
  const groups = monthlyWindow(section, new Date(), 2);
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎂 Upcoming Birthdays — Next 2 Months')
    .setFooter({ text: `Goliath Birthdays · Monthly Board · ${section.settings.timezone}` })
    .setTimestamp();
  for (const group of groups) {
    const lines = group.birthdays.length
      ? group.birthdays.map(({ member, effective }) => `**${String(effective.day).padStart(2, '0')} ${monthLabel(group.year, group.month).replace(/ \d{4}$/, '')}** — <@${member.userId}>`).join('\n')
      : 'No birthdays registered for this month.';
    embed.addFields({ name: `📅 ${monthLabel(group.year, group.month)}`, value: lines.slice(0, 1024) });
  }
  return embed;
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

async function getBirthdayRoleState(guild, section, member) {
  const roleId = section.settings.birthdayRoleId;
  if (!roleId) return { role: null, discordMember: null, hasRole: false };
  const discordMember = await guild.members.fetch(member.userId).catch(() => null);
  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  return { role, discordMember, hasRole: Boolean(discordMember?.roles?.cache?.has(roleId)) };
}

async function removeTrackedBirthdayRole(guild, member, roleId, meta = {}, reason = 'Goliath birthday role replaced') {
  if (!roleId) return false;
  const discordMember = await guild.members.fetch(member.userId).catch(() => null);
  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!discordMember) throw new Error('Birthday member is unavailable.');
  if (!role) return false;
  if (!discordMember.roles.cache.has(roleId)) return false;
  if (!canManageBirthdayRole(guild, role)) throw new Error(`Goliath cannot manage the birthday role ${role.name}.`);
  await discordMember.roles.remove(role, reason);
  incrementAnalytics(guild.id, { rolesRemoved: 1 }, meta);
  return true;
}

async function processGuild(guild) {
  if (!guild || !guildManager.isModuleEnabled(guild.id, 'birthdays')) return;
  const section = getSection(guild.id);
  const parts = zonedParts(new Date(), section.settings.timezone);
  const year = Number(parts.year);
  const todayKey = `${parts.year}-${parts.month}-${parts.day}`;
  const currentTime = `${parts.hour}:${parts.minute}`;
  const roleId = section.settings.birthdayRoleId;
  for (const member of Object.values(section.members)) {
    try {
      const isToday = birthdayKey(member, year, section.settings) === todayKey;
      const trackedRoleId = cleanId(member.roleAssignedRoleId);
      if (trackedRoleId && trackedRoleId !== roleId) {
        await removeTrackedBirthdayRole(guild, member, trackedRoleId, { action: 'birthday_role_replaced' });
        member.roleAssignedAt = null;
        member.roleAssignedRoleId = null;
      }
      if (isToday && roleId) {
        const { role, discordMember, hasRole } = await getBirthdayRoleState(guild, section, member);
        if (!discordMember) throw new Error('Birthday member is unavailable.');
        if (!role) throw new Error('Configured birthday role no longer exists.');
        if (!canManageBirthdayRole(guild, role)) throw new Error(`Goliath cannot manage the birthday role ${role.name}.`);
        if (!hasRole) {
          await discordMember.roles.add(role, 'Goliath birthday role');
          incrementAnalytics(guild.id, { rolesAssigned: 1 }, { action: 'birthday_role_assign' });
        }
        if (!member.roleAssignedAt || member.roleAssignedRoleId !== roleId) {
          member.roleAssignedAt = member.roleAssignedAt || now();
          member.roleAssignedRoleId = roleId;
        }
      } else if (!isToday && trackedRoleId) {
        await removeTrackedBirthdayRole(guild, member, trackedRoleId, { action: 'birthday_role_expire' }, 'Goliath birthday role expired');
        member.roleAssignedAt = null;
        member.roleAssignedRoleId = null;
      }
      if (!isToday || !member.announce || member.lastAnnouncedKey === todayKey || currentTime < section.settings.announcementTime) continue;
      const channelId = section.settings.announcementChannelId;
      if (!channelId) continue;
      const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased?.()) throw new Error('Birthday announcement channel is unavailable.');
      const content = renderMessage(section.settings.messageTemplate, guild, member, year);
      await channel.send({ content, allowedMentions: { users: [member.userId], roles: roleId ? [roleId] : [] } });
      member.lastAnnouncedKey = todayKey;
      incrementAnalytics(guild.id, { announcementsSent: 1 }, { action: 'birthday_announcement' });
    } catch (error) {
      incrementAnalytics(guild.id, { failures: 1 }, { action: 'birthday_process_failure' });
      console.warn(`[birthdays] ${guild.id}/${member.userId}: ${error.message}`);
    }
  }
  if (section.settings.monthlyBoardChannelId && Number(parts.day) === 1 && currentTime >= section.settings.monthlyBoardTime) {
    const monthKey = `${parts.year}-${parts.month}`;
    if (section.monthlyBoard?.lastPostedKey !== monthKey) {
      try {
        const channelId = section.settings.monthlyBoardChannelId;
        const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (!channel?.isTextBased?.()) throw new Error('Monthly birthday board channel is unavailable.');
        await channel.send({ embeds: [monthlyBoardEmbed(guild, section)], allowedMentions: { parse: [] } });
        section.monthlyBoard = { ...(section.monthlyBoard || {}), lastPostedKey: monthKey };
        incrementAnalytics(guild.id, { monthlyBoardsSent: 1 }, { action: 'birthday_monthly_board' });
      } catch (error) {
        incrementAnalytics(guild.id, { failures: 1 }, { action: 'birthday_monthly_board_failure' });
        console.warn(`[birthdays] monthly board ${guild.id}: ${error.message}`);
      }
    }
  }
  section.analytics.lastProcessedAt = now();
  saveSection(guild.id, section, { action: 'birthday_process' });
}

async function buildHealth(guild) {
  const section = getSection(guild.id);
  const issues = [];
  const warnings = [];
  if (!guildManager.isModuleEnabled(guild.id, 'birthdays')) warnings.push('Birthdays module is disabled.');
  if (section.settings.announcementChannelId) {
    const channel = guild.channels.cache.get(section.settings.announcementChannelId) || await guild.channels.fetch(section.settings.announcementChannelId).catch(() => null);
    if (!channel?.isTextBased?.()) issues.push('Birthday announcement channel is missing or not text based.');
  } else warnings.push('No birthday announcement channel is configured.');
  if (section.settings.monthlyBoardChannelId) {
    const channel = guild.channels.cache.get(section.settings.monthlyBoardChannelId) || await guild.channels.fetch(section.settings.monthlyBoardChannelId).catch(() => null);
    if (!channel?.isTextBased?.()) issues.push('Monthly birthday board channel is missing or not text based.');
  }
  if (section.settings.birthdayRoleId) {
    const role = guild.roles.cache.get(section.settings.birthdayRoleId) || await guild.roles.fetch(section.settings.birthdayRoleId).catch(() => null);
    if (!role) issues.push('Birthday role no longer exists.');
    else if (!canManageBirthdayRole(guild, role)) issues.push('Goliath cannot manage the configured birthday role.');
  }
  return { healthy: issues.length === 0, issues, warnings, analytics: section.analytics };
}

const startedClients = new WeakSet();
const runningClients = new WeakSet();
function start(client) {
  if (!client || startedClients.has(client)) return;
  startedClients.add(client);
  const run = async () => {
    if (runningClients.has(client)) return;
    runningClients.add(client);
    try {
      for (const guild of client.guilds.cache.values()) await processGuild(guild).catch((error) => console.warn(`[birthdays] ${guild.id}: ${error.message}`));
    } finally {
      runningClients.delete(client);
    }
  };
  const startMinuteLoop = () => {
    run().catch(() => {});
    const nowMs = Date.now();
    const delayToNextMinute = TICK_MS - (nowMs % TICK_MS) + 250;
    const alignTimer = setTimeout(() => {
      run().catch(() => {});
      const interval = setInterval(() => run().catch(() => {}), TICK_MS);
      interval.unref?.();
    }, delayToNextMinute);
    alignTimer.unref?.();
  };
  if (client.isReady?.()) startMinuteLoop();
  else client.once('ready', startMinuteLoop);
}

module.exports = {
  start, defaultSection, normalizeSection, normalizeMember,
  getSection, saveSection, updateSection, updateSettings, incrementAnalytics,
  getBirthday, setBirthday, removeBirthday, listUpcoming, nextBirthday, ageFor,
  monthlyWindow, monthlyBoardEmbed, processGuild, buildHealth, validTimezone, validTime,
  reset: (guildId, meta = {}) => saveSection(guildId, defaultSection(), meta),
};
