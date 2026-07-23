'use strict';

const crypto = require('crypto');
const socialStore = require('./socialStore');

const MAX_HISTORY = 500;
const MAX_INCIDENT_HISTORY = 100;
const INCIDENT_EVENT_TYPE = 'provider_incident';
const VALID_STATUSES = new Set(['sent', 'failed', 'skipped', 'suppressed', 'queued', 'retried', 'test']);

function now() {
  return new Date().toISOString();
}

function cleanText(value, fallback = '', maxLength = 500) {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function cleanStatus(value) {
  const status = cleanText(value, 'skipped', 30).toLowerCase();
  return VALID_STATUSES.has(status) ? status : 'skipped';
}

function normalizeEntry(entry = {}) {
  return {
    id: cleanText(entry.id || `social_event_${crypto.randomUUID().slice(0, 12)}`, '', 100),
    status: cleanStatus(entry.status),
    eventType: cleanText(entry.eventType || 'alert', 'alert', 40),
    alertType: cleanText(entry.alertType || 'live', 'live', 30),
    accountId: cleanText(entry.accountId, '', 100) || null,
    creator: cleanText(entry.creator, '', 120) || null,
    platform: cleanText(entry.platform, '', 30) || null,
    contentId: cleanText(entry.contentId, '', 200) || null,
    channelId: cleanText(entry.channelId, '', 30) || null,
    messageId: cleanText(entry.messageId, '', 30) || null,
    title: cleanText(entry.title, '', 300) || null,
    reason: cleanText(entry.reason, '', 500) || null,
    error: cleanText(entry.error, '', 1000) || null,
    providerStatus: cleanText(entry.providerStatus, '', 80) || null,
    isTest: entry.isTest === true,
    createdAt: entry.createdAt || now(),
    metadata: entry.metadata && typeof entry.metadata === 'object' && !Array.isArray(entry.metadata)
      ? JSON.parse(JSON.stringify(entry.metadata))
      : {},
  };
}

function trimEntries(entries = []) {
  let incidentCount = 0;
  const retained = [];

  for (const entry of entries.map(normalizeEntry)) {
    if (entry.eventType === INCIDENT_EVENT_TYPE) {
      if (incidentCount >= MAX_INCIDENT_HISTORY) continue;
      incidentCount += 1;
    }
    retained.push(entry);
    if (retained.length >= MAX_HISTORY) break;
  }

  return retained;
}

function list(guildId, options = {}) {
  const section = socialStore.getSocialSection(guildId);
  let entries = trimEntries(Array.isArray(section.history) ? section.history : []);

  if (options.status) entries = entries.filter((entry) => entry.status === cleanStatus(options.status));
  if (options.eventType) entries = entries.filter((entry) => entry.eventType === cleanText(options.eventType, '', 40));
  if (options.accountId) entries = entries.filter((entry) => entry.accountId === String(options.accountId));
  if (options.platform) entries = entries.filter((entry) => entry.platform === String(options.platform).toLowerCase());
  if (options.alertType) entries = entries.filter((entry) => entry.alertType === String(options.alertType).toLowerCase());

  const limit = Math.min(Math.max(Number(options.limit || 100), 1), MAX_HISTORY);
  return entries.slice(0, limit);
}

function record(guildId, entry = {}, meta = {}) {
  const normalized = normalizeEntry(entry);
  socialStore.updateSocialSection(guildId, (section) => ({
    ...section,
    history: trimEntries([normalized, ...(Array.isArray(section.history) ? section.history : [])]),
    updatedAt: now(),
  }), { action: 'social_history_record', ...meta });
  return normalized;
}

function clear(guildId, meta = {}) {
  return socialStore.updateSocialSection(guildId, (section) => ({
    ...section,
    history: [],
    updatedAt: now(),
  }), { action: 'social_history_clear', ...meta });
}

function summary(guildId) {
  const entries = list(guildId, { limit: MAX_HISTORY });
  const counts = {};
  const eventTypes = {};
  for (const entry of entries) {
    counts[entry.status] = Number(counts[entry.status] || 0) + 1;
    eventTypes[entry.eventType] = Number(eventTypes[entry.eventType] || 0) + 1;
  }
  const providerIncidents = Number(eventTypes[INCIDENT_EVENT_TYPE] || 0);
  return {
    total: entries.length,
    sent: Number(counts.sent || 0),
    failed: Number(counts.failed || 0),
    skipped: Number(counts.skipped || 0),
    suppressed: Number(counts.suppressed || 0),
    queued: Number(counts.queued || 0),
    retried: Number(counts.retried || 0),
    tests: Number(counts.test || 0),
    providerIncidents,
    incidentCapacity: {
      used: providerIncidents,
      limit: MAX_INCIDENT_HISTORY,
      remaining: Math.max(0, MAX_INCIDENT_HISTORY - providerIncidents),
      saturated: providerIncidents >= MAX_INCIDENT_HISTORY,
    },
    latestAt: entries[0]?.createdAt || null,
  };
}

module.exports = {
  MAX_HISTORY,
  MAX_INCIDENT_HISTORY,
  INCIDENT_EVENT_TYPE,
  normalizeEntry,
  trimEntries,
  list,
  record,
  clear,
  summary,
};