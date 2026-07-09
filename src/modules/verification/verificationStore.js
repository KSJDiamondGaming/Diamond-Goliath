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

function cleanHexColor(value, fallback = '#57f287') {
  const clean = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(clean) ? clean : fallback;
}

function cleanButtonStyle(value, fallback = 'success') {
  const clean = String(value || '').trim().toLowerCase();
  return ['primary', 'secondary', 'success', 'danger'].includes(clean) ? clean : fallback;
}

function cleanUrl(value) {
  const clean = String(value || '').trim().slice(0, 500);
  if (!clean) return null;
  return /^https?:\/\//i.test(clean) ? clean : null;
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

function defaultPanelTemplate() {
  return {
    title: 'Server Verification',
    description: 'Press the button below to verify and unlock the server.',
    color: '#57f287',
    footer: 'Goliath Verification',
    thumbnailUrl: null,
    imageUrl: null,
    buttonLabel: 'Verify',
    buttonEmoji: null,
    buttonStyle: 'success',
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
      removePendingRole: true,
    },
    panelTemplate: defaultPanelTemplate(),
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

function normalizePanelTemplate(template = {}) {
  const source = template && typeof template === 'object' ? template : {};
  const base = defaultPanelTemplate();

  return {
    ...base,
    ...clone(source),
    title: cleanString(source.title || base.title, base.title, 100),
    description: cleanString(source.description || base.description, base.description, 1000),
    color: cleanHexColor(source.color, base.color),
    footer: cleanString(source.footer || base.footer, base.footer, 200),
    thumbnailUrl: cleanUrl(source.thumbnailUrl),
    imageUrl: cleanUrl(source.imageUrl),
    buttonLabel: cleanString(source.buttonLabel || base.buttonLabel, base.buttonLabel, 80),
    buttonEmoji: cleanString(source.buttonEmoji || '', '', 80) || null,
    buttonStyle: cleanButtonStyle(source.buttonStyle, base.buttonStyle),
  };
}

function normalizePanel(panel = {}) {
  const source = panel && typeof panel === 'object' ? panel : {};
  const panelId = cleanString(source.panelId || source.id || createId('verify_panel'), 'verify_panel', 80);
  const template = normalizePanelTemplate(source);

  return {
    panelId,
    id: panelId,
    enabled: source.enabled !== false,
    ...template,
    channelId: cleanDiscordId(source.channelId),
    messageId: cleanDiscordId(source.messageId),
    createdBy: cleanDiscordId(source.createdBy),
    createdAt: source.createdAt || now(),
    updatedAt: source.updatedAt || source.createdAt || now(),
    lastDeployedAt: cleanDate(source.lastDeployedAt),
    deletedAt: cleanDate(source.deletedAt),
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
      removePendingRole: source.settings?.removePendingRole !== false,
    },
    panelTemplate: normalizePanelTemplate(source.panelTemplate),
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

function deletePanel(guildId, panelId, meta = {}) {
  return updateVerificationSection(guildId, (section) => {
    const panels = { ...(section.panels || {}) };
    delete panels[String(panelId || '')];
    return {
      ...section,
      panels,
      updatedAt: now(),
    };
  }, meta);
}

function getLatestPanel(guildId) {
  const panels = Object.values(getVerificationSection(guildId).panels || {});
  return panels.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0] || null;
}

function updatePanelTemplate(guildId, template, meta = {}) {
  return updateVerificationSection(guildId, (section) => ({
    ...section,
    panelTemplate: normalizePanelTemplate({
      ...(section.panelTemplate || {}),
      ...(template || {}),
    }),
    updatedAt: now(),
  }), meta).panelTemplate;
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
  defaultPanelTemplate,
  defaultVerificationSection,
  normalizeAnalytics,
  normalizePanelTemplate,
  normalizeVerificationSection,
  getVerificationSection,
  saveVerificationSection,
  updateVerificationSection,
  savePanel,
  getPanel,
  getLatestPanel,
  deletePanel,
  updatePanelTemplate,
  incrementAnalytics,
};
