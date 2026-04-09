const { getSpamBucket, pruneTimestamps, clearSpamBucket } = require('../runtime');

function antiSpamCheck(message, config) {
  const rule = config.rules?.antiSpam || config.antiSpam;
  if (!rule?.enabled) return null;

  const guildId = message.guild?.id;
  const userId = message.author?.id;

  if (!guildId || !userId) return null;

  const now = Date.now();
  const intervalMs =
    Number(rule.intervalMs) || Number(rule.intervalSeconds) * 1000 || 6000;
  const maxMessages = Number(rule.maxMessages || 5);

  const bucket = getSpamBucket(guildId, userId);
  bucket.timestamps = pruneTimestamps(bucket.timestamps, intervalMs, now);
  bucket.timestamps.push(now);

  if (bucket.timestamps.length > maxMessages) {
    clearSpamBucket(guildId, userId);

    return {
      matched: true,
      ruleKey: 'antiSpam',
      ruleName: 'Anti Spam',
      punishment: rule.punishment,
      timeoutMs:
        Number(rule.timeoutMs) || Number(rule.timeoutMinutes) * 60 * 1000 || 600000,
      deleteMessage: true,
      reason: `Sent more than ${maxMessages} messages in ${Math.round(intervalMs / 1000)} seconds.`,
      details: {
        maxMessages,
        intervalMs,
        observedMessages: bucket.timestamps.length,
      },
    };
  }

  return null;
}

module.exports = antiSpamCheck;