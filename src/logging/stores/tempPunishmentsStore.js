const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../../data');
const filePath = path.join(dataDir, 'tempPunishments.json');

function ensureStorage() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf8');
  }
}

function readStore() {
  ensureStorage();

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read temp punishments store:', error);
    return [];
  }
}

function writeStore(data) {
  ensureStorage();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getPunishments(guildId = null) {
  const data = readStore();

  if (!guildId) return data;

  return data.filter((p) => p.guildId === guildId);
}

function addPunishment(punishment = {}) {
  const data = readStore();

  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    userId: punishment.userId || null,
    guildId: punishment.guildId || null,
    type: punishment.type || 'unknown',
    expiresAt: punishment.expiresAt || null,
    reason: punishment.reason || 'No reason provided',
    moderatorId: punishment.moderatorId || null,
    createdAt: Date.now(),
  };

  data.push(entry);
  writeStore(data);

  return entry;
}

function removePunishment(id) {
  const data = readStore();
  const filtered = data.filter((p) => p.id !== id);
  writeStore(filtered);
}

function purgeExpired() {
  const now = Date.now();

  const data = readStore();
  const filtered = data.filter(
    (p) => !p.expiresAt || new Date(p.expiresAt).getTime() > now
  );

  writeStore(filtered);
}

module.exports = {
  getPunishments,
  addPunishment,
  removePunishment,
  purgeExpired,
};