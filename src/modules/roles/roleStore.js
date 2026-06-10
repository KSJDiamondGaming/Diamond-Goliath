'use strict';

// src/modules/roles/roleStore.js

const crypto = require('crypto');

const {
  getGuildSection,
  saveGuildSection,
  updateGuildSection,
} = require('../../guild/guildManager');

const SECTION = 'roles';

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function asObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? [...new Set(value.filter(Boolean).map(String))] : [];
}

function cleanString(value, fallback = '', maxLength = 1000) {
  const text = String(value ?? fallback).trim();
  return text.slice(0, maxLength);
}

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@&#!>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function cleanKey(value, fallback = 'default') {
  return (
    String(value || fallback)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  ).slice(0, 80);
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanNonNegativeInt(value, fallback = 0) {
  return Math.max(0, Math.floor(cleanNumber(value, fallback)));
}

function createId(prefix = 'role') {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function defaultRolesSection() {
  return {
    enabled: true,
    settings: {
      allowSelfRemove: true,
      auditLog: true,
      dailyTimedRoleCheck: true,
    },
    reactionPanels: {},
    timedRoles: {},
    joinRoles: {},
    analytics: {
      assigned: 0,
      removed: 0,
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizeReactionRole(role = {}) {
  const roleId = cleanDiscordId(role.roleId || role.id);

  return {
    id: cleanKey(role.id || roleId || createId('rr_role')),
    roleId,
    label: cleanString(role.label || role.name || 'Role', 'Role', 80),
    emoji: cleanString(role.emoji || '', '', 40),
    description: cleanString(role.description || '', '', 200),
    mode: ['toggle', 'add', 'remove', 'verify'].includes(role.mode)
      ? role.mode
      : 'toggle',
    groupId: role.groupId ? cleanKey(role.groupId) : null,
    maxPerGroup: cleanNonNegativeInt(role.maxPerGroup, 0),
    enabled: role.enabled !== false,
    createdAt: role.createdAt || now(),
    createdBy: cleanDiscordId(role.createdBy),
    updatedAt: role.updatedAt || role.createdAt || now(),
  };
}

function normalizeReactionPanel(panel = {}) {
  const panelId = cleanKey(panel.panelId || panel.id || createId('role_panel'));
  const roles = Array.isArray(panel.roles)
    ? panel.roles.map(normalizeReactionRole).filter((role) => role.roleId)
    : [];

  return {
    panelId,
    id: panelId,
    enabled: panel.enabled !== false,
    title: cleanString(panel.title || 'Reaction Roles', 'Reaction Roles', 100),
    description: cleanString(panel.description || 'Use the buttons below to manage your roles.', '', 1000),
    channelId: cleanDiscordId(panel.channelId),
    messageId: cleanDiscordId(panel.messageId),
    source: cleanString(panel.source || 'roles', 'roles', 50),
    sourceId: cleanString(panel.sourceId || '', '', 100) || null,
    roles,
    createdAt: panel.createdAt || now(),
    createdBy: cleanDiscordId(panel.createdBy),
    updatedAt: panel.updatedAt || panel.createdAt || now(),
    updatedBy: cleanDiscordId(panel.updatedBy),
  };
}

function normalizeTimedRole(rule = {}) {
  const ruleId = cleanKey(rule.ruleId || rule.id || createId('timed_role'));

  return {
    ruleId,
    id: ruleId,
    enabled: rule.enabled !== false,
    name: cleanString(rule.name || 'Timed Role', 'Timed Role', 100),
    roleId: cleanDiscordId(rule.roleId),
    afterDays: cleanNonNegativeInt(rule.afterDays, 0),
    removeIfBelow: rule.removeIfBelow === true,
    onlyHumans: rule.onlyHumans !== false,
    createdAt: rule.createdAt || now(),
    createdBy: cleanDiscordId(rule.createdBy),
    updatedAt: rule.updatedAt || rule.createdAt || now(),
    updatedBy: cleanDiscordId(rule.updatedBy),
    lastRunAt: rule.lastRunAt || null,
    lastAssignedCount: cleanNonNegativeInt(rule.lastAssignedCount, 0),
  };
}

function normalizeJoinRole(rule = {}) {
  const ruleId = cleanKey(rule.ruleId || rule.id || createId('join_role'));

  return {
    ruleId,
    id: ruleId,
    enabled: rule.enabled !== false,
    name: cleanString(rule.name || 'Join Role', 'Join Role', 100),
    roleId: cleanDiscordId(rule.roleId),
    delayMinutes: cleanNonNegativeInt(rule.delayMinutes, 0),
    onlyHumans: rule.onlyHumans !== false,
    createdAt: rule.createdAt || now(),
    createdBy: cleanDiscordId(rule.createdBy),
    updatedAt: rule.updatedAt || rule.createdAt || now(),
    updatedBy: cleanDiscordId(rule.updatedBy),
  };
}

function normalizeRolesSection(section = {}) {
  const base = defaultRolesSection();
  const source = asObject(section, {});
  const reactionPanels = asObject(source.reactionPanels, {});
  const timedRoles = asObject(source.timedRoles, {});
  const joinRoles = asObject(source.joinRoles, {});

  return {
    ...base,
    ...source,
    enabled: source.enabled !== false,
    settings: {
      ...base.settings,
      ...asObject(source.settings, {}),
    },
    reactionPanels: Object.fromEntries(
      Object.entries(reactionPanels)
        .map(([id, panel]) => {
          const normalized = normalizeReactionPanel({ ...panel, panelId: panel.panelId || id });
          return [normalized.panelId, normalized];
        })
    ),
    timedRoles: Object.fromEntries(
      Object.entries(timedRoles)
        .map(([id, rule]) => {
          const normalized = normalizeTimedRole({ ...rule, ruleId: rule.ruleId || id });
          return [normalized.ruleId, normalized];
        })
        .filter(([, rule]) => rule.roleId)
    ),
    joinRoles: Object.fromEntries(
      Object.entries(joinRoles)
        .map(([id, rule]) => {
          const normalized = normalizeJoinRole({ ...rule, ruleId: rule.ruleId || id });
          return [normalized.ruleId, normalized];
        })
        .filter(([, rule]) => rule.roleId)
    ),
    analytics: {
      assigned: cleanNonNegativeInt(source.analytics?.assigned, 0),
      removed: cleanNonNegativeInt(source.analytics?.removed, 0),
    },
    updatedAt: source.updatedAt || now(),
  };
}

function getRolesSection(guildId) {
  return normalizeRolesSection(
    getGuildSection(guildId, SECTION, defaultRolesSection())
  );
}

function saveRolesSection(guildId, section, guildOrMeta = {}) {
  return normalizeRolesSection(
    saveGuildSection(guildId, SECTION, normalizeRolesSection(section), guildOrMeta)
  );
}

function updateRolesSection(guildId, updater, guildOrMeta = {}) {
  return normalizeRolesSection(
    updateGuildSection(
      guildId,
      SECTION,
      (current) => {
        const normalized = normalizeRolesSection(current);
        const next = typeof updater === 'function' ? updater(clone(normalized)) : updater;
        return normalizeRolesSection(next);
      },
      defaultRolesSection(),
      guildOrMeta
    )
  );
}

function setEnabled(guildId, enabled, guildOrMeta = {}) {
  return updateRolesSection(
    guildId,
    (section) => ({
      ...section,
      enabled: Boolean(enabled),
      updatedAt: now(),
    }),
    guildOrMeta
  );
}

function getReactionPanels(guildId) {
  return Object.values(getRolesSection(guildId).reactionPanels || {});
}

function getReactionPanel(guildId, panelId) {
  const key = cleanKey(panelId);
  return getRolesSection(guildId).reactionPanels?.[key] || null;
}

function saveReactionPanel(guildId, panel, guildOrMeta = {}) {
  const normalized = normalizeReactionPanel(panel);

  return updateRolesSection(
    guildId,
    (section) => ({
      ...section,
      reactionPanels: {
        ...(section.reactionPanels || {}),
        [normalized.panelId]: {
          ...(section.reactionPanels?.[normalized.panelId] || {}),
          ...normalized,
          updatedAt: now(),
        },
      },
      updatedAt: now(),
    }),
    guildOrMeta
  ).reactionPanels[normalized.panelId];
}

function deleteReactionPanel(guildId, panelId, guildOrMeta = {}) {
  const key = cleanKey(panelId);

  return updateRolesSection(
    guildId,
    (section) => {
      const reactionPanels = { ...(section.reactionPanels || {}) };
      delete reactionPanels[key];

      return {
        ...section,
        reactionPanels,
        updatedAt: now(),
      };
    },
    guildOrMeta
  );
}

function getTimedRoles(guildId) {
  return Object.values(getRolesSection(guildId).timedRoles || {});
}

function getTimedRole(guildId, ruleId) {
  const key = cleanKey(ruleId);
  return getRolesSection(guildId).timedRoles?.[key] || null;
}

function saveTimedRole(guildId, rule, guildOrMeta = {}) {
  const normalized = normalizeTimedRole(rule);

  if (!normalized.roleId) {
    throw new Error('Timed role requires a valid roleId.');
  }

  return updateRolesSection(
    guildId,
    (section) => ({
      ...section,
      timedRoles: {
        ...(section.timedRoles || {}),
        [normalized.ruleId]: {
          ...(section.timedRoles?.[normalized.ruleId] || {}),
          ...normalized,
          updatedAt: now(),
        },
      },
      updatedAt: now(),
    }),
    guildOrMeta
  ).timedRoles[normalized.ruleId];
}

function deleteTimedRole(guildId, ruleId, guildOrMeta = {}) {
  const key = cleanKey(ruleId);

  return updateRolesSection(
    guildId,
    (section) => {
      const timedRoles = { ...(section.timedRoles || {}) };
      delete timedRoles[key];

      return {
        ...section,
        timedRoles,
        updatedAt: now(),
      };
    },
    guildOrMeta
  );
}

function touchTimedRoleRun(guildId, ruleId, assignedCount = 0, guildOrMeta = {}) {
  const key = cleanKey(ruleId);

  return updateRolesSection(
    guildId,
    (section) => {
      const current = section.timedRoles?.[key];
      if (!current) return section;

      return {
        ...section,
        timedRoles: {
          ...(section.timedRoles || {}),
          [key]: {
            ...current,
            lastRunAt: now(),
            lastAssignedCount: cleanNonNegativeInt(assignedCount, 0),
            updatedAt: now(),
          },
        },
        updatedAt: now(),
      };
    },
    guildOrMeta
  ).timedRoles[key];
}

function addAnalytics(guildId, changes = {}, guildOrMeta = {}) {
  return updateRolesSection(
    guildId,
    (section) => ({
      ...section,
      analytics: {
        assigned:
          cleanNonNegativeInt(section.analytics?.assigned, 0) +
          cleanNonNegativeInt(changes.assigned, 0),
        removed:
          cleanNonNegativeInt(section.analytics?.removed, 0) +
          cleanNonNegativeInt(changes.removed, 0),
      },
      updatedAt: now(),
    }),
    guildOrMeta
  );
}

module.exports = {
  SECTION,
  createId,
  now,
  asArray,
  cleanKey,
  cleanDiscordId,
  defaultRolesSection,
  normalizeRolesSection,
  normalizeReactionPanel,
  normalizeTimedRole,
  normalizeJoinRole,
  getRolesSection,
  saveRolesSection,
  updateRolesSection,
  setEnabled,
  getReactionPanels,
  getReactionPanel,
  saveReactionPanel,
  deleteReactionPanel,
  getTimedRoles,
  getTimedRole,
  saveTimedRole,
  deleteTimedRole,
  touchTimedRoleRun,
  addAnalytics,
};
