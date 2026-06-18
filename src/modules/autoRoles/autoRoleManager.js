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
    joinRoles: Array.isArray(input.joinRoles) ? input.joinRoles : section.joinRoles,
    botRoles: Array.isArray(input.botRoles) ? input.botRoles : section.botRoles,
    settings: {
      ...section.settings,
      ...(input.settings && typeof input.settings === 'object' ? input.settings : {}),
    },
    updatedAt: new Date().toISOString(),
  }), meta);
}

module.exports = {
  canManageAutoRoles,
  canBotManageRole,
  applyAutoRoles,
  configureAutoRoles,
};
