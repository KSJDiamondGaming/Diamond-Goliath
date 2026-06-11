'use strict';

// src/modules/forms/formStore.js

const crypto = require('crypto');
const {
  getModuleSection,
  saveModuleSection,
  updateModuleSection,
} = require('../../guild/moduleSectionManager');

const MODULE = 'forms';
const FIELD_TYPES = Object.freeze({
  SHORT: 'short',
  PARAGRAPH: 'paragraph',
  SELECT: 'select',
  BOOLEAN: 'boolean',
});

const FORM_ACTIONS = Object.freeze({
  NONE: 'none',
  CREATE_TICKET: 'create_ticket',
  LOG_ONLY: 'log_only',
});

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value, fallback = '', maxLength = 1000) {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function cleanKey(value, fallback = 'form') {
  return (
    String(value || fallback)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  ).slice(0, 80);
}

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@#!&>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function createId(prefix = 'form') {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function defaultFormsSection() {
  return {
    enabled: true,
    settings: {
      defaultAction: FORM_ACTIONS.CREATE_TICKET,
      dmSubmitter: true,
      requireStaffReview: true,
    },
    forms: {},
    submissions: {},
    panels: {},
    analytics: {
      submitted: 0,
      ticketsCreated: 0,
      approved: 0,
      denied: 0,
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizeField(field = {}, index = 0) {
  const source = isPlainObject(field) ? field : {};
  const type = Object.values(FIELD_TYPES).includes(source.type) ? source.type : FIELD_TYPES.SHORT;
  const id = cleanKey(source.id || source.key || `field-${index + 1}`, `field-${index + 1}`);

  return {
    id,
    type,
    label: cleanString(source.label || `Question ${index + 1}`, `Question ${index + 1}`, 80),
    placeholder: cleanString(source.placeholder || '', '', 100),
    required: source.required !== false,
    options: Array.isArray(source.options)
      ? source.options.map((option) => cleanString(option, '', 80)).filter(Boolean).slice(0, 25)
      : [],
    minLength: Math.max(0, Number(source.minLength || 0)),
    maxLength: Math.min(Math.max(Number(source.maxLength || 400), 1), 4000),
  };
}

function normalizeForm(form = {}) {
  const source = isPlainObject(form) ? form : {};
  const formId = cleanKey(source.formId || source.id || createId('form'));
  const action = Object.values(FORM_ACTIONS).includes(source.action)
    ? source.action
    : FORM_ACTIONS.CREATE_TICKET;

  return {
    formId,
    id: formId,
    enabled: source.enabled !== false,
    name: cleanString(source.name || 'New Form', 'New Form', 100),
    description: cleanString(source.description || 'Submit this form for staff review.', '', 1000),
    buttonLabel: cleanString(source.buttonLabel || 'Open Form', 'Open Form', 80),
    action,
    ticketType: cleanKey(source.ticketType || formId, formId),
    panelId: source.panelId ? cleanKey(source.panelId) : null,
    staffRoleIds: Array.isArray(source.staffRoleIds) ? source.staffRoleIds.map(cleanDiscordId).filter(Boolean) : [],
    logChannelId: cleanDiscordId(source.logChannelId),
    outputCategoryId: cleanDiscordId(source.outputCategoryId),
    fields: Array.isArray(source.fields)
      ? source.fields.map(normalizeField).slice(0, 5)
      : [],
    createdAt: source.createdAt || now(),
    createdBy: cleanDiscordId(source.createdBy),
    updatedAt: source.updatedAt || source.createdAt || now(),
    updatedBy: cleanDiscordId(source.updatedBy),
  };
}

function normalizeSubmission(submission = {}) {
  const source = isPlainObject(submission) ? submission : {};
  const submissionId = cleanKey(source.submissionId || source.id || createId('submission'));

  return {
    submissionId,
    id: submissionId,
    formId: cleanKey(source.formId || 'unknown'),
    userId: cleanDiscordId(source.userId),
    userTag: cleanString(source.userTag || '', '', 120),
    status: ['pending', 'approved', 'denied', 'closed'].includes(source.status) ? source.status : 'pending',
    answers: isPlainObject(source.answers) ? clone(source.answers) : {},
    ticketId: source.ticketId ? cleanString(source.ticketId, '', 120) : null,
    ticketChannelId: cleanDiscordId(source.ticketChannelId),
    reviewedBy: cleanDiscordId(source.reviewedBy),
    reviewedAt: source.reviewedAt || null,
    createdAt: source.createdAt || now(),
    updatedAt: source.updatedAt || source.createdAt || now(),
  };
}

function normalizePanel(panel = {}) {
  const source = isPlainObject(panel) ? panel : {};
  const panelId = cleanKey(source.panelId || source.id || createId('form_panel'));

  return {
    panelId,
    id: panelId,
    enabled: source.enabled !== false,
    title: cleanString(source.title || 'Forms', 'Forms', 100),
    description: cleanString(source.description || 'Choose a form below.', '', 1000),
    channelId: cleanDiscordId(source.channelId),
    messageId: cleanDiscordId(source.messageId),
    formIds: Array.isArray(source.formIds) ? source.formIds.map((id) => cleanKey(id)).slice(0, 25) : [],
    createdAt: source.createdAt || now(),
    createdBy: cleanDiscordId(source.createdBy),
    updatedAt: source.updatedAt || source.createdAt || now(),
    updatedBy: cleanDiscordId(source.updatedBy),
  };
}

function normalizeFormsSection(section = {}) {
  const base = defaultFormsSection();
  const source = isPlainObject(section) ? section : {};

  return {
    ...base,
    ...clone(source),
    enabled: source.enabled !== false,
    settings: {
      ...base.settings,
      ...(isPlainObject(source.settings) ? clone(source.settings) : {}),
    },
    forms: Object.fromEntries(
      Object.entries(isPlainObject(source.forms) ? source.forms : {})
        .map(([id, form]) => {
          const normalized = normalizeForm({ ...form, formId: form.formId || id });
          return [normalized.formId, normalized];
        })
    ),
    submissions: Object.fromEntries(
      Object.entries(isPlainObject(source.submissions) ? source.submissions : {})
        .map(([id, submission]) => {
          const normalized = normalizeSubmission({ ...submission, submissionId: submission.submissionId || id });
          return [normalized.submissionId, normalized];
        })
    ),
    panels: Object.fromEntries(
      Object.entries(isPlainObject(source.panels) ? source.panels : {})
        .map(([id, panel]) => {
          const normalized = normalizePanel({ ...panel, panelId: panel.panelId || id });
          return [normalized.panelId, normalized];
        })
    ),
    analytics: {
      submitted: Math.max(0, Number(source.analytics?.submitted || 0)),
      ticketsCreated: Math.max(0, Number(source.analytics?.ticketsCreated || 0)),
      approved: Math.max(0, Number(source.analytics?.approved || 0)),
      denied: Math.max(0, Number(source.analytics?.denied || 0)),
    },
    createdAt: source.createdAt || base.createdAt,
    updatedAt: source.updatedAt || now(),
  };
}

function getFormsSection(guildId) {
  return normalizeFormsSection(getModuleSection(guildId, MODULE, defaultFormsSection()));
}

function saveFormsSection(guildId, section, guildOrMeta = {}) {
  return normalizeFormsSection(saveModuleSection(guildId, MODULE, normalizeFormsSection(section), guildOrMeta));
}

function updateFormsSection(guildId, updater, guildOrMeta = {}) {
  return normalizeFormsSection(updateModuleSection(
    guildId,
    MODULE,
    (current) => {
      const normalized = normalizeFormsSection(current);
      const next = typeof updater === 'function' ? updater(clone(normalized)) : updater;
      return normalizeFormsSection(next);
    },
    defaultFormsSection(),
    guildOrMeta
  ));
}

function saveForm(guildId, form, guildOrMeta = {}) {
  const normalized = normalizeForm(form);
  return updateFormsSection(guildId, (section) => ({
    ...section,
    forms: {
      ...section.forms,
      [normalized.formId]: {
        ...(section.forms[normalized.formId] || {}),
        ...normalized,
        updatedAt: now(),
      },
    },
    updatedAt: now(),
  }), guildOrMeta).forms[normalized.formId];
}

function getForm(guildId, formId) {
  return getFormsSection(guildId).forms[cleanKey(formId)] || null;
}

function listForms(guildId) {
  return Object.values(getFormsSection(guildId).forms || {});
}

function savePanel(guildId, panel, guildOrMeta = {}) {
  const normalized = normalizePanel(panel);
  return updateFormsSection(guildId, (section) => ({
    ...section,
    panels: {
      ...section.panels,
      [normalized.panelId]: {
        ...(section.panels[normalized.panelId] || {}),
        ...normalized,
        updatedAt: now(),
      },
    },
    updatedAt: now(),
  }), guildOrMeta).panels[normalized.panelId];
}

function getPanel(guildId, panelId) {
  return getFormsSection(guildId).panels[cleanKey(panelId)] || null;
}

function saveSubmission(guildId, submission, guildOrMeta = {}) {
  const normalized = normalizeSubmission(submission);
  const isNew = !getFormsSection(guildId).submissions[normalized.submissionId];

  return updateFormsSection(guildId, (section) => ({
    ...section,
    submissions: {
      ...section.submissions,
      [normalized.submissionId]: {
        ...(section.submissions[normalized.submissionId] || {}),
        ...normalized,
        updatedAt: now(),
      },
    },
    analytics: {
      ...section.analytics,
      submitted: section.analytics.submitted + (isNew ? 1 : 0),
    },
    updatedAt: now(),
  }), guildOrMeta).submissions[normalized.submissionId];
}

function updateSubmission(guildId, submissionId, updates = {}, guildOrMeta = {}) {
  const safeId = cleanKey(submissionId, 'submission');

  return updateFormsSection(guildId, (section) => {
    const existing = section.submissions[safeId];
    if (!existing) return section;

    const normalized = normalizeSubmission({
      ...existing,
      ...(isPlainObject(updates) ? updates : {}),
      submissionId: safeId,
      updatedAt: now(),
    });

    return {
      ...section,
      submissions: {
        ...section.submissions,
        [safeId]: normalized,
      },
      updatedAt: now(),
    };
  }, guildOrMeta).submissions[safeId] || null;
}

function incrementAnalytics(guildId, increments = {}, guildOrMeta = {}) {
  return updateFormsSection(guildId, (section) => {
    const analytics = { ...section.analytics };

    for (const [key, amount] of Object.entries(increments || {})) {
      const value = Number(amount || 0);
      if (!Number.isFinite(value)) continue;
      analytics[key] = Math.max(0, Number(analytics[key] || 0) + value);
    }

    return {
      ...section,
      analytics,
      updatedAt: now(),
    };
  }, guildOrMeta).analytics;
}

module.exports = {
  MODULE,
  FIELD_TYPES,
  FORM_ACTIONS,
  createId,
  cleanKey,
  defaultFormsSection,
  normalizeForm,
  normalizePanel,
  normalizeSubmission,
  normalizeFormsSection,
  getFormsSection,
  saveFormsSection,
  updateFormsSection,
  saveForm,
  getForm,
  listForms,
  savePanel,
  getPanel,
  saveSubmission,
  updateSubmission,
  incrementAnalytics,
};
