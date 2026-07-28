'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('verification health reads canonical module state', () => {
  const source = read('src/modules/securityStudio/verificationHealth.js');
  assert.match(source, /guildManager\.isModuleEnabled\(guild\.id, 'verification'\)/);
});

test('verification startup reads canonical module state', () => {
  const source = read('src/modules/securityStudio/verification.js');
  assert.match(source, /guildManager\.isModuleEnabled\(guild\.id, 'verification'\)/);
});

test('verification route does not persist enabled through manager config', () => {
  const source = read('src/modules/securityStudio/verificationRoute.js');
  assert.match(source, /enabled: guildManager\.isModuleEnabled\(guildId, 'verification'\) === true/);
  assert.doesNotMatch(source, /configureVerification\(guildId, \{ enabled,/);
});

test('verification store removes module-level enabled state', () => {
  const source = read('src/modules/securityStudio/verificationStore.js');
  const defaultSection = source.slice(
    source.indexOf('function defaultVerificationSection()'),
    source.indexOf('function normalizeAnalytics('),
  );
  assert.doesNotMatch(defaultSection, /enabled\s*:/);
  assert.match(source, /delete normalized\.enabled;/);
});

test('verification member events are guarded by canonical module state', () => {
  const source = read('src/events/members/memberJoinLeave.js');
  assert.match(source, /guildManager\.isModuleEnabled\(member\.guild\.id, 'verification'\)/);
  assert.match(source, /guildManager\.isModuleEnabled\(newMember\.guild\.id, 'verification'\)/);
});
