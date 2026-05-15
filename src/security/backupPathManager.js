const path = require('path');
const fs = require('fs');

const DEFAULT_BACKUP_ROOT = path.join(
  process.cwd(),
  'src',
  'runtime',
  'backups'
);

const VALID_BACKUP_TYPES = new Set([
  'scheduled',
  'runtime',
  'rollback',
  'integrity',
  'sync'
]);

function normaliseEnvironment(environment) {
  const env = String(
    environment ||
    process.env.BOT_MODE ||
    'DEV'
  ).toUpperCase();

  if (env === 'DEV') return 'DEV';
  if (env === 'BETA') return 'BETA';
  if (env === 'PRODUCTION') return 'PRODUCTION';
  if (env === 'PROD') return 'PRODUCTION';

  return 'DEV';
}

function getBackupRoot() {
  return DEFAULT_BACKUP_ROOT;
}

function getGuildBackupRoot({
  environment,
  guildId
}) {
  if (!guildId) {
    throw new Error(
      'getGuildBackupRoot requires guildId'
    );
  }

  const env = normaliseEnvironment(environment);

  return path.join(
    getBackupRoot(),
    env,
    String(guildId)
  );
}

function getBackupDir({
  environment,
  guildId,
  backupType
}) {
  if (!VALID_BACKUP_TYPES.has(backupType)) {
    throw new Error(
      `Invalid backup type: ${backupType}`
    );
  }

  return path.join(
    getGuildBackupRoot({
      environment,
      guildId
    }),
    backupType
  );
}

function ensureBackupDir({
  environment,
  guildId,
  backupType
}) {
  const dir = getBackupDir({
    environment,
    guildId,
    backupType
  });

  fs.mkdirSync(dir, {
    recursive: true
  });

  return dir;
}

function ensureGuildBackupStructure({
  environment,
  guildId
}) {
  const created = {};

  for (const backupType of VALID_BACKUP_TYPES) {
    created[backupType] = ensureBackupDir({
      environment,
      guildId,
      backupType
    });
  }

  return created;
}

module.exports = {
  VALID_BACKUP_TYPES,
  normaliseEnvironment,
  getBackupRoot,
  getGuildBackupRoot,
  getBackupDir,
  ensureBackupDir,
  ensureGuildBackupStructure
};