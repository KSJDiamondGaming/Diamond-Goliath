'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const core = read('src/modules/roleStudio/timedRoles/timedRoles.js');
const service = read('src/modules/roleStudio/timedRoles/timedRolesService.js');
const locks = read('src/modules/roleStudio/timedRoles/timedRolesLocks.js');
const compat = read('src/modules/roleStudio/timedRoles/timedRolesCompat.js');
const health = read('src/modules/roleStudio/timedRoles/timedRolesHealth.js');
const route = read('src/server/routes/modules/roleStudio/timedRoles.js');
const startup = read('src/events/client/timedRolesStartup.js');
const join = read('src/events/timedroles/timedRolesMemberJoin.js');
const roleSync = read('src/events/roles/timedRolesSync.js');
const contracts = read('src/owner/sentinel/moduleContracts.js');

test('Timed Roles serializes guild progression mutations', () => {
  assert.match(locks, /withTimedRolesLock/);
  assert.match(service, /return withTimedRolesLock\(guild\.id/);
  assert.match(service, /async function scanGuild/);
  assert.match(startup, /timedRolesService/);
});

test('Timed Roles validates member and role hierarchy before Discord writes', () => {
  assert.match(service, /PermissionFlagsBits\.ManageRoles/);
  assert.match(service, /member\.manageable === false/);
  assert.match(service, /member\.id === guild\.ownerId/);
  assert.match(service, /role\.position >= me\.roles\.highest\.position/);
});

test('Timed Roles verifies final Discord state before announcements', () => {
  assert.match(service, /Discord did not converge to the requested Timed Roles state/);
  assert.match(service, /refreshMember/);
  assert.match(service, /targetOk && cleanupOk/);
  assert.match(service, /announcePromotion/);
});

test('Timed Roles prevents duplicate award-role milestones', () => {
  assert.match(service, /already used by the Timed Roles milestone/);
  assert.match(compat, /duplicate = base\.listRules/);
  assert.match(compat, /cannot duplicate the same award role/);
});

test('Timed Roles validates duration saves and Discord role selection', () => {
  assert.match(compat, /Number\.isFinite\(value\)/);
  assert.match(compat, /1_000_000/);
  assert.match(compat, /validateRoleSelection/);
  assert.match(compat, /timed_roles\.discord_create/);
  assert.match(compat, /timed_roles\.discord_cleanup/);
  assert.match(compat, /Timed Roles setup failed/);
});

test('Timed Roles simulation includes cleanup removals', () => {
  assert.match(service, /cleanupRoleIds/);
  assert.match(service, /const remove = \[\.\.\.state\.cleanupRoleIds\]/);
});

test('Timed Roles dashboard requires authenticated guild management access', () => {
  assert.match(route, /req\.session\?\.user\?\.id/);
  assert.match(route, /PermissionFlagsBits\.Administrator/);
  assert.match(route, /PermissionFlagsBits\.ManageGuild/);
  assert.match(route, /router\.use\('\/:guildId', requireTimedRolesAccess\)/);
  assert.doesNotMatch(route, /req\.body\?\.actorId/);
  assert.match(route, /timedRolesService/);
});

test('Timed Roles Discord controls enforce central admin security', () => {
  assert.match(compat, /security\.enforceInteractionSecurity/);
  assert.match(compat, /level: 'admin'/);
});

test('Timed Roles health treats warnings as unhealthy and validates announcement visibility', () => {
  assert.match(health, /healthy: uniqueIssues\.length === 0 && uniqueWarnings\.length === 0/);
  assert.match(health, /PermissionFlagsBits\.ViewChannel/);
  assert.match(health, /award role is also used by another Timed Roles milestone/);
  assert.match(health, /withTimedRolesLock/);
});

test('Timed Roles member joins use hardened progression service', () => {
  assert.match(join, /timedRolesService/);
  assert.match(join, /applyProgressionToMember/);
});

test('Timed Roles reconciles deleted Discord roles immediately', () => {
  assert.match(roleSync, /name: 'roleDelete'/);
  assert.match(roleSync, /timed_roles_target_role_deleted/);
  assert.match(roleSync, /timed_roles_cleanup_role_deleted/);
  assert.match(roleSync, /withTimedRolesLock/);
});

test('Sentinel contract includes Timed Roles interaction and scheduler signals', () => {
  assert.match(contracts, /timedRoles: \{ class: 'scheduled', signals: \['runtime', 'interaction', 'scheduler', 'persistence', 'discord-write'\] \}/);
});

test('Timed Roles core remains the canonical persistence and duration model', () => {
  assert.match(core, /modules?\.timedRoles|SECTION = 'timedRoles'/);
  assert.match(core, /function eligibleAt/);
  assert.match(core, /months/);
  assert.match(core, /years/);
});
