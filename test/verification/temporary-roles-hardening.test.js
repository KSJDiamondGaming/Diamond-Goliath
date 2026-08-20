'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const service = read('src/modules/roleStudio/temporaryRoles/temporaryRolesService.js');
const locks = read('src/modules/roleStudio/temporaryRoles/temporaryRolesLocks.js');
const panel = read('src/modules/roleStudio/temporaryRoles/temporaryRolesPanel.js');
const health = read('src/modules/roleStudio/temporaryRoles/temporaryRolesHealth.js');
const route = read('src/server/routes/modules/roleStudio/temporaryRoles.js');
const startup = read('src/events/client/temporaryRolesStartup.js');
const memberEvents = read('src/events/members/temporaryRolesSync.js');
const roleEvents = read('src/events/roles/temporaryRolesSync.js');
const contracts = read('src/owner/sentinel/moduleContracts.js');

test('Temporary Roles serializes guild mutations', () => {
  assert.match(locks, /withTemporaryRolesLock/);
  assert.match(service, /return withTemporaryRolesLock\(guild\.id/);
  assert.match(service, /async function scanExpired/);
  assert.match(startup, /temporaryRolesService/);
});

test('Temporary Roles validates member and role hierarchy before Discord writes', () => {
  assert.match(service, /PermissionFlagsBits\.ManageRoles/);
  assert.match(service, /member\.manageable === false/);
  assert.match(service, /member\.id === guild\.ownerId/);
  assert.match(service, /role\.position >= me\.roles\.highest\.position/);
});

test('Temporary Roles verifies Discord state and rolls back persistence split-brain', () => {
  assert.match(service, /assertRolePresence/);
  assert.match(service, /Temporary role assignment rollback/);
  assert.match(service, /Temporary role removal rollback/);
  assert.match(service, /Discord did not/);
});

test('Temporary Roles expiry failures use bounded retry backoff', () => {
  assert.match(service, /MAX_RETRY_MS/);
  assert.match(service, /retryCount/);
  assert.match(service, /nextRetryAt/);
  assert.match(service, /retryDelay/);
});

test('Temporary Roles dashboard requires authenticated guild management access', () => {
  assert.match(route, /req\.session\?\.user\?\.id/);
  assert.match(route, /PermissionFlagsBits\.Administrator/);
  assert.match(route, /PermissionFlagsBits\.ManageGuild/);
  assert.match(route, /router\.use\('\/:guildId', requireTemporaryRolesAccess\)/);
  assert.doesNotMatch(route, /req\.body\?\.actorId/);
});

test('Temporary Roles Discord controls enforce central admin security', () => {
  assert.match(panel, /security\.enforceInteractionSecurity/);
  assert.match(panel, /level: 'admin'/);
  assert.match(panel, /SESSION_TTL_MS/);
});

test('Temporary Roles reconciles member and role lifecycle events', () => {
  assert.match(memberEvents, /guildMemberUpdate/);
  assert.match(memberEvents, /guildMemberRemove/);
  assert.match(roleEvents, /roleDelete/);
  assert.match(service, /handleMemberUpdate/);
  assert.match(service, /handleMemberRemove/);
  assert.match(service, /handleRoleDelete/);
});

test('Temporary Roles health reports warnings as unhealthy and uses hardened service', () => {
  assert.match(health, /temporaryRolesService/);
  assert.match(health, /healthy: issues\.length === 0 && warnings\.length === 0/);
  assert.match(health, /withTemporaryRolesLock/);
});

test('Sentinel contract includes Temporary Roles interactions and scheduler signals', () => {
  assert.match(contracts, /temporaryRoles: \{ class: 'scheduled', signals: \['runtime', 'interaction', 'scheduler', 'persistence', 'discord-write'\] \}/);
});
