'use strict';

const socialHistory = require('./socialHistory');

const INCIDENT_HISTORY_TYPE = 'provider_incident';

function cleanId(value) {
  return String(value || '').trim().slice(0, 300);
}

function alreadyRecorded(guildId, incidentId) {
  const safeId = cleanId(incidentId);
  if (!safeId) return false;
  return socialHistory.list(guildId, { limit: socialHistory.MAX_HISTORY }).some(
    (entry) => entry.eventType === INCIDENT_HISTORY_TYPE && entry.metadata?.incidentId === safeId,
  );
}

function statusFor(incident = {}) {
  if (incident.kind === 'recovery') return 'sent';
  if (incident.severity === 'critical' || incident.severity === 'error') return 'failed';
  return 'skipped';
}

function reasonFor(incident = {}) {
  if (incident.kind === 'recovery') return 'provider_recovered';
  if (incident.kind === 'recovery_failed') return 'provider_recovery_failed';
  if (incident.kind === 'escalation') return 'provider_incident_escalated';
  return 'provider_outage_detected';
}

function record(guildId, incident, meta = {}) {
  if (!guildId || !incident?.id) return { recorded: false, reason: 'invalid_incident' };
  if (alreadyRecorded(guildId, incident.id)) {
    return { recorded: false, duplicate: true, reason: 'incident_already_recorded', incident };
  }

  const entry = socialHistory.record(guildId, {
    status: statusFor(incident),
    eventType: INCIDENT_HISTORY_TYPE,
    alertType: 'provider',
    platform: incident.provider,
    reason: reasonFor(incident),
    error: incident.error || null,
    providerStatus: incident.currentState || null,
    title: `${incident.provider} ${incident.kind}`,
    metadata: {
      incidentId: incident.id,
      kind: incident.kind,
      severity: incident.severity,
      eventType: incident.eventType,
      occurredAt: incident.occurredAt,
      incidentStartedAt: incident.incidentStartedAt,
      durationMs: Number(incident.durationMs || 0),
      retryAt: incident.retryAt,
      failureType: incident.failureType,
      previousState: incident.previousState,
      currentState: incident.currentState,
    },
  }, { action: 'social_provider_incident', ...meta });

  return { recorded: true, duplicate: false, incident, entry };
}

function recordFromResult(guildId, result = {}, meta = {}) {
  return result.providerIncident
    ? record(guildId, result.providerIncident, meta)
    : { recorded: false, reason: 'no_provider_incident' };
}

module.exports = {
  INCIDENT_HISTORY_TYPE,
  alreadyRecorded,
  statusFor,
  reasonFor,
  record,
  recordFromResult,
};
