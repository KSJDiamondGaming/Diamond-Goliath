const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../data/tempPunishments.json');

function ensureStore() {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([], null, 2));
  }
}

function loadData() {
  ensureStore();

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('❌ Failed to read temp punishments store:', error);
    return [];
  }
}

function saveData(data) {
  ensureStore();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function addPunishment(entry) {
  const data = loadData();

  data.push({
    userId: entry.userId,
    guildId: entry.guildId,
    type: entry.type,
    expiresAt: entry.expiresAt,
  });

  saveData(data);
}

function removePunishment(userId, guildId, type) {
  const data = loadData().filter(
    (p) => !(p.userId === userId && p.guildId === guildId && p.type === type)
  );

  saveData(data);
}

function getPunishments() {
  return loadData();
}

module.exports = {
  addPunishment,
  removePunishment,
  getPunishments,
};