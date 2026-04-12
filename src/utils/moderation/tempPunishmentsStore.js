const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../../../data');
const filePath = path.join(dataDir, 'tempPunishments.json');

function ensureStorage() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf8');
  }
}

function getPunishments() {
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

function savePunishments(punishments) {
  ensureStorage();
  fs.writeFileSync(filePath, JSON.stringify(punishments, null, 2), 'utf8');
}

function addPunishment(punishment) {
  const punishments = getPunishments();

  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    userId: punishment.userId,
    guildId: punishment.guildId,
    type: punishment.type,
    expiresAt: punishment.expiresAt,
    reason: punishment.reason || 'No reason provided',
    moderatorId: punishment.moderatorId || null,
    createdAt: Date.now(),
  };

  punishments.push(entry);
  savePunishments(punishments);

  return entry;
}

function removePunishment(id) {
  const punishments = getPunishments();
  const filtered = punishments.filter((p) => p.id !== id);
  savePunishments(filtered);
}

module.exports = {
  getPunishments,
  savePunishments,
  addPunishment,
  removePunishment,
};