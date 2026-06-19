'use strict';

// src/modules/autoRoles/autoRoleManager.js

const { PermissionFlagsBits } = require('discord.js');
const autoRoleStore = require('./autoRoleStore');
const { isModuleEnabled } = require('../../guild/guildManager');

function canManageAutoRoles(member) {
  return Boolean(
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
      member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
      member?.permissions?.has(PermissionFlagsBits.ManageRoles)
  );
}

function getBotMember(guild) {
  return guild?.members?.me || guild?.members?.cache?.get(guild.client.user.id) || null;
}

function canBotManageRole(guild, role) {
  const botMember = getBotMember(guild);

  if (!botMember || !role) return false;
  if (role.managed || role.id === guild.id) return false;

  return Boolean(
    botMember.permissions.has(PermissionFlagsBits.ManageRoles) &&
      botMember.roles.highest.position > role.position
  );
}

async function fetchRole(guild, roleId) {
  if (!guild || !roleId) return null;
  return guild.roles.cache.get(roleId) || guild.roles.fetch(roleId).catch(() => null);
}

async function validateManageableRole(guild, roleId) {
  const role = await fetchRole(guild, roleId);

  if (!role) throw new Error('Role not found.');
  if (!canBotManageRole(guild, role)) {
    throw new Error('I cannot manage that role. Move my role above it and make sure I have Manage Roles.');
  }

  return role;
}

async function applyAutoRoles(member) {
  const guild = member?.guild;

  if (!guild?.id || !member?.id) return [];
  if (!isModuleEnabled(guild.id, 'autoRoles')) return [];

  const section = autoRoleStore.getAutoRolesSection(guild.id);

  if (section.enabled === false) return [];
  if (member.user?.bot && section.settings?.applyToBots !== true) return [];

  const roleIds = member.user?.bot ? section.botRoles || [] : section.joinRoles || [];

  if (!roleIds.length) return [];

  const addedRoles = [];
  let failed = 0;

  for (const roleId of roleIds) {
    const role = await fetchRole(guild, roleId);

    if (!role || member.roles.cache.has(role.id)) {
      if (role) addedRoles.push(role);
      continue;
    }

    if (!canBotManageRole(guild, role)) {
      failed += 1;
      continue;
    }

    try {
      await member.roles.add(role, 'Goliath Auto Roles');
      addedRoles.push(role);
    } catch {
      failed += 1;
    }
  }

  if (addedRoles.length || failed) {
    autoRoleStore.incrementAnalytics(guild.id, {
      assigned: addedRoles.length,
      failed,
    });
  }

  return addedRoles;
}

function configureAutoRoles(guildId, input = {}, meta = {}) {
  if (!isModuleEnabled(guildId, 'autoRoles')) {
    throw new Error('Auto Roles module is disabled for this server.');
  }

  return autoRoleStore.updateAutoRolesSection(guildId, (section) => ({
    ...section,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : section.enabled,
    joinRoles: Array.isArray(input.joinRoles) ? autoRoleStore.cleanRoleIds(input.joinRoles) : section.joinRoles,
    botRoles: Array.isArray(input.botRoles) ? autoRoleStore.cleanRoleIds(input.botRoles) : section.botRoles,
    settings: {
      ...section.settings,
      ...(input.settings && typeof input.settings === 'object' ? input.settings : {}),
    },
    updatedAt: new Date().toISOString(),
  }), meta);
}

function setAutoRolesEnabled(guildId, enabled = true, meta = {}) {
  return autoRoleStore.setEnabled(guildId, enabled, meta);
}

async function addAutoRole(guild, roleId, options = {}, meta = {}) {
  if (!guild?.id) throw new Error('Guild is required.');
  const role = await validateManageableRole(guild, roleId);
  const section = options.bot === true
    ? autoRoleStore.addBotRole(guild.id, role.id, meta)
    : autoRoleStore.addJoinRole(guild.id, role.id, meta);

  return { role, section };
}

function removeAutoRole(guildId, roleId, options = {}, meta = {}) {
  return options.bot === true
    ? autoRoleStore.removeBotRole(guildId, roleId, meta)
    : autoRoleStore.removeJoinRole(guildId, roleId, meta);
}

function setApplyToBots(guildId, applyToBots = false, meta = {}) {
  return autoRoleStore.updateSettings(guildId, { applyToBots: applyToBots === true }, meta);
}

function getAutoRoleAnalytics(guildId) {
  return autoRoleStore.getAutoRolesSection(guildId).analytics || { assigned: 0, failed: 0 };
}

module.exports = {
  canManageAutoRoles,
  canBotManageRole,
  validateManageableRole,
  applyAutoRoles,
  configureAutoRoles,
  setAutoRolesEnabled,
  addAutoRole,
  removeAutoRole,
  setApplyToBots,
  getAutoRoleAnalytics,
};
