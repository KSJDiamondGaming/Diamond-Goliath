'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const managerPath = path.resolve(__dirname, '../../src/core/guild/moduleSectionManager.js');
const guildManagerPath = path.resolve(__dirname, '../../src/core/guild/guildManager.js');
const moduleAdminPanelsPath = path.resolve(__dirname, '../../src/core/admin/functions/moduleAdminPanels.js');

function loadManager(initialModules = {}) {
  let modules = JSON.parse(JSON.stringify(initialModules));

  const guildManagerMock = {
    getGuildSection(_guildId, sectionName, fallback = {}) {
      if (sectionName !== 'modules') return fallback;
      return JSON.parse(JSON.stringify(modules));
    },
    updateGuildSection(_guildId, sectionName, updater, fallback = {}) {
      assert.equal(sectionName, 'modules');
      const current = modules && typeof modules === 'object' ? modules : fallback;
      modules = typeof updater === 'function' ? updater(JSON.parse(JSON.stringify(current))) : updater;
      return JSON.parse(JSON.stringify(modules));
    },
  };

  delete require.cache[managerPath];
  require.cache[guildManagerPath] = {
    id: guildManagerPath,
    filename: guildManagerPath,
    loaded: true,
    exports: guildManagerMock,
  };

  const manager = require(managerPath);
  return {
    manager,
    getModules: () => JSON.parse(JSON.stringify(modules)),
    cleanup() {
      delete require.cache[managerPath];
      delete require.cache[guildManagerPath];
    },
  };
}

test('getModuleSection automatically creates modules.<key>', () => {
  const fixture = loadManager({});
  try {
    const section = fixture.manager.getModuleSection('1515201360386068642', 'newModule', {
      settings: { enabledFeature: true },
    });

    assert.equal(section.enabled, false);
    assert.deepEqual(section.settings, { enabledFeature: true });
    assert.ok(section.createdAt);
    assert.ok(section.updatedAt);

    const stored = fixture.getModules();
    assert.deepEqual(stored.newModule.settings, { enabledFeature: true });
  } finally {
    fixture.cleanup();
  }
});

test('existing module data is preserved and merged with fallback defaults', () => {
  const fixture = loadManager({
    leveling: {
      enabled: true,
      users: { abc: { xp: 50 } },
    },
  });

  try {
    const section = fixture.manager.getModuleSection('1515201360386068642', 'leveling', {
      settings: { xpRate: 1 },
    });

    assert.equal(section.enabled, true);
    assert.deepEqual(section.users, { abc: { xp: 50 } });
    assert.deepEqual(section.settings, { xpRate: 1 });
  } finally {
    fixture.cleanup();
  }
});

test('legacy Role Studio auto roles migrate non-destructively', () => {
  const fixture = loadManager({
    roles: {
      enabled: true,
      joinRoles: { members: ['123456789012345678'] },
      settings: { auditLog: true },
      analytics: { assigned: 7 },
    },
  });

  try {
    const section = fixture.manager.getModuleSection('1515201360386068642', 'autoRoles');
    assert.equal(section.enabled, true);
    assert.deepEqual(section.joinRoles, { members: ['123456789012345678'] });
    assert.equal(section.analytics.assigned, 7);

    const stored = fixture.getModules();
    assert.ok(stored.roles, 'legacy data must remain until explicit cleanup');
    assert.deepEqual(stored.autoRoles.joinRoles, { members: ['123456789012345678'] });
  } finally {
    fixture.cleanup();
  }
});

test('saving a module preserves enabled and createdAt metadata', () => {
  const fixture = loadManager({
    social: {
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      creators: {},
    },
  });

  try {
    const section = fixture.manager.saveModuleSection('1515201360386068642', 'social', {
      creators: { creator1: { platform: 'twitch' } },
    });

    assert.equal(section.enabled, true);
    assert.equal(section.createdAt, '2026-01-01T00:00:00.000Z');
    assert.equal(section.creators.creator1.platform, 'twitch');
    assert.ok(section.updatedAt);
  } finally {
    fixture.cleanup();
  }
});

test('generic module admin panels use canonical module state without persisting enabled', () => {
  const source = fs.readFileSync(moduleAdminPanelsPath, 'utf8');
  const registry = source.slice(source.indexOf('const MODULE_PANEL_REGISTRY = {'), source.indexOf('const SERVER_MODULES ='));
  const saveConfig = source.slice(source.indexOf('function saveModuleConfig('), source.indexOf('function formatValue('));
  const actions = source.slice(source.indexOf('const action = id.match('), source.indexOf('const toggle = id.match('));

  assert.doesNotMatch(registry, /defaults:\s*\{\s*enabled\s*:/);
  assert.match(source, /enabled: guildManager\.isModuleEnabled\(guildId, moduleKey\)/);
  assert.match(saveConfig, /const \{ enabled: _enabled, \.\.\.config \} = next \|\| \{\};/);
  assert.match(actions, /guildManager\.setModuleEnabled\(interaction\.guild\.id, key, type === 'enable'/);
  assert.doesNotMatch(actions, /saveModuleConfig\([^\n]+enabled:/);
});
