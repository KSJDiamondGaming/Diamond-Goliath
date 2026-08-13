'use strict';

const path = require('node:path');
const guildManager = require('../../guild/guildManager');

function clone(value) {
  return JSON.parse(JSON.stringify(value || []));
}

function normalizeGuildId(guildId) {
  const id = String(guildId || '').trim();
  return /^\d{16,20}$/.test(id) ? id : null;
}

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

function getPunishments(guildId = null) {
  const safeGuildId = normalizeGuildId(guildId);

  if (safeGuildId) {
    const security = guildManager.getSecurityConfig(safeGuildId);
    return clone(ensureTempPunishments(security));
  }

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
