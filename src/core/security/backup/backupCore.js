// src/security/backup/backupCore.js

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { resolveRuntimePath } = require('../../../config/runtimePaths');

// ======================================================
// BACKUP CORE
// Goliath Backup Infrastructure Layer
// ======================================================
// CORE CONSTANTS
// ======================================================

const VALID_BACKUP_TYPES = new Set([
  'scheduled',
  'runtime',
  'rollback',
  'integrity',
  'sync',
]);

const HASH_ALGORITHM = 'sha256';
const INTEGRITY_VERSION = '1A_INTEGRITY_SYSTEM';

// ======================================================
// INTERNAL HELPERS
// ======================================================

function normalizeJson(data) {
  return JSON.stringify(data, null, 2);
}

function ensureFileExists(filePath, label = 'File') {
  if (!filePath) {
    throw new Error(`${label} path is required`);
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }

  return true;
}

function readJsonFileSafe(filePath, corruptedReason) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');

    return {
      success: true,
      data: JSON.parse(raw),
      raw,
    };
  } catch (error) {
    return {
      success: false,
      reason: corruptedReason,
      error: error.message,
    };
  }
}

// ======================================================
// BACKUP PATH SYSTEM
// ======================================================

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

function getModeKey(environment) {
  const env = normaliseEnvironment(environment);

  if (env === 'PRODUCTION') return 'production';
  if (env === 'BETA') return 'beta';

  return 'dev';
}

function getBackupRoot(environment) {
  return resolveRuntimePath(
    getModeKey(environment),
    'backups'
  );
}

function getGuildBackupRoot({
  environment,
  guildId,
}) {
  if (!guildId) {
    throw new Error('getGuildBackupRoot requires guildId');
  }

  return path.join(
    getBackupRoot(environment),
    String(guildId)
  );
}

function getBackupDir({
  environment,
  guildId,
  backupType,
}) {
  if (!VALID_BACKUP_TYPES.has(backupType)) {
    throw new Error(`Invalid backup type: ${backupType}`);
  }

  return path.join(
    getGuildBackupRoot({
      environment,
      guildId,
    }),
    backupType
  );
}

function ensureBackupDir({
  environment,
  guildId,
  backupType,
}) {
  const dir = getBackupDir({
    environment,
    guildId,
    backupType,
  });

  fs.mkdirSync(dir, {
    recursive: true,
  });

  return dir;
}

function ensureGuildBackupStructure({
  environment,
  guildId,
}) {
  const created = {};

  for (const backupType of VALID_BACKUP_TYPES) {
    created[backupType] = ensureBackupDir({
      environment,
      guildId,
      backupType,
    });
  }

  return created;
}

// ======================================================
// BACKUP INTEGRITY SYSTEM
// ======================================================

function generateHash(content) {
  return crypto
    .createHash(HASH_ALGORITHM)
    .update(content)
    .digest('hex');
}

function getIntegrityPath(backupPath) {
  return `${backupPath}.integrity.json`;
}

function createIntegrityRecord({
  backupId,
  environment,
  guildId,
  backupType = 'runtime',
  backupPath,
  backupData,
}) {
  ensureFileExists(backupPath, 'Backup file');

  const normalized = normalizeJson(backupData);
  const hash = generateHash(normalized);
  const stats = fs.statSync(backupPath);

  return {
    version: INTEGRITY_VERSION,

    backup: {
      id: backupId,
      type: backupType,
      environment: normaliseEnvironment(environment),
      guildId,
      path: backupPath,
    },

    integrity: {
      algorithm: HASH_ALGORITHM,
      hash,
      size: stats.size,
      generatedAt: new Date().toISOString(),
    },
  };
}

function writeIntegrityFile({
  backupId,
  environment,
  guildId,
  backupType,
  backupPath,
  backupData,
}) {
  ensureFileExists(backupPath, 'Backup file');

  const integrityRecord = createIntegrityRecord({
    backupId,
    environment,
    guildId,
    backupType,
    backupPath,
    backupData,
  });

  const integrityPath = getIntegrityPath(backupPath);

  fs.writeFileSync(
    integrityPath,
    JSON.stringify(integrityRecord, null, 2),
    'utf8'
  );

  return {
    success: true,
    integrityPath,
    integrityRecord,
  };
}

function validateBackupIntegrity(backupPath) {
  if (!fs.existsSync(backupPath)) {
    return {
      valid: false,
      reason: 'BACKUP_FILE_MISSING',
      backupPath,
    };
  }

  const integrityPath = getIntegrityPath(backupPath);

  if (!fs.existsSync(integrityPath)) {
    return {
      valid: false,
      reason: 'INTEGRITY_FILE_MISSING',
      backupPath,
      integrityPath,
    };
  }

  const backupRead = readJsonFileSafe(
    backupPath,
    'CORRUPTED_BACKUP_JSON'
  );

  if (!backupRead.success) {
    return {
      valid: false,
      reason: backupRead.reason,
      backupPath,
      integrityPath,
      error: backupRead.error,
    };
  }

  const integrityRead = readJsonFileSafe(
    integrityPath,
    'CORRUPTED_INTEGRITY_JSON'
  );

  if (!integrityRead.success) {
    return {
      valid: false,
      reason: integrityRead.reason,
      backupPath,
      integrityPath,
      error: integrityRead.error,
    };
  }

  const backupData = backupRead.data;
  const integrityData = integrityRead.data;

  const normalized = normalizeJson(backupData);
  const currentHash = generateHash(normalized);
  const storedHash = integrityData?.integrity?.hash;

  const valid = currentHash === storedHash;

  return {
    valid,

    reason: valid
      ? 'VALID'
      : 'HASH_MISMATCH',

    backupPath,
    integrityPath,

    algorithm: HASH_ALGORITHM,

    currentHash,
    storedHash,

    generatedAt:
      integrityData?.integrity?.generatedAt || null,

    metadata: integrityData?.backup || {},
  };
}

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  // backup path system
  VALID_BACKUP_TYPES,
  normaliseEnvironment,
  getModeKey,
  getBackupRoot,
  getGuildBackupRoot,
  getBackupDir,
  ensureBackupDir,
  ensureGuildBackupStructure,

  // integrity system
  HASH_ALGORITHM,
  INTEGRITY_VERSION,

  generateHash,
  writeIntegrityFile,
  validateBackupIntegrity,
  getIntegrityPath,

  // safe utility exports for future restore/sync use
  normalizeJson,
  ensureFileExists,
};
