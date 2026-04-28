// functions/moderation/moderationChecks.js

const { PermissionFlagsBits } = require('discord.js');

const STAFF_LEVELS = {
  NONE: 'none',
  HELPER: 'helper',
  JUNIOR_MOD: 'junior_mod',
  MOD: 'mod',
  ADMIN: 'admin',
  OWNER: 'owner',
};

const STAFF_LEVEL_RANKS = {
  [STAFF_LEVELS.NONE]: 0,
  [STAFF_LEVELS.HELPER]: 1,
  [STAFF_LEVELS.JUNIOR_MOD]: 2,
  [STAFF_LEVELS.MOD]: 3,
  [STAFF_LEVELS.ADMIN]: 4,
  [STAFF_LEVELS.OWNER]: 5,
};

const STAFF_LEVEL_LABELS = {
  [STAFF_LEVELS.NONE]: 'No Access',
  [STAFF_LEVELS.HELPER]: 'Helper',
  [STAFF_LEVELS.JUNIOR_MOD]: 'Junior Mod',
  [STAFF_LEVELS.MOD]: 'Moderator',
  [STAFF_LEVELS.ADMIN]: 'Admin',
  [STAFF_LEVELS.OWNER]: 'Owner',
};

const STAFF_BADGES = {
  [STAFF_LEVELS.NONE]: '🚫',
  [STAFF_LEVELS.HELPER]: '🪪',
  [STAFF_LEVELS.JUNIOR_MOD]: '🛡️',
  [STAFF_LEVELS.MOD]: '⚔️',
  [STAFF_LEVELS.ADMIN]: '👑',
  [STAFF_LEVELS.OWNER]: '🏆',
};

const ACTION_REQUIREMENTS = {
  view_dashboard: STAFF_LEVELS.JUNIOR_MOD,
  view_cases: STAFF_LEVELS.JUNIOR_MOD,
  view_case_detail: STAFF_LEVELS.JUNIOR_MOD,

  warn: STAFF_LEVELS.JUNIOR_MOD,
  add_case_note: STAFF_LEVELS.JUNIOR_MOD,

  timeout: STAFF_LEVELS.MOD,
  remove_timeout: STAFF_LEVELS.MOD,

  kick: STAFF_LEVELS.ADMIN,
  ban: STAFF_LEVELS.ADMIN,
  remove_warning: STAFF_LEVELS.ADMIN,
  edit_case: STAFF_LEVELS.ADMIN,

  bulk_warn: STAFF_LEVELS.ADMIN,
  bulk_timeout: STAFF_LEVELS.ADMIN,
  bulk_kick: STAFF_LEVELS.ADMIN,
  bulk_ban: STAFF_LEVELS.OWNER,
};

function hasPermission(member, permission) {
  return Boolean(member?.permissions?.has(permission));
}

function hasModPermission(member) {
  return (
    hasPermission(member, PermissionFlagsBits.ModerateMembers) ||
    hasPermission(member, PermissionFlagsBits.KickMembers) ||
    hasPermission(member, PermissionFlagsBits.BanMembers) ||
    hasPermission(member, PermissionFlagsBits.Administrator)
  );
}

function getStaffLevel(member, guild) {
  if (!member || !guild) return STAFF_LEVELS.NONE;
  if (member.id === guild.ownerId) return STAFF_LEVELS.OWNER;

  if (hasPermission(member, PermissionFlagsBits.Administrator)) {
    return STAFF_LEVELS.ADMIN;
  }

  if (hasPermission(member, PermissionFlagsBits.BanMembers)) {
    return STAFF_LEVELS.ADMIN;
  }

  if (hasPermission(member, PermissionFlagsBits.KickMembers)) {
    return STAFF_LEVELS.MOD;
  }

  if (hasPermission(member, PermissionFlagsBits.ModerateMembers)) {
    return STAFF_LEVELS.JUNIOR_MOD;
  }

  return STAFF_LEVELS.NONE;
}

function getStaffLevelRank(level) {
  return STAFF_LEVEL_RANKS[level] || STAFF_LEVEL_RANKS.none;
}

function getRequiredStaffLevel(action) {
  return ACTION_REQUIREMENTS[action] || STAFF_LEVELS.OWNER;
}

function canUseModAction(member, guild, action) {
  const staffLevel = getStaffLevel(member, guild);
  const requiredLevel = getRequiredStaffLevel(action);

  return getStaffLevelRank(staffLevel) >= getStaffLevelRank(requiredLevel);
}

function getStaffLevelLabel(level) {
  return STAFF_LEVEL_LABELS[level] || 'Unknown';
}

function getStaffBadge(level) {
  return STAFF_BADGES[level] || '❔';
}

function getModActionDeniedMessage(action) {
  const requiredLevel = getRequiredStaffLevel(action);

  return `❌ You do not have permission to use this action. Required level: ${getStaffLevelLabel(requiredLevel)}.`;
}

function getHighestRolePosition(member) {
  return member?.roles?.highest?.position ?? 0;
}

function isGuildOwner(memberOrUserId, guildOwnerId) {
  const id = typeof memberOrUserId === 'string'
    ? memberOrUserId
    : memberOrUserId?.id;

  return Boolean(id && id === guildOwnerId);
}

function canActOnTarget(actorMember, targetMember, guildOwnerId) {
  if (!actorMember || !targetMember) return false;

  if (isGuildOwner(targetMember, guildOwnerId)) return false;
  if (actorMember.id === targetMember.id) return false;
  if (isGuildOwner(actorMember, guildOwnerId)) return true;

  return getHighestRolePosition(actorMember) > getHighestRolePosition(targetMember);
}

function canBotActOnTarget(botMember, targetMember) {
  if (!botMember || !targetMember) return false;

  return getHighestRolePosition(botMember) > getHighestRolePosition(targetMember);
}

function getHierarchySummary(actorMember, botMember, targetMember, guildOwnerId) {
  if (!targetMember) {
    return {
      ok: false,
      actorCanAct: false,
      botCanAct: false,
      reason: '❌ Target not found.',
    };
  }

  if (isGuildOwner(targetMember, guildOwnerId)) {
    return {
      ok: false,
      actorCanAct: false,
      botCanAct: false,
      reason: '❌ Cannot moderate the server owner.',
    };
  }

  if (actorMember?.id === targetMember.id) {
    return {
      ok: false,
      actorCanAct: false,
      botCanAct: false,
      reason: '❌ You cannot moderate yourself.',
    };
  }

  const actorCanAct = canActOnTarget(actorMember, targetMember, guildOwnerId);
  const botCanAct = canBotActOnTarget(botMember, targetMember);

  if (!actorCanAct) {
    return {
      ok: false,
      actorCanAct,
      botCanAct,
      reason: '❌ You cannot act on this target due to role hierarchy.',
    };
  }

  if (!botCanAct) {
    return {
      ok: false,
      actorCanAct,
      botCanAct,
      reason: '❌ Bot cannot act on this target due to role hierarchy.',
    };
  }

  return {
    ok: true,
    actorCanAct,
    botCanAct,
    reason: null,
  };
}

function checkHierarchy(interaction, target) {
  if (!interaction?.guild || !interaction?.member) {
    return '❌ Invalid interaction context.';
  }

  const summary = getHierarchySummary(
    interaction.member,
    interaction.guild.members.me,
    target,
    interaction.guild.ownerId
  );

  return summary.ok ? null : summary.reason;
}

function checkHierarchyForBulk(actorMember, botMember, guildOwnerId, targetMember, actorUserId) {
  if (!targetMember) return 'User not found.';
  if (targetMember.id === actorUserId) return 'Cannot target yourself.';
  if (isGuildOwner(targetMember, guildOwnerId)) return 'Cannot target the server owner.';

  const actorIsOwner = actorUserId === guildOwnerId;
  const actorHighestRole = getHighestRolePosition(actorMember);
  const targetHighestRole = getHighestRolePosition(targetMember);
  const botHighestRole = getHighestRolePosition(botMember);

  if (!actorIsOwner && actorHighestRole <= targetHighestRole) {
    return 'Target has an equal or higher role.';
  }

  if (!botMember || botHighestRole <= targetHighestRole) {
    return 'Bot role is too low.';
  }

  return null;
}

module.exports = {
  STAFF_LEVELS,
  STAFF_LEVEL_RANKS,
  STAFF_LEVEL_LABELS,
  STAFF_BADGES,
  ACTION_REQUIREMENTS,

  hasPermission,
  hasModPermission,

  getStaffLevel,
  getStaffLevelRank,
  getRequiredStaffLevel,
  canUseModAction,
  getStaffLevelLabel,
  getModActionDeniedMessage,
  getStaffBadge,

  getHighestRolePosition,
  isGuildOwner,
  checkHierarchy,
  checkHierarchyForBulk,
  canActOnTarget,
  canBotActOnTarget,
  getHierarchySummary,
};