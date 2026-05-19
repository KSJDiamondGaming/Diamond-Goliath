const { EmbedBuilder, WebhookClient } = require('discord.js');
const guildManager = require('../guild/guildManager');

const OWNER_SECURITY_WEBHOOK_URL = String(
  process.env.OWNER_SECURITY_WEBHOOK_URL || ''
).trim();

let ownerWebhookClient = null;

const SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

const INCIDENT_TYPES = {
  CHANNEL_DELETE: 'channel_delete',
  ROLE_DELETE: 'role_delete',

  MASS_CHANNEL_DELETE: 'mass_channel_delete',
  MASS_ROLE_DELETE: 'mass_role_delete',

  LOCKDOWN_ENABLED: 'lockdown_enabled',
  LOCKDOWN_DISABLED: 'lockdown_disabled',
  LOCKDOWN_RECOVERY_RESTORED: 'lockdown_recovery_restored',
  EMERGENCY_LOCKDOWN: 'emergency_lockdown',

  MEMBER_QUARANTINED: 'member_quarantined',

  DANGEROUS_ROLE_PERMISSION_ADDED: 'dangerous_role_permission_added',
  DANGEROUS_ROLE_PERMISSION_REMOVED: 'dangerous_role_permission_removed',
  DANGEROUS_ROLE_CREATE: 'dangerous_role_create',

  WEBHOOK_UPDATE: 'webhook_update',
  WEBHOOK_CREATE: 'webhook_create',
  WEBHOOK_DELETE: 'webhook_delete',
  SUSPICIOUS_WEBHOOK_ACTIVITY: 'suspicious_webhook_activity',

  OWNER_ESCALATION: 'owner_escalation',
  BACKUP_CREATED: 'backup_created',
  RESTORE_ACTION: 'restore_action',
  SUSPICIOUS_ADMIN_ACTION: 'suspicious_admin_action',
};

function safeString(value, fallback = 'Unknown') {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function createIncidentId() {
  return `inc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getSeverityColor(severity) {
  switch (severity) {
    case SEVERITY.CRITICAL:
      return 0xff0000;
    case SEVERITY.HIGH:
      return 0xff7a00;
    case SEVERITY.MEDIUM:
      return 0xffcc00;
    case SEVERITY.LOW:
    default:
      return 0x5865f2;
  }
}

function getThreatLevelFromSeverity(severity) {
  switch (severity) {
    case SEVERITY.CRITICAL:
      return 'critical';
    case SEVERITY.HIGH:
      return 'high';
    case SEVERITY.MEDIUM:
      return 'medium';
    case SEVERITY.LOW:
    default:
      return 'low';
  }
}

function resolveSecurityLogChannelId(guildId) {
  const security = guildManager.getGuildSection(guildId, 'security', {});
  const logs = guildManager.getGuildSection(guildId, 'logs', {});

  return (
    security?.incidentLogChannelId ||
    security?.securityLogChannelId ||
    logs?.channels?.admin ||
    logs?.channels?.moderation ||
    logs?.channels?.general ||
    logs?.adminLogChannelId ||
    logs?.modLogChannelId ||
    logs?.logsChannelId ||
    null
  );
}

function readIncidents(guildId) {
  try {
    const security = guildManager.getGuildSection(guildId, 'security', {});
    return Array.isArray(security.incidents) ? security.incidents : [];
  } catch (err) {
    console.error('[securitySystem] Failed to read incidents:', err);
    return [];
  }
}

function writeIncidents(guildId, incidents = [], options = {}) {
  try {
    const security = guildManager.getGuildSection(guildId, 'security', {});
    const safeIncidents = Array.isArray(incidents) ? incidents : [];
    const maxStored = Number(options.maxStored || 250);

    guildManager.saveGuildSection(guildId, 'security', {
      ...security,
      incidents: safeIncidents.slice(0, maxStored),
    });

    return true;
  } catch (err) {
    console.error('[securitySystem] Failed to write incidents:', err);
    return false;
  }
}

function updateGuildSecurityState(guildId, incident, options = {}) {
  try {
    const security = guildManager.getGuildSection(guildId, 'security', {});

    const currentIncidents = Array.isArray(security.incidents)
      ? security.incidents
      : [];

    const maxStored = Number(options.maxStored || 250);
    const incidents = [incident, ...currentIncidents].slice(0, maxStored);

    const totalIncidents = Number(security.totalIncidents || 0) + 1;

    const criticalIncidents =
      incident.severity === SEVERITY.CRITICAL
        ? Number(security.criticalIncidents || 0) + 1
        : Number(security.criticalIncidents || 0);

    guildManager.saveGuildSection(guildId, 'security', {
      ...security,

      enabled: security.enabled !== false,
      incidents,

      threatLevel: getThreatLevelFromSeverity(incident.severity),

      totalIncidents,
      criticalIncidents,

      lastIncidentAt: incident.createdAt,
      lastIncidentType: incident.type,

      lastLockdownAt:
        incident.type === INCIDENT_TYPES.LOCKDOWN_ENABLED ||
        incident.type === INCIDENT_TYPES.EMERGENCY_LOCKDOWN
          ? incident.createdAt
          : security.lastLockdownAt || null,

      lastQuarantineAt:
        incident.type === INCIDENT_TYPES.MEMBER_QUARANTINED
          ? incident.createdAt
          : security.lastQuarantineAt || null,

      ownerMonitoring: {
        ...(security.ownerMonitoring || {}),
        enabled: security.ownerMonitoring?.enabled !== false,
        webhookMirrorEnabled:
          security.ownerMonitoring?.webhookMirrorEnabled !== false,
      },
    });

    return true;
  } catch (err) {
    console.error(
      '[securitySystem] Failed to update guild security state:',
      err
    );
    return false;
  }
}

function buildIncidentEmbed(incident, options = {}) {
  const severity = safeString(incident.severity, SEVERITY.LOW).toUpperCase();
  const isOwnerMirror = Boolean(options.ownerMirror);

  const embed = new EmbedBuilder()
    .setColor(getSeverityColor(incident.severity))
    .setTitle(
      isOwnerMirror
        ? '🚨 Goliath Security Network Alert'
        : '🚨 Security Incident Logged'
    )
    .setDescription(
      `**Type:** \`${incident.type}\`\n**Severity:** \`${severity}\``
    )
    .addFields(
      {
        name: 'Incident ID',
        value: `\`${incident.id}\``,
        inline: false,
      },
      {
        name: 'Guild',
        value: `${incident.guildName || 'Unknown'}\n\`${incident.guildId}\``,
        inline: true,
      },
      {
        name: 'Actor',
        value: incident.actorId
          ? `${incident.actorTag || 'Unknown'}\n\`${incident.actorId}\``
          : 'Unknown',
        inline: true,
      },
      {
        name: 'Target',
        value: incident.targetId
          ? `${incident.targetName || 'Unknown'}\n\`${incident.targetId}\``
          : 'None',
        inline: true,
      }
    )
    .setTimestamp(new Date(incident.createdAt))
    .setFooter({
      text: isOwnerMirror
        ? 'Goliath Monitoring'
        : 'Goliath Security System',
    });

  if (incident.reason) {
    embed.addFields({
      name: 'Reason / Summary',
      value: safeString(incident.reason).slice(0, 1024),
      inline: false,
    });
  }

  if (incident.actionTaken) {
    embed.addFields({
      name: 'Action Taken',
      value: safeString(incident.actionTaken).slice(0, 1024),
      inline: false,
    });
  }

  const metadata = incident.metadata || {};

if (
  metadata.severityScore !== undefined ||
  Array.isArray(metadata.recommendedActions) ||
  metadata.beforeBackupId ||
  metadata.lockdownTriggered !== undefined ||
  metadata.quarantine
) {
  embed.addFields(
    {
      name: 'Severity Score',
      value: `\`${metadata.severityScore || 0}\``,
      inline: true,
    },
    {
      name: 'Emergency Lockdown',
      value: metadata.lockdownTriggered ? 'Enabled' : 'Not Triggered',
      inline: true,
    },
    {
      name: 'Rollback / Backup Snapshot',
      value: metadata.beforeBackupId
        ? `\`${metadata.beforeBackupId}\``
        : metadata.beforeBackupCreated
          ? 'Created'
          : 'None',
      inline: true,
    }
  );

  if (
    Array.isArray(metadata.recommendedActions) &&
    metadata.recommendedActions.length
  ) {
    embed.addFields({
      name: 'Recommended Actions',
      value: metadata.recommendedActions
        .map((action) => `• ${action}`)
        .join('\n')
        .slice(0, 1024),
      inline: false,
    });
  }

  if (metadata.quarantine) {
    embed.addFields({
      name: 'Quarantine Result',
      value: safeString(
        metadata.quarantine.success
          ? 'Executor quarantined successfully.'
          : metadata.quarantine.reason || 'Quarantine failed/skipped.'
      ).slice(0, 1024),
      inline: false,
    });
  }
}

  if (incident.metadata && Object.keys(incident.metadata).length) {
    embed.addFields({
      name: 'Metadata',
      value:
        `\`\`\`json\n` +
        `${JSON.stringify(incident.metadata, null, 2).slice(0, 950)}\n` +
        `\`\`\``,
      inline: false,
    });
  }

  return embed;
}

async function sendIncidentLog(guild, incident) {
  try {
    if (!guild) return false;

    const channelId = resolveSecurityLogChannelId(guild.id);
    if (!channelId) return false;

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return false;

    await channel.send({
      embeds: [buildIncidentEmbed(incident)],
    });

    return true;
  } catch (err) {
    console.error('[securitySystem] Failed to send incident log:', err);
    return false;
  }
}

function getOwnerWebhookClient() {
  if (!OWNER_SECURITY_WEBHOOK_URL) return null;

  if (!ownerWebhookClient) {
    ownerWebhookClient = new WebhookClient({
      url: OWNER_SECURITY_WEBHOOK_URL,
    });
  }

  return ownerWebhookClient;
}

function shouldMirrorToOwner(incident) {
  if (!OWNER_SECURITY_WEBHOOK_URL) return false;

  return [
    SEVERITY.MEDIUM,
    SEVERITY.HIGH,
    SEVERITY.CRITICAL,
  ].includes(incident.severity);
}

async function sendOwnerSecurityMirror(incident) {
  try {
    if (!shouldMirrorToOwner(incident)) return false;

    const webhook = getOwnerWebhookClient();
    if (!webhook) return false;

    await webhook.send({
      username: 'Goliath Security Network',
      avatarURL: null,
      embeds: [buildIncidentEmbed(incident, { ownerMirror: true })],
    });

    return true;
  } catch (err) {
    console.error(
      '[securitySystem] Failed to send owner security mirror:',
      err
    );
    return false;
  }
}

async function logIncident(guild, options = {}) {
  const guildId = safeString(options.guildId || guild?.id);
  const guildName = safeString(options.guildName || guild?.name);

  const incident = {
    id: options.id || createIncidentId(),
    type: options.type || 'unknown_security_incident',
    severity: options.severity || SEVERITY.LOW,

    guildId,
    guildName,

    actorId: options.actorId || null,
    actorTag: options.actorTag || null,

    targetId: options.targetId || null,
    targetName: options.targetName || null,
    targetType: options.targetType || null,

    reason: options.reason || null,
    actionTaken: options.actionTaken || null,

    metadata: options.metadata || {},

    createdAt: options.createdAt || new Date().toISOString(),
  };

  updateGuildSecurityState(guildId, incident, {
    maxStored: Number(options.maxStored || 250),
  });

  if (options.sendToDiscord !== false && guild) {
    await sendIncidentLog(guild, incident);
  }

  if (options.sendToOwner !== false) {
    await sendOwnerSecurityMirror(incident);
  }

  return incident;
}

function getRecentIncidents(guildId, limit = 25) {
  return readIncidents(guildId).slice(0, limit);
}

function getIncidentsByType(guildId, type, limit = 25) {
  return readIncidents(guildId)
    .filter((incident) => incident.type === type)
    .slice(0, limit);
}

function getIncidentsSince(guildId, sinceMs) {
  const since = Date.now() - Number(sinceMs || 0);

  return readIncidents(guildId).filter((incident) => {
    const created = new Date(incident.createdAt).getTime();
    return Number.isFinite(created) && created >= since;
  });
}

module.exports = {
  SEVERITY,
  INCIDENT_TYPES,

  logIncident,
  sendIncidentLog,
  sendOwnerSecurityMirror,
  buildIncidentEmbed,

  readIncidents,
  writeIncidents,
  getRecentIncidents,
  getIncidentsByType,
  getIncidentsSince,
};