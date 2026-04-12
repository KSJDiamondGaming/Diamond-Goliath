const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(process.cwd(), 'data', 'moderation');

function ensureDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function getFilePath(guildId) {
  ensureDir();
  return path.join(dataDir, `pending-actions-${guildId}.json`);
}

function ensureStore(guildId) {
  const filePath = getFilePath(guildId);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ actions: [] }, null, 2), 'utf8');
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

function purgeExpired(guildId) {
  const store = readStore(guildId);
  const now = Date.now();

  store.actions = store.actions.filter(entry => {
    return new Date(entry.expiresAt).getTime() > now;
  });

  writeStore(guildId, store);
}

function createPendingAction(guildId, action) {
  purgeExpired(guildId);

  const store = readStore(guildId);
  const token = crypto.randomBytes(8).toString('hex');

  const entry = {
    token,
    moderatorId: action.moderatorId,
    targetId: action.targetId,
    type: action.type,
    payload: action.payload || {},
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  };

  store.actions.push(entry);
  writeStore(guildId, store);

  return token;
}

function getPendingAction(guildId, token) {
  purgeExpired(guildId);

  const store = readStore(guildId);
  return store.actions.find(entry => entry.token === token) || null;
}

function deletePendingAction(guildId, token) {
  const store = readStore(guildId);
  store.actions = store.actions.filter(entry => entry.token !== token);
  writeStore(guildId, store);
}

module.exports = {
  createPendingAction,
  getPendingAction,
  deletePendingAction
};