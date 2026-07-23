'use strict';

const socialManager = require('./socialManager');
const providerHealth = require('./socialProviderHealth');
const providerIncidents = require('./socialProviderIncidents');
const incidentReporter = require('./socialIncidentReporter');
const incidentNotifier = require('./socialIncidentNotifier');

const DEFAULT_INTERVAL_MS = 60000;
let timer = null;
let lastRun = null;

function intervalMs(value = process.env.SOCIAL_PROVIDER_INCIDENT_CHECK_MS) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(3600000, Math.max(10000, Math.round(number))) : DEFAULT_INTERVAL_MS;
}

function guildProviders(guildId) {
  const config = socialManager.getConfig(guildId);
  if (config.enabled === false) return new Set();
  return new Set((config.accounts || [])
    .filter((account) => account.enabled !== false && config.providers?.[account.platform]?.enabled !== false)
    .map((account) => String(account.platform || '').toLowerCase())
    .filter(Boolean));
}

function currentIncidents(now = Date.now()) {
  const incidents = new Map();
  for (const snapshot of Object.values(providerHealth.summary(now).providers || {})) {
    const transition = providerIncidents.transition({}, snapshot, now);
    const escalation = providerIncidents.escalation(snapshot, now);
    if (transition) incidents.set(transition.id, transition);
    if (escalation) incidents.set(escalation.id, escalation);
  }
  return [...incidents.values()];
}

async function scan(client, options = {}) {
  const startedAt = Date.now();
  const guildIds = options.guildIds || [...(client?.guilds?.cache?.keys?.() || [])];
  const incidents = currentIncidents(startedAt);
  let recordedCount = 0;
  let duplicateCount = 0;
  let notificationCount = 0;
  let notificationSkippedCount = 0;
  let notificationFailureCount = 0;

  for (const guildId of guildIds) {
    const enabled = guildProviders(guildId);
    for (const incident of incidents) {
      if (!enabled.has(incident.provider)) continue;
      const result = incidentReporter.record(guildId, incident, { action: 'social_provider_incident_monitor' });
      if (result.recorded) {
        recordedCount += 1;
        const notification = await incidentNotifier.notify(guildId, incident, client);
        if (notification.sent) notificationCount += 1;
        else if (notification.skipped) notificationSkippedCount += 1;
        else notificationFailureCount += 1;
      } else if (result.duplicate) {
        duplicateCount += 1;
      }
    }
  }

  lastRun = {
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date().toISOString(),
    guildCount: guildIds.length,
    incidentCount: incidents.length,
    recordedCount,
    duplicateCount,
    notificationCount,
    notificationSkippedCount,
    notificationFailureCount,
  };
  return lastRun;
}

function start(client, options = {}) {
  if (timer) return timer;
  timer = setInterval(() => {
    scan(client, options).catch((error) => {
      lastRun = {
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        guildCount: 0,
        incidentCount: 0,
        recordedCount: 0,
        duplicateCount: 0,
        notificationCount: 0,
        notificationSkippedCount: 0,
        notificationFailureCount: 1,
        error: error?.message || String(error),
      };
    });
  }, intervalMs(options.intervalMs));
  timer.unref?.();
  return timer;
}

function stop() {
  if (!timer) return false;
  clearInterval(timer);
  timer = null;
  return true;
}

function status() {
  return { started: Boolean(timer), intervalMs: intervalMs(), lastRun };
}

module.exports = {
  DEFAULT_INTERVAL_MS,
  intervalMs,
  guildProviders,
  currentIncidents,
  scan,
  start,
  stop,
  status,
};
