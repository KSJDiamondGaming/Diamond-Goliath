'use strict';

const schedule = require('./schedule');
const deployment = require('./scheduleDeployment');

const REMINDER_TICK_MS = 60 * 1000;
const timers = new WeakMap();

async function reconcileProcessedGuild(guild, beforeEvents, action) {
  const before = new Map(beforeEvents.map((event) => [event.eventId, event]));
  const afterEvents = schedule.listEvents(guild.id);
  const after = new Map(afterEvents.map((event) => [event.eventId, event]));

  for (const [eventId, previous] of before.entries()) {
    const current = after.get(eventId);
    if (!current || previous.status === current.status) continue;
    if (current.messageId) {
      await deployment.updateDeployment(guild, eventId).catch((error) => {
        console.warn(`[Schedule] ${guild.id} deployment lifecycle sync failed for ${eventId}: ${error.message}`);
      });
    } else if (current.discordEventId) {
      await deployment.syncDiscordEvent(guild, current).catch((error) => {
        console.warn(`[Schedule] ${guild.id} native lifecycle sync failed for ${eventId}: ${error.message}`);
      });
    }
  }

  for (const current of afterEvents) {
    if (before.has(current.eventId) || current.status !== 'scheduled' || current.messageId) continue;
    const parent = current.parentEventId ? before.get(current.parentEventId) || after.get(current.parentEventId) : null;
    if (!parent?.messageId || !current.channelId) continue;
    await deployment.deploy(guild, current.eventId, current.channelId, { action: `${action}_recurrence_deploy` }).catch((error) => {
      schedule.saveEvent(guild.id, { ...current, lastError: `Recurring deployment: ${error.message}` }, { action: `${action}_recurrence_deploy_failed` });
      console.warn(`[Schedule] ${guild.id} recurring event deployment failed for ${current.eventId}: ${error.message}`);
    });
  }
}

async function processAllGuilds(client, action) {
  if (!client?.guilds?.cache) return;

  for (const guild of client.guilds.cache.values()) {
    const beforeEvents = schedule.listEvents(guild.id);
    try {
      await schedule.processGuild(guild, { action });
      await reconcileProcessedGuild(guild, beforeEvents, action);
    } catch (error) {
      console.warn(`[Schedule] ${guild.id}: ${error.message}`);
    }
  }
}

async function startup(client) {
  if (!client?.guilds?.cache) throw new Error('Discord client is unavailable.');
  if (timers.has(client)) return timers.get(client);

  await processAllGuilds(client, 'schedule_startup_process');

  const timer = setInterval(() => {
    processAllGuilds(client, 'schedule_interval_process').catch((error) => {
      console.warn(`[Schedule] Processing failed: ${error.message}`);
    });
  }, REMINDER_TICK_MS);

  timer.unref?.();
  timers.set(client, timer);
  return timer;
}

function shutdown(client) {
  const timer = timers.get(client);
  if (!timer) return false;
  clearInterval(timer);
  timers.delete(client);
  return true;
}

module.exports = {
  REMINDER_TICK_MS,
  startup,
  shutdown,
};
