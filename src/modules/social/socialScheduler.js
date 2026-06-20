'use strict';

// src/modules/social/socialScheduler.js

const socialManager = require('./socialManager');
const providerRegistry = require('./providerRegistry');

let intervalRef = null;
let running = false;

function getIntervalMs(options = {}) {
  const value = Number(options.intervalMs || process.env.SOCIAL_CHECK_INTERVAL_MS || 300000);
  return Number.isFinite(value) && value >= 60000 ? value : 300000;
}

async function runSocialCheck(client, options = {}) {
  if (running) {
    return { skipped: true, reason: 'already_running' };
  }

  running = true;

  try {
    const guildIds = Array.isArray(options.guildIds) && options.guildIds.length
      ? options.guildIds
      : [...(client?.guilds?.cache?.keys?.() || [])];

    const results = [];

    for (const guildId of guildIds) {
      const config = socialManager.getConfig(guildId);
      const accounts = (config.accounts || []).filter((account) => account.enabled !== false);

      for (const account of accounts) {
        results.push(await providerRegistry.checkAccount(account));
      }
    }

    return { skipped: false, guildCount: guildIds.length, accountCount: results.length, results };
  } finally {
    running = false;
  }
}

function startSocialScheduler(client, options = {}) {
  if (intervalRef) return intervalRef;

  const intervalMs = getIntervalMs(options);

  intervalRef = setInterval(() => {
    runSocialCheck(client, options).catch((error) => {
      console.error('[SocialScheduler] Check failed:', error);
    });
  }, intervalMs);

  if (typeof intervalRef.unref === 'function') intervalRef.unref();

  console.log(`[SocialScheduler] Social provider scheduler ready (${intervalMs}ms)`);
  return intervalRef;
}

function stopSocialScheduler() {
  if (!intervalRef) return false;
  clearInterval(intervalRef);
  intervalRef = null;
  return true;
}

module.exports = {
  runSocialCheck,
  startSocialScheduler,
  stopSocialScheduler,
};
