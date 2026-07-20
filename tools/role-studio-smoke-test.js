'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const load = (file) => require(path.join(root, file));

console.log('\nRole Studio Smoke Test');
console.log('======================');

const entry = read('src/modules/roleStudio/reactionRoles/reactionRolesPanel.js');
const hubSource = read('src/modules/roleStudio/roleStudioPanel.js');
const hub = load('src/modules/roleStudio/roleStudioPanel.js');
const navigation = read('src/modules/roleStudio/roleStudioNavigationPatch.js');
const modulePanels = load('src/modules/roleStudio/roleStudioNavigationPatch.js');
const autoRolesSource = read('src/modules/roleStudio/autoRoles/autoRoles.js');
const autoRoles = load('src/modules/roleStudio/autoRoles/autoRoles.js');
const autoRolesStartup = read('src/events/client/autoRolesStartup.js');
const temporary = load('src/modules/roleStudio/temporaryRoles/temporaryRoles.js');
const temporaryPanel = read('src/modules/roleStudio/temporaryRoles/temporaryRolesPanel.js');
const temporaryStartup = read('src/events/client/temporaryRolesStartup.js');
const timedRoles = load('src/modules/roleStudio/timedRoles/timedRoles.js');
const timedPanel = read('src/modules/roleStudio/timedRoles/timedRolesPanel.js');
const timedStartup = read('src/events/client/timedRolesStartup.js');
const timedMemberJoin = read('src/events/timedroles/timedRolesMemberJoin.js');

assert.equal(typeof hub.buildRoleStudioPanel, 'function');
assert.equal(typeof hub.buildRoleAnalyticsPanel, 'function');
assert.equal(typeof hub.buildRoleHealthPanel, 'function');

for (const route of [
  'admin:autoRoles',
  'admin:reactionRoles:open',
  'admin:timedRoles',
  'admin:reactionRoles:temporary',
  'admin:reactionRoles:analytics',
  'admin:reactionRoles:health',
]) {
  assert.ok(hubSource.includes(route), `Role Studio is missing route ${route}`);
}

const moduleRoutes = modulePanels.SERVER_MODULES.map((item) => item[0]);
const roleStudioEntry = modulePanels.SERVER_MODULES.find(
  (item) => item[0] === 'admin:reactionRoles'
);

assert.ok(roleStudioEntry, 'Role Studio must appear in the top-level module menu');
assert.equal(roleStudioEntry[1], '🛡️ Role Studio');
assert.equal(roleStudioEntry[2], 'Role Studio');
assert.equal(moduleRoutes.includes('admin:autoRoles'), false);
assert.equal(moduleRoutes.includes('admin:timedRoles'), false);
assert.equal(moduleRoutes.includes('admin:forms'), false);
assert.equal(moduleRoutes.includes('admin:giveaways'), false);
assert.equal(moduleRoutes.includes('admin:leveling'), false);
assert.equal(moduleRoutes.includes('admin:starboard'), false);
assert.equal(moduleRoutes.includes('admin:sticky'), false);
assert.equal(moduleRoutes.includes('admin:tempVoice'), false);
assert.equal(moduleRoutes.includes('admin:translation'), false);
assert.equal(moduleRoutes.length, 8);

assert.ok(entry.includes('handleReactionRolesAdminInteraction'));
assert.ok(navigation.includes('TOP_LEVEL_MODULE_ROUTES'));
assert.ok(navigation.includes("moduleEntry[1] = '🛡️ Role Studio'"));

assert.equal(typeof autoRoles.applyAutoRoles, 'function');
assert.equal(typeof autoRoles.startupAutoRoles, 'function');
assert.equal(typeof autoRoles.buildHealthReport, 'function');
assert.equal(typeof autoRoles.setAutoRolesEnabled, 'function');
assert.equal(autoRoles.setEnabled, undefined);
assert.ok(autoRolesSource.includes('const enabled = isAutoRolesEnabled(guild.id);'));
assert.ok(autoRolesSource.includes('const reapply = enabled && section.settings?.reapplyOnStartup === true'));
assert.ok(autoRolesStartup.includes('startupAutoRoles(client)'));

const normalizedAutoRoles = autoRoles.normalizeAutoRolesSection({
  settings: {
    applyToBots: true,
    auditLog: false,
    reapplyOnStartup: true,
    ignoreExistingRoles: false,
    unsupportedSetting: true,
  },
});
assert.deepEqual(Object.keys(normalizedAutoRoles.settings).sort(), [
  'applyToBots',
  'auditLog',
  'ignoreExistingRoles',
  'reapplyOnStartup',
]);
assert.equal(normalizedAutoRoles.settings.unsupportedSetting, undefined);
assert.equal(autoRolesSource.includes('...input,'), false);
assert.equal(autoRolesSource.includes('...clone(source.settings)'), false);

assert.equal(typeof temporary.assignTemporaryRole, 'function');
assert.equal(typeof temporary.removeAssignment, 'function');
assert.equal(typeof temporary.scanExpired, 'function');
assert.ok(temporaryPanel.includes('UserSelectMenuBuilder'));
assert.ok(temporaryPanel.includes('Assign Temporary Role'));
assert.ok(temporaryStartup.includes('SCAN_INTERVAL_MS'));
assert.ok(temporaryStartup.includes('scanExpired'));

assert.equal(typeof timedRoles.getMemberProgression, 'function');
assert.equal(typeof timedRoles.applyProgressionToMember, 'function');
assert.equal(typeof timedRoles.simulateGuild, 'function');
assert.equal(typeof timedRoles.scanGuild, 'function');
assert.deepEqual(timedRoles.MODES, ['keep_all', 'highest_only']);
assert.ok(timedPanel.includes('Choose any role to create a milestone'));
assert.ok(timedPanel.includes('Preview any member'));
assert.ok(timedPanel.includes('toggleMode'));
assert.ok(timedPanel.includes('announcementChannel'));
assert.ok(timedPanel.includes('Promotion Announcement'));
assert.ok(timedPanel.includes('Simulate'));
assert.ok(timedStartup.includes('timedRoles.startup(client)'));
assert.ok(timedMemberJoin.includes('applyProgressionToMember'));

console.log('✅ Role Studio exports and routes are wired.');
console.log('✅ Role systems are grouped under Role Studio in the Admin module menu.');
console.log('✅ Unavailable placeholder modules are hidden from the Admin module menu.');
console.log('✅ Auto Roles runtime, health and startup module gate are present.');
console.log('✅ Auto Roles settings are restricted to the supported schema.');
console.log('✅ Auto, reaction, timed and temporary role modules are connected.');
console.log('✅ Timed-role progression, simulation and startup processing are present.');
console.log('✅ Temporary-role assignment, removal and expiry scanning are present.');
console.log('ℹ️ Run the full doctor and a live development-guild acceptance test after pulling.');
