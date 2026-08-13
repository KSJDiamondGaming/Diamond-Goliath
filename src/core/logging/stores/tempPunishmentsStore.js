'use strict';

const path = require('node:path');
const guildManager = require('../../guild/guildManager');

function ensureTempPunishments(security = {}) {
  const punishments = Array.isArray(security.tempPunishments)
    ? security.tempPunishments
    : [];

  return punishments.filter((punishment) => punishment && typeof punishment === 'object');
}

function getGuildIdsFromRuntime() {
  try {
    return guildManager
      .listGuildFiles()
      .map((file) => path.basename(file, '.json'))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getPunishments() {
  return getGuildIdsFromRuntime().flatMap((runtimeGuildId) => {
    const security = guildManager.getSecurityConfig(runtimeGuildId);
    return ensureTempPunishments(security);
  });
}

function removePunishment(id) {
  const targetId = String(id || '').trim();
  if (!targetId) return false;

  let removed = false;

  for (const runtimeGuildId of getGuildIdsFromRuntime()) {
    const security = guildManager.getSecurityConfig(runtimeGuildId);
    const punishments = ensureTempPunishments(security);
    const filtered = punishments.filter((punishment) => punishment.id !== targetId);

    if (filtered.length === punishments.length) continue;

    guildManager.updateSecurityConfig(runtimeGuildId, (currentSecurity) => ({
      ...currentSecurity,
      tempPunishments: filtered,
    }));

    removed = true;
  }

  return removed;
}

module.exports = {
  getPunishments,
  removePunishment,
};
