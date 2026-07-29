'use strict';

const verificationManager = require('./verificationManager');
const verificationStore = require('./verificationStore');
const guildManager = require('../../core/guild/guildManager');

async function fetchRole(guild, roleId) {
  if (!guild || !roleId) return null;
  return guild.roles.cache.get(roleId) || guild.roles.fetch(roleId).catch(() => null);
}

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

  const section = verificationManager.getVerificationStatus(guild.id);
  const verifiedRoleIds = [];
  const pendingRoleIds = [];
  const panels = {};

  for (const roleId of section.settings?.verifiedRoleIds || []) {
    const role = await fetchRole(guild, roleId);
    if (role) verifiedRoleIds.push(role.id);
  }

  for (const roleId of section.settings?.pendingRoleIds || []) {
    const role = await fetchRole(guild, roleId);
    if (role) pendingRoleIds.push(role.id);
  }

  for (const panel of Object.values(section.panels || {})) {
    const health = await verificationManager.getPanelHealth(guild, panel);
    if (health.ok) panels[panel.panelId] = panel;
  }

  verificationStore.updateVerificationSection(guild.id, (current) => ({
    ...current,
    settings: verificationStore.normalizeSettings({
      ...(current.settings || {}),
      verifiedRoleIds,
      pendingRoleIds,
    }),
    panels,
    updatedAt: new Date().toISOString(),
  }), { action: 'verification_health_repair', ...meta });

  return buildHealthReport(guild);
}

module.exports = {
  buildHealthReport,
  repair,
};
