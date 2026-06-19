'use strict';

// src/modules/autoRoles/autoRoleStore.js

const {
  getModuleSection,
  saveModuleSection,
  updateModuleSection,
} = require('../../guild/moduleSectionManager');

const MODULE = 'autoRoles';

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@&#!>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function cleanRoleIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanDiscordId).filter(Boolean))];
}

function defaultAutoRolesSection() {
  return {
    enabled: true,
    joinRoles: [],
    botRoles: [],
    settings: {
      applyToBots: false,
      auditLog: true,
    },
    analytics: {
      assigned: 0,
      failed: 0,
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizeAutoRolesSection(section = {}) {
  const base = defaultAutoRolesSection();
  const source = section && typeof section === 'object' ? section : {};

  return {
    ...base,
    ...clone(source),
    enabled: source.enabled !== false,
    joinRoles: cleanRoleIds(source.joinRoles || source.roleIds || source.roles),
    botRoles: cleanRoleIds(source.botRoles),
    settings: {
      ...base.settings,
      ...(source.settings && typeof source.settings === 'object' ? clone(source.settings) : {}),
      applyToBots: source.settings?.applyToBots === true,
      auditLog: source.settings?.auditLog !== false,
    },
    analytics: {
      assigned: Math.max(0, Number(source.analytics?.assigned || 0)),
      failed: Math.max(0, Number(source.analytics?.failed || 0)),
    },
    createdAt: source.createdAt || base.createdAt,
    updatedAt: source.updatedAt || now(),
  };
}

function getAutoRolesSection(guildId) {
  return normalizeAutoRolesSection(getModuleSection(guildId, MODULE, defaultAutoRolesSection()));
}

function saveAutoRolesSection(guildId, section, meta = {}) {
  return normalizeAutoRolesSection(saveModuleSection(guildId, MODULE, normalizeAutoRolesSection(section), meta));
}

function updateAutoRolesSection(guildId, updater, meta = {}) {
  return normalizeAutoRolesSection(updateModuleSection(
    guildId,
    MODULE,
    (current) => {
      const normalized = normalizeAutoRolesSection(current);
      const next = typeof updater === 'function' ? updater(clone(normalized)) : updater;
      return normalizeAutoRolesSection(next);
    },
    defaultAutoRolesSection(),
    meta
  ));
}

function setEnabled(guildId, enabled = true, meta = {}) {
  return updateAutoRolesSection(guildId, (section) => ({
    ...section,
    enabled: enabled !== false,
    updatedAt: now(),
  }), meta);
}

function setJoinRoles(guildId, roleIds = [], meta = {}) {
  return updateAutoRolesSection(guildId, (section) => ({
    ...section,
    joinRoles: cleanRoleIds(roleIds),
    updatedAt: now(),
  }), meta);
}

function addJoinRole(guildId, roleId, meta = {}) {
  const safeRoleId = cleanDiscordId(roleId);
  if (!safeRoleId) throw new Error('A valid role ID is required.');

  return updateAutoRolesSection(guildId, (section) => ({
    ...section,
    joinRoles: [...new Set([...(section.joinRoles || []), safeRoleId])],
    updatedAt: now(),
  }), meta);
}

function removeJoinRole(guildId, roleId, meta = {}) {
  const safeRoleId = cleanDiscordId(roleId);
  if (!safeRoleId) throw new Error('A valid role ID is required.');

  return updateAutoRolesSection(guildId, (section) => ({
    ...section,
    joinRoles: (section.joinRoles || []).filter((id) => id !== safeRoleId),
    updatedAt: now(),
  }), meta);
}

function setBotRoles(guildId, roleIds = [], meta = {}) {
  return updateAutoRolesSection(guildId, (section) => ({
    ...section,
    botRoles: cleanRoleIds(roleIds),
    updatedAt: now(),
  }), meta);
}

function addBotRole(guildId, roleId, meta = {}) {
  const safeRoleId = cleanDiscordId(roleId);
  if (!safeRoleId) throw new Error('A valid role ID is required.');

  return updateAutoRolesSection(guildId, (section) => ({
    ...section,
    botRoles: [...new Set([...(section.botRoles || []), safeRoleId])],
    updatedAt: now(),
  }), meta);
}

function removeBotRole(guildId, roleId, meta = {}) {
  const safeRoleId = cleanDiscordId(roleId);
  if (!safeRoleId) throw new Error('A valid role ID is required.');

  return updateAutoRolesSection(guildId, (section) => ({
    ...section,
    botRoles: (section.botRoles || []).filter((id) => id !== safeRoleId),
    updatedAt: now(),
  }), meta);
}

function updateSettings(guildId, settings = {}, meta = {}) {
  return updateAutoRolesSection(guildId, (section) => ({
    ...section,
    settings: {
      ...(section.settings || {}),
      ...(settings && typeof settings === 'object' ? settings : {}),
      applyToBots: settings.applyToBots === true,
      auditLog: settings.auditLog !== false,
    },
    updatedAt: now(),
  }), meta);
}

function incrementAnalytics(guildId, increments = {}, meta = {}) {
  return updateAutoRolesSection(guildId, (section) => ({
    ...section,
    analytics: {
      ...section.analytics,
      assigned: Math.max(0, Number(section.analytics?.assigned || 0) + Number(increments.assigned || 0)),
      failed: Math.max(0, Number(section.analytics?.failed || 0) + Number(increments.failed || 0)),
    },
    updatedAt: now(),
  }), meta).analytics;
}

module.exports = {
  MODULE,
  cleanDiscordId,
  cleanRoleIds,
  defaultAutoRolesSection,
  normalizeAutoRolesSection,
  getAutoRolesSection,
  saveAutoRolesSection,
  updateAutoRolesSection,
  setEnabled,
  setJoinRoles,
  addJoinRole,
  removeJoinRole,
  setBotRoles,
  addBotRole,
  removeBotRole,
  updateSettings,
  incrementAnalytics,
};
