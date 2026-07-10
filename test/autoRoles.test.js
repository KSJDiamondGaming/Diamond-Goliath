'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const autoRoleStore = require('../src/modules/autoRoles/autoRoleStore');
const autoRoleManager = require('../src/modules/autoRoles/autoRoleManager');

const ROLE_ONE = '123456789012345678';
const ROLE_TWO = '223456789012345678';

test('auto roles defaults are complete and safe', () => {
  const section = autoRoleStore.defaultAutoRolesSection();

  assert.equal(section.enabled, true);
  assert.deepEqual(section.joinRoles, []);
  assert.deepEqual(section.botRoles, []);
  assert.equal(section.settings.applyToBots, false);
  assert.equal(section.settings.reapplyOnStartup, false);
  assert.equal(section.analytics.assigned, 0);
  assert.equal(section.analytics.failed, 0);
});

test('auto roles normalization removes invalid and duplicate IDs', () => {
  const section = autoRoleStore.normalizeAutoRolesSection({
    joinRoles: [ROLE_ONE, ROLE_ONE, 'invalid'],
    botRoles: [ROLE_TWO, '', null],
    settings: { applyToBots: true, auditLog: false },
  });

  assert.deepEqual(section.joinRoles, [ROLE_ONE]);
  assert.deepEqual(section.botRoles, [ROLE_TWO]);
  assert.equal(section.settings.applyToBots, true);
  assert.equal(section.settings.auditLog, false);
});

test('analytics normalization clamps invalid values', () => {
  const analytics = autoRoleStore.normalizeAnalytics({
    assigned: -5,
    failed: '3',
    skipped: 'invalid',
    membersProcessed: 2,
  });

  assert.equal(analytics.assigned, 0);
  assert.equal(analytics.failed, 3);
  assert.equal(analytics.skipped, 0);
  assert.equal(analytics.membersProcessed, 2);
});

test('export configuration returns portable module data', () => {
  const original = autoRoleStore.getAutoRolesSection;
  autoRoleStore.getAutoRolesSection = () => ({ enabled: true, joinRoles: [ROLE_ONE], botRoles: [] });

  try {
    const exported = autoRoleManager.exportConfiguration('323456789012345678');
    assert.equal(exported.module, 'autoRoles');
    assert.equal(exported.guildId, '323456789012345678');
    assert.deepEqual(exported.config.joinRoles, [ROLE_ONE]);
    assert.ok(exported.exportedAt);
  } finally {
    autoRoleStore.getAutoRolesSection = original;
  }
});

test('role helper rejects malformed IDs', () => {
  assert.deepEqual(autoRoleStore.cleanRoleIds([ROLE_ONE, 'bad', ROLE_TWO]), [ROLE_ONE, ROLE_TWO]);
  assert.equal(autoRoleStore.cleanDiscordId('<@&123456789012345678>'), ROLE_ONE);
  assert.equal(autoRoleStore.cleanDiscordId('abc'), null);
});
