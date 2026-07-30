'use strict';

const verificationManager = require('./verificationManager');
const verificationStore = require('./verificationStore');
const guildManager = require('../../core/guild/guildManager');

async function buildHealthReport(guild) {
  if (!guild?.id) throw new Error('Guild is unavailable.');
  const report = await verificationManager.buildHealthReport(guild);
  return {
    ...report,
    enabled: guildManager.isModuleEnabled(guild.id, 'verification'),
  };
}

async function repair(guild, meta = {}) {
  if (!guild?.id) throw new Error('Guild is unavailable.');

  // Repair only data shape/normalisation here. Do not delete configured roles or
  // panel records merely because Discord could not resolve them during a health
  // check; a transient API/cache/permission failure must never destroy config.
  verificationStore.updateVerificationSection(guild.id, (current) => ({
    ...current,
    settings: verificationStore.normalizeSettings(current.settings || {}),
    messages: verificationStore.normalizeMessages(current.messages || {}),
    panelTemplate: verificationStore.normalizePanelTemplate(current.panelTemplate || {}),
    panels: Object.fromEntries(
      Object.entries(current.panels || {}).map(([panelId, panel]) => [
        panelId,
        verificationStore.normalizePanel({ ...panel, panelId }),
      ])
    ),
    updatedAt: new Date().toISOString(),
  }), { action: 'verification_health_repair', ...meta });

  return buildHealthReport(guild);
}

module.exports = {
  buildHealthReport,
  repair,
};