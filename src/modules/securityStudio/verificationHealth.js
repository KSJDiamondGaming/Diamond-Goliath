'use strict';

const guildManager = require('../../core/guild/guildManager');
const verificationManager = require('./verificationManager');
const verificationStore = require('./verificationStore');

const MODULE = 'verification';

function requireGuild(guild) {
  if (!guild?.id) {
    throw new Error('Guild is unavailable.');
  }

  return guild;
}

async function buildHealthReport(guild) {
  const targetGuild = requireGuild(guild);
  const report = await verificationManager.buildHealthReport(targetGuild);

  return {
    ...report,
    enabled: guildManager.isModuleEnabled(targetGuild.id, MODULE),
  };
}

async function repair(guild, meta = {}) {
  const targetGuild = requireGuild(guild);

  // Repair data shape only. Missing Discord roles, channels or messages may be
  // caused by temporary API, cache or permission failures and must not remove
  // saved configuration.
  verificationStore.updateVerificationSection(
    targetGuild.id,
    (current) => ({
      ...current,
      settings: verificationStore.normalizeSettings(current.settings || {}),
      messages: verificationStore.normalizeMessages(current.messages || {}),
      panelTemplate: verificationStore.normalizePanelTemplate(current.panelTemplate || {}),
      panels: { ...(current.panels || {}) },
      updatedAt: new Date().toISOString(),
    }),
    {
      action: 'verification_health_repair',
      ...meta,
    }
  );

  return buildHealthReport(targetGuild);
}

module.exports = {
  buildHealthReport,
  repair,
};