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
  return path.join(dataDir, `cases-${guildId}.json`);
}

function ensureStore(guildId) {
  const filePath = getFilePath(guildId);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      JSON.stringify({ nextCaseId: 1, cases: [] }, null, 2),
      'utf8'
    );
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

function createCase({
  guildId,
  userId,
  moderatorId,
  action,
  reason,
  metadata = {},
  status = 'active',
  relatedCaseId = null
}) {
  const store = readStore(guildId);

  const newCase = {
    caseId: store.nextCaseId,
    guildId,
    userId,
    moderatorId,
    action,
    reason,
    metadata,
    status,
    relatedCaseId,
    createdAt: new Date().toISOString(),
    updatedAt: null
  };

  store.nextCaseId += 1;
  store.cases.push(newCase);
  writeStore(guildId, store);

  return newCase;
}

function getCasesForUser(guildId, userId) {
  const store = readStore(guildId);
  return store.cases
    .filter(entry => entry.userId === userId)
    .sort((a, b) => b.caseId - a.caseId);
}

function getCaseCountForUser(guildId, userId) {
  return getCasesForUser(guildId, userId).length;
}

function getCaseById(guildId, caseId) {
  const store = readStore(guildId);
  return store.cases.find(entry => entry.caseId === Number(caseId)) || null;
}

function updateCaseReason(guildId, caseId, newReason) {
  const store = readStore(guildId);

  const entry = store.cases.find(item => item.caseId === Number(caseId));
  if (!entry) return null;

  entry.reason = newReason;
  entry.updatedAt = new Date().toISOString();

  writeStore(guildId, store);
  return entry;
}

function updateCaseStatus(guildId, caseId, status) {
  const store = readStore(guildId);

  const entry = store.cases.find(item => item.caseId === Number(caseId));
  if (!entry) return null;

  entry.status = status;
  entry.updatedAt = new Date().toISOString();

  writeStore(guildId, store);
  return entry;
}

module.exports = {
  createCase,
  getCasesForUser,
  getCaseCountForUser,
  getCaseById,
  updateCaseReason,
  updateCaseStatus
};