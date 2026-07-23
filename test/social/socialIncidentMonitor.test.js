'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const socialManager = require('../../src/modules/social/socialManager');
const providerHealth = require('../../src/modules/social/socialProviderHealth');
const providerIncidents = require('../../src/modules/social/socialProviderIncidents');
const incidentReporter = require('../../src/modules/social/socialIncidentReporter');
const incidentNotifier = require('../../src/modules/social/socialIncidentNotifier');
const monitor = require('../../src/modules/social/socialIncidentMonitor');

const originals = {
  getConfig: socialManager.getConfig,
  summary: providerHealth.summary,
  transition: providerIncidents.transition,
  escalation: providerIncidents.escalation,
  record: incidentReporter.record,
  notify: incidentNotifier.notify,
};

test.after(() => {
  socialManager.getConfig = originals.getConfig;
  providerHealth.summary = originals.summary;
  providerIncidents.transition = originals.transition;
  providerIncidents.escalation = originals.escalation;
  incidentReporter.record = originals.record;
  incidentNotifier.notify = originals.notify;
});

test('monitor notifies only newly recorded incidents', async () => {
  socialManager.getConfig = () => ({
    enabled: true,
    accounts: [{ platform: 'twitch', enabled: true }],
    providers: { twitch: { enabled: true } },
  });
  providerHealth.summary = () => ({ providers: { twitch: { provider: 'twitch', state: 'open' } } });
  providerIncidents.transition = () => ({ id: 'incident-1', provider: 'twitch', kind: 'outage' });
  providerIncidents.escalation = () => null;

  let recordCalls = 0;
  incidentReporter.record = () => {
    recordCalls += 1;
    return recordCalls === 1 ? { recorded: true } : { recorded: false, duplicate: true };
  };

  let notifyCalls = 0;
  incidentNotifier.notify = async () => {
    notifyCalls += 1;
    return { sent: true };
  };

  const client = { guilds: { cache: new Map([['guild-1', {}]]) } };
  const first = await monitor.scan(client);
  const second = await monitor.scan(client);

  assert.equal(first.recordedCount, 1);
  assert.equal(first.notificationCount, 1);
  assert.equal(second.duplicateCount, 1);
  assert.equal(second.notificationCount, 0);
  assert.equal(notifyCalls, 1);
});

test('monitor counts skipped and failed notification attempts', async () => {
  socialManager.getConfig = () => ({
    enabled: true,
    accounts: [{ platform: 'twitch', enabled: true }, { platform: 'youtube', enabled: true }],
    providers: {},
  });
  providerHealth.summary = () => ({
    providers: {
      twitch: { provider: 'twitch', state: 'open' },
      youtube: { provider: 'youtube', state: 'open' },
    },
  });
  providerIncidents.transition = (_previous, snapshot) => ({ id: `incident-${snapshot.provider}`, provider: snapshot.provider, kind: 'outage' });
  providerIncidents.escalation = () => null;
  incidentReporter.record = () => ({ recorded: true });
  incidentNotifier.notify = async (_guildId, incident) => (
    incident.provider === 'twitch'
      ? { sent: false, skipped: true, reason: 'log_channel_not_configured' }
      : { sent: false, skipped: false, error: 'missing permission' }
  );

  const result = await monitor.scan({ guilds: { cache: new Map([['guild-1', {}]]) } });
  assert.equal(result.recordedCount, 2);
  assert.equal(result.notificationSkippedCount, 1);
  assert.equal(result.notificationFailureCount, 1);
});
