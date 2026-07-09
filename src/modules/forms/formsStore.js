'use strict';

const crypto = require('crypto');
const guildManager = require('../../core/guild/guildManager');

const MODULE_KEY = 'forms';

function now() {
  return new Date().toISOString();
}

function createId(prefix = 'form') {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@&#!>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function cleanIdArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanDiscordId).filter(Boolean))];
}

function cleanString(value, fallback = '', maxLength = 1000) {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function defaultFormsSection() {
  return {
    enabled: true,
    submitChannelId: null,
    logChannelId: null,
    managerRoleIds: [],
    requireReview: true,
    anonymousSubmissions: false,
    storeResponses: true,
    forms: {},
    submissions: {},
    analytics: {
      deployed: 0,
      submitted: 0,
      approved: 0,
      denied: 0,
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

function defaultQuestions() {
  return [
    { id: 'q1', label: 'Tell us what this form is for', style: 'paragraph', required: true, maxLength: 1000 },
  ];
}

function normalizeQuestion(input = {}, index = 0) {
  return {
    id: cleanString(input.id || `q${index + 1}`, `q${index + 1}`, 20),
    label: cleanString(input.label || `Question ${index + 1}`, `Question ${index + 1}`, 45),
    style: input.style === 'short' ? 'short' : 'paragraph',
    required: input.required !== false,
    maxLength: Math.max(1, Math.min(1000, Number(input.maxLength || 1000))),
  };
}

function normalizeForm(input = {}) {
  const formId = cleanString(input.formId || input.id || createId('fm'), 'fm', 80);
  const questions = Array.isArray(input.questions) && input.questions.length
    ? input.questions.slice(0, 5).map(normalizeQuestion)
    : defaultQuestions();
  return {
    formId,
    id: formId,
    enabled: input.enabled !== false,
    title: cleanString(input.title || 'Server Form', 'Server Form', 45),
    description: cleanString(input.description || 'Click below to submit this form.', '', 1000),
    buttonLabel: cleanString(input.buttonLabel || 'Submit Form', 'Submit Form', 80),
    channelId: cleanDiscordId(input.channelId),
    messageId: cleanDiscordId(input.messageId),
    questions,
    createdBy: cleanDiscordId(input.createdBy),
    createdAt: input.createdAt || now(),
    updatedAt: input.updatedAt || input.createdAt || now(),
  };
}

function normalizeSubmission(input = {}) {
  const submissionId = cleanString(input.submissionId || input.id || createId('fs'), 'fs', 80);
  return {
    submissionId,
    id: submissionId,
    formId: cleanString(input.formId || '', '', 80),
    status: ['pending', 'approved', 'denied'].includes(input.status) ? input.status : 'pending',
    authorId: cleanDiscordId(input.authorId),
    answers: input.answers && typeof input.answers === 'object' ? input.answers : {},
    channelId: cleanDiscordId(input.channelId),
    messageId: cleanDiscordId(input.messageId),
    createdAt: input.createdAt || now(),
    updatedAt: input.updatedAt || input.createdAt || now(),
    reviewedBy: cleanDiscordId(input.reviewedBy),
    reviewedAt: input.reviewedAt || null,
  };
}

function normalizeSection(section = {}) {
  const base = defaultFormsSection();
  const source = section && typeof section === 'object' ? section : {};
  const forms = source.forms && typeof source.forms === 'object' ? source.forms : {};
  const submissions = source.submissions && typeof source.submissions === 'object' ? source.submissions : {};

  return {
    ...base,
    ...source,
    enabled: source.enabled !== false,
    submitChannelId: cleanDiscordId(source.submitChannelId),
    logChannelId: cleanDiscordId(source.logChannelId),
    managerRoleIds: cleanIdArray(source.managerRoleIds),
    requireReview: source.requireReview !== false,
    anonymousSubmissions: source.anonymousSubmissions === true,
    storeResponses: source.storeResponses !== false,
    forms: Object.fromEntries(Object.entries(forms).map(([id, form]) => {
      const normalized = normalizeForm({ ...form, formId: form.formId || id });
      return [normalized.formId, normalized];
    })),
    submissions: Object.fromEntries(Object.entries(submissions).map(([id, submission]) => {
      const normalized = normalizeSubmission({ ...submission, submissionId: submission.submissionId || id });
      return [normalized.submissionId, normalized];
    })),
    analytics: {
      deployed: Math.max(0, Number(source.analytics?.deployed || 0)),
      submitted: Math.max(0, Number(source.analytics?.submitted || 0)),
      approved: Math.max(0, Number(source.analytics?.approved || 0)),
      denied: Math.max(0, Number(source.analytics?.denied || 0)),
    },
    updatedAt: source.updatedAt || now(),
  };
}

function getSection(guildId) {
  const modules = guildManager.getGuildSection(guildId, 'modules', {});
  return normalizeSection(modules?.[MODULE_KEY] || defaultFormsSection());
}

function saveSection(guildId, section, guildOrMeta = {}) {
  const normalized = normalizeSection(section);
  guildManager.updateGuildSection(guildId, 'modules', (modules = {}) => ({
    ...(modules && typeof modules === 'object' ? modules : {}),
    [MODULE_KEY]: normalized,
  }), {}, guildOrMeta);
  return normalized;
}

function updateSection(guildId, updater, guildOrMeta = {}) {
  const current = getSection(guildId);
  const next = typeof updater === 'function' ? updater(current) : updater;
  return saveSection(guildId, normalizeSection(next), guildOrMeta);
}

function saveForm(guildId, form, guildOrMeta = {}) {
  const normalized = normalizeForm(form);
  return updateSection(guildId, (section) => ({
    ...section,
    forms: {
      ...(section.forms || {}),
      [normalized.formId]: { ...(section.forms?.[normalized.formId] || {}), ...normalized, updatedAt: now() },
    },
    updatedAt: now(),
  }), guildOrMeta).forms[normalized.formId];
}

function getForm(guildId, formId) {
  return getSection(guildId).forms?.[cleanString(formId, '', 80)] || null;
}

function saveSubmission(guildId, submission, guildOrMeta = {}) {
  const normalized = normalizeSubmission(submission);
  return updateSection(guildId, (section) => ({
    ...section,
    submissions: {
      ...(section.submissions || {}),
      [normalized.submissionId]: { ...(section.submissions?.[normalized.submissionId] || {}), ...normalized, updatedAt: now() },
    },
    updatedAt: now(),
  }), guildOrMeta).submissions[normalized.submissionId];
}

function getSubmission(guildId, submissionId) {
  return getSection(guildId).submissions?.[cleanString(submissionId, '', 80)] || null;
}

function updateSubmission(guildId, submissionId, updater, guildOrMeta = {}) {
  return updateSection(guildId, (section) => {
    const current = section.submissions?.[submissionId];
    if (!current) return section;
    const next = typeof updater === 'function' ? updater(current) : updater;
    return {
      ...section,
      submissions: {
        ...(section.submissions || {}),
        [submissionId]: normalizeSubmission({ ...current, ...next, submissionId, updatedAt: now() }),
      },
      updatedAt: now(),
    };
  }, guildOrMeta).submissions?.[submissionId] || null;
}

function incrementAnalytics(guildId, changes = {}, guildOrMeta = {}) {
  return updateSection(guildId, (section) => ({
    ...section,
    analytics: {
      deployed: section.analytics.deployed + Math.max(0, Number(changes.deployed || 0)),
      submitted: section.analytics.submitted + Math.max(0, Number(changes.submitted || 0)),
      approved: section.analytics.approved + Math.max(0, Number(changes.approved || 0)),
      denied: section.analytics.denied + Math.max(0, Number(changes.denied || 0)),
    },
    updatedAt: now(),
  }), guildOrMeta).analytics;
}

module.exports = {
  MODULE_KEY,
  now,
  createId,
  defaultFormsSection,
  defaultQuestions,
  normalizeSection,
  normalizeForm,
  normalizeSubmission,
  getSection,
  saveSection,
  updateSection,
  saveForm,
  getForm,
  saveSubmission,
  getSubmission,
  updateSubmission,
  incrementAnalytics,
};
