'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const socialRoot = path.join(root, 'src/modules/social');

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('Social Studio completion surfaces exist', () => {
  const required = [
    'src/modules/social/social.js',
    'src/modules/social/socialRuntime.js',
    'src/modules/social/socialRuntimeHealth.js',
    'src/modules/social/socialRuntimeDoctor.js',
    'src/modules/social/socialProcessLifecycle.js',
    'src/modules/social/socialRoute.js',
    'src/modules/social/socialPanel.js',
    'src/dashboard/js/pages/modules/Social.jsx',
    'src/dashboard/js/pages/modules/SocialWithRuntime.jsx',
    'src/events/social/socialReady.js',
    'docs/modules/social-alerts.md',
  ];

  for (const file of required) assert.equal(exists(file), true, `${file} is required`);
});

test('Social Studio has no retired split implementations', () => {
  const retired = [
    'socialCreatorPanel.js',
    'socialCreatorRoute.js',
    'socialCreators.js',
    'socialDiagnostics.js',
    'socialSimulator.js',
  ];

  for (const file of retired) assert.equal(fs.existsSync(path.join(socialRoot, file)), false, `${file} must remain retired`);
});

test('Social Studio public entry owns lifecycle and diagnostics', () => {
  const social = require('../../src/modules/social/social');

  for (const name of ['startup', 'shutdown', 'diagnostics', 'runtimeHealth', 'delivery', 'creators', 'simulator', 'queue', 'history', 'health', 'providers', 'scheduler']) {
    assert.notEqual(social[name], undefined, `social.${name} must be exported`);
  }
});

test('startup and shutdown use canonical Social Studio entry', () => {
  const ready = source('src/events/social/socialReady.js');
  const lifecycle = source('src/modules/social/socialProcessLifecycle.js');

  assert.match(ready, /social\.startup\(client\)/);
  assert.match(lifecycle, /social\.shutdown\(client\)/);
  assert.doesNotMatch(ready, /startSocialScheduler|socialQueue\.start|incidentMonitor\.start/);
  assert.doesNotMatch(lifecycle, /stopSocialScheduler|socialQueue\.stop|incidentMonitor\.stop/);
});

test('dashboard and doctor consume canonical runtime health', () => {
  const dashboard = source('src/dashboard/js/pages/modules/SocialWithRuntime.jsx');
  const doctor = source('src/modules/social/socialRuntimeDoctor.js');

  assert.match(dashboard, /diagnostics\?\.runtime/);
  assert.match(doctor, /social\.runtimeHealth\.status\(\)/);
});

test('scripts directory retains one canonical CLI file', () => {
  const scripts = fs.readdirSync(path.join(root, 'scripts'), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(scripts, ['goliath.js']);
});

test('Social Studio manifest is complete', () => {
  const { MODULE_MATURITY, getMissingCapabilities } = require('../../src/core/modules/moduleStandard');
  const { moduleManifest } = require('../../src/core/modules/moduleManifest');
  const manifest = moduleManifest.social;

  assert.ok(manifest, 'Social Studio manifest entry is required');
  assert.equal(manifest.name, 'Social Studio');
  assert.equal(manifest.maturity, MODULE_MATURITY.COMPLETE);
  assert.deepEqual(getMissingCapabilities(manifest), []);
});
