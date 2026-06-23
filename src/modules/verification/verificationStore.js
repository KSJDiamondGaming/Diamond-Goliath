'use strict';

// src/modules/verification/verificationStore.js

const crypto = require('crypto');

const {
  getModuleSection,
  saveModuleSection,
  updateModuleSection,
} = require('../../core/guild/moduleSectionManager');

const MODULE = 'verification';

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

function cleanString(value, fallback = '', maxLength = 1000) {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function cleanDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function cleanCount(value) {
  return Math.max(0, Number(value || 0));
}

function createId(prefix = 'verify') {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function defaultAnalytics() {
  return {
    verified: 0,
    failed: 0,
    alreadyVerified: 0,
    requirementBlocked: 0,
    unavailable: 0,
    roleManageFailed: 0,
    lastVerificationAt: null,
    lastFailedAt: null,
    lastRequirementBlockedAt: null,
    lastUnavailableAt: null,
  };
}

function defaultVerificationSection() {
  return {
    enabled: false,
    settings: {
      verifiedRoleId: null,
      unverifiedRoleId: null,
      logChannelId: null,
      dmOnVerify: true,
      requireButton: true,
    },
    panels: {},
    analytics: defaultAnalytics(),
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizeAnalytics(analytics = {}) {
  const source = analytics && typeof analytics === 'object' ? analytics : {};
  const base = defaultAnalytics();

  return {
    ...base,
    ...clone(source),
    verified: cleanCount(source.verified),
    failed: cleanCount(source.failed),
    alreadyVerified: cleanCount(source.alreadyVerified),
    requirementBlocked: cleanCount(source.requirementBlocked),
    unavailable: cleanCount(source.unavailable),
    roleManageFailed: cleanCount(source.roleManageFailed),
    lastVerificationAt: cleanDate(source.lastVerificationAt),
    lastFailedAt: cleanDate(source.lastFailedAt),
    lastRequirementBlockedAt: cleanDate(source.lastRequirementBlockedAt),
    lastUnavailableAt: cleanDate(source.lastUnavailableAt),
  };
}

function normalizePanel(panel = {}) {
  const source = panel && typeof panel === 'object' ? panel : {};
  const panelId = cleanString(source.panelId || source.id || createId('verify_panel'), 'verify_panel', 80);

  return {
    panelId,
    id: panelId,
    enabled: source.enabled !== false,
    title: cleanString(source.title || 'Server Verification', 'Server Verification', 100),
    description: cleanString(source.description || 'Press the button below to verify and unlock the server.', '', 1000),
    buttonLabel: cleanString(source.buttonLabel || 'Verify', 'Verify', 80),
    channelId: cleanDiscordId(source.channelId),
    messageId: cleanDiscordId(source.messageId),
    createdBy: cleanDiscordId(source.createdBy),
    createdAt: source.createdAt || now(),
    updatedAt: source.updatedAt || source.createdAt || now(),
  };
}

function normalizeVerificationSection(section = {}) {
  const base = defaultVerificationSection();
  const source = section && typeof section === 'object' ? section : {};
  const panels = source.panels && typeof source.panels === 'object' ? source.panels : {};

  return {
    ...base,
    ...clone(source),
    enabled: source.enabled === true,
    settings: {
      ...base.settings,
      ...(source.settings && typeof source.settings === 'object' ? clone(source.settings) : {}),
      verifiedRoleId: cleanDiscordId(source.settings?.verifiedRoleId),
      unverifiedRoleId: cleanDiscordId(source.settings?.unverifiedRoleId),
      logChannelId: cleanDiscordId(source.settings?.logChannelId),
      dmOnVerify: source.settings?.dmOnVerify !== false,
      requireButton: source.settings?.requireButton !== false,
    },
    panels: Object.fromEntries(
      Object.entries(panels).map(([id, panel]) => {
        const normalized = normalizePanel({ ...panel, panelId: panel.panelId || id });
        return [normalized.panelId, normalized];
      })
    ),
    analytics: normalizeAnalytics(source.analytics),
    createdAt: source.createdAt || base.createdAt,
    updatedAt: source.updatedAt || now(),
  };
}

function getVerificationSection(guildId) {
  return normalizeVerificationSection(getModuleSection(guildId, MODULE, defaultVerificationSection()));
}

function saveVerificationSection(guildId, section, meta = {}) {
  return normalizeVerificationSection(saveModuleSection(guildId, MODULE, normalizeVerificationSection(section), meta));
}

function updateVerificationSection(guildId, updater, meta = {}) {
  return normalizeVerificationSection(updateModuleSection(
    guildId,
    MODULE,
    (current) => {
      const normalized = normalizeVerificationSection(current);
      const next = typeof updater === 'function' ? updater(clone(normalized)) : updater;
      return normalizeVerificationSection(next);
    },
    defaultVerificationSection(),
    meta
  ));
}

function savePanel(guildId, panel, meta = {}) {
  const normalized = normalizePanel(panel);

  return updateVerificationSection(guildId, (section) => ({
    ...section,
    panels: {
      ...section.panels,
      [normalized.panelId]: {
        ...(section.panels?.[normalized.panelId] || {}),
        ...normalized,
        updatedAt: now(),
      },
    },
    updatedAt: now(),
  }), meta).panels[normalized.panelId];
}

function getPanel(guildId, panelId) {
  return getVerificationSection(guildId).panels?.[String(panelId || '')] || null;
}

function incrementAnalytics(guildId, increments = {}, meta = {}) {
  const timestamp = now();

  return updateVerificationSection(guildId, (section) => {
    const analytics = normalizeAnalytics(section.analytics);
    const nextAnalytics = {
      ...analytics,
      verified: cleanCount(analytics.verified + Number(increments.verified || 0)),
      failed: cleanCount(analytics.failed + Number(increments.failed || 0)),
      alreadyVerified: cleanCount(analytics.alreadyVerified + Number(increments.alreadyVerified || 0)),
      requirementBlocked: cleanCount(analytics.requirementBlocked + Number(increments.requirementBlocked || 0)),
      unavailable: cleanCount(analytics.unavailable + Number(increments.unavailable || 0)),
      roleManageFailed: cleanCount(analytics.roleManageFailed + Number(increments.roleManageFailed || 0)),
    };

    if (Number(increments.verified || 0) > 0) nextAnalytics.lastVerificationAt = timestamp;
    if (Number(increments.failed || 0) > 0) nextAnalytics.lastFailedAt = timestamp;
    if (Number(increments.requirementBlocked || 0) > 0) nextAnalytics.lastRequirementBlockedAt = timestamp;
    if (Number(increments.unavailable || 0) > 0) nextAnalytics.lastUnavailableAt = timestamp;

    return {
      ...section,
      analytics: nextAnalytics,
      updatedAt: timestamp,
    };
  }, meta).analytics;
}

module.exports = {
  MODULE,
  createId,
  defaultAnalytics,
  defaultVerificationSection,
  normalizeAnalytics,
  normalizeVerificationSection,
  getVerificationSection,
  saveVerificationSection,
  updateVerificationSection,
  savePanel,
  getPanel,
  incrementAnalytics,
};
