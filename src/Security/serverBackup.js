const fs = require('node:fs');
const path = require('node:path');
const { ChannelType } = require('discord.js');

const guildManager = require('../guild/guildManager');

const BACKUPS_DIR = path.resolve(
  process.env.SERVER_BACKUP_DIR ||
    path.join(process.cwd(), 'data', 'serverBackups')
);

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

function mapOverwrite(overwrite, roleIdMap, guildId) {
  const mappedId =
    overwrite.id === guildId ? guildId : roleIdMap.get(overwrite.id) || overwrite.id;

  return {
    id: mappedId,
    type: overwrite.type,
    allow: BigInt(overwrite.allow || 0),
    deny: BigInt(overwrite.deny || 0),
  };
}

function getChannelCreateOptions(channel, roleIdMap, guildId, categoryIdMap) {
  const options = {
    name: channel.name,
    type: channel.type,
    permissionOverwrites: (channel.permissionOverwrites || []).map((overwrite) =>
      mapOverwrite(overwrite, roleIdMap, guildId)
    ),
  };

  if (channel.parentId && categoryIdMap.has(channel.parentId)) {
    options.parent = categoryIdMap.get(channel.parentId);
  }

  if (channel.topic) options.topic = channel.topic;
  if ('nsfw' in channel) options.nsfw = Boolean(channel.nsfw);
  if ('rateLimitPerUser' in channel) {
    options.rateLimitPerUser = channel.rateLimitPerUser || 0;
  }

  if (
    channel.type === ChannelType.GuildVoice ||
    channel.type === ChannelType.GuildStageVoice
  ) {
    if (channel.bitrate) options.bitrate = channel.bitrate;
    if (channel.userLimit) options.userLimit = channel.userLimit;
  }

  return options;
}

async function restoreServerBackup(targetGuild, backup) {
  if (!targetGuild || !backup) throw new Error('Invalid restore input.');

  const roleIdMap = new Map();
  const categoryIdMap = new Map();

  const result = {
    roles: [],
    categories: [],
    channels: [],
    skipped: [],
  };

  roleIdMap.set(backup.guild?.id || backup.sourceGuild?.id || targetGuild.id, targetGuild.id);

  for (const role of backup.roles || []) {
    try {
      const createdRole = await targetGuild.roles.create({
        name: role.name,
        color: role.color,
        permissions: BigInt(role.permissions || 0),
        hoist: role.hoist,
        mentionable: role.mentionable,
        reason: 'Server backup restore',
      });

      roleIdMap.set(role.id, createdRole.id);
      result.roles.push(createdRole.id);
    } catch (error) {
      result.skipped.push({
        type: 'role',
        name: role.name,
        reason: error.message,
      });
    }
  }

  const categories = (backup.channels || [])
    .filter((channel) => channel.type === ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position);

  for (const category of categories) {
    try {
      const createdCategory = await targetGuild.channels.create(
        getChannelCreateOptions(category, roleIdMap, targetGuild.id, categoryIdMap)
      );

      categoryIdMap.set(category.id, createdCategory.id);
      result.categories.push(createdCategory.id);
    } catch (error) {
      result.skipped.push({
        type: 'category',
        name: category.name,
        reason: error.message,
      });
    }
  }

  const channels = (backup.channels || [])
    .filter((channel) => channel.type !== ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position);

  for (const channel of channels) {
    try {
      const createdChannel = await targetGuild.channels.create(
        getChannelCreateOptions(channel, roleIdMap, targetGuild.id, categoryIdMap)
      );

      result.channels.push(createdChannel.id);
    } catch (error) {
      result.skipped.push({
        type: 'channel',
        name: channel.name,
        reason: error.message,
      });
    }
  }

  if (backup.logs) {
    guildManager.replaceGuildSection(targetGuild.id, 'logs', backup.logs);
  }

  return result;
}

module.exports = {
  BACKUPS_DIR,

  createServerBackup,
  listServerBackups,
  cleanupOldBackups,
  getBackupSummaries,
  readServerBackup,
  deleteServerBackup,
  restoreServerBackup,
};