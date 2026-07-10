'use strict';

const { PermissionFlagsBits } = require('discord.js');
const autoRoleStore = require('./autoRoleStore');
const { isModuleEnabled } = require('../../core/guild/guildManager');

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
  return Boolean(botMember.permissions.has(PermissionFlagsBits.ManageRoles) && botMember.roles.highest.position > role.position);
}

function canBotManageMember(member) {
  const botMember = getBotMember(member?.guild);
  if (!botMember || !member) return false;
  if (member.id === botMember.id) return false;
  if (member.guild?.ownerId === member.id) return false;
  return botMember.roles.highest.position > member.roles.highest.position;
}

async function fetchRole(guild, roleId) {
  if (!guild || !roleId) return null;
  return guild.roles.cache.get(roleId) || guild.roles.fetch(roleId).catch(() => null);
}

async function validateManageableRole(guild, roleId) {
  const role = await fetchRole(guild, roleId);
  if (!role) throw new Error('Role not found.');
  if (!canBotManageRole(guild, role)) throw new Error('I cannot manage that role. Move my role above it and make sure I have Manage Roles.');
  return role;
}

async function applyAutoRoles(member, options = {}) {
  const guild = member?.guild;
  if (!guild?.id || !member?.id) return [];
  if (!isModuleEnabled(guild.id, 'autoRoles')) return [];

  const section = autoRoleStore.getAutoRolesSection(guild.id);
  if (section.enabled === false) return [];
  if (member.user?.bot && section.settings?.applyToBots !== true) return [];
  if (!canBotManageMember(member)) {
    autoRoleStore.incrementAnalytics(guild.id, { failed: 1, botsProcessed: member.user?.bot ? 1 : 0, membersProcessed: member.user?.bot ? 0 : 1 });
    return [];
  }

  const roleIds = member.user?.bot ? section.botRoles || [] : section.joinRoles || [];
  const uniqueRoleIds = autoRoleStore.cleanRoleIds(roleIds);
  if (!uniqueRoleIds.length) {
    autoRoleStore.incrementAnalytics(guild.id, { skipped: 1, botsProcessed: member.user?.bot ? 1 : 0, membersProcessed: member.user?.bot ? 0 : 1 });
    return [];
  }

  const addedRoles = [];
  let failed = 0;
  let skipped = 0;

  for (const roleId of uniqueRoleIds) {
    const role = await fetchRole(guild, roleId);
    if (!role) {
      failed += 1;
      continue;
    }
    if (member.roles.cache.has(role.id)) {
      skipped += 1;
      continue;
    }
    if (!canBotManageRole(guild, role)) {
      failed += 1;
      continue;
    }
    try {
      await member.roles.add(role, options.reason || 'Goliath Auto Roles');
      addedRoles.push(role);
    } catch {
      failed += 1;
    }
  }

  autoRoleStore.incrementAnalytics(guild.id, {
    assigned: addedRoles.length,
    failed,
    skipped,
    membersProcessed: member.user?.bot ? 0 : 1,
    botsProcessed: member.user?.bot ? 1 : 0,
  });

  return addedRoles;
}

function configureAutoRoles(guildId, input = {}, meta = {}) {
  if (!isModuleEnabled(guildId, 'autoRoles')) throw new Error('Auto Roles module is disabled for this server.');
  return autoRoleStore.updateAutoRolesSection(guildId, (section) => ({
    ...section,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : section.enabled,
    joinRoles: Array.isArray(input.joinRoles) ? autoRoleStore.cleanRoleIds(input.joinRoles) : section.joinRoles,
    botRoles: Array.isArray(input.botRoles) ? autoRoleStore.cleanRoleIds(input.botRoles) : section.botRoles,
    settings: { ...section.settings, ...(input.settings && typeof input.settings === 'object' ? input.settings : {}) },
    updatedAt: new Date().toISOString(),
  }), meta);
}

function setAutoRolesEnabled(guildId, enabled = true, meta = {}) {
  return autoRoleStore.setEnabled(guildId, enabled, meta);
}

async function addAutoRole(guild, roleId, options = {}, meta = {}) {
  if (!guild?.id) throw new Error('Guild is required.');
  const role = await validateManageableRole(guild, roleId);
  const section = options.bot === true ? autoRoleStore.addBotRole(guild.id, role.id, meta) : autoRoleStore.addJoinRole(guild.id, role.id, meta);
  return { role, section };
}

function removeAutoRole(guildId, roleId, options = {}, meta = {}) {
  return options.bot === true ? autoRoleStore.removeBotRole(guildId, roleId, meta) : autoRoleStore.removeJoinRole(guildId, roleId, meta);
}

function setApplyToBots(guildId, applyToBots = false, meta = {}) {
  return autoRoleStore.updateSettings(guildId, { applyToBots: applyToBots === true }, meta);
}

function getAutoRoleAnalytics(guildId) {
  return autoRoleStore.getAutoRolesSection(guildId).analytics || autoRoleStore.defaultAnalytics();
}

async function buildHealthReport(guild) {
  if (!guild?.id) throw new Error('Guild is required.');
  const section = autoRoleStore.getAutoRolesSection(guild.id);
  const botMember = getBotMember(guild);
  const roleIds = [...new Set([...(section.joinRoles || []), ...(section.botRoles || [])])];
  const roles = [];

  for (const roleId of roleIds) {
    const role = await fetchRole(guild, roleId);
    roles.push({
      roleId,
      exists: Boolean(role),
      manageable: Boolean(role && canBotManageRole(guild, role)),
      name: role?.name || null,
    });
  }

  const warnings = [
    section.enabled === false ? 'Auto Roles is disabled.' : null,
    !botMember?.permissions?.has(PermissionFlagsBits.ManageRoles) ? 'Goliath is missing Manage Roles.' : null,
    section.joinRoles.length === 0 && (!section.settings.applyToBots || section.botRoles.length === 0) ? 'No automatic roles are configured.' : null,
    ...roles.filter((role) => !role.exists).map((role) => `Role ${role.roleId} no longer exists.`),
    ...roles.filter((role) => role.exists && !role.manageable).map((role) => `${role.name || role.roleId} is above Goliath or managed by an integration.`),
  ].filter(Boolean);

  return {
    enabled: section.enabled !== false,
    hasManageRoles: Boolean(botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)),
    joinRoles: section.joinRoles.length,
    botRoles: section.botRoles.length,
    roles,
    warnings,
    healthy: warnings.length === 0,
  };
}

async function repairConfiguration(guild, meta = {}) {
  const section = autoRoleStore.getAutoRolesSection(guild.id);
  const validJoinRoles = [];
  const validBotRoles = [];

  for (const roleId of section.joinRoles || []) {
    const role = await fetchRole(guild, roleId);
    if (role && canBotManageRole(guild, role)) validJoinRoles.push(roleId);
  }
  for (const roleId of section.botRoles || []) {
    const role = await fetchRole(guild, roleId);
    if (role && canBotManageRole(guild, role)) validBotRoles.push(roleId);
  }

  return autoRoleStore.updateAutoRolesSection(guild.id, (current) => ({
    ...current,
    joinRoles: validJoinRoles,
    botRoles: validBotRoles,
    updatedAt: new Date().toISOString(),
  }), { action: 'auto_roles_repair', ...meta });
}

async function reapplyToGuild(guild, options = {}) {
  if (!guild?.members?.fetch) throw new Error('Guild members are unavailable.');
  const section = autoRoleStore.getAutoRolesSection(guild.id);
  if (section.enabled === false) return { processed: 0, assigned: 0, failed: 0 };

  const members = await guild.members.fetch();
  let processed = 0;
  let assigned = 0;
  let failed = 0;

  for (const member of members.values()) {
    if (member.user?.bot && section.settings?.applyToBots !== true) continue;
    try {
      const roles = await applyAutoRoles(member, { reason: options.reason || 'Goliath Auto Roles reapply' });
      processed += 1;
      assigned += roles.length;
    } catch {
      processed += 1;
      failed += 1;
    }
  }

  return { processed, assigned, failed };
}

function exportConfiguration(guildId) {
  return {
    exportedAt: new Date().toISOString(),
    guildId,
    module: 'autoRoles',
    config: autoRoleStore.getAutoRolesSection(guildId),
  };
}

function resetAutoRoles(guildId, meta = {}) {
  return autoRoleStore.resetAutoRolesSection(guildId, meta);
}

module.exports = {
  canManageAutoRoles,
  canBotManageRole,
  canBotManageMember,
  validateManageableRole,
  applyAutoRoles,
  configureAutoRoles,
  setAutoRolesEnabled,
  addAutoRole,
  removeAutoRole,
  setApplyToBots,
  getAutoRoleAnalytics,
  buildHealthReport,
  repairConfiguration,
  reapplyToGuild,
  exportConfiguration,
  resetAutoRoles,
};
