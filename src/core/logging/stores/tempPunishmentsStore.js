'use strict';

const path = require('path');
const guildManager = require('../../guild/guildManager');

const dataDir = null;
const filePath = null;

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

function addPunishment(punishment = {}) {
  const safeGuildId = normalizeGuildId(punishment.guildId);

  if (!safeGuildId) {
    throw new Error('Cannot add temp punishment without a valid guild ID.');
  }

  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    userId: punishment.userId || null,
    guildId: safeGuildId,
    type: punishment.type || 'unknown',
    expiresAt: punishment.expiresAt || null,
    reason: punishment.reason || 'No reason provided',
    moderatorId: punishment.moderatorId || null,
    createdAt: Date.now(),
  };

  guildManager.updateSecurityConfig(safeGuildId, (security) => ({
    ...security,
    tempPunishments: [
      ...ensureTempPunishments(security),
      entry,
    ],
  }));

  return entry;
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

function purgeExpired() {
  const currentTime = Date.now();
  let removedCount = 0;

  for (const runtimeGuildId of getGuildIdsFromRuntime()) {
    const security = guildManager.getSecurityConfig(runtimeGuildId);
    const punishments = ensureTempPunishments(security);
    const filtered = punishments.filter(
      (punishment) => !punishment.expiresAt || new Date(punishment.expiresAt).getTime() > currentTime
    );

    if (filtered.length === punishments.length) continue;

    removedCount += punishments.length - filtered.length;

    guildManager.updateSecurityConfig(runtimeGuildId, (currentSecurity) => ({
      ...currentSecurity,
      tempPunishments: filtered,
    }));
  }

  return removedCount;
}

module.exports = {
  dataDir,
  filePath,

  getPunishments,
  addPunishment,
  removePunishment,
  purgeExpired,
};
