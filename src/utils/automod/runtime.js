const userSpamBuckets = new Map();
const userRepeatBuckets = new Map();

function getBucketKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

// Remove old timestamps outside interval
function pruneTimestamps(timestamps, intervalMs, now = Date.now()) {
  return timestamps.filter((timestamp) => now - timestamp <= intervalMs);
}

// ===== SPAM TRACKING =====
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

// ===== REPEAT TRACKING =====
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

// ===== CLEANUP (IMPORTANT FOR MEMORY) =====
function cleanupRuntime() {
  const now = Date.now();
  const maxIdleMs = 30 * 60 * 1000; // 30 minutes

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

// Run cleanup every 5 minutes (non-blocking)
setInterval(cleanupRuntime, 5 * 60 * 1000).unref();

module.exports = {
  getSpamBucket,
  getRepeatBucket,
  pruneTimestamps,
};