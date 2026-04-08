const userSpamBuckets = new Map();
const userRepeatBuckets = new Map();

function getBucketKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function pruneTimestamps(timestamps, intervalMs, now = Date.now()) {
  return timestamps.filter((timestamp) => now - timestamp <= intervalMs);
}

function getSpamBucket(guildId, userId) {
  const key = getBucketKey(guildId, userId);

  if (!userSpamBuckets.has(key)) {
    userSpamBuckets.set(key, {
      timestamps: [],
      lastSeenAt: Date.now(),
    });
  }

  const bucket = userSpamBuckets.get(key);
  bucket.lastSeenAt = Date.now();
  return bucket;
}

function clearSpamBucket(guildId, userId) {
  userSpamBuckets.delete(getBucketKey(guildId, userId));
}

function getRepeatBucket(guildId, userId) {
  const key = getBucketKey(guildId, userId);

  if (!userRepeatBuckets.has(key)) {
    userRepeatBuckets.set(key, {
      entries: [],
      lastSeenAt: Date.now(),
    });
  }

  const bucket = userRepeatBuckets.get(key);
  bucket.lastSeenAt = Date.now();
  return bucket;
}

function clearRepeatBucket(guildId, userId) {
  userRepeatBuckets.delete(getBucketKey(guildId, userId));
}

function cleanupRuntime() {
  const now = Date.now();
  const maxIdleMs = 30 * 60 * 1000;

  for (const [key, bucket] of userSpamBuckets.entries()) {
    if (now - bucket.lastSeenAt > maxIdleMs) {
      userSpamBuckets.delete(key);
    }
  }

  for (const [key, bucket] of userRepeatBuckets.entries()) {
    if (now - bucket.lastSeenAt > maxIdleMs) {
      userRepeatBuckets.delete(key);
    }
  }
}

setInterval(cleanupRuntime, 5 * 60 * 1000).unref();

module.exports = {
  getSpamBucket,
  clearSpamBucket,
  getRepeatBucket,
  clearRepeatBucket,
  pruneTimestamps,
};