'use strict';

const express = require('express');
const { PermissionFlagsBits } = require('discord.js');
const router = express.Router();

const guildManager = require('../../guild/guildManager');
const notifications = require('../../notifications/notificationStore');
const { requireEntitlement } = require('../../../server/middleware/requireEntitlement');
const securityCore = require('./core');
const { getAntiNukeConfig } = require('./antiNuke');
const { getEmergencyControlState } = require('./emergencyControls');
const { getProtectedAssets } = require('./advancedThreatProtection');

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@#!&>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function cleanDiscordIds(values) {
  const source = Array.isArray(values) ? values : [];
  return [...new Set(source.map(cleanDiscordId).filter(Boolean))].slice(0, 250);
}

function getGuildId(req) {
  return cleanDiscordId(req.params.guildId || req.query.guildId || req.session?.guildId || req.session?.selectedGuildId || null);
}

async function resolveRequestGuild(req) {
  const guildId = getGuildId(req);
  if (!guildId) return null;
  const client = req.client || req.app?.get?.('goliath.client');
  return client?.guilds?.cache?.get(guildId) || await client?.guilds?.fetch?.(guildId).catch(() => null);
}

async function requireSecurityGuildAccess(req, res, next) {
  try {
    const userId = cleanDiscordId(req.session?.user?.id);
    if (!userId) return res.status(401).json({ ok: false, success: false, error: 'Authentication required.' });
    const guildId = getGuildId(req);
    if (!guildId) return res.status(400).json({ ok: false, success: false, error: 'Missing or invalid guildId.' });
    if (securityCore.isBotOwner(userId)) return next();

    const guild = await resolveRequestGuild(req);
    if (!guild) return res.status(403).json({ ok: false, success: false, error: 'Guild is unavailable or not accessible.' });
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    const allowed = Boolean(
      member?.id === guild.ownerId
      || member?.permissions?.has(PermissionFlagsBits.Administrator)
      || member?.permissions?.has(PermissionFlagsBits.ManageGuild)
    );
    if (!allowed) return res.status(403).json({ ok: false, success: false, error: 'Manage Server permission is required.' });
    return next();
  } catch (error) {
    console.error('[Security Routes] access check failed:', error);
    return res.status(403).json({ ok: false, success: false, error: 'Unable to verify server access.' });
  }
}

async function requireGuildOwner(req, res, next) {
  try {
    const userId = cleanDiscordId(req.session?.user?.id);
    if (!userId) return res.status(401).json({ ok: false, success: false, error: 'Authentication required.' });
    if (securityCore.isBotOwner(userId)) return next();
    const guild = await resolveRequestGuild(req);
    if (!guild) return res.status(403).json({ ok: false, success: false, error: 'Guild is unavailable or not accessible.' });
    if (guild.ownerId !== userId) return res.status(403).json({ ok: false, success: false, error: 'Only the Discord server owner can change protected security assets.' });
    return next();
  } catch (error) {
    console.error('[Security Routes] owner check failed:', error);
    return res.status(403).json({ ok: false, success: false, error: 'Unable to verify server ownership.' });
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function notifySecurity(guildId, overview = {}) {
  try {
    const score = Number(overview.protectionScore || 100);
    const threat = String(overview.threatLevel || 'low').toLowerCase();
    const critical = Number(overview.incidents?.critical || 0);
    const high = Number(overview.incidents?.high || 0);
    const lockdown = Boolean(overview.lockdown?.active);
    const quarantined = Number(overview.quarantineCount || 0);
    const healthDegraded = overview.capabilityHealth?.healthy === false;

    if (threat === 'critical' || critical > 0 || score < 55 || lockdown || healthDegraded) {
      return notifications.addNotificationOnce(guildId, {
        level: 'danger',
        source: 'security',
        title: 'Critical security attention needed',
        message: `Threat ${threat}, score ${score}, critical incidents ${critical}, lockdown ${lockdown ? 'active' : 'inactive'}${healthDegraded ? ', response capability degraded' : ''}.`,
        route: '/security',
        metadata: { threat, score, critical, high, lockdown, quarantined, healthDegraded },
      }, { fingerprint: `security:critical:${threat}:${critical}:${lockdown}:${healthDegraded}`, windowMs: 15 * 60_000 });
    }

    if (threat === 'high' || high > 0 || score < 75 || quarantined > 0) {
      return notifications.addNotificationOnce(guildId, {
        level: 'warning',
        source: 'security',
        title: 'Security warning detected',
        message: `Threat ${threat}, score ${score}, high incidents ${high}, quarantined users ${quarantined}.`,
        route: '/security',
        metadata: { threat, score, critical, high, quarantined },
      }, { fingerprint: `security:warning:${threat}:${high}:${quarantined}`, windowMs: 15 * 60_000 });
    }
  } catch (error) {
    console.warn('[Security Routes] notification skipped:', error.message || error);
  }
  return null;
}

function normaliseIncident(incident = {}) {
  return {
    ...incident,
    id: incident.id || incident.caseId || incident.incidentId || null,
    type: incident.type || incident.eventType || incident.action || 'security_event',
    severity: String(incident.severity || incident.level || 'info').toLowerCase(),
    reason: incident.reason || incident.message || incident.description || 'No reason provided.',
    actorId: incident.actorId || incident.userId || null,
    targetId: incident.targetId || null,
    timestamp: incident.timestamp || incident.createdAt || incident.time || null,
  };
}

function severityWeight(severity = 'info') {
  const value = String(severity).toLowerCase();
  if (value === 'critical') return 12;
  if (value === 'high') return 8;
  if (value === 'medium') return 4;
  if (value === 'low') return 2;
  return 1;
}

function buildProtectionModules(security = {}, modules = {}, antiNukeConfig = {}, securityModuleEnabled = true, emergencyControls = {}) {
  const webhook = asObject(security.webhooks || security.webhookMonitor || modules.security?.webhooks);
  const ownerMonitoring = asObject(security.ownerMonitoring || security.ownerMonitor || modules.security?.ownerMonitoring);
  const auditLog = asObject(security.auditLog || security.audit || modules.security?.auditLog);
  const lockdown = asObject(security.lockdown);
  const quarantine = asObject(security.quarantine);
  const health = asObject(security.capabilityHealth);
  const antiNukeEnabled = securityModuleEnabled && antiNukeConfig.enabled !== false;
  const quarantineEnabled = securityModuleEnabled && quarantine.enabled !== false;
  const inviteFreezeActive = Boolean(emergencyControls?.invites?.active);
  const roleFreezeActive = Boolean(emergencyControls?.roles?.active);
  const healthStatus = !securityModuleEnabled ? 'disabled' : health.healthy === false ? 'degraded' : 'healthy';

  return [
    { key: 'antiNuke', label: 'Anti-Nuke Core', enabled: antiNukeEnabled, status: antiNukeEnabled ? 'online' : 'disabled', description: 'Role, channel and destructive action protection.' },
    { key: 'threatCorrelation', label: 'Threat Correlation', enabled: antiNukeEnabled, status: antiNukeEnabled ? 'online' : 'disabled', description: 'Correlates multiple dangerous actions by the same actor across a rolling threat session.' },
    { key: 'securityHealth', label: 'Response Capability', enabled: securityModuleEnabled, status: healthStatus, description: 'Continuously validates audit-log access, security permissions and Goliath role hierarchy.' },
    { key: 'lockdown', label: 'Lockdown', enabled: securityModuleEnabled, status: lockdown.active ? 'active' : securityModuleEnabled ? 'standby' : 'disabled', description: 'Emergency server restriction state.' },
    { key: 'quarantine', label: 'Quarantine', enabled: quarantineEnabled, status: quarantineEnabled ? 'online' : 'disabled', description: 'Isolation flow for dangerous members.' },
    { key: 'inviteFreeze', label: 'Invite Freeze', enabled: antiNukeEnabled && antiNukeConfig.emergencyControls?.disableInvites !== false, status: inviteFreezeActive ? 'active' : antiNukeEnabled ? 'standby' : 'disabled', description: 'Automatically blocks new invite creation during critical incidents without invalidating existing invites.' },
    { key: 'roleFreeze', label: 'Role Freeze', enabled: antiNukeEnabled && antiNukeConfig.emergencyControls?.freezeRoles !== false, status: roleFreezeActive ? 'active' : antiNukeEnabled ? 'standby' : 'disabled', description: 'Automatically removes role-management capability from manageable untrusted roles during critical incidents.' },
    { key: 'webhookMonitor', label: 'Webhook Monitor', enabled: securityModuleEnabled && webhook.enabled !== false, status: securityModuleEnabled && webhook.enabled !== false ? 'online' : 'disabled', description: 'Webhook creation, deletion and abuse monitoring.' },
    { key: 'ownerMonitoring', label: 'Owner Monitoring', enabled: securityModuleEnabled && ownerMonitoring.enabled !== false, status: securityModuleEnabled && ownerMonitoring.enabled !== false ? 'online' : 'disabled', description: 'Owner/admin action visibility.' },
    { key: 'auditLog', label: 'Audit Log Health', enabled: securityModuleEnabled && auditLog.enabled !== false, status: health.missingPermissions?.includes?.('ViewAuditLog') ? 'degraded' : securityModuleEnabled && auditLog.enabled !== false ? 'online' : 'disabled', description: 'Audit-log driven event attribution and forensic correlation.' },
  ];
}

function buildProtectionScore({ modules = [], incidentRisk = 0, lockdownActive = false, quarantineCount = 0, healthDegraded = false }) {
  const disabledModules = modules.filter((module) => module.enabled === false).length;
  const penalty = (disabledModules * 12) + incidentRisk + (lockdownActive ? 20 : 0) + (quarantineCount * 3) + (healthDegraded ? 25 : 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function scoreStatus(score) {
  if (score >= 90) return 'protected';
  if (score >= 70) return 'watch';
  return 'danger';
}

function buildOverview(guildId) {
  const guildData = typeof guildManager.getGuildData === 'function' ? guildManager.getGuildData(guildId) || {} : {};
  const security = guildManager.getSecurityConfig(guildId) || {};
  const modules = asObject(guildData.modules);
  const securityModuleEnabled = guildManager.isModuleEnabled(guildId, 'security');
  const antiNukeConfig = getAntiNukeConfig(guildId);
  const emergencyControls = getEmergencyControlState(guildId);
  const incidents = asArray(security.incidents).map(normaliseIncident);
  const incidentPackages = asArray(security.incidentPackages);
  const capabilityHealth = asObject(security.capabilityHealth);
  const lockdown = { active: false, ...asObject(security.lockdown) };
  const quarantine = { users: {}, ...asObject(security.quarantine) };
  const quarantinedCount = Object.keys(asObject(quarantine.users)).length;
  const protectionModules = buildProtectionModules(security, modules, antiNukeConfig, securityModuleEnabled, emergencyControls);
  const critical = incidents.filter((incident) => incident.severity === 'critical').length;
  const high = incidents.filter((incident) => incident.severity === 'high').length;
  const webhookIncidents = incidents.filter((incident) => String(incident.type || '').toLowerCase().includes('webhook')).length;
  const incidentRisk = incidents.slice(0, 10).reduce((sum, incident) => sum + severityWeight(incident.severity), 0);
  const protectionScore = buildProtectionScore({ modules: protectionModules, incidentRisk, lockdownActive: Boolean(lockdown.active), quarantineCount: quarantinedCount, healthDegraded: capabilityHealth.healthy === false });
  const rawProtected = asObject(antiNukeConfig.protectedAssets);

  return {
    ok: true,
    success: true,
    guildId,
    threatLevel: security.threatLevel || (critical ? 'critical' : high ? 'high' : 'low'),
    protectionScore,
    protectionStatus: scoreStatus(protectionScore),
    incidents: {
      total: Number(security.totalIncidents || incidents.length || 0),
      critical: Number(security.criticalIncidents || critical || 0),
      high,
      webhook: webhookIncidents,
      recent: incidents.slice(0, 25),
    },
    incidentPackages: incidentPackages.slice(0, 25),
    capabilityHealth,
    protectedAssets: {
      enabled: rawProtected.enabled !== false,
      roleIds: cleanDiscordIds(rawProtected.roleIds),
      channelIds: cleanDiscordIds(rawProtected.channelIds),
    },
    lockdown,
    quarantine,
    quarantineCount: quarantinedCount,
    emergencyControls,
    antiNuke: antiNukeConfig,
    protectionModules,
    monitors: {
      antiNuke: protectionModules.find((module) => module.key === 'antiNuke'),
      threatCorrelation: protectionModules.find((module) => module.key === 'threatCorrelation'),
      securityHealth: protectionModules.find((module) => module.key === 'securityHealth'),
      lockdown: protectionModules.find((module) => module.key === 'lockdown'),
      quarantine: protectionModules.find((module) => module.key === 'quarantine'),
      inviteFreeze: protectionModules.find((module) => module.key === 'inviteFreeze'),
      roleFreeze: protectionModules.find((module) => module.key === 'roleFreeze'),
      webhooks: protectionModules.find((module) => module.key === 'webhookMonitor'),
      ownerMonitoring: protectionModules.find((module) => module.key === 'ownerMonitoring'),
      auditLog: protectionModules.find((module) => module.key === 'auditLog'),
    },
    moduleFlags: {
      security: securityModuleEnabled,
      automod: guildManager.isModuleEnabled(guildId, 'automod'),
      logs: guildManager.isModuleEnabled(guildId, 'logs'),
      restore: guildManager.isModuleEnabled(guildId, 'restore'),
      verification: guildManager.isModuleEnabled(guildId, 'verification'),
    },
    premium: {
      advancedSecurityLocked: true,
      requiredFeature: 'security.advanced',
      requiredPlan: 'pro',
    },
    updatedAt: new Date().toISOString(),
  };
}

router.get('/overview', requireSecurityGuildAccess, async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const overview = buildOverview(guildId);
    notifySecurity(guildId, overview);
    return res.json(overview);
  } catch (error) {
    console.error('[Security Routes] overview failed:', error);
    return res.status(500).json({ ok: false, success: false, error: error.message });
  }
});

router.get('/:guildId/protected-assets', requireSecurityGuildAccess, async (req, res) => {
  try {
    const guild = await resolveRequestGuild(req);
    if (!guild) return res.status(404).json({ ok: false, success: false, error: 'Guild unavailable.' });
    const assets = getProtectedAssets(guild);
    return res.json({ ok: true, success: true, enabled: assets.enabled, roleIds: assets.roleIdList, channelIds: assets.channelIdList });
  } catch (error) {
    return res.status(500).json({ ok: false, success: false, error: error.message });
  }
});

router.put('/:guildId/protected-assets', requireGuildOwner, async (req, res) => {
  try {
    const guild = await resolveRequestGuild(req);
    if (!guild) return res.status(404).json({ ok: false, success: false, error: 'Guild unavailable.' });
    const roleIds = cleanDiscordIds(req.body?.roleIds);
    const channelIds = cleanDiscordIds(req.body?.channelIds);
    const enabled = req.body?.enabled !== false;

    for (const roleId of roleIds) {
      if (!guild.roles.cache.has(roleId)) return res.status(400).json({ ok: false, success: false, error: `Unknown role ID: ${roleId}` });
    }
    for (const channelId of channelIds) {
      if (!guild.channels.cache.has(channelId)) return res.status(400).json({ ok: false, success: false, error: `Unknown channel ID: ${channelId}` });
    }

    const saved = guildManager.getGuildSection(guild.id, 'antiNuke', {}) || {};
    guildManager.saveGuildSection(guild.id, 'antiNuke', {
      ...saved,
      protectedAssets: { enabled, roleIds, channelIds },
    }, guild);

    const assets = getProtectedAssets(guild);
    return res.json({ ok: true, success: true, enabled: assets.enabled, roleIds: assets.roleIdList, channelIds: assets.channelIdList });
  } catch (error) {
    console.error('[Security Routes] protected asset update failed:', error);
    return res.status(500).json({ ok: false, success: false, error: error.message });
  }
});

router.get('/:guildId/advanced', requireSecurityGuildAccess, requireEntitlement('security.advanced'), async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const overview = buildOverview(guildId);
    return res.json({ ...overview, advanced: true });
  } catch (error) {
    return res.status(500).json({ ok: false, success: false, error: error.message });
  }
});

module.exports = router;
