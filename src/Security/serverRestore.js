// security/serverRestore.js

const { ChannelType } = require('discord.js');

const { readServerBackup } = require('./serverBackup');
const guildManager = require('../guild/guildManager');

const RESTORE_VERSION = '2C';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asSnowflake(value) {
  return value ? String(value) : null;
}

function getBackupGuildId(backup) {
  return (
    backup.guild?.id ||
    backup.sourceGuild?.id ||
    backup.guildId ||
    backup.sourceGuildId ||
    null
  );
}

function getBackupRoles(backup) {
  return asArray(backup.roles);
}

function getBackupCategories(backup) {
  const categories = asArray(backup.categories);

  if (categories.length) return categories;

  return asArray(backup.channels).filter((channel) =>
    isCategoryType(channel.type)
  );
}

function getBackupChannels(backup) {
  return asArray(backup.channels).filter((channel) =>
    !isCategoryType(channel.type)
  );
}

function isCategoryType(type) {
  return (
    type === ChannelType.GuildCategory ||
    type === 4 ||
    type === 'GuildCategory' ||
    type === 'category'
  );
}

function normalizeChannelType(type) {
  if (typeof type === 'number') return type;

  const map = {
    GuildText: ChannelType.GuildText,
    GuildAnnouncement: ChannelType.GuildAnnouncement,
    GuildVoice: ChannelType.GuildVoice,
    GuildCategory: ChannelType.GuildCategory,
    GuildStageVoice: ChannelType.GuildStageVoice,
    GuildForum: ChannelType.GuildForum,
    GuildMedia: ChannelType.GuildMedia,

    text: ChannelType.GuildText,
    announcement: ChannelType.GuildAnnouncement,
    news: ChannelType.GuildAnnouncement,
    voice: ChannelType.GuildVoice,
    category: ChannelType.GuildCategory,
    stage: ChannelType.GuildStageVoice,
    forum: ChannelType.GuildForum,
    media: ChannelType.GuildMedia,
  };

  return map[type] ?? ChannelType.GuildText;
}

function bitfield(value) {
  if (value == null) return undefined;

  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function cleanName(name, fallback) {
  return String(name || fallback || 'restored-item').slice(0, 100);
}

function roleIsRestorable(role) {
  if (!role) return false;
  if (role.id === role.guildId) return false;
  if (role.name === '@everyone') return false;
  if (role.managed) return false;
  return true;
}

function getRestorableRoles(backup) {
  return getBackupRoles(backup)
    .filter(roleIsRestorable)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}

function getSortedCategories(backup) {
  return getBackupCategories(backup).sort(
    (a, b) => (a.position || 0) - (b.position || 0)
  );
}

function getSortedChannels(backup) {
  return getBackupChannels(backup).sort(
    (a, b) => (a.position || 0) - (b.position || 0)
  );
}

function getRoleBackupId(role) {
  return asSnowflake(role.id || role.roleId);
}

function getChannelBackupId(channel) {
  return asSnowflake(channel.id || channel.channelId);
}

function getParentBackupId(channel) {
  return asSnowflake(
    channel.parentId ||
    channel.parent ||
    channel.categoryId ||
    channel.category
  );
}

function getOverwriteType(overwrite) {
  const type = overwrite.type;

  if (type === 0 || type === 'role' || type === 'Role') return 0;
  if (type === 1 || type === 'member' || type === 'Member') return 1;

  return type;
}

function mapPermissionOverwrites(overwrites, guild, maps) {
  return asArray(overwrites)
    .map((overwrite) => {
      const originalId = asSnowflake(overwrite.id);
      const type = getOverwriteType(overwrite);

      if (!originalId) return null;

      let mappedId = originalId;

      if (originalId === guild.id) {
        mappedId = guild.roles.everyone.id;
      } else if (type === 0) {
        mappedId = maps.roles.get(originalId);
      } else if (type === 1) {
        mappedId = originalId;
      }

      if (!mappedId) return null;

      return {
        id: mappedId,
        type,
        allow: bitfield(overwrite.allow),
        deny: bitfield(overwrite.deny),
      };
    })
    .filter(Boolean);
}

function getBackupConfigSections(backup) {
  return (
    backup.guildConfig ||
    backup.config ||
    backup.sections ||
    backup.guildSections ||
    null
  );
}

function countConfigSections(backup) {
  const sections = getBackupConfigSections(backup);
  if (!sections || typeof sections !== 'object') return 0;
  return Object.entries(sections).filter(([, data]) => data != null).length;
}

async function emitProgress(options, payload) {
  if (typeof options.onProgress !== 'function') return;

  const total = Number(payload.total || 0);
  const current = Number(payload.current || 0);
  const percent = total > 0 ? Math.round((current / total) * 100) : 100;

  await options.onProgress({
    ...payload,
    current,
    total,
    percent,
  });
}

async function restoreRoles(guild, backup, maps, report, options, progressState) {
  const roles = getRestorableRoles(backup);
  let processed = 0;

  await emitProgress(options, {
    phase: 'roles',
    step: 'Restoring roles',
    current: progressState.completed,
    total: progressState.total,
    phaseCurrent: 0,
    phaseTotal: roles.length,
  });

  for (const role of roles) {
    const oldRoleId = getRoleBackupId(role);
    if (!oldRoleId) {
      processed += 1;
      continue;
    }

    if (options.dryRun) {
      maps.roles.set(oldRoleId, `dry-role-${oldRoleId}`);
      report.roles.planned += 1;
    } else {
      const created = await guild.roles.create({
        name: cleanName(role.name, 'restored-role'),
        color: role.color || 0,
        hoist: Boolean(role.hoist),
        mentionable: Boolean(role.mentionable),
        permissions: bitfield(role.permissions) ?? 0n,
        reason: options.reason,
      });

      maps.roles.set(oldRoleId, created.id);

      report.roles.created += 1;
      report.created.roles.push({
        oldId: oldRoleId,
        newId: created.id,
        name: created.name,
      });
    }

    processed += 1;
    progressState.completed += 1;

    await emitProgress(options, {
      phase: 'roles',
      step: options.dryRun ? 'Planning roles' : 'Creating roles',
      current: progressState.completed,
      total: progressState.total,
      phaseCurrent: processed,
      phaseTotal: roles.length,
      itemName: role.name,
    });
  }

  if (!options.dryRun && options.restoreRolePositions !== false) {
    let positionProcessed = 0;

    for (const role of roles) {
      const newRoleId = maps.roles.get(getRoleBackupId(role));
      const newRole = newRoleId ? guild.roles.cache.get(newRoleId) : null;

      if (!newRole || typeof role.position !== 'number') {
        positionProcessed += 1;
        continue;
      }

      try {
        await newRole.setPosition(role.position, options.reason);
        report.roles.positionsRestored += 1;
      } catch (error) {
        report.warnings.push(
          `Could not restore role position for ${role.name}: ${error.message}`
        );
      }

      positionProcessed += 1;

      await emitProgress(options, {
        phase: 'rolePositions',
        step: 'Restoring role positions',
        current: progressState.completed,
        total: progressState.total,
        phaseCurrent: positionProcessed,
        phaseTotal: roles.length,
        itemName: role.name,
      });
    }
  }
}

async function restoreCategories(guild, backup, maps, report, options, progressState) {
  const categories = getSortedCategories(backup);
  let processed = 0;

  await emitProgress(options, {
    phase: 'categories',
    step: 'Restoring categories',
    current: progressState.completed,
    total: progressState.total,
    phaseCurrent: 0,
    phaseTotal: categories.length,
  });

  for (const category of categories) {
    const oldCategoryId = getChannelBackupId(category);
    if (!oldCategoryId) {
      processed += 1;
      continue;
    }

    const overwrites = mapPermissionOverwrites(
      category.permissionOverwrites || category.overwrites,
      guild,
      maps
    );

    if (options.dryRun) {
      maps.channels.set(oldCategoryId, `dry-category-${oldCategoryId}`);
      report.categories.planned += 1;
    } else {
      const created = await guild.channels.create({
        name: cleanName(category.name, 'restored-category'),
        type: ChannelType.GuildCategory,
        permissionOverwrites: overwrites,
        reason: options.reason,
      });

      maps.channels.set(oldCategoryId, created.id);

      report.categories.created += 1;
      report.created.categories.push({
        oldId: oldCategoryId,
        newId: created.id,
        name: created.name,
      });
    }

    processed += 1;
    progressState.completed += 1;

    await emitProgress(options, {
      phase: 'categories',
      step: options.dryRun ? 'Planning categories' : 'Creating categories',
      current: progressState.completed,
      total: progressState.total,
      phaseCurrent: processed,
      phaseTotal: categories.length,
      itemName: category.name,
    });
  }
}

async function restoreChannels(guild, backup, maps, report, options, progressState) {
  const channels = getSortedChannels(backup);
  let processed = 0;

  await emitProgress(options, {
    phase: 'channels',
    step: 'Restoring channels',
    current: progressState.completed,
    total: progressState.total,
    phaseCurrent: 0,
    phaseTotal: channels.length,
  });

  for (const channel of channels) {
    const oldChannelId = getChannelBackupId(channel);
    if (!oldChannelId) {
      processed += 1;
      continue;
    }

    const parentOldId = getParentBackupId(channel);
    const parentNewId = parentOldId ? maps.channels.get(parentOldId) : null;

    const overwrites = mapPermissionOverwrites(
      channel.permissionOverwrites || channel.overwrites,
      guild,
      maps
    );

    const type = normalizeChannelType(channel.type);

    if (options.dryRun) {
      maps.channels.set(oldChannelId, `dry-channel-${oldChannelId}`);
      report.channels.planned += 1;
    } else {
      const payload = {
        name: cleanName(channel.name, 'restored-channel'),
        type,
        parent: parentNewId || undefined,
        permissionOverwrites: overwrites,
        topic: channel.topic || undefined,
        nsfw: Boolean(channel.nsfw),
        rateLimitPerUser: channel.rateLimitPerUser || channel.slowmode || 0,
        reason: options.reason,
      };

      if (
        type === ChannelType.GuildVoice ||
        type === ChannelType.GuildStageVoice
      ) {
        payload.bitrate = channel.bitrate || undefined;
        payload.userLimit = channel.userLimit || undefined;
      }

      const created = await guild.channels.create(payload);

      maps.channels.set(oldChannelId, created.id);

      report.channels.created += 1;
      report.created.channels.push({
        oldId: oldChannelId,
        newId: created.id,
        name: created.name,
        type,
      });
    }

    processed += 1;
    progressState.completed += 1;

    await emitProgress(options, {
      phase: 'channels',
      step: options.dryRun ? 'Planning channels' : 'Creating channels',
      current: progressState.completed,
      total: progressState.total,
      phaseCurrent: processed,
      phaseTotal: channels.length,
      itemName: channel.name,
    });
  }
}

function remapConfigValue(value, maps) {
  if (Array.isArray(value)) {
    return value.map((item) => remapConfigValue(item, maps));
  }

  if (value && typeof value === 'object') {
    const output = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = remapConfigValue(nestedValue, maps);
    }

    return output;
  }

  const stringValue = asSnowflake(value);

  if (!stringValue) return value;

  if (maps.roles.has(stringValue)) return maps.roles.get(stringValue);
  if (maps.channels.has(stringValue)) return maps.channels.get(stringValue);

  return value;
}

async function restoreGuildConfig(guild, backup, maps, report, options, progressState) {
  const sections = getBackupConfigSections(backup);

  if (!sections || typeof sections !== 'object') {
    report.config.skipped = true;
    report.config.reason = 'No config sections found in backup.';

    await emitProgress(options, {
      phase: 'config',
      step: 'No config sections found',
      current: progressState.completed,
      total: progressState.total,
      phaseCurrent: 0,
      phaseTotal: 0,
    });

    return;
  }

  const entries = Object.entries(sections).filter(
    ([section, data]) => section && data != null
  );

  let processed = 0;

  await emitProgress(options, {
    phase: 'config',
    step: 'Restoring config',
    current: progressState.completed,
    total: progressState.total,
    phaseCurrent: 0,
    phaseTotal: entries.length,
  });

  for (const [section, data] of entries) {
    const remapped = remapConfigValue(data, maps);

    if (options.dryRun) {
      report.config.planned += 1;
    } else {
      guildManager.replaceGuildSection(guild.id, section, remapped);
      report.config.restored += 1;
      report.config.sections.push(section);
    }

    processed += 1;
    progressState.completed += 1;

    await emitProgress(options, {
      phase: 'config',
      step: options.dryRun ? 'Planning config' : 'Restoring config',
      current: progressState.completed,
      total: progressState.total,
      phaseCurrent: processed,
      phaseTotal: entries.length,
      itemName: section,
    });
  }
}

function createRestoreReport(guild, backupId, options) {
  return {
    version: RESTORE_VERSION,
    dryRun: Boolean(options.dryRun),
    guildId: guild.id,
    guildName: guild.name,
    backupId,
    startedAt: new Date().toISOString(),
    finishedAt: null,

    roles: {
      planned: 0,
      created: 0,
      positionsRestored: 0,
    },

    categories: {
      planned: 0,
      created: 0,
    },

    channels: {
      planned: 0,
      created: 0,
    },

    config: {
      planned: 0,
      restored: 0,
      skipped: false,
      reason: null,
      sections: [],
    },

    created: {
      roles: [],
      categories: [],
      channels: [],
    },

    warnings: [],
    errors: [],
  };
}

function validateRestore(guild, backup, backupId, options) {
  if (!guild) {
    throw new Error('Missing guild.');
  }

  if (!backup) {
    throw new Error(`Backup not found: ${backupId}`);
  }

  const backupGuildId = getBackupGuildId(backup);

  if (options.requireSameGuild !== false && backupGuildId && backupGuildId !== guild.id) {
    throw new Error(
      `Backup guild mismatch. Backup belongs to ${backupGuildId}, current guild is ${guild.id}.`
    );
  }
}

function getRestoreTotal(backup, options) {
  let total = 0;

  if (options.restoreRoles) total += getRestorableRoles(backup).length;
  if (options.restoreCategories) total += getSortedCategories(backup).length;
  if (options.restoreChannels) total += getSortedChannels(backup).length;
  if (options.restoreConfig) total += countConfigSections(backup);

  return total || 1;
}

async function restoreServerBackup(guild, backupId, options = {}) {
  const restoreOptions = {
    onProgress: null,
    dryRun: true,
    requireSameGuild: true,
    restoreRoles: true,
    restoreCategories: true,
    restoreChannels: true,
    restoreConfig: true,
    restoreRolePositions: true,
    reason: `Goliath restore ${RESTORE_VERSION}`,
    ...options,
  };

  const backup = readServerBackup(guild.id, backupId);
  validateRestore(guild, backup, backupId, restoreOptions);

  const report = createRestoreReport(guild, backupId, restoreOptions);

  const maps = {
    roles: new Map(),
    channels: new Map(),
  };

  const progressState = {
    completed: 0,
    total: getRestoreTotal(backup, restoreOptions),
  };

  try {
    await emitProgress(restoreOptions, {
      phase: 'start',
      step: 'Starting restore',
      current: 0,
      total: progressState.total,
      phaseCurrent: 0,
      phaseTotal: progressState.total,
    });

    if (restoreOptions.restoreRoles) {
      await restoreRoles(guild, backup, maps, report, restoreOptions, progressState);
    }

    if (restoreOptions.restoreCategories) {
      await restoreCategories(guild, backup, maps, report, restoreOptions, progressState);
    }

    if (restoreOptions.restoreChannels) {
      await restoreChannels(guild, backup, maps, report, restoreOptions, progressState);
    }

    if (restoreOptions.restoreConfig) {
      await restoreGuildConfig(guild, backup, maps, report, restoreOptions, progressState);
    }

    await emitProgress(restoreOptions, {
      phase: 'complete',
      step: 'Restore complete',
      current: progressState.total,
      total: progressState.total,
      phaseCurrent: progressState.total,
      phaseTotal: progressState.total,
    });
  } catch (error) {
    report.errors.push(error.message);

    await emitProgress(restoreOptions, {
      phase: 'error',
      step: 'Restore failed',
      current: progressState.completed,
      total: progressState.total,
      phaseCurrent: progressState.completed,
      phaseTotal: progressState.total,
      error: error.message,
    });

    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
  }

  return report;
}

module.exports = {
  restoreServerBackup,
};