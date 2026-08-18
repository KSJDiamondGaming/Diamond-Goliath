// src/core/security/backup/backupWorker.js

const {
  incrementSyncAttempt,
  verifyRemoteHash,
  markBackupSynced,
  markBackupFailed,
  getPendingSyncs,

  uploadBackup,
} = require('./backupSync');

// ======================================================
// BACKUP WORKER
// Goliath Background Sync Worker
// ======================================================
//
// Responsibilities:
// - Background sync processing
// - Queue execution
// - Upload execution
// - Retry handling
//
// IMPORTANT:
// - No restore logic
// - No integrity generation
// - No Discord client logic
//
// This file is runtime execution ONLY.
// ======================================================

// ======================================================
// CONSTANTS
// ======================================================

const DEFAULT_INTERVAL_MS =
  1000 * 60 * 5;

// ======================================================
// INTERNAL STATE
// ======================================================

let workerRunning = false;
let interval = null;

// ======================================================
// ENTRY PROCESSING
// ======================================================

async function processSyncEntry(
  entry
) {
  if (!entry) {
    return null;
  }

  try {
    incrementSyncAttempt(
      entry.syncId
    );

    const result =
      await uploadBackup({
        guildId:
          entry.guildId,

        backupId:
          entry.backupId,

        backupPath:
          entry.backupPath,

        environment:
          entry.environment,

        backupType:
          entry.backupType,
      });

    if (!result.configured) {
      return {
        success: false,
        skipped: true,

        reason:
          result.reason ||
          'Google Drive not configured.',
      };
    }

    if (!result.uploaded) {
      markBackupFailed(
        entry.syncId,

        result.reason ||
          'Upload failed.'
      );

      return {
        success: false,
        skipped: false,

        reason:
          result.reason ||
          'Upload failed.',
      };
    }

    let verified = false;

    if (result.remoteHash) {
      const verification =
        verifyRemoteHash(
          entry.syncId,
          result.remoteHash
        );

      verified =
        verification.verified ===
        true;
    }

    markBackupSynced(
      entry.syncId,
      {
        remoteVerified:
          verified,

        remoteHash:
          result.remoteHash ||
          null,
      }
    );

    return {
      success: true,
      verified,
    };
  } catch (error) {
    markBackupFailed(
      entry.syncId,

      error.message ||
        'Unknown sync worker failure.'
    );

    return {
      success: false,
      error,
    };
  }
}

// ======================================================
// QUEUE PROCESSING
// ======================================================

async function processPendingSyncs() {
  if (workerRunning) {
    return {
      skipped: true,

      reason:
        'Sync worker already running.',
    };
  }

  workerRunning = true;

  try {
    const pending =
      getPendingSyncs();

    const results = [];

    for (const entry of pending) {
      const result =
        await processSyncEntry(
          entry
        );

      results.push({
        syncId:
          entry.syncId,

        backupId:
          entry.backupId,

        guildId:
          entry.guildId,

        result,
      });
    }

    return {
      success: true,

      processed:
        results.length,

      results,
    };
  } finally {
    workerRunning = false;
  }
}

// ======================================================
// WORKER RUNTIME
// ======================================================

function startBackupWorker(
  options = {}
) {
  const intervalMs =
    Number(
      options.intervalMs ||
        process.env
          .BACKUP_SYNC_INTERVAL_MS
    ) ||
    DEFAULT_INTERVAL_MS;

  if (interval) {
    return {
      started: false,

      reason:
        'Backup sync worker already running.',

      intervalMs,
    };
  }

  interval = setInterval(
    async () => {
      try {
        await processPendingSyncs();
      } catch (error) {
        console.error(
          '[Backup Sync Worker Error]',
          error
        );
      }
    },
    intervalMs
  );

  if (
    typeof interval.unref ===
    'function'
  ) {
    interval.unref();
  }

  return {
    started: true,
    intervalMs,
  };
}

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  startBackupWorker,
};
