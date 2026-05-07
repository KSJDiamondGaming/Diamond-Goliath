// security/serverBackup.js

const fs = require('node:fs');
const path = require('node:path');
const { ChannelType } = require('discord.js');

const guildManager = require('../guild/guildManager');

const BACKUPS_DIR = path.resolve(
  process.env.SERVER_BACKUP_DIR ||
    path.join(process.cwd(), 'data', 'serverBackups')
);

const SUPPORTED_BACKUP_VERSIONS = [3];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function createBackupId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function getRetentionLimit() {
  return Number(process.env.SERVER_BACKUP_RETENTION || 4) || 4;
}

function getGuildBackupDir(guildId) {
  return path.join(BACKUPS_DIR, 'guilds', String(guildId), 'backups');
}

function getBackupFilePath(guildId, backupId) {
  return path.join(getGuildBackupDir(guildId), `${backupId}.json`);
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));

  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isValidBitfield(value) {
  if (value === undefined || value === null) return false;

  try {
    BigInt(value);
    return true;
  } catch {
    return false;
  }
}

function isValidChannelType(type) {
  return [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildVoice,
    ChannelType.GuildCategory,
    ChannelType.GuildStageVoice,
    ChannelType.GuildForum,
    ChannelType.GuildMedia,
  ].includes(type);
}

function serializeOverwrite(overwrite) {
  return {
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield.toString(),
    deny: overwrite.deny.bitfield.toString(),
  };
}

function serializeRole(role) {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    position: role.position,
    permissions: role.permissions.bitfield.toString(),
    hoist: role.hoist,
    mentionable: role.mentionable,
  };
}

function serializeChannel(channel) {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    parentId: channel.parentId || null,
    position: channel.rawPosition ?? channel.position ?? 0,

    topic: channel.topic || null,
    nsfw: Boolean(channel.nsfw),
    rateLimitPerUser: channel.rateLimitPerUser || 0,
    bitrate: channel.bitrate || null,
    userLimit: channel.userLimit || 0,

    permissionOverwrites: channel.permissionOverwrites?.cache
      ? channel.permissionOverwrites.cache.map(serializeOverwrite)
      : [],
  };
}

function getLogsSnapshot(guildId) {
  const guildData = guildManager.getGuildData(guildId);

  return {
    enabled: guildData.logs?.enabled !== false,
    channels: guildData.logs?.channels || {},
    events: guildData.logs?.events || {},
  };
}

function createBackupSummary(backup) {
  const roles = Array.isArray(backup?.roles) ? backup.roles : [];
  const channels = Array.isArray(backup?.channels) ? backup.channels : [];

  return {
    backupId: backup?.backupId || null,
    version: backup?.version || null,
    createdAt: backup?.createdAt || null,
    createdBy: backup?.createdBy || null,
    reason: backup?.reason || null,
    guildId: backup?.guild?.id || null,
    guildName: backup?.guild?.name || null,

    counts: {
      roles: roles.length,
      channels: channels.length,
      categories: channels.filter((c) => c.type === ChannelType.GuildCategory).length,
      permissionOverwrites: channels.reduce(
        (total, c) =>
          total +
          (Array.isArray(c.permissionOverwrites)
            ? c.permissionOverwrites.length
            : 0),
        0
      ),
    },
  };
}

function validateServerBackup(backup, options = {}) {
  const errors = [];
  const warnings = [];

  if (!isObject(backup)) {
    return {
      valid: false,
      errors: ['Backup is not a valid object.'],
      warnings,
      summary: null,
    };
  }

  if (!SUPPORTED_BACKUP_VERSIONS.includes(Number(backup.version))) {
    errors.push(`Unsupported backup version: ${backup.version || 'missing'}`);
  }

  if (!backup.backupId) errors.push('Backup is missing backupId.');
  if (!backup.createdAt) errors.push('Backup is missing createdAt.');
  if (!backup.guild?.id) errors.push('Backup is missing guild.id.');

  if (
    options.guildId &&
    backup.guild?.id &&
    String(options.guildId) !== String(backup.guild.id)
  ) {
    errors.push(
      `Backup guild mismatch. Backup belongs to ${backup.guild.id}, current guild is ${options.guildId}.`
    );
  }

  if (!Array.isArray(backup.roles)) {
    errors.push('Backup roles field is missing or invalid.');
  }

  if (!Array.isArray(backup.channels)) {
    errors.push('Backup channels field is missing or invalid.');
  }

  for (const role of backup.roles || []) {
    if (!role.id) errors.push(`Role "${role.name || 'unknown'}" is missing id.`);
    if (!role.name) errors.push(`Role at ${role.id || 'unknown'} is missing name.`);

    if (!isValidBitfield(role.permissions)) {
      errors.push(`Role "${role.name || role.id}" has invalid permissions.`);
    }

    if (typeof role.position !== 'number') {
      warnings.push(`Role "${role.name || role.id}" has no numeric position.`);
    }
  }

  for (const channel of backup.channels || []) {
    if (!channel.id) errors.push(`Channel "${channel.name || 'unknown'}" is missing id.`);
    if (!channel.name) errors.push(`Channel at ${channel.id || 'unknown'} is missing name.`);

    if (!isValidChannelType(channel.type)) {
      errors.push(`Channel "${channel.name || channel.id}" has invalid type.`);
    }

    if (typeof channel.position !== 'number') {
      warnings.push(`Channel "${channel.name || channel.id}" has no numeric position.`);
    }

    for (const overwrite of channel.permissionOverwrites || []) {
      if (!overwrite.id) {
        errors.push(`Channel "${channel.name}" has overwrite missing id.`);
      }

      if (overwrite.type === undefined || overwrite.type === null) {
        errors.push(`Channel "${channel.name}" has overwrite missing type.`);
      }

      if (!isValidBitfield(overwrite.allow)) {
        errors.push(`Channel "${channel.name}" has overwrite with invalid allow.`);
      }

      if (!isValidBitfield(overwrite.deny)) {
        errors.push(`Channel "${channel.name}" has overwrite with invalid deny.`);
      }
    }
  }

  if ((backup.roles || []).length === 0) {
    warnings.push('Backup contains no restorable roles.');
  }

  if ((backup.channels || []).length === 0) {
    warnings.push('Backup contains no restorable channels.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: createBackupSummary(backup),
  };
}

async function createServerBackup(guild, options = {}) {
  if (!guild) throw new Error('Missing guild.');

  await guild.roles.fetch().catch(() => null);
  await guild.channels.fetch().catch(() => null);

  const backupId = options.backupId || createBackupId();

  const roles = guild.roles.cache
    .filter((role) => role.id !== guild.id && !role.managed)
    .sort((a, b) => a.position - b.position)
    .map(serializeRole);

  const channels = guild.channels.cache
    .sort(
      (a, b) =>
        (a.rawPosition ?? a.position ?? 0) -
        (b.rawPosition ?? b.position ?? 0)
    )
    .map(serializeChannel);

  const backup = {
    version: 3,
    backupId,
    createdAt: new Date().toISOString(),
    createdBy: options.createdBy || null,
    reason: options.reason || 'Server backup',

    guild: {
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL({ extension: 'png', size: 1024 }) || null,
    },

    logs: getLogsSnapshot(guild.id),

    stats: {
      roles: roles.length,
      channels: channels.length,
      categories: channels.filter((c) => c.type === ChannelType.GuildCategory).length,
      textChannels: channels.filter((c) => c.type === ChannelType.GuildText).length,
      voiceChannels: channels.filter((c) => c.type === ChannelType.GuildVoice).length,
    },

    restoreNotes: {
      canRestore: [
        'Roles',
        'Categories',
        'Channels',
        'Permission overwrites',
        'Log configuration references',
      ],
      cannotRestore: [
        'Messages',
        'Members',
        'Boosts',
        'Audit logs',
        'Original guild ID',
        'Original ownership',
      ],
    },

    roles,
    channels,
  };

  writeJson(getBackupFilePath(guild.id, backupId), backup);

  cleanupOldBackups(guild.id);
  updateGuildBackupReference(guild, backup);

  return backup;
}

function listServerBackups(guildId) {
  const dir = getGuildBackupDir(guildId);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace('.json', ''))
    .sort((a, b) => b.localeCompare(a));
}

function getLatestServerBackupId(guildId) {
  const section = guildManager.getGuildSection(guildId, 'serverBackups', {});

  if (section.lastBackupId) {
    const existing = readServerBackup(guildId, section.lastBackupId);
    if (existing) return section.lastBackupId;
  }

  return listServerBackups(guildId)[0] || null;
}

function readLatestServerBackup(guildId) {
  const latestBackupId = getLatestServerBackupId(guildId);
  if (!latestBackupId) return null;

  return readServerBackup(guildId, latestBackupId);
}

function cleanupOldBackups(guildId) {
  const maxBackups = getRetentionLimit();
  const backups = listServerBackups(guildId);

  if (backups.length <= maxBackups) return 0;

  const oldBackups = backups.slice(maxBackups);
  let deleted = 0;

  for (const backupId of oldBackups) {
    if (deleteServerBackup(guildId, backupId)) deleted += 1;
  }

  return deleted;
}

function getBackupSummaries(guildId) {
  return listServerBackups(guildId)
    .map((backupId) => readServerBackup(guildId, backupId))
    .filter(Boolean)
    .map((backup) => ({
      backupId: backup.backupId,
      createdAt: backup.createdAt,
      createdBy: backup.createdBy,
      reason: backup.reason,
      guildName: backup.guild?.name || null,
      roles: backup.roles?.length || 0,
      channels: backup.channels?.length || 0,
      logsIncluded: Boolean(backup.logs),
      validation: validateServerBackup(backup, {
        guildId: backup.guild?.id,
      }),
    }));
}

function readServerBackup(guildId, backupId) {
  return readJson(getBackupFilePath(guildId, backupId));
}

function deleteServerBackup(guildId, backupId) {
  const file = getBackupFilePath(guildId, backupId);
  if (!fs.existsSync(file)) return false;

  fs.unlinkSync(file);
  return true;
}

function updateGuildBackupReference(guild, backup) {
  const existing = guildManager.getGuildSection(guild.id, 'serverBackups', {});
  const backups = listServerBackups(guild.id);
  const retentionMax = getRetentionLimit();

  guildManager.replaceGuildSection(guild.id, 'serverBackups', {
    enabled: existing.enabled !== false,

    lastBackupId: backup.backupId,
    lastBackupAt: backup.createdAt,
    lastBackupBy: backup.createdBy || null,
    lastBackupReason: backup.reason || null,

    backupCount: backups.length,

    latestBackup: {
      backupId: backup.backupId,
      createdAt: backup.createdAt,
      createdBy: backup.createdBy || null,
      reason: backup.reason || null,
      sourceGuildName: guild.name,
      roles: backup.roles?.length || 0,
      channels: backup.channels?.length || 0,
      logsIncluded: Boolean(backup.logs),
    },

    storage: {
      provider: process.env.SERVER_BACKUP_PROVIDER || 'google_drive_desktop',
      path: BACKUPS_DIR,
      restoreRequiresSupport: true,
    },

    retention: {
      maxBackups: retentionMax,
      autoCleanup: existing.retention?.autoCleanup !== false,
    },
  });
}

module.exports = {
  BACKUPS_DIR,
  SUPPORTED_BACKUP_VERSIONS,

  createServerBackup,
  listServerBackups,
  cleanupOldBackups,
  getBackupSummaries,
  readServerBackup,
  deleteServerBackup,

  getLatestServerBackupId,
  readLatestServerBackup,

  validateServerBackup,
  createBackupSummary,
};