'use strict';

const verificationManager = require('./verificationManager');
const verificationStore = require('./verificationStore');

async function fetchConfiguredRoles(guild, roleIds = []) {
  const roles = [];
  for (const roleId of roleIds) {
    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (role) roles.push(role);
  }
  return roles;
}

async function buildHealthReport(guild) {
  if (!guild?.id) throw new Error('Guild is unavailable.');

  const section = verificationStore.getVerificationSection(guild.id);
  const settings = section.settings;
  const verifiedRoles = await fetchConfiguredRoles(guild, settings.verifiedRoleIds);
  const pendingRoles = await fetchConfiguredRoles(guild, settings.pendingRoleIds);
  const panels = Object.values(section.panels || {});
  const panelHealth = [];

  for (const panel of panels) {
    panelHealth.push({
      panelId: panel.panelId,
      ...(await verificationManager.getPanelHealth(guild, panel)),
    });
  }

  const invalidVerified = verifiedRoles.filter((role) => !verificationManager.canBotManageRole(guild, role));
  const invalidPending = pendingRoles.filter((role) => !verificationManager.canBotManageRole(guild, role));
  const screeningEnabled = verificationManager.hasDiscordScreening(guild);
  const warnings = [
    section.enabled !== true ? 'Verification is disabled.' : null,
    !settings.verifiedRoleIds.length ? 'No verified roles are configured.' : null,
    settings.verifiedRoleIds.length !== verifiedRoles.length ? 'One or more verified roles are missing.' : null,
    invalidVerified.length ? 'Goliath cannot manage one or more verified roles.' : null,
    settings.usePendingRoles && !settings.pendingRoleIds.length ? 'Pending roles are enabled but no pending roles are selected.' : null,
    settings.requirePendingRole && !settings.usePendingRoles ? 'Require Pending Role is enabled while Pending Roles are disabled.' : null,
    settings.assignPendingRoles && !settings.usePendingRoles ? 'Assign Pending Roles is enabled while Pending Roles are disabled.' : null,
    settings.usePendingRoles && settings.pendingRoleIds.length !== pendingRoles.length ? 'One or more pending roles are missing.' : null,
    invalidPending.length ? 'Goliath cannot manage one or more pending roles.' : null,
    settings.waitForDiscordScreening && !screeningEnabled && !settings.skipScreeningIfUnavailable
      ? 'Discord Membership Screening is required but not configured.'
      : null,
    panels.length === 0 ? 'No verification panel deployed.' : null,
    ...panelHealth.filter((panel) => !panel.ok).map((panel) => `${panel.panelId}: ${panel.status}`),
  ].filter(Boolean);

  return {
    enabled: section.enabled === true,
    screeningEnabled,
    waitForDiscordScreening: settings.waitForDiscordScreening,
    hasVerifiedRole: verifiedRoles.length > 0,
    verifiedRoleCount: verifiedRoles.length,
    hasPendingRole: pendingRoles.length > 0,
    pendingRoleCount: pendingRoles.length,
    hasLogChannel: Boolean(settings.logChannelId),
    panels: panelHealth,
    warnings,
  };
}

async function repair(guild, meta = {}) {
  if (!guild?.id) throw new Error('Guild is unavailable.');

  const section = verificationStore.getVerificationSection(guild.id);
  const verifiedRoleIds = [];
  const pendingRoleIds = [];
  const panels = {};

  for (const roleId of section.settings.verifiedRoleIds || []) {
    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (role) verifiedRoleIds.push(role.id);
  }

  for (const roleId of section.settings.pendingRoleIds || []) {
    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (role) pendingRoleIds.push(role.id);
  }

  for (const panel of Object.values(section.panels || {})) {
    const health = await verificationManager.getPanelHealth(guild, panel);
    if (health.ok) panels[panel.panelId] = panel;
  }

  verificationStore.updateVerificationSection(guild.id, (current) => ({
    ...current,
    settings: verificationStore.normalizeSettings({
      ...current.settings,
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
