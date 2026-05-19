const {
  AuditLogEvent,
  PermissionsBitField,
  PermissionFlagsBits,
} = require('discord.js');

const securitySystem = require('./securitySystem');
const guildManager = require('../guild/guildManager');

const {
  enableLockdown,
  getLockdownState,
  getLockdownModeFromSeverity,
} = require('./lockdownSystem');

const {
  validateBotHierarchy,
  hasDangerousPermissions,
  canManageTargetMember,
} = require('./securitySystem');

const {
  SEVERITY,
  INCIDENT_TYPES,
  logIncident,
  calculateIncidentSeverity,
} = securitySystem;

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

setInterval(() => {
  const now = Date.now();

  for (const [key, timestamps] of actionBuckets.entries()) {
    const fresh = timestamps.filter((timestamp) => now - timestamp < 60_000);

    if (fresh.length) {
      actionBuckets.set(key, fresh);
    } else {
      actionBuckets.delete(key);
    }
  }
}, 60_000);

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

  if (config.trustedUserIds.includes(member.id)) {
    return true;
  }

  const trustedRoleMatch = member.roles.cache.some((role) =>
    config.trustedRoleIds.includes(role.id)
  );

  if (!trustedRoleMatch) {
    return false;
  }

  return hasDangerousPermissions(member);
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
    console.error('[securitySystem] Failed to fetch audit executor:', err);
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
    console.error('[securitySystem] Emergency backup failed:', err);
    return null;
  }
}

async function alertOwner(guild, incident) {
  try {
    const owner = await guild.fetchOwner().catch(() => null);
    if (!owner) return false;

    await owner.send(
      [
        '🚨 **Goliath Anti-Nuke Alert**',
        `Server: **${guild.name}**`,
        `Incident: \`${incident.type}\``,
        `Severity: \`${incident.severity}\``,
        `Actor: ${incident.actorTag || 'Unknown'} (${incident.actorId || 'unknown'})`,
        `Action: ${incident.actionTaken || 'Logged only'}`,
      ].join('\n')
    );

    return true;
  } catch (err) {
    console.error('[securitySystem] Owner alert failed:', err);
    return false;
  }
}

async function emergencyLockdown(guild, reason) {
  if (!guild) return false;

  const current = getLockdownState(guild.id);

  if (current.active) {
    return false;
  }

  const result = await enableLockdown(guild, {
    reason: reason || 'Goliath Anti-Nuke emergency lockdown triggered.',
    enabledBy: 'anti_nuke',
    enabledByTag: 'Goliath Anti-Nuke',
  });

  if (!result.success) {
    return false;
  }

  await logIncident(guild, {
    type: INCIDENT_TYPES.EMERGENCY_LOCKDOWN,
    severity: incidentAnalysis.severity,
    reason,
    actionTaken: 'Emergency lockdown panic protection enabled.',
    metadata: {
      source: 'anti_nuke',
      protectedChannels: result.locked,
    },
  });

  return true;
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
    const manageable = canManageTargetMember(guild, member);

    if (!manageable.allowed) {
      return {
        success: false,
        reason: manageable.reason,
      };
    }

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
      severity: incidentAnalysis.severity,
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
    console.error('[securitySystem] Failed to quarantine member:', err);

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

  const hierarchy = validateBotHierarchy(guild);

  if (!hierarchy.valid) {
    console.warn(
      `[AntiNuke] Blocked protection system in ${guild.name}: ${hierarchy.reason}`
    );

    return null;
  }

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

  const lockdownProfile = getLockdownModeFromSeverity(
  incidentAnalysis.severity
);

  if (config.lockdown.enabled) {
    const lockdownResult = await enableLockdown(guild, {
      reason: config.lockdown.reason,
      enabledBy: 'anti_nuke',
      enabledByTag: 'Goliath Anti-Nuke',

      severity: incidentAnalysis.severity,
      lockdownMode: lockdownProfile.mode,
      slowmodeSeconds: lockdownProfile.slowmodeSeconds,
      lockText: lockdownProfile.lockText,
      lockVoice: lockdownProfile.lockVoice,
      lockThreads: lockdownProfile.lockThreads,
      lockCommands: lockdownProfile.lockCommands,
    });

    lockdownTriggered = Boolean(lockdownResult?.success);
  }

  if (config.quarantine.enabled && member) {
    quarantineResult = await quarantineMember(
      guild,
      member,
      config,
      `Mass ${actionType} detected.`
    );
  }

  const incidentAnalysis = calculateIncidentSeverity(massIncidentType, {
    actionCount: count,
    threshold: threshold.maxActions,
    actorIsBot: executor.bot || false,
    actorTrusted: false,
    rollbackAvailable: Boolean(beforeBackup),
  });

  const massIncident = await logIncident(guild, {
    type: massIncidentType,
    severity: incidentAnalysis.severity,
    actorId: executor.id,
    actorTag: executor.tag,
    targetId: target?.id || null,
    targetName: target?.name || null,
    targetType: actionType,
    reason: `Mass ${actionType} detected.`,
    actionTaken: [
      lockdownTriggered ? 'Emergency lockdown triggered.' : 'Lockdown not applied.',
      quarantineResult.success
        ? 'Attacker quarantined.'
        : `Quarantine failed/skipped: ${quarantineResult.reason}`,
    ].join(' '),
    metadata: {
      actionCount: count,
      threshold: threshold.maxActions,
      windowMs: threshold.windowMs,
      beforeBackupCreated: Boolean(beforeBackup),
      lockdownTriggered,
      lockdownMode: lockdownProfile.mode,
      lockdownSeverity: incidentAnalysis.severity,
      quarantine: quarantineResult,
      severityScore: incidentAnalysis.score,
      recommendedActions: incidentAnalysis.recommendedActions,
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

async function handleRoleCreate(role) {
  const guild = role.guild;
  if (!guild) return null;

  const config = getAntiNukeConfig(guild.id);
  if (!config.enabled) return null;

  const hierarchy = validateBotHierarchy(guild);
  if (!hierarchy.valid) return null;

  const executor = await fetchAuditExecutor(guild, AuditLogEvent.RoleCreate);
  if (!executor?.id) return null;

  if (config.ignoreBots && executor.bot) return null;

  const member = await guild.members.fetch(executor.id).catch(() => null);
  if (isTrustedMember(member, config)) return null;

  const dangerous =
    role.permissions.has(PermissionFlagsBits.Administrator) ||
    role.permissions.has(PermissionFlagsBits.ManageGuild) ||
    role.permissions.has(PermissionFlagsBits.ManageRoles) ||
    role.permissions.has(PermissionFlagsBits.ManageChannels) ||
    role.permissions.has(PermissionFlagsBits.BanMembers) ||
    role.permissions.has(PermissionFlagsBits.KickMembers) ||
    role.permissions.has(PermissionFlagsBits.ManageWebhooks);

  if (!dangerous) return null;

  if (config.backups.beforeIncident) {
    await createEmergencyBackup(
      guild,
      'Security escalation detected.',
      'security_escalation'
    );
  }

  await logIncident(guild, {
    type: INCIDENT_TYPES.DANGEROUS_ROLE_CREATE || 'dangerous_role_create',
    severity: incidentAnalysis.severity,
    actorId: executor.id,
    actorTag: executor.tag,
    targetId: role.id,
    targetName: role.name,
    targetType: 'role',
    reason: 'Dangerous role created.',
    actionTaken: 'Role creation flagged as suspicious.',
  });

  if (config.quarantine.enabled && member) {
    await quarantineMember(
      guild,
      member,
      config,
      'Dangerous role creation detected.'
    );
  }

  return true;
}

async function handleRoleUpdate(oldRole, newRole) {
  const guild = newRole.guild;
  if (!guild) return null;

  const config = getAntiNukeConfig(guild.id);
  if (!config.enabled) return null;

  const hierarchy = validateBotHierarchy(guild);
  if (!hierarchy.valid) return null;

  const executor = await fetchAuditExecutor(guild, AuditLogEvent.RoleUpdate);
  if (!executor?.id) return null;

  if (config.ignoreBots && executor.bot) return null;

  const member = await guild.members.fetch(executor.id).catch(() => null);
  if (isTrustedMember(member, config)) return null;

  const dangerousFlags = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.ManageWebhooks,
  ];

  const addedDangerous = dangerousFlags.filter(
    (flag) =>
      !oldRole.permissions.has(flag) &&
      newRole.permissions.has(flag)
  );

  if (!addedDangerous.length) return null;

  if (config.backups.beforeIncident) {
    await createEmergencyBackup(
      guild,
      'Security escalation detected.',
      'security_escalation'
    );
  }

  await logIncident(guild, {
    type:
      INCIDENT_TYPES.DANGEROUS_ROLE_PERMISSION_ADDED ||
      'dangerous_role_permission_added',
    severity: incidentAnalysis.severity,
    actorId: executor.id,
    actorTag: executor.tag,
    targetId: newRole.id,
    targetName: newRole.name,
    targetType: 'role',
    reason: 'Dangerous permissions were added to an existing role.',
    actionTaken: 'Role permission escalation flagged.',
    metadata: {
      roleId: newRole.id,
      roleName: newRole.name,
      addedPermissionCount: addedDangerous.length,
    },
  });

  if (config.quarantine.enabled && member) {
    await quarantineMember(
      guild,
      member,
      config,
      'Dangerous role permission escalation detected.'
    );
  }

  return true;
}

async function handleWebhookCreate(webhook) {
  const guild = webhook.guild;
  if (!guild) return null;

  const config = getAntiNukeConfig(guild.id);
  if (!config.enabled) return null;

  const hierarchy = validateBotHierarchy(guild);
  if (!hierarchy.valid) return null;

  const executor = await fetchAuditExecutor(guild, AuditLogEvent.WebhookCreate);
  if (!executor?.id) return null;

  if (config.ignoreBots && executor.bot) return null;

  const member = await guild.members.fetch(executor.id).catch(() => null);
  if (isTrustedMember(member, config)) return null;

  if (config.backups.beforeIncident) {
    await createEmergencyBackup(
      guild,
      'Security escalation detected.',
      'security_escalation'
    );
  }

  await logIncident(guild, {
    type: INCIDENT_TYPES.WEBHOOK_CREATE || 'webhook_create',
    severity: SEVERITY.HIGH,
    actorId: executor.id,
    actorTag: executor.tag,
    targetId: webhook.id,
    targetName: webhook.name,
    targetType: 'webhook',
    reason: 'Webhook creation detected.',
    actionTaken: 'Webhook flagged for monitoring.',
  });

  if (config.quarantine.enabled && member) {
    await quarantineMember(
      guild,
      member,
      config,
      'Suspicious webhook creation detected.'
    );
  }

  return true;
}

async function handleWebhookDelete(webhook) {
  const guild = webhook.guild;
  if (!guild) return null;

  const config = getAntiNukeConfig(guild.id);
  if (!config.enabled) return null;

  const hierarchy = validateBotHierarchy(guild);
  if (!hierarchy.valid) return null;

  const executor = await fetchAuditExecutor(guild, AuditLogEvent.WebhookDelete);
  if (!executor?.id) return null;

  if (config.ignoreBots && executor.bot) return null;

  const member = await guild.members.fetch(executor.id).catch(() => null);
  if (isTrustedMember(member, config)) return null;

  if (config.backups.beforeIncident) {
    await createEmergencyBackup(
      guild,
      'Security escalation detected.',
      'security_escalation'
    );
  }

  await logIncident(guild, {
    type: INCIDENT_TYPES.WEBHOOK_DELETE || 'webhook_delete',
    severity: incidentAnalysis.severity,
    actorId: executor.id,
    actorTag: executor.tag,
    targetId: webhook.id,
    targetName: webhook.name,
    targetType: 'webhook',
    reason: 'Webhook deletion detected.',
    actionTaken: 'Webhook deletion flagged as suspicious.',
  });

  if (config.quarantine.enabled && member) {
    await quarantineMember(
      guild,
      member,
      config,
      'Suspicious webhook deletion detected.'
    );
  }

  return true;
}

async function handleWebhookUpdate(channel) {
  if (!channel?.guild) return null;

  const guild = channel.guild;
  const config = getAntiNukeConfig(guild.id);

  if (!config.enabled) return null;

  const hierarchy = validateBotHierarchy(guild);
  if (!hierarchy.valid) return null;

  const auditTypes = [
    AuditLogEvent.WebhookCreate,
    AuditLogEvent.WebhookUpdate,
    AuditLogEvent.WebhookDelete,
  ];

  let executor = null;

  for (const auditType of auditTypes) {
    executor = await fetchAuditExecutor(guild, auditType);
    if (executor?.id) break;
  }

  if (!executor?.id) return null;
  if (config.ignoreBots && executor.bot) return null;

  const member = await guild.members.fetch(executor.id).catch(() => null);
  if (isTrustedMember(member, config)) return null;

  let quarantineResult = {
    success: false,
    reason: 'Quarantine not attempted.',
  };

  if (config.quarantine.enabled && member) {
    quarantineResult = await quarantineMember(
      guild,
      member,
      config,
      'Suspicious webhook activity detected.'
    );
  }

  const incident = await logIncident(guild, {
    type:
      INCIDENT_TYPES.SUSPICIOUS_WEBHOOK_ACTIVITY ||
      INCIDENT_TYPES.WEBHOOK_UPDATE ||
      'suspicious_webhook_activity',

    severity: incidentAnalysis.severity,

    actorId: executor.id,
    actorTag: executor.tag,

    targetId: channel.id,
    targetName: channel.name,
    targetType: 'webhook_channel',

    reason: `Webhook activity detected in #${channel.name}.`,

    actionTaken: quarantineResult.success
      ? 'Executor quarantined automatically.'
      : `Quarantine failed/skipped: ${quarantineResult.reason}`,

    metadata: {
      channelId: channel.id,
      channelName: channel.name,
      auditAction: executor.entry?.action || null,
      quarantine: quarantineResult,
    },
  });

  if (typeof alertOwner === 'function') {
    await alertOwner(guild, incident);
  }

  return incident;
}

module.exports = {
  DEFAULT_CONFIG,
  QUARANTINE_ROLE_NAME,

  getAntiNukeConfig,

  handleChannelDelete,
  handleRoleDelete,
  handleWebhookCreate,
  handleWebhookDelete,
  handleWebhookUpdate,
  handleRoleCreate,
  handleRoleUpdate,

  emergencyLockdown,
  quarantineMember,
  alertOwner,
  createEmergencyBackup,
};