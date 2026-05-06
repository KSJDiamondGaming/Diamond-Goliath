const { PermissionsBitField } = require('discord.js');
const guildManager = require('../../guild/guildManager');

/* ---------------- CONSTANTS ---------------- */

const LEVELS = {
  NONE: 'none',
  MOD: 'mod',
  ADMIN: 'admin',
  OWNER: 'owner',
};

/* ---------------- HELPERS ---------------- */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getRoleIds(guildId, section) {
  if (!guildId) return [];

  const config = guildManager.getGuildSection(guildId, section, {
    roleIds: [],
  });

  return safeArray(config.roleIds)
    .map((id) => String(id || '').trim())
    .filter(Boolean);
}

function hasAnyRole(member, roleIds = []) {
  if (!member?.roles?.cache) return false;

  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

function isOwner(member) {
  if (!member?.guild || !member?.id) return false;

  return member.guild.ownerId === member.id;
}

function isAdmin(member) {
  return Boolean(
    member?.permissions?.has(
      PermissionsBitField.Flags.Administrator
    )
  );
}

function isMod(member) {
  if (!member?.guild) return false;

  return hasAnyRole(
    member,
    getRoleIds(member.guild.id, 'modRoles')
  );
}

/* ---------------- PERMISSION LEVEL ---------------- */

function getPermissionLevel(member) {
  if (!member?.guild) {
    return LEVELS.NONE;
  }

  if (isOwner(member)) {
    return LEVELS.OWNER;
  }

  if (isAdmin(member)) {
    return LEVELS.ADMIN;
  }

  if (isMod(member)) {
    return LEVELS.MOD;
  }

  return LEVELS.NONE;
}

function hasPermissionLevel(member, allowedLevels = []) {
  const level = getPermissionLevel(member);

  return allowedLevels.includes(level);
}

/* ---------------- ACCESS RULES ---------------- */

function canAccessAdminPanel(member) {
  return hasPermissionLevel(member, [
    LEVELS.OWNER,
    LEVELS.ADMIN,
  ]);
}

function canAccessAutoMod(member) {
  return hasPermissionLevel(member, [
    LEVELS.OWNER,
    LEVELS.ADMIN,
  ]);
}

function canAccessModPanel(member) {
  return hasPermissionLevel(member, [
    LEVELS.OWNER,
    LEVELS.ADMIN,
    LEVELS.MOD,
  ]);
}

/* ---------------- EXPORTS ---------------- */

module.exports = {
  LEVELS,

  getPermissionLevel,
  hasPermissionLevel,

  isOwner,
  isAdmin,
  isMod,

  canAccessAdminPanel,
  canAccessAutoMod,
  canAccessModPanel,
};