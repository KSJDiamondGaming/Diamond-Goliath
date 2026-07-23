'use strict';

const { Events } = require('discord.js');
const social = require('../../modules/social/social');

const RECOVERY_DEBOUNCE_MS = 30000;
let lastRecoveryAt = 0;
let recoveryPromise = null;

module.exports = {
  name: Events.ShardResume,
  once: false,
  async execute(shardId, replayedEvents, client) {
    const elapsed = Date.now() - lastRecoveryAt;
    if (recoveryPromise) return recoveryPromise;
    if (lastRecoveryAt && elapsed < RECOVERY_DEBOUNCE_MS) return null;

    lastRecoveryAt = Date.now();
    recoveryPromise = (async () => {
      console.log(`[SocialRuntime] Discord shard ${shardId} resumed (${Number(replayedEvents || 0)} replayed events); recovering Social monitoring`);
      const providerRecovery = await social.scheduler.runSocialCheck(client, {
        force: true,
        respectSchedule: false,
        recoveryReason: 'shard_resume',
      });
      const queueRecovery = await social.queue.processAll(client, {
        meta: { action: 'social_shard_resume_queue_recovery', shardId },
      });
      console.log(`[SocialRuntime] Social shard recovery complete for shard ${shardId}`);
      return { providerRecovery, queueRecovery };
    })();

    try {
      return await recoveryPromise;
    } finally {
      recoveryPromise = null;
    }
  },
};
