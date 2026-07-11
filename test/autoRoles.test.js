'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const guildManager = require('../src/core/guild/guildManager');
const autoRoleStore = require('../src/modules/autoRoles/autoRoleStore');
const autoRoleManager = require('../src/modules/autoRoles/autoRoleManager');

const ROLE_ONE = '123456789012345678';
const ROLE_TWO = '223456789012345678';
const GUILD_ID = '323456789012345678';

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

test('enabled state synchronizes central registry and module config', () => {
  const originalSetModuleEnabled = guildManager.setModuleEnabled;
  const originalSetEnabled = autoRoleStore.setEnabled;
  const calls = [];

  guildManager.setModuleEnabled = (guildId, moduleName, enabled) => {
    calls.push({ source: 'registry', guildId, moduleName, enabled });
    return { enabled };
  };
  autoRoleStore.setEnabled = (guildId, enabled) => {
    calls.push({ source: 'config', guildId, enabled });
    return { enabled };
  };

  try {
    const result = autoRoleManager.setAutoRolesEnabled(GUILD_ID, false);
    assert.equal(result.enabled, false);
    assert.deepEqual(calls, [
      { source: 'registry', guildId: GUILD_ID, moduleName: 'autoRoles', enabled: false },
      { source: 'config', guildId: GUILD_ID, enabled: false },
    ]);
  } finally {
    guildManager.setModuleEnabled = originalSetModuleEnabled;
    autoRoleStore.setEnabled = originalSetEnabled;
  }
});

test('export configuration returns portable module data', () => {
  const originalGetSection = autoRoleStore.getAutoRolesSection;
  const originalIsModuleEnabled = guildManager.isModuleEnabled;
  autoRoleStore.getAutoRolesSection = () => ({ enabled: true, joinRoles: [ROLE_ONE], botRoles: [] });
  guildManager.isModuleEnabled = () => true;

  try {
    const exported = autoRoleManager.exportConfiguration(GUILD_ID);
    assert.equal(exported.module, 'autoRoles');
    assert.equal(exported.guildId, GUILD_ID);
    assert.equal(exported.registryEnabled, true);
    assert.deepEqual(exported.config.joinRoles, [ROLE_ONE]);
    assert.ok(exported.exportedAt);
  } finally {
    autoRoleStore.getAutoRolesSection = originalGetSection;
    guildManager.isModuleEnabled = originalIsModuleEnabled;
  }
});

test('legacy role helpers remain compatible with older API routes', () => {
  const originalAddJoinRole = autoRoleStore.addJoinRole;
  const originalAddBotRole = autoRoleStore.addBotRole;
  autoRoleStore.addJoinRole = (guildId, roleId) => ({ guildId, roleId, type: 'join' });
  autoRoleStore.addBotRole = (guildId, roleId) => ({ guildId, roleId, type: 'bot' });

  try {
    assert.deepEqual(autoRoleManager.addJoinRole(GUILD_ID, ROLE_ONE), { guildId: GUILD_ID, roleId: ROLE_ONE, type: 'join' });
    assert.deepEqual(autoRoleManager.addBotRole(GUILD_ID, ROLE_TWO), { guildId: GUILD_ID, roleId: ROLE_TWO, type: 'bot' });
  } finally {
    autoRoleStore.addJoinRole = originalAddJoinRole;
    autoRoleStore.addBotRole = originalAddBotRole;
  }
});

test('role helper rejects malformed IDs', () => {
  assert.deepEqual(autoRoleStore.cleanRoleIds([ROLE_ONE, 'bad', ROLE_TWO]), [ROLE_ONE, ROLE_TWO]);
  assert.equal(autoRoleStore.cleanDiscordId('<@&123456789012345678>'), ROLE_ONE);
  assert.equal(autoRoleStore.cleanDiscordId('abc'), null);
});
