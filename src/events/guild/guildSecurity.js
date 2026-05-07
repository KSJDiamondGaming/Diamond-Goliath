const { AuditLogEvent } = require('discord.js');

const antiNukeManager = require('../../security/antiNukeManager');
const securityIncidentLogger = require('../../security/securityIncidentLogger');

const {
  SEVERITY,
  INCIDENT_TYPES,
  logIncident,
} = securityIncidentLogger;

function getChangedFields(oldGuild, newGuild) {
  const changes = [];

  if (oldGuild.name !== newGuild.name) {
    changes.push({
      field: 'name',
      before: oldGuild.name,
      after: newGuild.name,
    });
  }

  if (oldGuild.icon !== newGuild.icon) {
    changes.push({
      field: 'icon',
      before: oldGuild.icon,
      after: newGuild.icon,
    });
  }

  if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
    changes.push({
      field: 'vanityURLCode',
      before: oldGuild.vanityURLCode,
      after: newGuild.vanityURLCode,
    });
  }

  if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
    changes.push({
      field: 'verificationLevel',
      before: oldGuild.verificationLevel,
      after: newGuild.verificationLevel,
    });
  }

  if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) {
    changes.push({
      field: 'explicitContentFilter',
      before: oldGuild.explicitContentFilter,
      after: newGuild.explicitContentFilter,
    });
  }

  if (oldGuild.defaultMessageNotifications !== newGuild.defaultMessageNotifications) {
    changes.push({
      field: 'defaultMessageNotifications',
      before: oldGuild.defaultMessageNotifications,
      after: newGuild.defaultMessageNotifications,
    });
  }

  return changes;
}

function isDangerousGuildChange(field) {
  return [
    'vanityURLCode',
    'verificationLevel',
    'explicitContentFilter',
  ].includes(field);
}

async function getAuditExecutor(guild, auditType) {
  const logs = await guild.fetchAuditLogs({
    type: auditType,
    limit: 1,
  }).catch(() => null);

  const entry = logs?.entries?.first();

  return {
    entry,
    executorId: entry?.executor?.id || null,
    executorTag: entry?.executor?.tag || null,
  };
}

async function handleGuildUpdate(oldGuild, newGuild) {
  if (!newGuild) return;

  const changes = getChangedFields(oldGuild, newGuild);
  if (!changes.length) return;

  const dangerousChanges = changes.filter((change) =>
    isDangerousGuildChange(change.field)
  );

  const { executorId, executorTag } = await getAuditExecutor(
    newGuild,
    AuditLogEvent.GuildUpdate
  );

  const config = antiNukeManager.getAntiNukeConfig(newGuild.id);

  const member = executorId
    ? await newGuild.members.fetch(executorId).catch(() => null)
    : null;

  let quarantineResult = {
    success: false,
    reason: 'Quarantine not attempted.',
  };

  if (
    member &&
    typeof antiNukeManager.quarantineMember === 'function' &&
    config.quarantine?.enabled &&
    dangerousChanges.length
  ) {
    quarantineResult = await antiNukeManager.quarantineMember(
      newGuild,
      member,
      config,
      'Dangerous guild/server settings modified.'
    );
  }

  const incident = await logIncident(newGuild, {
    type:
      INCIDENT_TYPES.SUSPICIOUS_ADMIN_ACTION ||
      'suspicious_admin_action',

    severity: dangerousChanges.length
      ? SEVERITY.CRITICAL
      : SEVERITY.HIGH,

    actorId: executorId,
    actorTag: executorTag,

    targetId: newGuild.id,
    targetName: newGuild.name,
    targetType: 'guild',

    reason: dangerousChanges.length
      ? 'Dangerous guild/server settings modified.'
      : 'Guild/server settings modified.',

    actionTaken: dangerousChanges.length
      ? quarantineResult.success
        ? 'Executor quarantined automatically.'
        : `Quarantine failed/skipped: ${quarantineResult.reason}`
      : 'Incident logged.',

    metadata: {
      changes,
      dangerousChanges,
      quarantine: quarantineResult,
    },
  });

  if (
    dangerousChanges.length &&
    typeof antiNukeManager.alertOwner === 'function'
  ) {
    await antiNukeManager.alertOwner(newGuild, incident);
  }
}

async function handleWebhookUpdate(channel) {
  if (!channel?.guild) return;

  const guild = channel.guild;
  const config = antiNukeManager.getAntiNukeConfig(guild.id);

  if (!config.enabled) return;

  const auditTypes = [
    AuditLogEvent.WebhookCreate,
    AuditLogEvent.WebhookUpdate,
    AuditLogEvent.WebhookDelete,
  ];

  let auditData = null;

  for (const auditType of auditTypes) {
    const data = await getAuditExecutor(guild, auditType);

    if (data?.executorId) {
      auditData = data;
      break;
    }
  }

  if (!auditData?.executorId) return;

  const member = await guild.members.fetch(auditData.executorId).catch(() => null);

  let quarantineResult = {
    success: false,
    reason: 'Quarantine not attempted.',
  };

  if (
    member &&
    typeof antiNukeManager.quarantineMember === 'function' &&
    config.quarantine?.enabled
  ) {
    quarantineResult = await antiNukeManager.quarantineMember(
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

    severity: SEVERITY.CRITICAL,

    actorId: auditData.executorId,
    actorTag: auditData.executorTag,

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
      auditAction: auditData.entry?.action || null,
      quarantine: quarantineResult,
    },
  });

  if (typeof antiNukeManager.alertOwner === 'function') {
    await antiNukeManager.alertOwner(guild, incident);
  }
}

module.exports = [
  {
    name: 'guildUpdate',

    async execute(oldGuild, newGuild) {
      try {
        await handleGuildUpdate(oldGuild, newGuild);
      } catch (error) {
        console.error('[guildSecurity] guildUpdate error:', error);
      }
    },
  },

  {
    name: 'webhookUpdate',

    async execute(channel) {
      try {
        await handleWebhookUpdate(channel);
      } catch (error) {
        console.error('[guildSecurity] webhookUpdate error:', error);
      }
    },
  },
];