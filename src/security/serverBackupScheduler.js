const {
  createServerBackup,
  listServerBackups,
  deleteServerBackup,
} = require('./serverBackup');

const guildManager = require('../guild/guildManager');

const CHECK_EVERY_MS = 60 * 60 * 1000; // checks hourly

let started = false;

function getEnvNumber(name, fallback) {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function isEnabled() {
  return String(process.env.SERVER_BACKUP_ENABLED || 'false').toLowerCase() === 'true';
}

function getIntervalDays() {
  return getEnvNumber('SERVER_BACKUP_INTERVAL_DAYS', 7);
}

function getRetentionLimit() {
  return getEnvNumber('SERVER_BACKUP_RETENTION', 3);
}

function daysToMs(days) {
  return days * 24 * 60 * 60 * 1000;
}

function getLastBackupAt(guildId) {
  const data = guildManager.getGuildSection(guildId, 'serverBackups', {});
  return data.lastBackupAt ? new Date(data.lastBackupAt).getTime() : 0;
}

function shouldBackup(guildId) {
  const lastBackupAt = getLastBackupAt(guildId);
  if (!lastBackupAt) return true;

  return Date.now() - lastBackupAt >= daysToMs(getIntervalDays());
}

function cleanupOldBackups(guildId) {
  const retentionLimit = getRetentionLimit();
  const backups = listServerBackups(guildId);

  if (backups.length <= retentionLimit) return 0;

  const toDelete = backups.slice(retentionLimit);
  let deleted = 0;

  for (const backup of toDelete) {
    const backupId = typeof backup === 'string' ? backup : backup.backupId;

    if (backupId && deleteServerBackup(guildId, backupId)) {
      deleted += 1;
    }
  }

  return deleted;
}

async function backupGuild(guild) {
  if (!guild) return null;

  if (!shouldBackup(guild.id)) {
    return {
      guildId: guild.id,
      skipped: true,
      reason: 'Backup interval not reached.',
    };
  }

  const backup = await createServerBackup(guild, {
    createdBy: 'system:auto-weekly',
    reason: 'Automatic weekly server disaster backup',
    type: 'scheduled',
  });

  const deletedOldBackups = cleanupOldBackups(guild.id);

  return {
    guildId: guild.id,
    guildName: guild.name,
    backupId: backup.backupId,
    deletedOldBackups,
  };
}

async function runServerBackupCycle(client) {
  if (!isEnabled()) return [];

  const results = [];

  for (const guild of client.guilds.cache.values()) {
    try {
      const result = await backupGuild(guild);
      if (result) results.push(result);

      if (result?.skipped) {
        console.log(`💾 Backup skipped: ${guild.name} | ${result.reason}`);
      } else {
        console.log(
          `💾 Backup created: ${guild.name} | ${result.backupId} | old deleted: ${result.deletedOldBackups}`
        );
      }
    } catch (error) {
      console.error(`❌ Backup failed for ${guild.name} (${guild.id}):`, error);
    }
  }

  return results;
}

function startServerBackupScheduler(client) {
  if (started) {
    console.warn('⚠️ Server backup scheduler already running.');
    return;
  }

  if (!isEnabled()) {
    console.log('💾 Server backup scheduler disabled.');
    return;
  }

  started = true;

  console.log(
    `💾 Server backup scheduler started | every ${getIntervalDays()} day(s) | keep ${getRetentionLimit()}`
  );

  runServerBackupCycle(client).catch((error) => {
    console.error('❌ Initial server backup cycle failed:', error);
  });

  setInterval(() => {
    runServerBackupCycle(client).catch((error) => {
      console.error('❌ Scheduled server backup cycle failed:', error);
    });
  }, CHECK_EVERY_MS);
}

module.exports = {
  startServerBackupScheduler,
  runServerBackupCycle,
  backupGuild,
  cleanupOldBackups,
  getIntervalDays,
  getRetentionLimit,
};