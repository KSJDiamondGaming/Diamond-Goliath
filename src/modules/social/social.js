'use strict';

const socialStore = require('./socialStore');
const socialRuntime = require('./socialRuntime');
const incidentMonitor = require('./socialIncidentMonitor');
const runtimeHealth = require('./socialRuntimeHealth');

const STARTUP_KEY = Symbol.for('goliath.social.startup');

const diagnostics = Object.freeze({
  ...socialRuntime.diagnostics,
  buildDiagnostics(guildId) {
    return {
      ...socialRuntime.diagnostics.buildDiagnostics(guildId),
      runtime: runtimeHealth.status({ guildId }),
    };
  },
});

async function startup(client, options = {}) {
  const runtime = await socialRuntime.startup(client, options);
  const incidentTimer = incidentMonitor.start(client, options.incidents || {});
  return { ...runtime, incidentTimer };
}

function shutdown(client) {
  const schedulerStopped = socialRuntime.scheduler.stopSocialScheduler();
  const queueStopped = socialRuntime.queue.stop();
  const incidentMonitorStopped = incidentMonitor.stop();
  const hadStartupState = Boolean(client?.[STARTUP_KEY]);

  if (client && Object.prototype.hasOwnProperty.call(client, STARTUP_KEY)) {
    delete client[STARTUP_KEY];
  }

  return {
    stopped: schedulerStopped || queueStopped || incidentMonitorStopped || hadStartupState,
    schedulerStopped,
    queueStopped,
    incidentMonitorStopped,
    startupStateCleared: hadStartupState,
  };
}

module.exports = {
  ...socialRuntime,
  startup,
  shutdown,
  diagnostics,
  runtimeHealth,
  store: socialStore,
  http: require('./socialHttp'),
  providerHealth: require('./socialProviderHealth'),
  providerIncidents: require('./socialProviderIncidents'),
  incidentReporter: require('./socialIncidentReporter'),
  incidentNotifier: require('./socialIncidentNotifier'),
  incidentMonitor,
  incidentDiagnostics: require('./socialIncidentDiagnostics'),
  pollingPolicy: require('./socialPollingPolicy'),
};

Object.defineProperty(module.exports, 'health', {
  enumerable: true,
  configurable: false,
  get() {
    return require('./socialHealth');
  },
});
