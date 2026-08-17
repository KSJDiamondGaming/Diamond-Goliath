'use strict';

const subscriptionAdminManager = require('../../core/billing/subscriptionAdminManager');

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
let workerTimer = null;
let running = false;

function getIntervalMs() {
  const minutes = Number(process.env.SUBSCRIPTION_WORKER_INTERVAL_MINUTES || 60);
  if (!Number.isFinite(minutes) || minutes < 5) return DEFAULT_INTERVAL_MS;
  return Math.round(minutes * 60 * 1000);
}

function runSubscriptionExpiryCheck() {
  if (running) {
    return {
      skipped: true,
      reason: 'already_running',
    };
  }

  running = true;

  try {
    const result = subscriptionAdminManager.processExpiredSubscriptions({
      actor: 'subscription_worker',
    });

    if (result.expiredCount > 0) {
      console.log(`[Subscription Worker] Expired ${result.expiredCount} subscription(s).`);
    }

    return result;
  } catch (error) {
    console.error('[Subscription Worker] Expiry check failed:', error);
    return {
      success: false,
      error: error.message || 'Subscription expiry check failed.',
    };
  } finally {
    running = false;
  }
}

function startSubscriptionWorker() {
  if (workerTimer) return workerTimer;

  const intervalMs = getIntervalMs();

  console.log(`[Subscription Worker] Starting expiry worker every ${Math.round(intervalMs / 60000)} minute(s).`);
  runSubscriptionExpiryCheck();

  workerTimer = setInterval(runSubscriptionExpiryCheck, intervalMs);
  if (typeof workerTimer.unref === 'function') workerTimer.unref();

  return workerTimer;
}

function stopSubscriptionWorker() {
  if (!workerTimer) return;
  clearInterval(workerTimer);
  workerTimer = null;
}

module.exports = {
  runSubscriptionExpiryCheck,
  startSubscriptionWorker,
  stopSubscriptionWorker,
};
