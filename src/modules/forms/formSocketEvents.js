'use strict';

// src/modules/forms/formSocketEvents.js

const {
  emitGuildUpdate,
  emitDirectSyncEvent,
} = require('../../server/sockets/socketHub');

const EVENTS = Object.freeze({
  FORM_CREATED: 'form_created',
  FORM_UPDATED: 'form_updated',
  FORM_SUBMITTED: 'form_submitted',
  FORM_SUBMISSION_UPDATED: 'form_submission_updated',

  PANEL_CREATED: 'form_panel_created',
  PANEL_UPDATED: 'form_panel_updated',

  ANALYTICS_UPDATED: 'form_analytics_updated',
});

const STANDARD_EVENTS = Object.freeze({
  form_created: 'form.created',
  form_updated: 'form.updated',
  form_submitted: 'form.submitted',
  form_submission_updated: 'form.submission.updated',

  form_panel_created: 'form.panel.created',
  form_panel_updated: 'form.panel.updated',

  form_analytics_updated: 'form.analytics.updated',
});

function now() {
  return new Date().toISOString();
}

function getStandardEvent(event) {
  return STANDARD_EVENTS[event] || event;
}

function createPayload(type, guildId, data = {}) {
  const event = getStandardEvent(type);
  const timestamp = now();

  return {
    type,
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

  const eventNames = [event, payload.event, 'goliath_realtime_event'].filter(
    (eventName, index, list) =>
      eventName && list.indexOf(eventName) === index
  );

  for (const eventName of eventNames) {
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
  STANDARD_EVENTS,
  emit,
  emitFormUpdated,
  emitFormSubmitted,
  emitFormSubmissionUpdated,
  emitFormPanelUpdated,
  emitFormAnalyticsUpdated,
};
