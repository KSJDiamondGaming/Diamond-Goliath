// security/restoreDiffBuilder.js

const { ChannelType, PermissionsBitField } = require('discord.js');

const DANGEROUS_PERMISSIONS = [
  'Administrator',
  'ManageGuild',
  'ManageRoles',
  'ManageChannels',
  'ManageWebhooks',
  'BanMembers',
  'KickMembers',
  'ModerateMembers',
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeName(value, fallback = 'unknown') {
  return String(value || fallback).trim();
}

function normaliseName(value) {
  return safeName(value).toLowerCase();
}

function countByName(items = []) {
  const counts = new Map();

  for (const item of items) {
    const name = normaliseName(item.name);
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  return counts;
}

function hasDangerousPermission(permissionBitfield) {
  const flags = [];

  try {
    const permissions = new PermissionsBitField(BigInt(permissionBitfield || 0));

    for (const permission of DANGEROUS_PERMISSIONS) {
      if (permissions.has(permission)) {
        flags.push(permission);
      }
    }
  } catch {
    flags.push('InvalidPermissionBitfield');
  }

  return flags;
}

function getLiveRoles(guild) {
  return guild.roles.cache
    .filter((role) => role.id !== guild.id && !role.managed)
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      position: role.position,
      permissions: role.permissions.bitfield.toString(),
      hoist: role.hoist,
      mentionable: role.mentionable,
      managed: role.managed,
    }));
}

function getLiveChannels(guild) {
  return guild.channels.cache.map((channel) => ({
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
  }));
}

function buildEmptyDiff() {
  return {
    valid: true,

    backup: {
      backupId: null,
      createdAt: null,
      guildId: null,
      guildName: null,
      environment: null,
      type: null,
    },

    summary: {
      roles: {
        create: 0,
        update: 0,
        skip: 0,
        duplicates: 0,
        warnings: 0,
      },
      channels: {
        create: 0,
        update: 0,
        skip: 0,
        duplicates: 0,
        warnings: 0,
      },
      permissions: {
        restore: 0,
        skip: 0,
        warnings: 0,
      },
      totals: {
        create: 0,
        update: 0,
        skip: 0,
        duplicates: 0,
        warnings: 0,
        blockers: 0,
      },
    },

    roles: {
      create: [],
      update: [],
      skip: [],
      duplicates: [],
      warnings: [],
    },

    channels: {
      create: [],
      update: [],
      skip: [],
      duplicates: [],
      warnings: [],
    },

    permissions: {
      restore: [],
      skip: [],
      warnings: [],
    },

    warnings: [],
    blockers: [],
    safeApprovalSummary: [],
  };
}

function compareRole(backupRole, liveRole) {
  const changes = [];

  if (String(backupRole.permissions) !== String(liveRole.permissions)) {
    changes.push('permissions');
  }

  if (backupRole.color !== liveRole.color) {
    changes.push('color');
  }

  if (backupRole.hoist !== liveRole.hoist) {
    changes.push('hoist');
  }

  if (backupRole.mentionable !== liveRole.mentionable) {
    changes.push('mentionable');
  }

  return changes;
}

function compareChannel(backupChannel, liveChannel) {
  const changes = [];

  if (backupChannel.type !== liveChannel.type) {
    changes.push('type');
  }

  if ((backupChannel.topic || null) !== (liveChannel.topic || null)) {
    changes.push('topic');
  }

  if (Boolean(backupChannel.nsfw) !== Boolean(liveChannel.nsfw)) {
    changes.push('nsfw');
  }

  if ((backupChannel.rateLimitPerUser || 0) !== (liveChannel.rateLimitPerUser || 0)) {
    changes.push('slowmode');
  }

  if ((backupChannel.userLimit || 0) !== (liveChannel.userLimit || 0)) {
    changes.push('userLimit');
  }

  if ((backupChannel.bitrate || null) !== (liveChannel.bitrate || null)) {
    changes.push('bitrate');
  }

  return changes;
}

function channelTypeLabel(type) {
  switch (type) {
    case ChannelType.GuildCategory:
      return 'Category';
    case ChannelType.GuildText:
      return 'Text Channel';
    case ChannelType.GuildVoice:
      return 'Voice Channel';
    case ChannelType.GuildAnnouncement:
      return 'Announcement Channel';
    case ChannelType.GuildStageVoice:
      return 'Stage Channel';
    case ChannelType.GuildForum:
      return 'Forum Channel';
    case ChannelType.GuildMedia:
      return 'Media Channel';
    default:
      return `Channel Type ${type}`;
  }
}

function addWarning(diff, area, item) {
  diff.warnings.push(item);

  if (area === 'roles') {
    diff.roles.warnings.push(item);
  }

  if (area === 'channels') {
    diff.channels.warnings.push(item);
  }

  if (area === 'permissions') {
    diff.permissions.warnings.push(item);
  }
}

function refreshSummary(diff) {
  diff.summary.roles.create = diff.roles.create.length;
  diff.summary.roles.update = diff.roles.update.length;
  diff.summary.roles.skip = diff.roles.skip.length;
  diff.summary.roles.duplicates = diff.roles.duplicates.length;
  diff.summary.roles.warnings = diff.roles.warnings.length;

  diff.summary.channels.create = diff.channels.create.length;
  diff.summary.channels.update = diff.channels.update.length;
  diff.summary.channels.skip = diff.channels.skip.length;
  diff.summary.channels.duplicates = diff.channels.duplicates.length;
  diff.summary.channels.warnings = diff.channels.warnings.length;

  diff.summary.permissions.restore = diff.permissions.restore.length;
  diff.summary.permissions.skip = diff.permissions.skip.length;
  diff.summary.permissions.warnings = diff.permissions.warnings.length;

  diff.summary.totals.create =
    diff.summary.roles.create +
    diff.summary.channels.create;

  diff.summary.totals.update =
    diff.summary.roles.update +
    diff.summary.channels.update;

  diff.summary.totals.skip =
    diff.summary.roles.skip +
    diff.summary.channels.skip +
    diff.summary.permissions.skip;

  diff.summary.totals.duplicates =
    diff.summary.roles.duplicates +
    diff.summary.channels.duplicates;

  diff.summary.totals.warnings = diff.warnings.length;
  diff.summary.totals.blockers = diff.blockers.length;

  diff.valid = diff.blockers.length === 0;

  diff.safeApprovalSummary = [
    `${diff.summary.roles.create} roles will be created`,
    `${diff.summary.roles.update} roles may be updated`,
    `${diff.summary.channels.create} channels will be created`,
    `${diff.summary.channels.update} channels may be updated`,
    `${diff.summary.totals.duplicates} duplicates detected`,
    `${diff.summary.totals.warnings} warnings detected`,
    `${diff.summary.totals.blockers} blockers detected`,
  ];

  return diff;
}

async function buildRestoreDiff(guild, backup, options = {}) {
  const diff = buildEmptyDiff();

  if (!guild) {
    diff.blockers.push('Missing guild.');
    return refreshSummary(diff);
  }

  if (!backup || typeof backup !== 'object') {
    diff.blockers.push('Missing or invalid backup.');
    return refreshSummary(diff);
  }

  diff.backup = {
    backupId: backup.backupId || null,
    createdAt: backup.createdAt || null,
    guildId: backup.guild?.id || null,
    guildName: backup.guild?.name || null,
    environment: backup.environment || backup.metadata?.environment || null,
    type: backup.backupType || backup.type || backup.metadata?.backupType || null,
  };

  if (
    options.enforceGuildMatch !== false &&
    backup.guild?.id &&
    String(backup.guild.id) !== String(guild.id)
  ) {
    diff.blockers.push(
      `Backup guild mismatch. Backup belongs to ${backup.guild.id}, current guild is ${guild.id}.`
    );
  }

  await guild.roles.fetch().catch(() => null);
  await guild.channels.fetch().catch(() => null);

  const backupRoles = asArray(backup.roles);
  const backupChannels = asArray(backup.channels);

  const liveRoles = getLiveRoles(guild);
  const liveChannels = getLiveChannels(guild);

  const liveRolesByName = new Map(
    liveRoles.map((role) => [normaliseName(role.name), role])
  );

  const liveChannelsByNameAndType = new Map(
    liveChannels.map((channel) => [
      `${normaliseName(channel.name)}:${channel.type}`,
      channel,
    ])
  );

  const backupRoleNameCounts = countByName(backupRoles);
  const liveRoleNameCounts = countByName(liveRoles);
  const backupChannelNameCounts = countByName(backupChannels);
  const liveChannelNameCounts = countByName(liveChannels);

  for (const role of backupRoles) {
    const roleName = safeName(role.name);
    const roleKey = normaliseName(role.name);

    if ((backupRoleNameCounts.get(roleKey) || 0) > 1) {
      diff.roles.duplicates.push({
        type: 'backup_role_duplicate',
        name: roleName,
        id: role.id || null,
        message: `Backup contains duplicate role name: ${roleName}`,
      });
      continue;
    }

    if ((liveRoleNameCounts.get(roleKey) || 0) > 1) {
      diff.roles.duplicates.push({
        type: 'live_role_duplicate',
        name: roleName,
        id: role.id || null,
        message: `Live server contains duplicate role name: ${roleName}`,
      });
      continue;
    }

    const dangerousPermissions = hasDangerousPermission(role.permissions);

    if (dangerousPermissions.length > 0) {
      addWarning(diff, 'roles', {
        type: 'dangerous_role_permission',
        name: roleName,
        id: role.id || null,
        permissions: dangerousPermissions,
        message: `Role "${roleName}" has dangerous permissions: ${dangerousPermissions.join(', ')}`,
      });
    }

    const liveRole = liveRolesByName.get(roleKey);

    if (!liveRole) {
      diff.roles.create.push({
        id: role.id || null,
        name: roleName,
        permissions: role.permissions,
        dangerousPermissions,
      });
      continue;
    }

    const changes = compareRole(role, liveRole);

    if (changes.length > 0) {
      diff.roles.update.push({
        id: role.id || null,
        liveId: liveRole.id,
        name: roleName,
        changes,
      });
    } else {
      diff.roles.skip.push({
        id: role.id || null,
        liveId: liveRole.id,
        name: roleName,
        reason: 'Already matches live server',
      });
    }
  }

  for (const channel of backupChannels) {
    const channelName = safeName(channel.name);
    const channelKey = normaliseName(channel.name);
    const typedKey = `${channelKey}:${channel.type}`;

    if ((backupChannelNameCounts.get(channelKey) || 0) > 1) {
      diff.channels.duplicates.push({
        type: 'backup_channel_duplicate',
        name: channelName,
        id: channel.id || null,
        channelType: channelTypeLabel(channel.type),
        message: `Backup contains duplicate channel name: ${channelName}`,
      });
      continue;
    }

    if ((liveChannelNameCounts.get(channelKey) || 0) > 1) {
      diff.channels.duplicates.push({
        type: 'live_channel_duplicate',
        name: channelName,
        id: channel.id || null,
        channelType: channelTypeLabel(channel.type),
        message: `Live server contains duplicate channel name: ${channelName}`,
      });
      continue;
    }

    const overwriteCount = asArray(channel.permissionOverwrites).length;

    if (overwriteCount > 0) {
      diff.permissions.restore.push({
        channelId: channel.id || null,
        channelName,
        overwrites: overwriteCount,
        message: `${overwriteCount} permission overwrites will be checked for ${channelName}`,
      });
    } else {
      diff.permissions.skip.push({
        channelId: channel.id || null,
        channelName,
        reason: 'No permission overwrites in backup',
      });
    }

    const liveChannel = liveChannelsByNameAndType.get(typedKey);

    if (!liveChannel) {
      diff.channels.create.push({
        id: channel.id || null,
        name: channelName,
        type: channel.type,
        typeLabel: channelTypeLabel(channel.type),
        permissionOverwrites: overwriteCount,
      });
      continue;
    }

    const changes = compareChannel(channel, liveChannel);

    if (changes.length > 0) {
      diff.channels.update.push({
        id: channel.id || null,
        liveId: liveChannel.id,
        name: channelName,
        type: channel.type,
        typeLabel: channelTypeLabel(channel.type),
        changes,
      });
    } else {
      diff.channels.skip.push({
        id: channel.id || null,
        liveId: liveChannel.id,
        name: channelName,
        type: channel.type,
        typeLabel: channelTypeLabel(channel.type),
        reason: 'Already matches live server',
      });
    }
  }

  if (backupRoles.length === 0) {
    addWarning(diff, 'roles', {
      type: 'empty_roles',
      message: 'Backup contains no restorable roles.',
    });
  }

  if (backupChannels.length === 0) {
    addWarning(diff, 'channels', {
      type: 'empty_channels',
      message: 'Backup contains no restorable channels.',
    });
  }

  return refreshSummary(diff);
}

function createRestoreDiffText(diff) {
  if (!diff) return 'No restore diff available.';

  return [
    '**Restore Preview**',
    '',
    `**Roles**`,
    `+ Create: ${diff.summary.roles.create}`,
    `~ Update: ${diff.summary.roles.update}`,
    `= Skip: ${diff.summary.roles.skip}`,
    `! Duplicates: ${diff.summary.roles.duplicates}`,
    `⚠ Warnings: ${diff.summary.roles.warnings}`,
    '',
    `**Channels**`,
    `+ Create: ${diff.summary.channels.create}`,
    `~ Update: ${diff.summary.channels.update}`,
    `= Skip: ${diff.summary.channels.skip}`,
    `! Duplicates: ${diff.summary.channels.duplicates}`,
    `⚠ Warnings: ${diff.summary.channels.warnings}`,
    '',
    `**Permissions**`,
    `↺ Restore/check: ${diff.summary.permissions.restore}`,
    `= Skip: ${diff.summary.permissions.skip}`,
    `⚠ Warnings: ${diff.summary.permissions.warnings}`,
    '',
    `**Safety**`,
    `Warnings: ${diff.summary.totals.warnings}`,
    `Blockers: ${diff.summary.totals.blockers}`,
  ].join('\n');
}

module.exports = {
  buildRestoreDiff,
  createRestoreDiffText,
};