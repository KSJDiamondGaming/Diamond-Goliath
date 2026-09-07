'use strict';

const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const securitySystem = require('./system');
const guildManager = require('../../guild/guildManager');
const { enableLockdown, getLockdownState, getLockdownModeFromSeverity } = require('./lockdown');
const { validateBotHierarchy } = require('./system');
const { quarantineMember: quarantineSystemMember } = require('./quarantine');
const schedulerRegistry = require('../../../owner/sentinel/schedulerRegistry');

const { SEVERITY, INCIDENT_TYPES, logIncident, calculateIncidentSeverity } = securitySystem;
const QUARANTINE_ROLE_NAME = 'Goliath Quarantine';
const CLEANUP_INTERVAL_MS = 60_000;
const CLEANUP_SCHEDULER_ID = 'security:anti-nuke-bucket-cleanup:global';
const DEFAULT_RESPONSE_DURATION_MS = 60 * 60 * 1000;

const DEFAULT_CONFIG = {
  enabled: true,
  thresholds: {
    channelDelete: { maxActions: 3, windowMs: 30_000 },
    roleDelete: { maxActions: 3, windowMs: 30_000 },
  },
  lockdown: { enabled: true, reason: 'Goliath Anti-Nuke emergency lockdown triggered.', durationMs: DEFAULT_RESPONSE_DURATION_MS },
  quarantine: { enabled: true, roleName: QUARANTINE_ROLE_NAME, reason: 'Goliath Anti-Nuke quarantine triggered.', durationMs: DEFAULT_RESPONSE_DURATION_MS },
  ownerAlerts: { enabled: true },
  backups: { beforeIncident: true, afterIncident: true },
  trustedUserIds: [],
  trustedRoleIds: [],
  ignoreBots: false,
};

const actionBuckets = new Map();
schedulerRegistry.register({ id: CLEANUP_SCHEDULER_ID, module: 'security', component: 'anti-nuke-bucket-cleanup', intervalMs: CLEANUP_INTERVAL_MS, staleAfterMs: CLEANUP_INTERVAL_MS * 3 });
const cleanupTimer = setInterval(() => {
  try {
    const now = Date.now();
    for (const [key, timestamps] of actionBuckets) {
      const fresh = timestamps.filter((timestamp) => now - timestamp < CLEANUP_INTERVAL_MS);
      if (fresh.length) actionBuckets.set(key, fresh); else actionBuckets.delete(key);
    }
    schedulerRegistry.beat(CLEANUP_SCHEDULER_ID, { buckets: actionBuckets.size });
  } catch (error) {
    schedulerRegistry.fail(CLEANUP_SCHEDULER_ID, error, { buckets: actionBuckets.size });
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();

function normalizeThreshold(value, fallback) {
  const maxActions = Number(value?.maxActions);
  const windowMs = Number(value?.windowMs);
  return {
    maxActions: Number.isFinite(maxActions) ? Math.max(1, Math.min(100, Math.trunc(maxActions))) : fallback.maxActions,
    windowMs: Number.isFinite(windowMs) ? Math.max(1000, Math.min(3_600_000, Math.trunc(windowMs))) : fallback.windowMs,
  };
}
function normalizeDuration(value, fallback = DEFAULT_RESPONSE_DURATION_MS) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? Math.max(60_000, Math.min(604_800_000, Math.trunc(duration))) : fallback;
}
function getAntiNukeConfig(guildId) {
  const saved = guildManager.getGuildSection(guildId, 'antiNuke', {}) || {};
  return {
    ...DEFAULT_CONFIG,
    ...saved,
    thresholds: {
      channelDelete: normalizeThreshold(saved.thresholds?.channelDelete, DEFAULT_CONFIG.thresholds.channelDelete),
      roleDelete: normalizeThreshold(saved.thresholds?.roleDelete, DEFAULT_CONFIG.thresholds.roleDelete),
    },
    lockdown: { ...DEFAULT_CONFIG.lockdown, ...(saved.lockdown || {}), durationMs: normalizeDuration(saved.lockdown?.durationMs, DEFAULT_CONFIG.lockdown.durationMs) },
    quarantine: { ...DEFAULT_CONFIG.quarantine, ...(saved.quarantine || {}), durationMs: normalizeDuration(saved.quarantine?.durationMs || saved.durationMs, DEFAULT_CONFIG.quarantine.durationMs) },
    ownerAlerts: { ...DEFAULT_CONFIG.ownerAlerts, ...(saved.ownerAlerts || {}) },
    backups: { ...DEFAULT_CONFIG.backups, ...(saved.backups || {}) },
    trustedUserIds: Array.isArray(saved.trustedUserIds) ? [...new Set(saved.trustedUserIds.map(String))] : [],
    trustedRoleIds: Array.isArray(saved.trustedRoleIds) ? [...new Set(saved.trustedRoleIds.map(String))] : [],
    ignoreBots: Boolean(saved.ignoreBots),
  };
}
function addAction(guildId, userId, actionType, windowMs) {
  const key = `${guildId}:${userId || 'unknown'}:${actionType}`;
  const now = Date.now();
  const fresh = (actionBuckets.get(key) || []).filter((timestamp) => now - timestamp <= windowMs);
  fresh.push(now); actionBuckets.set(key, fresh); return fresh.length;
}
function isTrustedMember(member, config) {
  if (!member) return false;
  if (config.trustedUserIds.includes(String(member.id))) return true;
  return member.roles.cache.some((role) => config.trustedRoleIds.includes(String(role.id)));
}
function responseCapability(guild) {
  const result = validateBotHierarchy(guild);
  if (!result.valid) console.warn(`[AntiNuke] Detection remains active but response capability is degraded in ${guild?.name || guild?.id}: ${result.reason}`);
  return result;
}
async function fetchAuditExecutor(guild, auditType) {
  try {
    const logs = await guild.fetchAuditLogs({ type: auditType, limit: 1 });
    const entry = logs.entries.first();
    if (!entry || Date.now() - entry.createdTimestamp > 8_000) return null;
    return { id: entry.executor?.id || null, tag: entry.executor?.tag || null, bot: Boolean(entry.executor?.bot), entry };
  } catch (error) {
    console.warn('[AntiNuke] Failed to fetch audit executor:', error?.message || error); return null;
  }
}
async function createEmergencyBackup(guild, reason, stage) {
  try {
    const { createServerBackup } = require('../restoreBackup/backup');
    if (typeof createServerBackup !== 'function') return null;
    return await createServerBackup(guild, { createdBy: 'Goliath Anti-Nuke', reason, stage, emergency: true, type: 'security_emergency' });
  } catch (error) {
    console.error('[AntiNuke] Emergency backup failed:', error); return null;
  }
}
async function alertOwner(guild, incident) {
  try {
    const owner = await guild.fetchOwner().catch(() => null);
    if (!owner) return false;
    await owner.send({ content: ['🚨 **Goliath Anti-Nuke Alert**', `Server: **${guild.name}**`, `Incident: \`${incident.type}\``, `Severity: \`${incident.severity}\``, `Actor: ${incident.actorTag || 'Unknown'} (${incident.actorId || 'unknown'})`, `Action: ${incident.actionTaken || 'Logged only'}`].join('\n'), allowedMentions: { parse: [] } });
    return true;
  } catch (error) {
    console.error('[AntiNuke] Owner alert failed:', error); return false;
  }
}
async function emergencyLockdown(guild, reason) {
  if (!guild || getLockdownState(guild.id).active) return false;
  const config = getAntiNukeConfig(guild.id);
  const result = await enableLockdown(guild, { reason: reason || config.lockdown.reason, enabledBy: 'anti_nuke', enabledByTag: 'Goliath Anti-Nuke', severity: SEVERITY.CRITICAL, lockdownMode: 'emergency', durationMs: config.lockdown.durationMs });
  if (!result?.success) return false;
  await logIncident(guild, { type: INCIDENT_TYPES.EMERGENCY_LOCKDOWN, severity: SEVERITY.CRITICAL, reason, actionTaken: 'Emergency lockdown panic protection enabled.', metadata: { source: 'anti_nuke', protectedChannels: result.locked || 0, expiresAt: result.expiresAt || null } });
  return true;
}
async function quarantineMember(guild, member, config = {}, reason = '') {
  if (!guild || !member) return { success: false, reason: 'Missing guild or member.' };
  if (member.id === guild.ownerId) return { success: false, reason: 'Cannot quarantine the server owner.' };
  return quarantineSystemMember(guild, member, { reason: reason || config.quarantine?.reason || DEFAULT_CONFIG.quarantine.reason, quarantinedBy: 'anti_nuke', source: 'anti_nuke', roleName: config.quarantine?.roleName || QUARANTINE_ROLE_NAME, durationMs: normalizeDuration(config.quarantine?.durationMs || config.durationMs) });
}
function analyseIncident(type, metadata = {}) {
  return typeof calculateIncidentSeverity === 'function' ? calculateIncidentSeverity(type, metadata) : { severity: SEVERITY.HIGH, score: 0, recommendedActions: [] };
}
function getDangerousRolePermissions(role) {
  const flags = [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageWebhooks];
  return flags.filter((flag) => role.permissions.has(flag));
}
async function resolveExecutor(guild, auditType, config) {
  const executor = await fetchAuditExecutor(guild, auditType);
  if (!executor?.id || (config.ignoreBots && executor.bot)) return null;
  const member = await guild.members.fetch(executor.id).catch(() => null);
  if (isTrustedMember(member, config)) return null;
  return { executor, member };
}
async function maybeQuarantine(guild, member, config, reason) {
  if (!config.quarantine.enabled) return { success: false, reason: 'Quarantine is disabled.' };
  if (!member) return { success: false, reason: 'Executor member is unavailable.' };
  return quarantineMember(guild, member, config, reason);
}
async function maybeAlertOwner(guild, config, incident) {
  if (config.ownerAlerts.enabled) await alertOwner(guild, incident);
}

async function handleDeleteEvent({ guild, target, actionType, auditType, incidentType, massIncidentType }) {
  if (!guild) return null;
  const config = getAntiNukeConfig(guild.id);
  if (!config.enabled) return null;
  const capability = responseCapability(guild);
  const resolved = await resolveExecutor(guild, auditType, config);
  if (!resolved) return null;
  const { executor, member } = resolved;
  const threshold = actionType === 'channelDelete' ? config.thresholds.channelDelete : config.thresholds.roleDelete;
  const count = addAction(guild.id, executor.id, actionType, threshold.windowMs);
  const normalIncident = await logIncident(guild, { type: incidentType, severity: SEVERITY.MEDIUM, actorId: executor.id, actorTag: executor.tag, targetId: target?.id || null, targetName: target?.name || null, targetType: actionType, reason: `${actionType} detected.`, metadata: { actionCount: count, threshold: threshold.maxActions, windowMs: threshold.windowMs, responseCapability: capability } });
  if (count < threshold.maxActions) return normalIncident;

  const analysis = analyseIncident(massIncidentType, { actionCount: count, threshold: threshold.maxActions, actorIsBot: executor.bot, actorTrusted: false });
  const beforeBackup = config.backups.beforeIncident ? await createEmergencyBackup(guild, `Before anti-nuke response: ${massIncidentType}`, 'before_incident_response') : null;
  const profile = getLockdownModeFromSeverity(analysis.severity);
  const lockdownResult = config.lockdown.enabled
    ? await enableLockdown(guild, { reason: config.lockdown.reason, enabledBy: 'anti_nuke', enabledByTag: 'Goliath Anti-Nuke', severity: analysis.severity, lockdownMode: profile.mode, slowmodeSeconds: profile.slowmodeSeconds, lockText: profile.lockText, lockVoice: profile.lockVoice, lockThreads: profile.lockThreads, lockCommands: profile.lockCommands, durationMs: config.lockdown.durationMs })
    : { success: false, reason: 'Lockdown is disabled.' };
  const quarantineResult = await maybeQuarantine(guild, member, config, `Mass ${actionType} detected.`);
  const incident = await logIncident(guild, {
    type: massIncidentType, severity: analysis.severity, actorId: executor.id, actorTag: executor.tag, targetId: target?.id || null, targetName: target?.name || null, targetType: actionType, reason: `Mass ${actionType} detected.`,
    actionTaken: `${lockdownResult.success ? 'Emergency lockdown triggered.' : `Lockdown failed/skipped: ${lockdownResult.reason || lockdownResult.error || 'unknown'}.`} ${quarantineResult.success ? 'Attacker quarantined.' : `Quarantine failed/skipped: ${quarantineResult.reason || quarantineResult.error || 'unknown'}.`}`,
    metadata: { actionCount: count, threshold: threshold.maxActions, windowMs: threshold.windowMs, beforeBackupCreated: Boolean(beforeBackup), lockdown: lockdownResult, quarantine: quarantineResult, severityScore: analysis.score, recommendedActions: analysis.recommendedActions, responseCapability: capability },
  });
  await maybeAlertOwner(guild, config, incident);
  const afterBackup = config.backups.afterIncident ? await createEmergencyBackup(guild, `After anti-nuke response: ${massIncidentType}`, 'after_incident_response') : null;
  if (afterBackup) await logIncident(guild, { type: INCIDENT_TYPES.BACKUP_CREATED, severity: SEVERITY.HIGH, reason: 'Emergency after-incident backup created.', actionTaken: 'Backup created after anti-nuke response.', metadata: { backupId: afterBackup.backupId || null, backupCreatedAt: afterBackup.createdAt || null, relatedIncidentId: incident.id } });
  return incident;
}

async function handleChannelDelete(channel) { return handleDeleteEvent({ guild: channel.guild, target: channel, actionType: 'channelDelete', auditType: AuditLogEvent.ChannelDelete, incidentType: INCIDENT_TYPES.CHANNEL_DELETE, massIncidentType: INCIDENT_TYPES.MASS_CHANNEL_DELETE }); }
async function handleRoleDelete(role) { return handleDeleteEvent({ guild: role.guild, target: role, actionType: 'roleDelete', auditType: AuditLogEvent.RoleDelete, incidentType: INCIDENT_TYPES.ROLE_DELETE, massIncidentType: INCIDENT_TYPES.MASS_ROLE_DELETE }); }

async function handleRoleCreate(role) {
  const guild = role?.guild; if (!guild) return null;
  const config = getAntiNukeConfig(guild.id); if (!config.enabled) return null;
  const capability = responseCapability(guild);
  const resolved = await resolveExecutor(guild, AuditLogEvent.RoleCreate, config); if (!resolved) return null;
  const dangerous = getDangerousRolePermissions(role); if (!dangerous.length) return null;
  const quarantine = await maybeQuarantine(guild, resolved.member, config, 'Dangerous role creation detected.');
  const incident = await logIncident(guild, { type: INCIDENT_TYPES.DANGEROUS_ROLE_CREATE || 'dangerous_role_create', severity: analyseIncident(INCIDENT_TYPES.DANGEROUS_ROLE_CREATE, { dangerousPermissionCount: dangerous.length }).severity, actorId: resolved.executor.id, actorTag: resolved.executor.tag, targetId: role.id, targetName: role.name, targetType: 'role', reason: 'Dangerous role created.', actionTaken: quarantine.success ? 'Executor quarantined automatically.' : `Role creation flagged; quarantine failed/skipped: ${quarantine.reason || quarantine.error}`, metadata: { dangerousPermissionCount: dangerous.length, quarantine, responseCapability: capability } });
  await maybeAlertOwner(guild, config, incident); return incident;
}

async function handleRoleUpdate(oldRole, newRole) {
  const guild = newRole?.guild; if (!guild) return null;
  const config = getAntiNukeConfig(guild.id); if (!config.enabled) return null;
  const capability = responseCapability(guild);
  const resolved = await resolveExecutor(guild, AuditLogEvent.RoleUpdate, config); if (!resolved) return null;
  const added = getDangerousRolePermissions(newRole).filter((flag) => !oldRole.permissions.has(flag)); if (!added.length) return null;
  const quarantine = await maybeQuarantine(guild, resolved.member, config, 'Dangerous role permission escalation detected.');
  const incident = await logIncident(guild, { type: INCIDENT_TYPES.DANGEROUS_ROLE_PERMISSION_ADDED || 'dangerous_role_permission_added', severity: analyseIncident(INCIDENT_TYPES.DANGEROUS_ROLE_PERMISSION_ADDED, { dangerousPermissionCount: added.length }).severity, actorId: resolved.executor.id, actorTag: resolved.executor.tag, targetId: newRole.id, targetName: newRole.name, targetType: 'role', reason: 'Dangerous permissions were added to an existing role.', actionTaken: quarantine.success ? 'Executor quarantined automatically.' : `Role escalation flagged; quarantine failed/skipped: ${quarantine.reason || quarantine.error}`, metadata: { addedPermissionCount: added.length, quarantine, responseCapability: capability } });
  await maybeAlertOwner(guild, config, incident); return incident;
}

async function handleWebhookCreate(webhook) { return handleWebhookObject(webhook, AuditLogEvent.WebhookCreate, INCIDENT_TYPES.WEBHOOK_CREATE || 'webhook_create', 'Webhook creation detected.', 'Suspicious webhook creation detected.'); }
async function handleWebhookDelete(webhook) { return handleWebhookObject(webhook, AuditLogEvent.WebhookDelete, INCIDENT_TYPES.WEBHOOK_DELETE || 'webhook_delete', 'Webhook deletion detected.', 'Suspicious webhook deletion detected.'); }
async function handleWebhookObject(webhook, auditType, incidentType, reason, quarantineReason) {
  const guild = webhook?.guild; if (!guild) return null;
  const config = getAntiNukeConfig(guild.id); if (!config.enabled) return null;
  const capability = responseCapability(guild);
  const resolved = await resolveExecutor(guild, auditType, config); if (!resolved) return null;
  const quarantine = await maybeQuarantine(guild, resolved.member, config, quarantineReason);
  const incident = await logIncident(guild, { type: incidentType, severity: analyseIncident(incidentType, {}).severity, actorId: resolved.executor.id, actorTag: resolved.executor.tag, targetId: webhook.id, targetName: webhook.name, targetType: 'webhook', reason, actionTaken: quarantine.success ? 'Executor quarantined automatically.' : `Webhook activity flagged; quarantine failed/skipped: ${quarantine.reason || quarantine.error}`, metadata: { quarantine, responseCapability: capability } });
  await maybeAlertOwner(guild, config, incident); return incident;
}

async function handleWebhookUpdate(channel) {
  const guild = channel?.guild; if (!guild) return null;
  const config = getAntiNukeConfig(guild.id); if (!config.enabled) return null;
  const capability = responseCapability(guild);
  let resolved = null;
  for (const auditType of [AuditLogEvent.WebhookCreate, AuditLogEvent.WebhookUpdate, AuditLogEvent.WebhookDelete]) {
    resolved = await resolveExecutor(guild, auditType, config); if (resolved) break;
  }
  if (!resolved) return null;
  const quarantine = await maybeQuarantine(guild, resolved.member, config, 'Suspicious webhook activity detected.');
  const incidentType = INCIDENT_TYPES.SUSPICIOUS_WEBHOOK_ACTIVITY || INCIDENT_TYPES.WEBHOOK_UPDATE || 'suspicious_webhook_activity';
  const incident = await logIncident(guild, { type: incidentType, severity: analyseIncident(incidentType, {}).severity, actorId: resolved.executor.id, actorTag: resolved.executor.tag, targetId: channel.id, targetName: channel.name, targetType: 'webhook_channel', reason: `Webhook activity detected in #${channel.name}.`, actionTaken: quarantine.success ? 'Executor quarantined automatically.' : `Webhook activity flagged; quarantine failed/skipped: ${quarantine.reason || quarantine.error}`, metadata: { auditAction: resolved.executor.entry?.action || null, quarantine, responseCapability: capability } });
  await maybeAlertOwner(guild, config, incident); return incident;
}

module.exports = { DEFAULT_CONFIG, QUARANTINE_ROLE_NAME, DEFAULT_RESPONSE_DURATION_MS, getAntiNukeConfig, handleChannelDelete, handleRoleDelete, handleWebhookCreate, handleWebhookDelete, handleWebhookUpdate, handleRoleCreate, handleRoleUpdate, emergencyLockdown, quarantineMember, alertOwner, createEmergencyBackup };
