const { PermissionsBitField } = require('discord.js');
const guildManager = require('../../guild/guildManager');

/* ---------------- HELPERS ---------------- */

function getRoleIds(guildId, section) {
  const config = guildManager.getGuildSection(guildId, section, {
    roleIds: [],
  });

  return Array.isArray(config.roleIds) ? config.roleIds : [];
}

function hasAnyRole(member, roleIds = []) {
  if (!member?.roles?.cache) return false;
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

function isOwner(member) {
  return member?.guild?.ownerId === member?.id;
}

function isAdmin(member) {
  return member?.permissions?.has(PermissionsBitField.Flags.Administrator);
}

function isMod(member) {
  return hasAnyRole(member, getRoleIds(member.guild.id, 'modRoles'));
}

/* ---------------- PERMISSION LEVEL ---------------- */

function getPermissionLevel(member) {
  if (!member?.guild) return 'none';

  if (isOwner(member)) return 'owner';
  if (isAdmin(member)) return 'admin';
  if (isMod(member)) return 'mod';

  return 'none';
}

/* ---------------- ACCESS RULES ---------------- */

function canAccessAdminPanel(member) {
  const level = getPermissionLevel(member);
  return level === 'owner' || level === 'admin';
}

function canAccessAutoMod(member) {
  const level = getPermissionLevel(member);
  return level === 'owner' || level === 'admin';
}

function canAccessModPanel(member) {
  const level = getPermissionLevel(member);
  return level === 'owner' || level === 'admin' || level === 'mod';
}

module.exports = {
  getPermissionLevel,

  isOwner,
  isAdmin,
  isMod,

  canAccessAdminPanel,
  canAccessAutoMod,
  canAccessModPanel,
};