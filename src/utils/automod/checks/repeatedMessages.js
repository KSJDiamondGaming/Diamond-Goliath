const { getRepeatBucket, clearRepeatBucket } = require('../runtime');
const { normalizeContent } = require('../automodHelpers');

function repeatedMessagesCheck(message, config) {
  const rule = config.rules?.repeatedMessages;
  if (!rule?.enabled) return null;

  const guildId = message.guild?.id;
  const userId = message.author?.id;

  if (!guildId || !userId) return null;

  const content = normalizeContent(message.content).toLowerCase();
  if (!content) return null;

  const now = Date.now();
  const intervalMs = Number(rule.intervalMs || 10000);
  const maxRepeats = Number(rule.maxRepeats || 3);

  const bucket = getRepeatBucket(guildId, userId);

  bucket.entries = bucket.entries.filter((entry) => now - entry.timestamp <= intervalMs);
  bucket.entries.push({
    content,
    timestamp: now,
  });

  const repeatCount = bucket.entries.filter((entry) => entry.content === content).length;

  if (repeatCount >= maxRepeats) {
    clearRepeatBucket(guildId, userId);

    return {
      matched: true,
      ruleKey: 'repeatedMessages',
      ruleName: 'Repeated Messages',
      punishment: rule.punishment,
      timeoutMs: rule.timeoutMs,
      deleteMessage: true,
      reason: `Repeated the same message ${repeatCount} times within ${Math.round(intervalMs / 1000)} seconds.`,
      details: {
        maxRepeats,
        intervalMs,
        repeatCount,
        repeatedContent: content,
      },
    };
  }

  return null;
}

module.exports = repeatedMessagesCheck;