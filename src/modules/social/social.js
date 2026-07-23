'use strict';

const socialStore = require('./socialStore');
const socialRuntime = require('./socialRuntime');
const incidentMonitor = require('./socialIncidentMonitor');

async function startup(client, options = {}) {
  const runtime = await socialRuntime.startup(client, options);
  const incidentTimer = incidentMonitor.start(client, options.incidents || {});
  return { ...runtime, incidentTimer };
}

module.exports = {
  ...socialRuntime,
  startup,
  store: socialStore,
  http: require('./socialHttp'),
  providerHealth: require('./socialProviderHealth'),
  providerIncidents: require('./socialProviderIncidents'),
  incidentReporter: require('./socialIncidentReporter'),
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