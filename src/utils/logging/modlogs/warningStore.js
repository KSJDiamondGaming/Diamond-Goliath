const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.cwd(), 'data', 'moderation');

function ensureDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function getFilePath(guildId) {
  ensureDir();
  return path.join(dataDir, `warnings-${guildId}.json`);
}

function ensureStore(guildId) {
  const filePath = getFilePath(guildId);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ warnings: [] }, null, 2), 'utf8');
  }

  return filePath;
}

function readStore(guildId) {
  const filePath = ensureStore(guildId);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeStore(guildId, data) {
  const filePath = ensureStore(guildId);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function addWarning({
  guildId,
  userId,
  moderatorId,
  reason,
  caseId,
  expiresAt = null
}) {
  const store = readStore(guildId);

  const warning = {
    guildId,
    userId,
    moderatorId,
    reason,
    caseId,
    createdAt: new Date().toISOString(),
    expiresAt
  };

  store.warnings.push(warning);
  writeStore(guildId, store);

  return warning;
}

function purgeExpiredWarnings(guildId) {
  const store = readStore(guildId);
  const now = Date.now();
  const expired = [];

  const stillActive = [];

  for (const warning of store.warnings) {
    if (!warning.expiresAt) {
      stillActive.push(warning);
      continue;
    }

    if (new Date(warning.expiresAt).getTime() > now) {
      stillActive.push(warning);
    } else {
      expired.push(warning);
    }
  }

  store.warnings = stillActive;
  writeStore(guildId, store);

  return expired;
}

function getWarningsForUser(guildId, userId) {
  purgeExpiredWarnings(guildId);

  const store = readStore(guildId);
  return store.warnings
    .filter(entry => entry.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getWarningCountForUser(guildId, userId) {
  return getWarningsForUser(guildId, userId).length;
}

function getWarningByCaseId(guildId, caseId) {
  purgeExpiredWarnings(guildId);

  const store = readStore(guildId);
  return store.warnings.find(entry => entry.caseId === Number(caseId)) || null;
}

function deleteWarningByCaseId(guildId, caseId) {
  purgeExpiredWarnings(guildId);

  const store = readStore(guildId);
  const before = store.warnings.length;

  store.warnings = store.warnings.filter(
    entry => entry.caseId !== Number(caseId)
  );

  if (store.warnings.length === before) return false;

  writeStore(guildId, store);
  return true;
}

module.exports = {
  addWarning,
  getWarningsForUser,
  getWarningCountForUser,
  getWarningByCaseId,
  deleteWarningByCaseId,
  purgeExpiredWarnings
};