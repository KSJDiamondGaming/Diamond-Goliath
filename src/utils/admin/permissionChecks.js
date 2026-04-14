const { PermissionFlagsBits } = require('discord.js');

// 🛡️ Basic moderator permission check
function hasModPermission(member) {
  if (!member) return false;

  return (
    member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    member.permissions.has(PermissionFlagsBits.KickMembers) ||
    member.permissions.has(PermissionFlagsBits.BanMembers) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

// 🧱 Staff level by permissions
function getStaffLevel(member, guild) {
  if (!member || !guild) return 'none';
  if (member.id === guild.ownerId) return 'owner';

  if (member.permissions.has(PermissionFlagsBits.Administrator)) return 'admin';
  if (member.permissions.has(PermissionFlagsBits.BanMembers)) return 'admin';
  if (member.permissions.has(PermissionFlagsBits.KickMembers)) return 'mod';
  if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) return 'junior_mod';

  return 'none';
}

// 🔢 Rank order for staff levels
function getStaffLevelRank(level) {
  const ranks = {
    none: 0,
    helper: 1,
    junior_mod: 2,
    mod: 3,
    admin: 4,
    owner: 5
  };

  return ranks[level] || 0;
}

// 📋 Required level for each action
function getRequiredStaffLevel(action) {
  const requirements = {
    view_dashboard: 'junior_mod',
    view_cases: 'junior_mod',
    view_case_detail: 'junior_mod',

    warn: 'junior_mod',
    add_case_note: 'junior_mod',

    timeout: 'mod',
    remove_timeout: 'mod',

    kick: 'admin',
    ban: 'admin',
    remove_warning: 'admin',
    edit_case: 'admin',

    bulk_warn: 'admin',
    bulk_timeout: 'admin',
    bulk_kick: 'admin',
    bulk_ban: 'owner'
  };

  return requirements[action] || 'owner';
}

// ✅ Can this member use this action?
function canUseModAction(member, guild, action) {
  const staffLevel = getStaffLevel(member, guild);
  const requiredLevel = getRequiredStaffLevel(action);

  return getStaffLevelRank(staffLevel) >= getStaffLevelRank(requiredLevel);
}

// 📝 Human-friendly staff level label
function getStaffLevelLabel(level) {
  const labels = {
    none: 'No Access',
    helper: 'Helper',
    junior_mod: 'Junior Mod',
    mod: 'Moderator',
    admin: 'Admin',
    owner: 'Owner'
  };

  return labels[level] || 'Unknown';
}

// ❌ Denied message for a blocked action
function getModActionDeniedMessage(action) {
  const requiredLevel = getRequiredStaffLevel(action);
  return `❌ You do not have permission to use this action. Required level: ${getStaffLevelLabel(requiredLevel)}.`;
}

// 👑 Optional badge helper for UI
function getStaffBadge(level) {
  const badges = {
    none: '🚫',
    helper: '🪪',
    junior_mod: '🛡️',
    mod: '⚔️',
    admin: '👑',
    owner: '🏆'
  };

  return badges[level] || '❔';
}

module.exports = {
  hasModPermission,
  getStaffLevel,
  getStaffLevelRank,
  getRequiredStaffLevel,
  canUseModAction,
  getStaffLevelLabel,
  getModActionDeniedMessage,
  getStaffBadge
};