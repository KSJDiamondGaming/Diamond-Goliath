'use strict';

const { PermissionFlagsBits } = require('discord.js');
const schedule = require('./schedule');
const { isModuleEnabled } = require('../../../core/guild/guildManager');

const REMINDER_TICK_MS = 60 * 1000;
const now = () => new Date().toISOString();

function dueReminders(event, timestamp = Date.now()) {
  if (event.status !== 'scheduled' || event.enabled === false) return [];
  const startMs = new Date(event.startAt).getTime();
  return event.reminderMinutes.filter((minutes) => !event.sentReminders.includes(minutes) && timestamp >= startMs - minutes * 60000 && timestamp < startMs);
}

async function sendReminder(guild, event, minutes) {
  const channel = event.channelId ? await guild.channels.fetch(event.channelId).catch(() => null) : null;
  if (!channel?.send) throw new Error('Schedule reminder channel is unavailable.');
  const mentions = event.mentionRoleIds.map((id) => `<@&${id}>`).join(' ');
  const unix = Math.floor(new Date(event.startAt).getTime() / 1000);
  await channel.send({ content: `${mentions ? `${mentions} ` : ''}**${event.title}** starts <t:${unix}:R> (<t:${unix}:F>).`, allowedMentions: { roles: event.mentionRoleIds } });
}

async function processGuild(guild, meta = {}) {
  if (!isModuleEnabled(guild.id, 'schedule')) return { disabled: true, reminders: 0, completed: 0, recurrences: 0, failures: 0 };
  const result = { reminders: 0, completed: 0, recurrences: 0, failures: 0 };
  const timestamp = Date.now();
  for (const event of schedule.listEvents(guild.id)) {
    try {
      for (const minutes of dueReminders(event, timestamp)) {
        await sendReminder(guild, event, minutes);
        schedule.saveEvent(guild.id, { ...schedule.getEvent(guild.id, event.eventId), sentReminders: [...event.sentReminders, minutes] }, meta);
        result.reminders += 1;
      }
      if (event.status === 'scheduled' && timestamp >= new Date(event.endAt).getTime()) {
        schedule.saveEvent(guild.id, { ...event, status: 'completed', completedAt: now() }, meta);
        result.completed += 1;
        const next = schedule.nextOccurrence(event);
        if (next) { schedule.saveEvent(guild.id, next, meta); result.recurrences += 1; }
      }
    } catch (error) {
      schedule.saveEvent(guild.id, { ...event, lastError: error.message }, meta);
      result.failures += 1;
    }
  }
  schedule.incrementAnalytics(guild.id, { remindersSent: result.reminders, completed: result.completed, failures: result.failures, lastProcessedAt: now() }, meta);
  return result;
}

async function buildHealth(guild) {
  const section = schedule.getSection(guild.id);
  const issues = [];
  const warnings = [];
  for (const event of schedule.listEvents(guild.id)) {
    if (event.channelId) {
      const channel = guild.channels.cache.get(event.channelId) || await guild.channels.fetch(event.channelId).catch(() => null);
      if (!channel?.send) issues.push({ code: 'channel_unavailable', eventId: event.eventId, channelId: event.channelId });
    } else warnings.push({ code: 'channel_missing', eventId: event.eventId });
    if (event.lastError) warnings.push({ code: 'last_error', eventId: event.eventId, error: event.lastError });
  }
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.SendMessages)) issues.push({ code: 'send_messages_missing' });
  return { module: 'schedule', guildId: guild.id, healthy: issues.length === 0, enabled: isModuleEnabled(guild.id, 'schedule'), eventCount: Object.keys(section.events).length, upcomingCount: schedule.listEvents(guild.id, { status: 'scheduled' }).length, issues, warnings, checkedAt: now() };
}

async function repair(guild, meta = {}) {
  for (const event of schedule.listEvents(guild.id)) {
    const channelId = event.channelId && !guild.channels.cache.has(event.channelId) ? null : event.channelId;
    schedule.saveEvent(guild.id, { ...event, channelId, lastError: null }, meta);
  }
  return buildHealth(guild);
}

async function startup(client) {
  if (client.__goliathScheduleStarted) return client.__goliathScheduleStarted;
  const run = async () => {
    for (const guild of client.guilds.cache.values()) await processGuild(guild, { action: 'schedule_startup_process' }).catch((error) => console.warn(`[Schedule] ${guild.id}: ${error.message}`));
  };
  await run();
  const timer = setInterval(run, REMINDER_TICK_MS);
  timer.unref?.();
  client.__goliathScheduleStarted = timer;
  return timer;
}

module.exports = { REMINDER_TICK_MS, dueReminders, sendReminder, processGuild, buildHealth, repair, startup };
