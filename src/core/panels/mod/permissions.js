const { PermissionFlagsBits } = require('discord.js');
const security = require('../../../core/security/securityCore');
const { safeReply, ephemeralError } = require('../../../core/ui/interactionResponse');

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
  [STAFF_LEVELS.JUNIOR_MOD]: '🗝️',
  [STAFF_LEVELS.MOD]: '🔐',
  [STAFF_LEVELS.ADMIN]: '🔏',
  [STAFF_LEVELS.OWNER]: '👑',
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

function getId(memberOrUserId) {
  return typeof memberOrUserId === 'string'
    ? memberOrUserId
    : memberOrUserId?.id;
}

function isGuildOwner(memberOrUserId, guildOwnerId) {
  const id = getId(memberOrUserId);
  return Boolean(id && guildOwnerId && String(id) === String(guildOwnerId));
}

function hasPermission(member, permission) {
  return Boolean(member?.permissions?.has(permission));
}

function hasModPermission(member) {
  return (
    security.isBotOwner(getId(member)) ||
    hasPermission(member, PermissionFlagsBits.ModerateMembers) ||
    hasPermission(member, PermissionFlagsBits.KickMembers) ||
    hasPermission(member, PermissionFlagsBits.BanMembers) ||
    hasPermission(member, PermissionFlagsBits.Administrator)
  );
}

function getStaffLevel(member, guild) {
  if (!member || !guild) return STAFF_LEVELS.NONE;

  if (security.isBotOwner(getId(member))) return STAFF_LEVELS.OWNER;
  if (isGuildOwner(member, guild.ownerId)) return STAFF_LEVELS.OWNER;

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

function getStaffDisplay(member, guild) {
  if (!member || !guild) {
    return {
      level: STAFF_LEVELS.NONE,
      label: STAFF_LEVEL_LABELS[STAFF_LEVELS.NONE],
      badge: STAFF_BADGES[STAFF_LEVELS.NONE],
    };
  }

  if (security.isBotOwner(getId(member))) {
    return {
      level: STAFF_LEVELS.OWNER,
      label: 'Goliath Owner',
      badge: '👑',
    };
  }

  if (isGuildOwner(member, guild.ownerId)) {
    return {
      level: STAFF_LEVELS.OWNER,
      label: 'Guild Owner',
      badge: '🏆',
    };
  }

  const level = getStaffLevel(member, guild);

  return {
    level,
    label: getStaffLevelLabel(level),
    badge: getStaffBadge(level),
  };
}

function getStaffLevelRank(level) {
  return STAFF_LEVEL_RANKS[level] ?? STAFF_LEVEL_RANKS[STAFF_LEVELS.NONE];
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

function canActOnTarget(actorMember, targetMember, guildOwnerId) {
  if (!actorMember || !targetMember) return false;

  if (isGuildOwner(targetMember, guildOwnerId)) return false;
  if (actorMember.id === targetMember.id) return false;

  if (security.isBotOwner(getId(actorMember))) return true;
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

function checkHierarchyForBulk(
  actorMember,
  botMember,
  guildOwnerId,
  targetMember,
  actorUserId
) {
  if (!targetMember) return 'User not found.';
  if (targetMember.id === actorUserId) return 'Cannot target yourself.';
  if (isGuildOwner(targetMember, guildOwnerId)) {
    return 'Cannot target the server owner.';
  }

  const actorIsOwner =
    isGuildOwner(actorUserId, guildOwnerId) ||
    security.isBotOwner(actorUserId) ||
    security.isBotOwner(getId(actorMember));

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

async function fetchTarget(guild, userId) {
  const id = String(userId || '').trim();
  if (!guild || !/^\d{16,20}$/.test(id)) return null;
  return guild.members.fetch(id).catch(() => guild.members.cache.get(id) || null);
}

async function findMemberByQuery(guild, query) {
  const raw = String(query || '').trim();
  if (!guild || !raw) return null;

  const mentionId = raw.match(/^<@!?(\d{16,20})>$/)?.[1];
  const directId = mentionId || (/^\d{16,20}$/.test(raw) ? raw : null);
  if (directId) {
    const direct = await fetchTarget(guild, directId);
    if (direct) return direct;
  }

  const needle = raw.toLowerCase();
  const valuesFor = (member) => [
    member.user?.username,
    member.user?.tag,
    member.displayName,
    member.nickname,
  ].map((value) => String(value || '').trim().toLowerCase());

  const exact = guild.members.cache.find((member) => valuesFor(member).includes(needle));
  if (exact) return exact;

  const partial = guild.members.cache.find((member) =>
    valuesFor(member).some((value) => value && value.includes(needle))
  );
  if (partial) return partial;

  try {
    const results = await guild.members.search({ query: raw, limit: 10 });
    return results.find((member) => valuesFor(member).includes(needle)) || results.first() || null;
  } catch {
    return null;
  }
}

function ensurePanelAccess(interaction) {
  if (hasModPermission(interaction?.member)) return null;
  return safeReply(interaction, ephemeralError('No permission to use moderation panel.'));
}

async function ensureActionAccess(interaction, action, deniedMessage = null) {
  if (canUseModAction(interaction?.member, interaction?.guild, action)) return true;
  await safeReply(interaction, {
    content: deniedMessage || getModActionDeniedMessage(action),
    flags: 64,
  });
  return false;
}

async function requireSelectedTarget(interaction, targetId) {
  if (!targetId || targetId === 'none') {
    await safeReply(interaction, ephemeralError('No user selected.'));
    return null;
  }

  const target = await fetchTarget(interaction?.guild, targetId);
  if (!target) {
    await safeReply(interaction, ephemeralError('Could not find that user.'));
    return null;
  }

  return target;
}

async function requireModeratableTarget(interaction, targetId, action) {
  const target = await requireSelectedTarget(interaction, targetId);
  if (!target) return null;

  const hierarchyError = checkHierarchy(interaction, target);
  if (hierarchyError) {
    await safeReply(
      interaction,
      ephemeralError(String(hierarchyError).replace(/^❌\s*/, ''))
    );
    return null;
  }

  const allowed = await ensureActionAccess(interaction, action);
  return allowed ? target : null;
}

module.exports = {
  STAFF_LEVELS,
  STAFF_LEVEL_RANKS,
  STAFF_LEVEL_LABELS,
  STAFF_BADGES,
  ACTION_REQUIREMENTS,
  getId,
  isGuildOwner,
  hasPermission,
  hasModPermission,
  getStaffLevel,
  getStaffDisplay,
  getStaffLevelRank,
  getRequiredStaffLevel,
  canUseModAction,
  getStaffLevelLabel,
  getModActionDeniedMessage,
  getStaffBadge,
  getHighestRolePosition,
  checkHierarchy,
  checkHierarchyForBulk,
  canActOnTarget,
  canBotActOnTarget,
  getHierarchySummary,
  fetchTarget,
  findMemberByQuery,
  ensurePanelAccess,
  ensureActionAccess,
  requireSelectedTarget,
  requireModeratableTarget,
};