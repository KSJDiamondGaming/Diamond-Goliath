const guildStore = require('../../guild/store');

function getTempPunishments(guildId) {
  const moderation = guildStore.getGuildSection(guildId, 'moderation', {});
  return moderation.tempPunishments || {};
}

function saveTempPunishments(guildId, tempPunishments) {
  const moderation = guildStore.getGuildSection(guildId, 'moderation', {});

  return guildStore.saveGuildSection(guildId, 'moderation', {
    ...moderation,
    tempPunishments: tempPunishments || {},
  });
}

function addTempPunishment(guildId, punishment = {}) {
  const tempPunishments = getTempPunishments(guildId);

  const id =
    punishment.id ||
    `${punishment.type || 'punishment'}:${punishment.userId || punishment.targetId}:${Date.now()}`;

  const entry = {
    id,
    guildId,
    createdAt: new Date().toISOString(),
    ...punishment,
  };

  tempPunishments[id] = entry;
  saveTempPunishments(guildId, tempPunishments);

  return entry;
}

function removeTempPunishment(guildId, punishmentId) {
  const tempPunishments = getTempPunishments(guildId);

  if (!tempPunishments[punishmentId]) return null;

  const removed = tempPunishments[punishmentId];
  delete tempPunishments[punishmentId];

  saveTempPunishments(guildId, tempPunishments);

  return removed;
}

function listTempPunishments(guildId) {
  return Object.values(getTempPunishments(guildId));
}

module.exports = {
  getTempPunishments,
  saveTempPunishments,
  addTempPunishment,
  removeTempPunishment,
  listTempPunishments,
};