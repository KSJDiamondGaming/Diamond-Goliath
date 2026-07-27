'use strict';

const schedule = require('./schedule');

const REMINDER_TICK_MS = 60 * 1000;
const timers = new WeakMap();

async function processAllGuilds(client, action) {
  if (!client?.guilds?.cache) return;

  for (const guild of client.guilds.cache.values()) {
    await schedule.processGuild(guild, { action }).catch((error) => {
      console.warn(`[Schedule] ${guild.id}: ${error.message}`);
    });
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
