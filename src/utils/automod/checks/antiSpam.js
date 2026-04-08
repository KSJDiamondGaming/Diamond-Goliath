const { getSpamBucket, pruneTimestamps } = require('../runtime');

function antiSpamCheck(message, config) {
  const rule = config.rules.antiSpam;
  if (!rule?.enabled) return null;

  const guildId = message.guild?.id;
  const userId = message.author?.id;

  if (!guildId || !userId) return null;

  const now = Date.now();
  const intervalMs = rule.intervalMs || 6000;
  const maxMessages = rule.maxMessages || 5;

  const bucket = getSpamBucket(guildId, userId);
  bucket.timestamps = pruneTimestamps(bucket.timestamps, intervalMs, now);
  bucket.timestamps.push(now);

  if (bucket.timestamps.length > maxMessages) {
    bucket.timestamps = [];

    return {
      matched: true,
      ruleName: 'Anti Spam',
      punishment: rule.punishment,
      timeoutMs: rule.timeoutMs,
      reason: `Sent too many messages in ${intervalMs / 1000} seconds.`,
    };
  }

  return null;
}

module.exports = antiSpamCheck;