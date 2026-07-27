'use strict';

const { PermissionFlagsBits } = require('discord.js');
const schedule = require('./schedule');

function now() {
  return new Date().toISOString();
}

async function buildHealthReport(guild) {
  if (!guild?.id) throw new Error('Guild is unavailable.');

  const section = schedule.getSection(guild.id);
  const issues = [];
  const warnings = [];

  for (const event of schedule.listEvents(guild.id)) {
    if (!event.channelId) {
      warnings.push({ code: 'channel_missing', eventId: event.eventId });
    } else {
      const channel = guild.channels.cache.get(event.channelId)
        || await guild.channels.fetch(event.channelId).catch(() => null);
      if (!channel?.send) {
        issues.push({
          code: 'channel_unavailable',
          eventId: event.eventId,
          channelId: event.channelId,
        });
      }
    }

    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: event.timezone }).format(new Date());
    } catch {
      issues.push({ code: 'timezone_invalid', eventId: event.eventId, timezone: event.timezone });
    }

    if (event.lastError) {
      warnings.push({ code: 'last_error', eventId: event.eventId, error: event.lastError });
    }
  }

  const botMember = guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.SendMessages)) {
    issues.push({ code: 'send_messages_missing' });
  }

  return {
    module: 'schedule',
    guildId: guild.id,
    healthy: issues.length === 0,
    enabled: section.enabled,
    eventCount: Object.keys(section.events).length,
    upcomingCount: schedule.listEvents(guild.id, { status: 'scheduled' }).length,
    issues,
    warnings,
    checkedAt: now(),
  };
}

async function repair(guild, meta = {}) {
  if (!guild?.id) throw new Error('Guild is unavailable.');

  const section = schedule.getSection(guild.id);
  const events = {};

  for (const event of Object.values(section.events)) {
    let channelId = event.channelId;
    if (channelId) {
      const channel = guild.channels.cache.get(channelId)
        || await guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.send) channelId = null;
    }

    events[event.eventId] = {
      ...event,
      channelId,
      lastError: null,
      updatedAt: now(),
    };
  }

  schedule.saveSection(guild.id, {
    ...section,
    events,
    updatedAt: now(),
  }, {
    action: 'schedule_health_repair',
    ...meta,
  });

  return buildHealthReport(guild);
}

module.exports = {
  buildHealthReport,
  repair,
};
