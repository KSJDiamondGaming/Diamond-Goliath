const { EmbedBuilder, PermissionsBitField, AuditLogEvent } = require('discord.js');
const { buildPreviewEmbed, TEMPLATES } = require('../../functions/embed/embedPanel');
const guildManager = require('../../guild/guildManager');

/* ---------------- AUTO / JOIN ROLES ---------------- */

function getJoinRolesConfig(guildId) {
  const autoRoles = guildManager.getGuildSection(guildId, 'autoRoles', null);
  const joinRoles = guildManager.getGuildSection(guildId, 'joinRoles', null);

  const enabled = Boolean(autoRoles?.enabled || joinRoles?.enabled);

  const roleIds = [
    ...(Array.isArray(autoRoles?.roleIds) ? autoRoles.roleIds : []),
    ...(Array.isArray(joinRoles?.roleIds) ? joinRoles.roleIds : []),
    ...(Array.isArray(autoRoles?.roles) ? autoRoles.roles : []),
    ...(Array.isArray(joinRoles?.roles) ? joinRoles.roles : []),
  ];

  return {
    enabled,
    roleIds: [...new Set(roleIds.filter(Boolean).map(String))],
  };
}

async function getBotMember(guild) {
  return guild.members.me || guild.members.fetchMe().catch(() => null);
}

function canBotManageRole(botMember, role) {
  if (!botMember || !role) return false;
  if (role.managed) return false;

  const hasPermission = botMember.permissions.has(PermissionsBitField.Flags.ManageRoles);
  const botAboveRole = botMember.roles.highest.position > role.position;

  return hasPermission && botAboveRole;
}

async function applyJoinRoles(member) {
  const guild = member.guild;
  const config = getJoinRolesConfig(guild.id);

  console.log('[joinRoles] Config:', {
    guild: guild.name,
    enabled: config.enabled,
    roleIds: config.roleIds,
  });

  if (!config.enabled || !config.roleIds.length) return [];

  const botMember = await getBotMember(guild);

  if (!botMember) {
    console.warn('[joinRoles] Could not fetch bot member.');
    return [];
  }

  const addedRoles = [];

  for (const roleId of config.roleIds) {
    try {
      const role =
        guild.roles.cache.get(roleId) ||
        (await guild.roles.fetch(roleId).catch(() => null));

      if (!role) {
        console.warn(`[joinRoles] Role not found: ${roleId}`);
        continue;
      }

      if (member.roles.cache.has(role.id)) {
        addedRoles.push(role);
        continue;
      }

      if (!canBotManageRole(botMember, role)) {
        console.warn(`[joinRoles] Cannot manage role: ${role.name} (${role.id})`);
        continue;
      }

      await member.roles.add(role, 'Automatic join role');
      addedRoles.push(role);

      console.log(`[joinRoles] Added ${role.name} to ${member.user.tag}`);
    } catch (error) {
      console.error(`[joinRoles] Failed to add role ${roleId}:`, error);
    }
  }

  if (addedRoles.length) {
    await member.fetch(true).catch(() => null);
  }

  return addedRoles;
}

/* ---------------- SHARED HELPERS ---------------- */

function formatTimestamp(timestamp, style = 'R') {
  return timestamp ? `<t:${Math.floor(timestamp / 1000)}:${style}>` : 'Unknown';
}

function formatUser(user) {
  if (!user) return 'Unknown User';
  return `${user} \`${user.tag || user.username || user.id}\``;
}

function getAvatar(member) {
  return member.displayAvatarURL({
    extension: 'png',
    size: 256,
  });
}

function getRolesText(member, addedRoles = []) {
  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => role.toString());

  for (const role of addedRoles) {
    if (!roles.includes(role.toString())) roles.push(role.toString());
  }

  if (!roles.length) return 'No roles';

  return roles.join(', ').slice(0, 1024);
}

function isLogEnabled(guildId, eventName) {
  if (typeof guildManager.isLogEventEnabled !== 'function') return true;
  return guildManager.isLogEventEnabled(guildId, eventName) !== false;
}

/* ---------------- PUBLIC WELCOME / LEAVE EMBEDS ---------------- */

function getDefaultPresetName(guildId, type) {
  if (typeof guildManager.getEmbedDefaultPreset === 'function') {
    const value = guildManager.getEmbedDefaultPreset(guildId, type);

    if (typeof value === 'string') return value;
    if (value?.name) return value.name;
    if (value?.presetName) return value.presetName;
  }

  const defaults =
    typeof guildManager.getEmbedDefaults === 'function'
      ? guildManager.getEmbedDefaults(guildId)
      : null;

  return defaults?.[type] || null;
}

function getDefaultPresetData(guildId, type) {
  const defaultPresetName = getDefaultPresetName(guildId, type);

  if (defaultPresetName && typeof guildManager.getEmbedPreset === 'function') {
    const preset = guildManager.getEmbedPreset(guildId, defaultPresetName);
    if (preset) return preset;
  }

  const directDefault =
    typeof guildManager.getEmbedDefaultPreset === 'function'
      ? guildManager.getEmbedDefaultPreset(guildId, type)
      : null;

  if (directDefault && typeof directDefault === 'object') return directDefault;

  return null;
}

async function sendPublicMemberEmbed(member, type) {
  try {
    const guild = member.guild;

    const defaultPreset = getDefaultPresetData(guild.id, type);

    const sectionConfig =
      guildManager.getGuildSection(guild.id, type, null) ||
      guildManager.getGuildSection(guild.id, `${type}Settings`, null) ||
      {};

    const messageData = {
      ...(TEMPLATES[type] || {}),
      ...(sectionConfig || {}),
      ...(defaultPreset || {}),
    };

    const channelId =
      messageData.channelId ||
      sectionConfig.channelId ||
      guildManager.getGuildSection(guild.id, `${type}Settings`, {})?.channelId ||
      guildManager.getGuildSection(guild.id, type, {})?.channelId ||
      null;

    if (!channelId) return;

    const channel =
      guild.channels.cache.get(channelId) ||
      (await guild.channels.fetch(channelId).catch(() => null));

    if (!channel?.isTextBased()) return;

    const fakeInteraction = {
      guild,
      guildId: guild.id,
      user: member.user,
      member,
    };

    await channel.send({
      content: messageData.allowUserPing ? `<@${member.user.id}>` : '',
      embeds: [buildPreviewEmbed(messageData, fakeInteraction)],
      allowedMentions: messageData.allowUserPing
        ? { users: [member.user.id], roles: [], repliedUser: false }
        : { parse: [], repliedUser: false },
    });
  } catch (error) {
    console.error(`[joinLeave] Failed to send public ${type} embed:`, error);
  }
}

/* ---------------- REMOVAL DETECTION ---------------- */

const REMOVAL_TYPES = {
  left: {
    key: 'left',
    title: '👋 Member Left',
    color: '#ED4245',
    eventName: 'memberLeave',
    reasonLabel: 'No reason - user left normally',
  },

  kicked: {
    key: 'kicked',
    title: '👢 Member Kicked',
    color: '#FAA61A',
    eventName: 'memberKick',
    auditType: AuditLogEvent.MemberKick,
    reasonLabel: 'No reason provided',
  },

  banned: {
    key: 'banned',
    title: '🔨 Member Banned',
    color: '#ED4245',
    eventName: 'memberBan',
    auditType: AuditLogEvent.MemberBanAdd,
    reasonLabel: 'No reason provided',
  },

  pruned: {
    key: 'pruned',
    title: '🧹 Member Pruned / Removed',
    color: '#FEE75C',
    eventName: 'memberPrune',
    auditType: AuditLogEvent.MemberPrune,
    reasonLabel: 'Possible prune or bulk removal',
  },

  removed: {
    key: 'removed',
    title: '🚪 Member Removed',
    color: '#ED4245',
    eventName: 'memberRemove',
    reasonLabel: 'Removal type unknown',
  },
};

async function findRecentAuditLog(guild, userId, auditType, maxAgeMs = 15000) {
  if (!auditType) return null;

  try {
    const logs = await guild.fetchAuditLogs({
      limit: 10,
      type: auditType,
    });

    return (
      logs.entries.find((entry) => {
        const targetId = entry.target?.id;
        const isTarget = !targetId || targetId === userId;
        const isRecent = Date.now() - entry.createdTimestamp < maxAgeMs;

        return isTarget && isRecent;
      }) || null
    );
  } catch (error) {
    console.warn(`[joinLeave] Audit log check failed for ${auditType}:`, error.message);
    return null;
  }
}

async function detectRemoval(member) {
  const guild = member.guild;
  const userId = member.user.id;

  const banLog = await findRecentAuditLog(
    guild,
    userId,
    AuditLogEvent.MemberBanAdd,
    20000
  );

  if (banLog) {
    return {
      ...REMOVAL_TYPES.banned,
      auditLog: banLog,
    };
  }

  const kickLog = await findRecentAuditLog(
    guild,
    userId,
    AuditLogEvent.MemberKick,
    20000
  );

  if (kickLog) {
    return {
      ...REMOVAL_TYPES.kicked,
      auditLog: kickLog,
    };
  }

  const pruneLog = await findRecentAuditLog(
    guild,
    userId,
    AuditLogEvent.MemberPrune,
    30000
  );

  if (pruneLog) {
    return {
      ...REMOVAL_TYPES.pruned,
      auditLog: pruneLog,
    };
  }

  return {
    ...REMOVAL_TYPES.left,
    auditLog: null,
  };
}

/* ---------------- ADMIN MEMBER LOGS ---------------- */

async function getAdminMemberLogChannel(guild) {
  const channelId =
    guildManager.getLogChannelId(guild.id, 'member') ||
    guildManager.getLogChannelId(guild.id, 'admin') ||
    guildManager.getLogChannelId(guild.id, 'general');

  if (!channelId) return null;

  const channel =
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null));

  return channel?.isTextBased() ? channel : null;
}

function buildAdminJoinLog(member, addedRoles = []) {
  const guild = member.guild;

  return new EmbedBuilder()
    .setColor('#57F287')
    .setTitle('👥 Member Joined')
    .setThumbnail(getAvatar(member))
    .addFields(
      { name: 'User', value: formatUser(member.user), inline: true },
      { name: 'User ID', value: `\`${member.user.id}\``, inline: true },
      { name: 'Type', value: member.user.bot ? '🤖 Bot' : '👤 User', inline: true },
      {
        name: 'Account Created',
        value: `${formatTimestamp(member.user.createdTimestamp, 'R')}\n${formatTimestamp(
          member.user.createdTimestamp,
          'F'
        )}`,
        inline: true,
      },
      {
        name: 'Joined Server',
        value: `${formatTimestamp(member.joinedTimestamp, 'R')}\n${formatTimestamp(
          member.joinedTimestamp,
          'F'
        )}`,
        inline: true,
      },
      { name: 'Member Count', value: `\`${guild.memberCount}\``, inline: true },
      { name: 'Roles', value: getRolesText(member, addedRoles), inline: false }
    )
    .setFooter({ text: 'Admin Log' })
    .setTimestamp();
}

function buildAdminRemovalLog(member, removal) {
  const guild = member.guild;
  const auditLog = removal?.auditLog || null;
  const reason = auditLog?.reason || removal?.reasonLabel || 'No reason provided';
  const moderator = auditLog?.executor || null;

  const embed = new EmbedBuilder()
    .setColor(removal.color || '#ED4245')
    .setTitle(removal.title || '🚪 Member Removed')
    .setThumbnail(getAvatar(member))
    .addFields(
      { name: 'User', value: formatUser(member.user), inline: true },
      { name: 'User ID', value: `\`${member.user.id}\``, inline: true },
      { name: 'Type', value: member.user.bot ? '🤖 Bot' : '👤 User', inline: true },
      {
        name: 'Removal Type',
        value: `\`${removal.key || 'unknown'}\``,
        inline: true,
      },
      {
        name: 'Account Created',
        value: `${formatTimestamp(member.user.createdTimestamp, 'R')}\n${formatTimestamp(
          member.user.createdTimestamp,
          'F'
        )}`,
        inline: true,
      },
      {
        name: 'Joined Server',
        value: member.joinedTimestamp
          ? `${formatTimestamp(member.joinedTimestamp, 'R')}\n${formatTimestamp(
              member.joinedTimestamp,
              'F'
            )}`
          : 'Unknown',
        inline: true,
      },
      { name: 'Member Count', value: `\`${guild.memberCount}\``, inline: true },
      { name: 'Roles', value: getRolesText(member), inline: false },
      { name: 'Reason', value: String(reason).slice(0, 1024), inline: false }
    )
    .setFooter({ text: 'Admin Log' })
    .setTimestamp();

  if (moderator) {
    embed.addFields({
      name: 'Moderator',
      value: formatUser(moderator),
      inline: true,
    });
  }

  return embed;
}

async function sendAdminMemberJoinLog(member, addedRoles = []) {
  try {
    const guild = member.guild;

    if (!isLogEnabled(guild.id, 'memberJoin')) return;

    const channel = await getAdminMemberLogChannel(guild);
    if (!channel) return;

    await channel.send({
      embeds: [buildAdminJoinLog(member, addedRoles)],
    });
  } catch (error) {
    console.error('[joinLeave] Failed to send admin member join log:', error);
  }
}

async function sendAdminMemberRemovalLog(member, removal) {
  try {
    const guild = member.guild;

    const logEventName = removal?.eventName || 'memberRemove';

    if (!isLogEnabled(guild.id, logEventName) && !isLogEnabled(guild.id, 'memberLeave')) {
      return;
    }

    const channel = await getAdminMemberLogChannel(guild);
    if (!channel) return;

    await channel.send({
      embeds: [buildAdminRemovalLog(member, removal)],
    });
  } catch (error) {
    console.error('[joinLeave] Failed to send admin member removal log:', error);
  }
}

/* ---------------- EVENTS ---------------- */

module.exports = [
  {
    name: 'guildMemberAdd',

    async execute(member) {
      const addedRoles = await applyJoinRoles(member);

      await sendPublicMemberEmbed(member, 'welcome');

      await sendAdminMemberJoinLog(member, addedRoles);
    },
  },

  {
    name: 'guildMemberRemove',

    async execute(member) {
      const removal = await detectRemoval(member);

      await sendPublicMemberEmbed(member, 'leave');

      await sendAdminMemberRemovalLog(member, removal);
    },
  },
];