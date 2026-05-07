const { AuditLogEvent, PermissionsBitField } = require('discord.js');
const securityIncidentLogger = require('./securityIncidentLogger');
const guildManager = require('../guild/guildManager');

const {
  SEVERITY,
  INCIDENT_TYPES,
  logIncident,
} = securityIncidentLogger;

const QUARANTINE_ROLE_NAME = 'Goliath Quarantine';

const DEFAULT_CONFIG = {
  enabled: true,

  thresholds: {
    channelDelete: {
      maxActions: 3,
      windowMs: 30_000,
    },
    roleDelete: {
      maxActions: 3,
      windowMs: 30_000,
    },
  },

  lockdown: {
    enabled: true,
    reason: 'Goliath Anti-Nuke emergency lockdown triggered.',
  },

  quarantine: {
    enabled: true,
    roleName: QUARANTINE_ROLE_NAME,
    reason: 'Goliath Anti-Nuke quarantine triggered.',
  },

  ownerAlerts: {
    enabled: true,
  },

  backups: {
    beforeIncident: true,
    afterIncident: true,
  },

  trustedUserIds: [],
  trustedRoleIds: [],
  ignoreBots: false,
};

const actionBuckets = new Map();
const activeLockdowns = new Set();

function getAntiNukeConfig(guildId) {
  const saved = guildManager.getGuildSection(guildId, 'antiNuke', {});

  return {
    ...DEFAULT_CONFIG,
    ...saved,

    thresholds: {
      ...DEFAULT_CONFIG.thresholds,
      ...(saved.thresholds || {}),
      channelDelete: {
        ...DEFAULT_CONFIG.thresholds.channelDelete,
        ...(saved.thresholds?.channelDelete || {}),
      },
      roleDelete: {
        ...DEFAULT_CONFIG.thresholds.roleDelete,
        ...(saved.thresholds?.roleDelete || {}),
      },
    },

    lockdown: {
      ...DEFAULT_CONFIG.lockdown,
      ...(saved.lockdown || {}),
    },

    quarantine: {
      ...DEFAULT_CONFIG.quarantine,
      ...(saved.quarantine || {}),
    },

    ownerAlerts: {
      ...DEFAULT_CONFIG.ownerAlerts,
      ...(saved.ownerAlerts || {}),
    },

    backups: {
      ...DEFAULT_CONFIG.backups,
      ...(saved.backups || {}),
    },

    trustedUserIds: Array.isArray(saved.trustedUserIds)
      ? saved.trustedUserIds.map(String)
      : [],

    trustedRoleIds: Array.isArray(saved.trustedRoleIds)
      ? saved.trustedRoleIds.map(String)
      : [],

    ignoreBots: Boolean(saved.ignoreBots),
  };
}

function bucketKey(guildId, userId, actionType) {
  return `${guildId}:${userId || 'unknown'}:${actionType}`;
}

function addAction(guildId, userId, actionType, windowMs) {
  const key = bucketKey(guildId, userId, actionType);
  const now = Date.now();

  const existing = actionBuckets.get(key) || [];
  const fresh = existing.filter((timestamp) => now - timestamp <= windowMs);

  fresh.push(now);
  actionBuckets.set(key, fresh);

  return fresh.length;
}

function isTrustedMember(member, config) {
  if (!member) return false;

  if (config.trustedUserIds.includes(member.id)) return true;

  return member.roles.cache.some((role) =>
    config.trustedRoleIds.includes(role.id)
  );
}

async function fetchAuditExecutor(guild, auditType) {
  try {
    const logs = await guild.fetchAuditLogs({
      type: auditType,
      limit: 1,
    });

    const entry = logs.entries.first();
    if (!entry) return null;

    const createdRecently = Date.now() - entry.createdTimestamp < 8_000;
    if (!createdRecently) return null;

    return {
      id: entry.executor?.id || null,
      tag: entry.executor?.tag || null,
      bot: Boolean(entry.executor?.bot),
      entry,
    };
  } catch (err) {
    console.error('[AntiNukeManager] Failed to fetch audit executor:', err);
    return null;
  }
}

async function createEmergencyBackup(guild, reason, stage) {
  try {
    const { createServerBackup } = require('../security/serverBackup');

    if (typeof createServerBackup !== 'function') {
      return null;
    }

    return await createServerBackup(guild, {
      createdBy: 'Goliath Anti-Nuke',
      reason,
      stage,
      emergency: true,
      type: 'security_emergency',
    });
  } catch (err) {
    console.error('[AntiNukeManager] Emergency backup failed:', err);
    return null;
  }
}

async function alertOwner(guild, incident) {
  try {
    const owner = await guild.fetchOwner().catch(() => null);
    if (!owner) return false;

    await owner.send(
      [
        `🚨 **Goliath Anti-Nuke Alert**`,
        `Server: **${guild.name}**`,
        `Incident: \`${incident.type}\``,
        `Severity: \`${incident.severity}\``,
        `Actor: ${incident.actorTag || 'Unknown'} (${incident.actorId || 'unknown'})`,
        `Action: ${incident.actionTaken || 'Logged only'}`,
      ].join('\n')
    );

    return true;
  } catch (err) {
    console.error('[AntiNukeManager] Owner alert failed:', err);
    return false;
  }
}

async function emergencyLockdown(guild, reason) {
  if (activeLockdowns.has(guild.id)) return false;
  activeLockdowns.add(guild.id);

  try {
    const everyoneRole = guild.roles.everyone;

    const me = await guild.members.fetchMe().catch(() => null);
    if (!me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return false;
    }

    await everyoneRole.setPermissions(
      everyoneRole.permissions.remove([
        PermissionsBitField.Flags.CreateInstantInvite,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.AddReactions,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
      ]),
      reason
    );

    await logIncident(guild, {
      type: INCIDENT_TYPES.EMERGENCY_LOCKDOWN,
      severity: SEVERITY.CRITICAL,
      reason,
      actionTaken: 'Risky @everyone permissions removed.',
      metadata: {
        removedPermissions: [
          'CreateInstantInvite',
          'SendMessages',
          'AddReactions',
          'Connect',
          'Speak',
        ],
      },
    });

    return true;
  } catch (err) {
    console.error('[AntiNukeManager] Emergency lockdown failed:', err);
    return false;
  }
}

async function getOrCreateQuarantineRole(guild, config) {
  const roleName = config.quarantine.roleName || QUARANTINE_ROLE_NAME;

  let role = guild.roles.cache.find((r) => r.name === roleName);
  if (role) return role;

  role = await guild.roles.create({
    name: roleName,
    color: 0xff0000,
    hoist: false,
    mentionable: false,
    permissions: [],
    reason: 'Goliath Anti-Nuke quarantine role created.',
  });

  return role;
}

async function applyQuarantineOverwrites(guild, quarantineRole) {
  let updated = 0;

  for (const channel of guild.channels.cache.values()) {
    try {
      await channel.permissionOverwrites.edit(
        quarantineRole.id,
        {
          ViewChannel: false,
          SendMessages: false,
          AddReactions: false,
          Connect: false,
          Speak: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
          SendMessagesInThreads: false,
        },
        {
          reason: 'Goliath Anti-Nuke quarantine channel lockdown.',
        }
      );

      updated += 1;
    } catch {
      // Some channel types may reject certain overwrites.
    }
  }

  return updated;
}

async function quarantineMember(guild, member, config, reason) {
  try {
    if (!guild || !member) {
      return {
        success: false,
        reason: 'Missing guild or member.',
      };
    }

    const me = await guild.members.fetchMe().catch(() => null);

    if (!me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return {
        success: false,
        reason: 'Bot is missing Manage Roles.',
      };
    }

    if (member.id === guild.ownerId) {
      return {
        success: false,
        reason: 'Cannot quarantine the server owner.',
      };
    }

    if (member.id === me.id) {
      return {
        success: false,
        reason: 'Cannot quarantine myself.',
      };
    }

    if (member.roles.highest.position >= me.roles.highest.position) {
      return {
        success: false,
        reason: 'Target role is equal or higher than the bot role.',
      };
    }

    const quarantineRole = await getOrCreateQuarantineRole(guild, config);

    if (quarantineRole.position >= me.roles.highest.position) {
      return {
        success: false,
        reason: 'Quarantine role is equal or higher than the bot role.',
      };
    }

    await applyQuarantineOverwrites(guild, quarantineRole);

    const removableRoles = member.roles.cache.filter((role) => {
      if (role.id === guild.id) return false;
      if (role.managed) return false;
      if (role.id === quarantineRole.id) return false;
      if (role.position >= me.roles.highest.position) return false;
      return true;
    });

    await member.roles.remove(
      removableRoles,
      'Goliath Anti-Nuke quarantine: removing risky roles.'
    );

    await member.roles.add(
      quarantineRole,
      reason || config.quarantine.reason
    );

    await logIncident(guild, {
      type: INCIDENT_TYPES.MEMBER_QUARANTINED || 'member_quarantined',
      severity: SEVERITY.CRITICAL,
      actorId: member.id,
      actorTag: member.user?.tag || null,
      targetId: member.id,
      targetName: member.user?.tag || member.user?.username || null,
      targetType: 'member',
      reason,
      actionTaken: 'User was automatically quarantined.',
      metadata: {
        quarantineRoleId: quarantineRole.id,
        removedRoleIds: removableRoles.map((role) => role.id),
      },
    });

    return {
      success: true,
      quarantineRoleId: quarantineRole.id,
      removedRoleIds: removableRoles.map((role) => role.id),
    };
  } catch (err) {
    console.error('[AntiNukeManager] Failed to quarantine member:', err);

    return {
      success: false,
      reason: err.message,
    };
  }
}

async function handleDeleteEvent({
  guild,
  target,
  actionType,
  auditType,
  incidentType,
  massIncidentType,
}) {
  if (!guild) return null;

  const config = getAntiNukeConfig(guild.id);
  if (!config.enabled) return null;

  const executor = await fetchAuditExecutor(guild, auditType);
  if (!executor?.id) return null;

  if (config.ignoreBots && executor.bot) return null;

  const member = await guild.members.fetch(executor.id).catch(() => null);
  if (isTrustedMember(member, config)) return null;

  const threshold =
    actionType === 'channelDelete'
      ? config.thresholds.channelDelete
      : config.thresholds.roleDelete;

  const count = addAction(
    guild.id,
    executor.id,
    actionType,
    threshold.windowMs
  );

  const normalIncident = await logIncident(guild, {
    type: incidentType,
    severity: SEVERITY.MEDIUM,
    actorId: executor.id,
    actorTag: executor.tag,
    targetId: target?.id || null,
    targetName: target?.name || target?.username || null,
    targetType: actionType,
    reason: `${actionType} detected.`,
    metadata: {
      actionCount: count,
      threshold: threshold.maxActions,
      windowMs: threshold.windowMs,
    },
  });

  if (count < threshold.maxActions) {
    return normalIncident;
  }

  let beforeBackup = null;
  let afterBackup = null;
  let lockdownTriggered = false;
  let quarantineResult = {
    success: false,
    reason: 'Quarantine not attempted.',
  };

  if (config.backups.beforeIncident) {
    beforeBackup = await createEmergencyBackup(
      guild,
      `Before anti-nuke response: ${massIncidentType}`,
      'before_incident_response'
    );
  }

  if (config.lockdown.enabled) {
    lockdownTriggered = await emergencyLockdown(guild, config.lockdown.reason);
  }

  if (config.quarantine.enabled && member) {
    quarantineResult = await quarantineMember(
      guild,
      member,
      config,
      `Mass ${actionType} detected.`
    );
  }

  const massIncident = await logIncident(guild, {
    type: massIncidentType,
    severity: SEVERITY.CRITICAL,
    actorId: executor.id,
    actorTag: executor.tag,
    targetId: target?.id || null,
    targetName: target?.name || null,
    targetType: actionType,
    reason: `Mass ${actionType} detected.`,
    actionTaken: [
      lockdownTriggered ? 'Emergency lockdown triggered.' : 'Lockdown not applied.',
      quarantineResult.success ? 'Attacker quarantined.' : `Quarantine failed/skipped: ${quarantineResult.reason}`,
    ].join(' '),
    metadata: {
      actionCount: count,
      threshold: threshold.maxActions,
      windowMs: threshold.windowMs,
      beforeBackupCreated: Boolean(beforeBackup),
      lockdownTriggered,
      quarantine: quarantineResult,
    },
  });

  if (config.ownerAlerts.enabled) {
    await alertOwner(guild, massIncident);
  }

  if (config.backups.afterIncident) {
    afterBackup = await createEmergencyBackup(
      guild,
      `After anti-nuke response: ${massIncidentType}`,
      'after_incident_response'
    );
  }

  if (afterBackup) {
    await logIncident(guild, {
      type: INCIDENT_TYPES.BACKUP_CREATED,
      severity: SEVERITY.HIGH,
      reason: 'Emergency after-incident backup created.',
      actionTaken: 'Backup created after anti-nuke response.',
      metadata: {
        backupId: afterBackup.backupId || null,
        backupCreatedAt: afterBackup.createdAt || null,
        relatedIncidentId: massIncident.id,
      },
    });
  }

  return massIncident;
}

async function handleChannelDelete(channel) {
  return handleDeleteEvent({
    guild: channel.guild,
    target: channel,
    actionType: 'channelDelete',
    auditType: AuditLogEvent.ChannelDelete,
    incidentType: INCIDENT_TYPES.CHANNEL_DELETE,
    massIncidentType: INCIDENT_TYPES.MASS_CHANNEL_DELETE,
  });
}

async function handleRoleDelete(role) {
  return handleDeleteEvent({
    guild: role.guild,
    target: role,
    actionType: 'roleDelete',
    auditType: AuditLogEvent.RoleDelete,
    incidentType: INCIDENT_TYPES.ROLE_DELETE,
    massIncidentType: INCIDENT_TYPES.MASS_ROLE_DELETE,
  });
}

module.exports = {
  DEFAULT_CONFIG,
  QUARANTINE_ROLE_NAME,

  getAntiNukeConfig,
  handleChannelDelete,
  handleRoleDelete,

  emergencyLockdown,
  quarantineMember,
  alertOwner,
  createEmergencyBackup,
};