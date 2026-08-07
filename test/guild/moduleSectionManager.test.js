'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const managerPath = path.resolve(__dirname, '../../src/core/guild/moduleSectionManager.js');
const guildManagerPath = path.resolve(__dirname, '../../src/core/guild/guildManager.js');
const moduleAdminPanelsPath = path.resolve(__dirname, '../../src/core/admin/functions/moduleAdminPanels.js');
const reactionRolesPanelPath = path.resolve(__dirname, '../../src/modules/roleStudio/reactionRoles/reactionRolesPanel.js');
const levelingPath = path.resolve(__dirname, '../../src/modules/communityStudio/leveling/leveling.js');
const levelingInteractionsPath = path.resolve(__dirname, '../../src/modules/communityStudio/leveling/levelingInteractions.js');
const stickyStorePath = path.resolve(__dirname, '../../src/modules/messageStudio/sticky/stickyStore.js');
const starboardRuntimePath = path.resolve(__dirname, '../../src/modules/messageStudio/starboard/starboard.js');
const starboardStorePath = path.resolve(__dirname, '../../src/modules/messageStudio/starboard/starboardStore.js');
const starboardPanelPath = path.resolve(__dirname, '../../src/modules/messageStudio/starboard/starboardPanel.js');
const starboardRoutePath = path.resolve(__dirname, '../../src/server/routes/starboard.js');
const temporaryRolesPath = path.resolve(__dirname, '../../src/modules/roleStudio/temporaryRoles/temporaryRoles.js');
const temporaryRolesPanelPath = path.resolve(__dirname, '../../src/modules/roleStudio/temporaryRoles/temporaryRolesPanel.js');
const serverBackupSchedulerPath = path.resolve(__dirname, '../../src/core/security/serverBackupScheduler.js');
const statsRoutePath = path.resolve(__dirname, '../../src/modules/utilityStudio/stats/statsRoute.js');
const giveawaysAdminPanelPath = path.resolve(__dirname, '../../src/modules/communityStudio/giveaways/giveawaysAdminPanel.js');
const giveawaysInteractionHandlerPath = path.resolve(__dirname, '../../src/modules/communityStudio/giveaways/giveawaysInteractionHandler.js');
const socialStudioMonitorPath = path.resolve(__dirname, '../../src/modules/socialStudio/socialAlerts/socialStudioMonitor.js');
const socialStudioRoutePath = path.resolve(__dirname, '../../src/modules/socialStudio/socialAlerts/socialStudioRoute.js');

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
  assert.match(source, /const \{ saveModuleSection \} = require\('\.\.\/\.\.\/guild\/moduleSectionManager'\);/);
  assert.match(saveConfig, /const \{ enabled: _enabled, \.\.\.config \} = next \|\| \{\};/);
  assert.match(saveConfig, /const updated = saveModuleSection\(guild\.id, moduleKey, config, guild\);/);
  assert.doesNotMatch(saveConfig, /guildManager\.updateGuildSection/);
  assert.match(actions, /guildManager\.setModuleEnabled\(interaction\.guild\.id, key, type === 'enable'/);
  assert.doesNotMatch(actions, /saveModuleConfig\([^\n]+enabled:/);
});

test('reaction roles admin panel reports, writes and exports canonical module state', () => {
  const source = fs.readFileSync(reactionRolesPanelPath, 'utf8');
  assert.match(source, /const enabled = guildManager\.isModuleEnabled\(guild\.id, 'reactionRoles'\)/);
  assert.match(source, /guildManager\.setModuleEnabled\(guild\.id, 'reactionRoles', true, \{ actorId: userId \}\)/);
  assert.match(source, /guildManager\.setModuleEnabled\(guild\.id, 'reactionRoles', false, \{ actorId: userId \}\)/);
  assert.match(source, /enabled: guildManager\.isModuleEnabled\(guild\.id, 'reactionRoles'\)/);
  assert.doesNotMatch(source, /config\.enabled !== false/);
  assert.doesNotMatch(source, /reactionRoles\.setEnabled/);
  assert.match(source, /panel\.enabled === false/);
});

test('leveling core stores settings and XP without duplicating module enabled state', () => {
  const source = fs.readFileSync(levelingPath, 'utf8');
  const defaults = source.slice(source.indexOf('function defaults()'), source.indexOf('function xpForLevel('));
  const normalizer = source.slice(source.indexOf('function normalize(section'), source.indexOf('function protectedUserSnapshot('));

  assert.doesNotMatch(defaults, /enabled\s*:/);
  assert.match(normalizer, /delete normalized\.enabled;/);
  assert.match(source, /getModuleSection\(guildId, MODULE_KEY, defaults\(\)\)/);
  assert.match(source, /saveModuleSection\(guildId, MODULE_KEY, normalize\(section\), guildOrMeta\)/);
  assert.match(source, /updateModuleSection\(/);
  assert.doesNotMatch(source, /guildManager\.updateGuildSection/);
  assert.doesNotMatch(source, /enabled: source\.enabled !== false/);
});

test('leveling migration explicitly protects existing active and paused XP records', () => {
  const source = fs.readFileSync(levelingPath, 'utf8');
  const migration = source.slice(source.indexOf('function protectedUserSnapshot('), source.indexOf('function getSection('));

  assert.match(source, /const LEVELING_SCHEMA_VERSION = \d+;/);
  assert.match(migration, /for \(const bucket of \['users', 'pausedUsers'\]\)/);
  assert.match(migration, /for \(const field of \['xp', 'level', 'messages', 'voiceMinutes'\]\)/);
  assert.match(migration, /createBackup\(filePath, `leveling-v\$\{LEVELING_SCHEMA_VERSION\}-pre-migration`\)/);
  assert.match(migration, /validateProtectedUsers\(beforeSnapshot, migrated\)/);
  assert.match(migration, /validateProtectedUsers\(beforeSnapshot, persisted\)/);
  assert.match(migration, /restoreBackup\(filePath, backupPath\)/);
});

test('leveling XP awards reject paused users before changing XP or analytics', () => {
  const source = fs.readFileSync(levelingPath, 'utf8');
  const awardXp = source.slice(source.indexOf('function awardXp('), source.indexOf('function awardMessageXp('));

  assert.match(awardXp, /if \(!isUserParticipating\(guildId, safeUserId\)\) return null;/);
  assert.ok(
    awardXp.indexOf('if (!isUserParticipating(guildId, safeUserId)) return null;') < awardXp.indexOf('const multiplier ='),
    'participation guard must run before multiplier calculation and persistence',
  );
});

test('leveling XP history is capped, normalized and attached to every XP award', () => {
  const source = fs.readFileSync(levelingPath, 'utf8');
  const history = source.slice(source.indexOf('function normalizeHistoryEntry('), source.indexOf('function normalizeUsers('));
  const awardXp = source.slice(source.indexOf('function awardXp('), source.indexOf('function awardMessageXp('));

  assert.match(source, /const USER_HISTORY_LIMIT = 100;/);
  assert.match(history, /entries\.slice\(-USER_HISTORY_LIMIT\)\.map\(normalizeHistoryEntry\)/);
  assert.match(history, /return \[\.\.\.normalizeHistory\(value\), normalizeHistoryEntry\(entry\)\]\.slice\(-USER_HISTORY_LIMIT\);/);
  assert.match(history, /history: normalizeHistory\(input\.history\)/);
  assert.match(awardXp, /const history = appendHistory\(existing\.history,/);
  assert.match(awardXp, /beforeXp: previousXp/);
  assert.match(awardXp, /afterXp: nextXp/);
  assert.match(awardXp, /beforeLevel: previousLevel/);
  assert.match(awardXp, /afterLevel: nextLevel/);
  assert.match(awardXp, /history,/);
});

test('leveling integrity maintenance scans raw data and backs up write operations', () => {
  const source = fs.readFileSync(levelingInteractionsPath, 'utf8');
  const scan = source.slice(source.indexOf('function scanIntegrity('), source.indexOf('async function syncAllRewardRoles('));
  const repair = source.slice(source.indexOf('async function repairIntegrity('), source.indexOf('function applyManualProgressChange('));

  assert.match(source, /const \{ getModuleSection \} = require\('\.\.\/\.\.\/\.\.\/core\/guild\/moduleSectionManager'\);/);
  assert.match(scan, /getModuleSection\(guild\.id, leveling\.MODULE_KEY, leveling\.defaults\(\)\)/);
  assert.match(scan, /invalidUserIds/);
  assert.match(scan, /invalidXpRecords/);
  assert.match(scan, /multiplierIssues/);
  assert.match(scan, /analyticsIssues/);
  assert.match(scan, /rawIdsByBucket/);
  assert.match(scan, /rawAnalytics/);
  assert.match(source, /createMaintenanceBackup\(guild\.id, 'recalculate-levels'\)/);
  assert.match(source, /createMaintenanceBackup\(guild\.id, 'rebuild-reward-roles'\)/);
  assert.match(source, /createMaintenanceBackup\(guild\.id, 'rebuild-leaderboard'\)/);
  assert.match(repair, /createMaintenanceBackup\(guild\.id, 'integrity-repair'\)/);
  assert.match(source, /maintenanceLog:/);
});

test('leveling multiplier normalization tolerates malformed stored dates', () => {
  const source = fs.readFileSync(levelingPath, 'utf8');
  const multiplier = source.slice(source.indexOf('function normalizeMultiplier('), source.indexOf('function normalizeLevelRewards('));

  assert.match(multiplier, /try \{ startsAt = source\.startsAt \? new Date\(source\.startsAt\)\.toISOString\(\) : null; \} catch \{ startsAt = null; \}/);
  assert.match(multiplier, /try \{ endsAt = source\.endsAt \? new Date\(source\.endsAt\)\.toISOString\(\) : null; \} catch \{ endsAt = null; \}/);
});

test('sticky store strips module enabled state while preserving channel enabled state', () => {
  const source = fs.readFileSync(stickyStorePath, 'utf8');
  const defaults = source.slice(source.indexOf('function defaultStickySection()'), source.indexOf('function normalizeSticky('));
  const channelNormalizer = source.slice(source.indexOf('function normalizeSticky('), source.indexOf('function normalizeSection('));
  const sectionNormalizer = source.slice(source.indexOf('function normalizeSection('), source.indexOf('function loadStickyData('));

  assert.doesNotMatch(defaults, /enabled\s*:/);
  assert.match(channelNormalizer, /enabled: input\.enabled !== false/);
  assert.match(sectionNormalizer, /delete normalized\.enabled;/);
  assert.match(source, /return normalizeSection\(saveModuleSection\(guildId, MODULE_KEY, normalizeSection\(data\), meta\)\);/);
  assert.doesNotMatch(sectionNormalizer, /enabled: source\.enabled !== false/);
});

test('starboard uses canonical module state across runtime, store, route and panel', () => {
  const runtime = fs.readFileSync(starboardRuntimePath, 'utf8');
  const store = fs.readFileSync(starboardStorePath, 'utf8');
  const panel = fs.readFileSync(starboardPanelPath, 'utf8');
  const route = fs.readFileSync(starboardRoutePath, 'utf8');
  const defaults = store.slice(store.indexOf('function defaultStarboardSection()'), store.indexOf('function normalizePost('));

  assert.doesNotMatch(defaults, /enabled\s*:/);
  assert.match(store, /delete normalized\.enabled;/);
  assert.match(runtime, /isModuleEnabled\(guildId, 'starboard'\) === true/);
  assert.match(runtime, /setModuleEnabled\(guildId, 'starboard', input\.enabled === true\)/);
  assert.match(panel, /const enabled = isModuleEnabled\(guild\.id, 'starboard'\) === true;/);
  assert.match(panel, /setModuleEnabled\(interaction\.guild\.id, 'starboard', true\)/);
  assert.match(panel, /setModuleEnabled\(interaction\.guild\.id, 'starboard', false\)/);
  assert.match(route, /enabled: isModuleEnabled\(guildId, 'starboard'\) === true/);
  assert.match(route, /setModuleEnabled\(guildId, 'starboard', req\.body\?\.enabled === true/);
  assert.doesNotMatch(store, /enabled: source\.enabled !== false/);
});

test('temporary roles runtime and store use canonical module state', () => {
  const source = fs.readFileSync(temporaryRolesPath, 'utf8');
  const defaults = source.slice(source.indexOf('function defaultSection()'), source.indexOf('function normalizeAssignment('));

  assert.doesNotMatch(defaults, /enabled\s*:/);
  assert.match(source, /delete normalized\.enabled;/);
  assert.match(source, /isModuleEnabled\(guild\.id, SECTION\)/);
  assert.match(source, /setModuleEnabled\(guildId, SECTION, Boolean\(enabled\), meta\)/);
  assert.doesNotMatch(source, /section\.enabled/);
});

test('temporary roles admin panel reports and writes canonical module state', () => {
  const source = fs.readFileSync(temporaryRolesPanelPath, 'utf8');
  assert.match(source, /const enabled = isModuleEnabled\(guild\.id, 'temporaryRoles'\)/);
  assert.match(source, /setModuleEnabled\(interaction\.guild\.id, 'temporaryRoles', true/);
  assert.match(source, /setModuleEnabled\(interaction\.guild\.id, 'temporaryRoles', false/);
  assert.doesNotMatch(source, /temporaryRoles\.setEnabled/);
  assert.doesNotMatch(source, /section\.enabled/);
});

test('server backup scheduler uses canonical per-guild module state', () => {
  const source = fs.readFileSync(serverBackupSchedulerPath, 'utf8');
  const direct = source.slice(source.indexOf('async function backupGuild('), source.indexOf('async function runServerBackupCycle('));
  const cycle = source.slice(source.indexOf('async function runServerBackupCycle('), source.indexOf('function startServerBackupScheduler('));

  assert.match(direct, /guildManager\.isModuleEnabled\(guild\.id, 'serverBackups'\)/);
  assert.match(cycle, /guildManager\.isModuleEnabled\(guild\.id, 'serverBackups'\)/);
  assert.match(source, /SERVER_BACKUP_ENABLED/);
});

test('stats summary uses the canonical logging module key', () => {
  const source = fs.readFileSync(statsRoutePath, 'utf8');
  assert.match(source, /guildManager\.isModuleEnabled\(guildId, 'logging'\)/);
  assert.doesNotMatch(source, /guildManager\.isModuleEnabled\(guildId, 'logs'\)/);
});

test('giveaways admin and interaction paths use canonical module state', () => {
  const panel = fs.readFileSync(giveawaysAdminPanelPath, 'utf8');
  const interactions = fs.readFileSync(giveawaysInteractionHandlerPath, 'utf8');

  assert.match(panel, /const enabled = guildManager\.isModuleEnabled\(guild\.id, 'giveaways'\)/);
  assert.doesNotMatch(panel, /section\.enabled/);
  assert.match(interactions, /setModuleEnabled\(interaction\.guild\.id, 'giveaways', true/);
  assert.match(interactions, /setModuleEnabled\(interaction\.guild\.id, 'giveaways', false/);
  assert.match(interactions, /isModuleEnabled\(interaction\.guildId, 'giveaways'\)/);
  assert.doesNotMatch(interactions, /section\.enabled/);
});

test('social studio monitor and API overlay canonical module state without persisting enabled', () => {
  const monitor = fs.readFileSync(socialStudioMonitorPath, 'utf8');
  const route = fs.readFileSync(socialStudioRoutePath, 'utf8');

  assert.match(monitor, /enabled: guildManager\.isModuleEnabled\(guildId, 'social'\)/);
  assert.match(monitor, /if \(!config\.enabled && !options\.manual\)/);
  assert.match(monitor, /return \{ \.\.\.updated, enabled: guildManager\.isModuleEnabled\(guildId, 'social'\) \};/);
  assert.match(monitor, /account\.enabled === false/);
  assert.match(monitor, /creator\?\.enabled === false/);

  assert.match(route, /delete normalized\.enabled;/);
  assert.match(route, /enabled: guildManager\.isModuleEnabled\(id, 'social'\)/);
  assert.match(route, /const \{ enabled: _enabled, \.\.\.storedConfig \} = isObject\(config\) \? config : \{\};/);
  assert.match(route, /guildManager\.setModuleEnabled\(id, 'social', body\.enabled, actor\(req\)\)/);
  assert.match(route, /enabled: value\.enabled !== false/);
  assert.doesNotMatch(route, /enabled: source\.enabled !== false/);
});