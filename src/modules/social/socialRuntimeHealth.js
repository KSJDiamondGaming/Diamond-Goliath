'use strict';

const socialScheduler = require('./socialScheduler');
const socialQueue = require('./socialQueue');
const incidentMonitor = require('./socialIncidentMonitor');

function componentIssue(component, status = {}) {
  if (!status.started) {
    return {
      component,
      code: `${component}_stopped`,
      severity: 'error',
      message: `${component} runtime service is not started.`,
    };
  }

  if (status.lastRun?.error) {
    return {
      component,
      code: `${component}_last_run_failed`,
      severity: 'warning',
      message: status.lastRun.error,
    };
  }

  return null;
}

function status(options = {}) {
  const scheduler = socialScheduler.getSchedulerStatus();
  const queue = socialQueue.status();
  const incidents = incidentMonitor.status();
  const issues = [
    componentIssue('scheduler', scheduler),
    componentIssue('queue', queue),
    componentIssue('incident_monitor', incidents),
  ].filter(Boolean);

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const startedAtValues = [scheduler.startedAt, queue.startedAt]
    .map((value) => Date.parse(value || ''))
    .filter(Number.isFinite);

  return {
    module: 'social',
    checkedAt: new Date().toISOString(),
    healthy: errors.length === 0,
    state: errors.length ? 'error' : warnings.length ? 'warning' : 'healthy',
    started: scheduler.started && queue.started && incidents.started,
    startedAt: startedAtValues.length ? new Date(Math.min(...startedAtValues)).toISOString() : null,
    scheduler,
    queue: {
      ...queue,
      ...(options.guildId ? { summary: socialQueue.summary(options.guildId) } : {}),
    },
    incidentMonitor: {
      ...incidents,
      activeIncidentCount: incidentMonitor.currentIncidents().length,
    },
    issues,
    warningCount: warnings.length,
    errorCount: errors.length,
  };
}

module.exports = {
  componentIssue,
  status,
};
