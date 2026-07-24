'use strict';

const social = require('./social');

function recommendationFor(issue = {}) {
  const recommendations = {
    scheduler_stopped: 'Start Social Studio through the canonical social.startup() lifecycle.',
    queue_stopped: 'Start the Social delivery queue through the canonical social.startup() lifecycle.',
    incident_monitor_stopped: 'Start the incident monitor through the canonical social.startup() lifecycle.',
    scheduler_last_run_failed: 'Inspect the scheduler last-run error and provider diagnostics.',
    queue_last_run_failed: 'Inspect failed deliveries and retry configuration.',
    incident_monitor_last_run_failed: 'Inspect provider incident polling and notifier diagnostics.',
  };
  return recommendations[issue.code] || 'Inspect the canonical Social Studio runtime diagnostics.';
}

function buildReport(snapshot = social.runtimeHealth.status()) {
  if (!snapshot || snapshot.module !== 'social') {
    throw new Error('Canonical Social Studio runtime health is unavailable.');
  }

  const components = [
    { key: 'scheduler', label: 'Scheduler', status: snapshot.scheduler },
    { key: 'queue', label: 'Delivery Queue', status: snapshot.queue },
    { key: 'incidentMonitor', label: 'Incident Monitor', status: snapshot.incidentMonitor },
  ];

  return {
    module: snapshot.module,
    checkedAt: snapshot.checkedAt,
    state: snapshot.state,
    healthy: snapshot.healthy,
    started: snapshot.started,
    startedAt: snapshot.startedAt,
    warningCount: snapshot.warningCount,
    errorCount: snapshot.errorCount,
    components: components.map((component) => ({
      key: component.key,
      label: component.label,
      started: component.status?.started === true,
      startedAt: component.status?.startedAt || null,
      intervalMs: component.status?.tickIntervalMs ?? component.status?.intervalMs ?? null,
      lastRun: component.status?.lastRun || null,
    })),
    issues: (snapshot.issues || []).map((issue) => ({
      ...issue,
      recommendation: recommendationFor(issue),
    })),
  };
}

function marker(started) {
  return started ? '✅' : '⚠️';
}

function printReport(report) {
  console.log('\nSocial Studio runtime');
  console.log('=====================');
  for (const component of report.components) {
    const interval = Number.isFinite(component.intervalMs) ? ` · ${component.intervalMs}ms` : '';
    console.log(`${marker(component.started)} ${component.label}: ${component.started ? 'running' : 'stopped'}${interval}`);
  }
  console.log(`State: ${report.state}`);
  console.log(`Warnings: ${report.warningCount} · Errors: ${report.errorCount}`);
  console.log(`Started: ${report.startedAt || 'offline'}`);
  for (const issue of report.issues) {
    console.log(` - ${issue.severity}: ${issue.code} — ${issue.recommendation}`);
  }
}

function run() {
  try {
    const report = buildReport();
    printReport(report);
    return true;
  } catch (error) {
    console.error(`Social runtime doctor failed: ${error.message}`);
    return false;
  }
}

if (require.main === module && !run()) process.exit(1);

module.exports = {
  buildReport,
  printReport,
  recommendationFor,
  run,
};
