'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const core = read('src/modules/roleStudio/autoRoles/autoRoles.js');
const service = read('src/modules/roleStudio/autoRoles/autoRolesService.js');
const locks = read('src/modules/roleStudio/autoRoles/autoRolesLocks.js');
const panel = read('src/modules/roleStudio/autoRoles/autoRolesPanel.js');
const route = read('src/server/routes/modules/roleStudio/autoRoles.js');
const startup = read('src/events/client/autoRolesStartup.js');
const memberJoin = read('src/events/members/memberJoinLeave.js');
const roleSync = read('src/events/roles/autoRolesSync.js');
const contracts = read('src/owner/sentinel/moduleContracts.js');

test('Auto Roles serializes guild assignment and reapply mutations', () => {
  assert.match(locks, /withAutoRolesLock/);
  assert.match(service, /return withAutoRolesLock\(member\.guild\.id/);
  assert.match(service, /return withAutoRolesLock\(guild\.id/);
});

test('Auto Roles validates member and role hierarchy before writes', () => {
  assert.match(service, /PermissionFlagsBits\.ManageRoles/);
  assert.match(service, /member\.manageable === false/);
  assert.match(service, /member\.id === guild\.ownerId/);
  assert.match(service, /role\.position >= me\.roles\.highest\.position/);
});

test('Auto Roles verifies Discord assignment convergence', () => {
  assert.match(service, /refreshMember/);
  assert.match(service, /Discord did not apply/);
  assert.match(service, /live\.roles\.cache\.has\(role\.id\)/);
});

test('Auto Roles central member join path receives hardened compatibility wrapper', () => {
  assert.match(service, /base\.applyAutoRoles = applyAutoRoles/);
  assert.match(memberJoin, /autoRoleManager\.applyAutoRoles/);
  assert.match(startup, /autoRolesService/);
});

test('Auto Roles Discord controls enforce central admin security and role validation', () => {
  assert.match(panel, /security\.enforceInteractionSecurity/);
  assert.match(panel, /level: 'admin'/);
  assert.match(panel, /validateRoleSelection/);
  assert.match(panel, /setConfiguredRoles/);
});

test('Auto Roles dashboard requires authenticated guild management access', () => {
  assert.match(route, /req\.session\?\.user\?\.id/);
  assert.match(route, /PermissionFlagsBits\.Administrator/);
  assert.match(route, /PermissionFlagsBits\.ManageGuild/);
  assert.match(route, /router\.use\('\/:guildId', requireAutoRolesAccess\)/);
  assert.doesNotMatch(route, /req\.body\?\.actorId/);
  assert.match(route, /autoRolesService/);
});

test('Auto Roles dashboard mutations use the guild lock', () => {
  assert.match(route, /withAutoRolesLock/);
  assert.match(route, /setConfiguredRoles/);
  assert.match(route, /repairConfiguration/);
  assert.match(route, /reapplyToGuild/);
});

test('Auto Roles reconciles deleted Discord roles immediately', () => {
  assert.match(roleSync, /name: 'roleDelete'/);
  assert.match(roleSync, /handleRoleDelete/);
  assert.match(service, /auto_roles_role_deleted/);
});

test('Auto Roles health retains role existence and manageability checks', () => {
  assert.match(core, /buildHealthReport/);
  assert.match(core, /Goliath is missing Manage Roles/);
  assert.match(core, /above Goliath or managed by an integration/);
  assert.match(core, /healthy: warnings\.length === 0/);
});

test('Sentinel contract covers Auto Roles interaction and Discord writes', () => {
  assert.match(contracts, /autoRoles: \{ class: 'event', signals: \['runtime', 'interaction', 'persistence', 'discord-write'\] \}/);
});
