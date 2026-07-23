'use strict';

// src/modules/forms/formSocketEvents.js

const {
  emitGuildUpdate,
  emitDirectSyncEvent,
} = require('../../server/sockets/socketHub');

const EVENTS = Object.freeze({
  FORM_CREATED: 'form.created',
  FORM_UPDATED: 'form.updated',
  FORM_SUBMITTED: 'form.submitted',
  FORM_SUBMISSION_UPDATED: 'form.submission.updated',

  PANEL_CREATED: 'form.panel.created',
  PANEL_UPDATED: 'form.panel.updated',

  ANALYTICS_UPDATED: 'form.analytics.updated',
});

function now() {
  return new Date().toISOString();
}

function createPayload(event, guildId, data = {}) {
  const timestamp = now();

  return {
    module: 'forms',
    event,
    guildId: String(guildId),
    timestamp,
    updatedAt: timestamp,
    data,
  };
}

function emit(event, guildId, data = {}) {
  const payload = createPayload(event, guildId, data);
  const update = emitGuildUpdate(guildId, payload);

  if (!update) return payload;

  for (const eventName of [event, 'goliath_realtime_event']) {
    emitDirectSyncEvent(guildId, eventName, update);
  }

  return update;
}

function emitFormUpdated(guildId, form) {
  return emit(EVENTS.FORM_UPDATED, guildId, {
    formId: form?.formId || form?.id || null,
    name: form?.name || null,
    enabled: form?.enabled !== false,
    action: form?.action || null,
    updatedAt: form?.updatedAt || null,
  });
}

function emitFormSubmitted(guildId, submission) {
  return emit(EVENTS.FORM_SUBMITTED, guildId, {
    submissionId: submission?.submissionId || submission?.id || null,
    formId: submission?.formId || null,
    userId: submission?.userId || null,
    userTag: submission?.userTag || null,
    status: submission?.status || null,
    ticketId: submission?.ticketId || null,
    ticketChannelId: submission?.ticketChannelId || null,
    createdAt: submission?.createdAt || null,
  });
}

function emitFormSubmissionUpdated(guildId, submission) {
  return emit(EVENTS.FORM_SUBMISSION_UPDATED, guildId, {
    submissionId: submission?.submissionId || submission?.id || null,
    formId: submission?.formId || null,
    status: submission?.status || null,
    ticketId: submission?.ticketId || null,
    ticketChannelId: submission?.ticketChannelId || null,
    updatedAt: submission?.updatedAt || null,
  });
}

function emitFormPanelUpdated(guildId, panel) {
  return emit(EVENTS.PANEL_UPDATED, guildId, {
    panelId: panel?.panelId || panel?.id || null,
    title: panel?.title || null,
    channelId: panel?.channelId || null,
    messageId: panel?.messageId || null,
    updatedAt: panel?.updatedAt || null,
  });
}

function emitFormAnalyticsUpdated(guildId, analytics) {
  return emit(EVENTS.ANALYTICS_UPDATED, guildId, analytics || {});
}

module.exports = {
  EVENTS,
  emit,
  emitFormUpdated,
  emitFormSubmitted,
  emitFormSubmissionUpdated,
  emitFormPanelUpdated,
  emitFormAnalyticsUpdated,
};
