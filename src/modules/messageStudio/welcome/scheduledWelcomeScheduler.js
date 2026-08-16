'use strict';

const guildManager = require('../../../core/guild/guildManager');
const scheduledWelcome = require('./scheduledWelcome');

const CHECK_INTERVAL_MS = 60 * 1000;
const installed = Symbol.for('goliath.messageStudio.scheduledWelcomeScheduler');

function zonedClock(timezone, date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return formatter.format(date);
}

function isDue(config, date = new Date()) {
  if (!config?.enabled) return false;
  const today = scheduledWelcome.zonedDateKey(config.timezone, date);
  if (config.analytics?.lastRunDate === today) return false;
  return zonedClock(config.timezone, date) >= config.time;
}

async function checkGuild(guild, date = new Date()) {
  if (!guildManager.isModuleEnabled(guild.id, 'welcome')) return { skipped: true, reason: 'welcome_disabled' };
  const config = scheduledWelcome.getScheduledConfig(guild.id);
  if (!isDue(config, date)) return { skipped: true, reason: 'not_due' };
  try {
    return await scheduledWelcome.runScheduledWelcome(guild);
  } catch (error) {
    console.error(`[ScheduledWelcome] Run failed for ${guild.id}:`, error?.stack || error?.message || error);
    scheduledWelcome.updateScheduledConfig(guild.id, {
      analytics: {
        ...config.analytics,
        lastRunAt: new Date().toISOString(),
        lastError: String(error?.message || error).slice(0, 500),
      },
    }, { action: 'scheduled_welcome_run_failed' });
    return { skipped: false, failed: true, error: error?.message || String(error) };
  }
}

async function checkAllGuilds(client, date = new Date()) {
  const results = [];
  for (const guild of client?.guilds?.cache?.values?.() || []) {
    results.push({ guildId: guild.id, result: await checkGuild(guild, date) });
  }
  return results;
}

async function startup(client) {
  if (!client?.guilds?.cache) return { installed: false, reason: 'client_unavailable' };
  if (client[installed]) return { installed: false, reason: 'already_installed' };
  Object.defineProperty(client, installed, { value: true });
  await checkAllGuilds(client);
  const timer = setInterval(() => checkAllGuilds(client), CHECK_INTERVAL_MS);
  timer.unref?.();
  console.log('[ScheduledWelcome] Scheduler started (1 minute checks).');
  return { installed: true };
}

module.exports = {
  CHECK_INTERVAL_MS,
  zonedClock,
  isDue,
  checkGuild,
  checkAllGuilds,
  startup,
};