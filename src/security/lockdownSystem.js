const { ChannelType } = require('discord.js');
const guildManager = require('../guild/guildManager');

const activeReminderIntervals = new Map();

const REMINDER_INTERVAL_MS = 5 * 60 * 1000;
const REMINDER_DELETE_MS = 60 * 1000;

function emptyLockdownState() {
  return {
    active: false,
    enabledBy: null,
    enabledAt: null,
    reason: null,
    reminderChannelId: null,
    reminderUserId: null,
    lastReminderAt: null,
    channels: [],
    bypassRoleIds: [],
  };
}

function normalizeRoleIds(roleIds = []) {
  if (!Array.isArray(roleIds)) return [];

  return [
    ...new Set(
      roleIds
        .map(roleId => String(roleId || '').trim())
        .filter(roleId => /^\d{16,20}$/.test(roleId))
    ),
  ];
}

function getIncidentLogger() {
  return require('./securitySystem');
}

function getLockdownState(guildId) {
  const security = guildManager.getSecurityConfig(guildId);

  const state = {
    ...emptyLockdownState(),
    ...(security.lockdown || {}),
  };

  state.bypassRoleIds = normalizeRoleIds(state.bypassRoleIds);
  state.channels = Array.isArray(state.channels) ? state.channels : [];

  return state;
}

function getBypassRoleIds(guildId) {
  const state = getLockdownState(guildId);
  return normalizeRoleIds(state.bypassRoleIds);
}

function saveLockdownState(guild, lockdownData) {
  const nextLockdown = {
    ...emptyLockdownState(),
    ...lockdownData,
    bypassRoleIds: normalizeRoleIds(lockdownData.bypassRoleIds),
    channels: Array.isArray(lockdownData.channels)
      ? lockdownData.channels
      : [],
  };

  return guildManager.updateSecurityConfig(
    guild.id,
    security => ({
      ...security,
      lastLockdownAt: nextLockdown.active
        ? new Date().toISOString()
        : security.lastLockdownAt || null,
      lockdown: nextLockdown,
    }),
    guild
  );
}

function clearLockdownState(guild) {
  const current = getLockdownState(guild.id);

  return saveLockdownState(guild, {
    ...emptyLockdownState(),
    bypassRoleIds: current.bypassRoleIds,
  });
}

function stopLockdownReminder(guildId) {
  const interval = activeReminderIntervals.get(guildId);

  if (interval) {
    clearInterval(interval);
    activeReminderIntervals.delete(guildId);
  }
}

function getTextLockPermissions() {
  return {
    SendMessages: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false,
    SendMessagesInThreads: false,
    AddReactions: false,
    UseApplicationCommands: false,
  };
}

function getVoiceLockPermissions() {
  return {
    Connect: false,
    Speak: false,
    Stream: false,
  };
}

function getRestorePermissions() {
  return {
    SendMessages: null,
    CreatePublicThreads: null,
    CreatePrivateThreads: null,
    SendMessagesInThreads: null,
    AddReactions: null,
    UseApplicationCommands: null,
    Connect: null,
    Speak: null,
    Stream: null,
  };
}

function getTextBypassPermissions() {
  return {
    SendMessages: true,
    AddReactions: true,
    UseApplicationCommands: true,
    SendMessagesInThreads: true,
    CreatePublicThreads: true,
    CreatePrivateThreads: true,
  };
}

function getVoiceBypassPermissions() {
  return {
    Connect: true,
    Speak: true,
    Stream: true,
  };
}

function getBypassRestorePermissions() {
  return {
    SendMessages: null,
    AddReactions: null,
    UseApplicationCommands: null,
    SendMessagesInThreads: null,
    CreatePublicThreads: null,
    CreatePrivateThreads: null,
    Connect: null,
    Speak: null,
    Stream: null,
  };
}

function getLockdownModeFromSeverity(severity = 'low') {
  switch (String(severity).toLowerCase()) {
    case 'critical':
      return {
        mode: 'emergency',
        slowmodeSeconds: 21600,
        lockText: true,
        lockVoice: true,
        lockThreads: true,
        lockCommands: true,
      };

    case 'high':
      return {
        mode: 'high',
        slowmodeSeconds: 3600,
        lockText: true,
        lockVoice: true,
        lockThreads: true,
        lockCommands: true,
      };

    case 'medium':
      return {
        mode: 'medium',
        slowmodeSeconds: 600,
        lockText: true,
        lockVoice: false,
        lockThreads: true,
        lockCommands: false,
      };

    case 'low':
    default:
      return {
        mode: 'low',
        slowmodeSeconds: 60,
        lockText: false,
        lockVoice: false,
        lockThreads: false,
        lockCommands: false,
      };
  }
}

async function applyBypassRoleOverwrites(channel, guild, bypassRoleIds, isText, isVoice) {
  if (!bypassRoleIds.length) return 0;

  let applied = 0;

  for (const roleId of bypassRoleIds) {
    const role = guild.roles.cache.get(roleId);

    if (!role) continue;
    if (role.managed) continue;
    if (role.id === guild.id) continue;

    const bypassPerms = {};

    if (isText) Object.assign(bypassPerms, getTextBypassPermissions());
    if (isVoice) Object.assign(bypassPerms, getVoiceBypassPermissions());

    if (!Object.keys(bypassPerms).length) continue;

    try {
      await channel.permissionOverwrites.edit(role.id, bypassPerms, {
        reason: 'Goliath lockdown bypass role.',
      });

      applied++;
    } catch (error) {
      console.warn(
        `[LockdownSystem] Failed bypass overwrite for role ${role.id} in #${channel.name}:`,
        error.message
      );
    }
  }

  return applied;
}

async function restoreBypassRoleOverwrites(channel, guild, bypassRoleIds) {
  if (!bypassRoleIds.length) return 0;

  let restored = 0;

  for (const roleId of bypassRoleIds) {
    const role = guild.roles.cache.get(roleId);

    if (!role) continue;
    if (role.managed) continue;
    if (role.id === guild.id) continue;

    try {
      await channel.permissionOverwrites.edit(
        role.id,
        getBypassRestorePermissions(),
        {
          reason: 'Goliath lockdown bypass restore.',
        }
      );

      restored++;
    } catch (error) {
      console.warn(
        `[LockdownSystem] Failed bypass restore for role ${role.id} in #${channel.name}:`,
        error.message
      );
    }
  }

  return restored;
}

function startLockdownReminder(guild, reminderChannelId, reminderUserId) {
  if (!guild || !reminderChannelId || !reminderUserId) return false;

  stopLockdownReminder(guild.id);

  const interval = setInterval(async () => {
    try {
      const latest = getLockdownState(guild.id);

      if (!latest.active) {
        stopLockdownReminder(guild.id);
        return;
      }

      const channel = await guild.channels
        .fetch(latest.reminderChannelId || reminderChannelId)
        .catch(() => null);

      if (!channel || !channel.isTextBased()) return;

      const reminderMessage = await channel.send({
        content:
          `⚠️ <@${latest.reminderUserId || reminderUserId}> Lockdown is still **ACTIVE**. ⚠️\n` +
          `Remove the lockdown as soon as the server is secure.`,
      });

      saveLockdownState(guild, {
        ...latest,
        lastReminderAt: Date.now(),
      });

      setTimeout(() => {
        reminderMessage.delete().catch(() => null);
      }, REMINDER_DELETE_MS);
    } catch (error) {
      console.warn('[LockdownSystem] Reminder interval failed:', error.message);
    }
  }, REMINDER_INTERVAL_MS);

  activeReminderIntervals.set(guild.id, interval);
  return true;
}

async function enableLockdown(guild, options = {}) {
  if (!guild) {
    return {
      success: false,
      reason: 'Missing guild.',
      locked: 0,
      bypassApplied: 0,
    };
  }

  const current = getLockdownState(guild.id);

  if (current.active) {
    return {
      success: false,
      alreadyActive: true,
      reason: 'Lockdown is already active.',
      locked: 0,
      bypassApplied: 0,
    };
  }

  const reason = options.reason || 'No reason provided';
  const enabledBy = options.enabledBy || null;
  const enabledByTag = options.enabledByTag || 'Goliath System';
  const reminderChannelId = options.reminderChannelId || null;
  const reminderUserId = options.reminderUserId || null;

  const bypassRoleIds = normalizeRoleIds(
    options.bypassRoleIds || current.bypassRoleIds
  );

  const enabledAt = Date.now();

  const savedChannels = [];
  const channels = await guild.channels.fetch();

  let locked = 0;
  let bypassApplied = 0;

  for (const [, channel] of channels) {
    if (!channel || !channel.manageable) continue;

    const isText =
      channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.GuildAnnouncement ||
      channel.type === ChannelType.GuildForum;

    const isVoice =
      channel.type === ChannelType.GuildVoice ||
      channel.type === ChannelType.GuildStageVoice;

    if (!isText && !isVoice) continue;

    const slowmode = channel.rateLimitPerUser || 0;
    const perms = {};

    if (isText) Object.assign(perms, getTextLockPermissions());
    if (isVoice) Object.assign(perms, getVoiceLockPermissions());

    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, perms, {
        reason: `Lockdown enabled by ${enabledByTag}: ${reason}`,
      });

      const bypassCount = await applyBypassRoleOverwrites(
        channel,
        guild,
        bypassRoleIds,
        isText,
        isVoice
      );

      bypassApplied += bypassCount;

      savedChannels.push({
        id: channel.id,
        slowmode,
      });

      if (isText && typeof channel.setRateLimitPerUser === 'function') {
        await channel.setRateLimitPerUser(
          10,
          `Lockdown enabled by ${enabledByTag}`
        );
      }

      locked++;
    } catch (error) {
      console.warn(
        `[LockdownSystem] Failed to lock #${channel.name}:`,
        error.message
      );
    }
  }

  const lockdownExpiresAt =
  options.durationMs && Number(options.durationMs) > 0
    ? enabledAt + Number(options.durationMs)
    : null;

  saveLockdownState(guild, {
    active: true,
    enabledBy,
    enabledAt,
    reason,

    lockdownMode: options.lockdownMode || null,
    severity: options.severity || null,
    lockdownStartedAt: enabledAt,
    lockdownExpiresAt,

    reminderChannelId,
    reminderUserId,
    lastReminderAt: null,
    channels: savedChannels,
    bypassRoleIds,
});

  if (reminderChannelId && reminderUserId) {
    startLockdownReminder(guild, reminderChannelId, reminderUserId);
  }

  const {
    logIncident,
    INCIDENT_TYPES,
    SEVERITY,
  } = getIncidentLogger();

  await logIncident(guild, {
    type: INCIDENT_TYPES.LOCKDOWN_ENABLED,
    severity: SEVERITY.HIGH,
    actorId: enabledBy,
    actorTag: enabledByTag,
    reason,
    actionTaken: 'Server lockdown enabled.',
    metadata: {
      lockedChannels: locked,
      bypassRoles: bypassRoleIds.length,

      lockdownMode: options.lockdownMode || null,
      severity: options.severity || null,
      lockdownStartedAt: enabledAt,
      lockdownExpiresAt,

      reminderEnabled: Boolean(reminderChannelId && reminderUserId),
      reminderChannelId,
      reminderUserId,
    },
  });

  return {
    success: true,
    alreadyActive: false,
    locked,
    bypassApplied,
    reason,
    lockdownMode: options.lockdownMode || null,
    severity: options.severity || null,
    expiresAt: lockdownExpiresAt,
  };
}

async function disableLockdown(guild, options = {}) {
  if (!guild) {
    return {
      success: false,
      reason: 'Missing guild.',
      restored: 0,
      bypassRestored: 0,
    };
  }

  const state = getLockdownState(guild.id);

  if (!state.active) {
    return {
      success: false,
      notActive: true,
      reason: 'Lockdown is not currently active.',
      restored: 0,
      bypassRestored: 0,
    };
  }

  const disabledByTag = options.disabledByTag || 'Goliath System';
  const reason = options.reason || 'Lockdown disabled';
  const bypassRoleIds = normalizeRoleIds(state.bypassRoleIds);

  let restored = 0;
  let bypassRestored = 0;

  for (const saved of state.channels || []) {
    const channel = await guild.channels.fetch(saved.id).catch(() => null);

    if (!channel || !channel.manageable) continue;

    try {
      await channel.permissionOverwrites.edit(
        guild.roles.everyone,
        getRestorePermissions(),
        {
          reason: `${reason} by ${disabledByTag}`,
        }
      );

      bypassRestored += await restoreBypassRoleOverwrites(
        channel,
        guild,
        bypassRoleIds
      );

      if (typeof channel.setRateLimitPerUser === 'function') {
        await channel.setRateLimitPerUser(
          saved.slowmode || 0,
          `${reason} by ${disabledByTag}`
        );
      }

      restored++;
    } catch (error) {
      console.warn(
        `[LockdownSystem] Failed to restore #${channel.name}:`,
        error.message
      );
    }
  }

  stopLockdownReminder(guild.id);

  const {
    logIncident,
    INCIDENT_TYPES,
    SEVERITY,
  } = getIncidentLogger();

  clearLockdownState(guild);

  return {
    success: true,
    restored,
    bypassRestored,
  };
}

async function restoreLockdownReminders(client) {
  if (!client) return;

  for (const [, guild] of client.guilds.cache) {
    try {
      const state = getLockdownState(guild.id);

      if (!state.active) continue;

      if (
        state.lockdownExpiresAt &&
        Date.now() >= Number(state.lockdownExpiresAt)
      ) {
        console.log(
          `[LockdownSystem] Auto restoring expired lockdown for ${guild.name}`
        );

        await disableLockdown(guild, {
          reason: 'Automatic lockdown expiry',
          disabledByTag: 'Goliath Auto Recovery',
          restoredAutomatically: true,
        });

        continue;
      }

      if (!state.reminderChannelId || !state.reminderUserId) continue;
      if (activeReminderIntervals.has(guild.id)) continue;

      startLockdownReminder(
        guild,
        state.reminderChannelId,
        state.reminderUserId
      );

      const {
        logIncident,
        INCIDENT_TYPES,
        SEVERITY,
      } = getIncidentLogger();

      await logIncident(guild, {
        type: INCIDENT_TYPES.LOCKDOWN_RECOVERY_RESTORED,
        severity: SEVERITY.LOW,
        reason: 'Lockdown reminder system restored after restart.',
        actionTaken: 'Reminder interval recreated.',
        metadata: {
          reminderChannelId: state.reminderChannelId,
          reminderUserId: state.reminderUserId,
        },
        sendToOwner: false,
      });

      console.log(
        `[LockdownSystem] Restored reminder interval for ${guild.name}`
      );
    } catch (error) {
      console.warn(
        `[LockdownSystem] Failed restoring guild ${guild.id}:`,
        error.message
      );
    }
  }
}

module.exports = {
  emptyLockdownState,
  normalizeRoleIds,
  getLockdownState,
  getBypassRoleIds,
  saveLockdownState,
  clearLockdownState,
  enableLockdown,
  disableLockdown,
  restoreLockdownReminders,
  getLockdownModeFromSeverity,
};