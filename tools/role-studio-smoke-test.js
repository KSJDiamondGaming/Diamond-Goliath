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
const legacyEntry = read('src/modules/reactionroles/reactionRolesPanel.js');
const hubSource = read('src/modules/roleStudio/roleStudioPanel.js');
const hub = load('src/modules/roleStudio/roleStudioPanel.js');
const modulePanelSource = read('src/core/admin/functions/moduleAdminPanels.js');
const modulePanels = load('src/core/admin/functions/moduleAdminPanels.js');
const runtimePatchSource = read('src/core/admin/functions/adminModuleRuntimePatch.js');
const runtimePatch = load('src/core/admin/functions/adminModuleRuntimePatch.js');
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

runtimePatch.install(modulePanels);
const expectedModules = [
  ['admin:embed', 'Embed Studio'],
  ['admin:forms', 'Forms'],
  ['admin:fun', 'Fun'],
  ['admin:giveaways', 'Giveaways'],
  ['admin:goodbye', 'Goodbye'],
  ['admin:invites', 'Invite Studio'],
  ['admin:leveling', 'Leveling'],
  ['admin:polls', 'Polls'],
  ['admin:reactionRoles', 'Role Studio'],
  ['admin:stats', 'Server Stats'],
  ['admin:social', 'Social Alerts'],
  ['admin:starboard', 'Starboard'],
  ['admin:sticky', 'Sticky Messages'],
  ['admin:suggestions', 'Suggestions'],
  ['admin:tempVoice', 'Temp Voice'],
  ['admin:tickets', 'Tickets'],
  ['admin:translation', 'Translation'],
  ['admin:verification', 'Verification'],
  ['admin:welcome', 'Welcome'],
];

assert.equal(modulePanels.SERVER_MODULES.length, expectedModules.length);
assert.deepEqual(
  modulePanels.SERVER_MODULES.map(([route, , name]) => [route, name]),
  expectedModules
);

const names = modulePanels.SERVER_MODULES.map((item) => item[2]);
assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));

const moduleRoutes = modulePanels.SERVER_MODULES.map((item) => item[0]);
assert.equal(moduleRoutes.includes('admin:autoRoles'), false);
assert.equal(moduleRoutes.includes('admin:timedRoles'), false);
assert.equal(moduleRoutes.includes('admin:reactionRoles:open'), false);
assert.equal(moduleRoutes.includes('admin:reactionRoles:temporary'), false);

const roleStudioEntry = modulePanels.SERVER_MODULES.find((item) => item[0] === 'admin:reactionRoles');
assert.ok(roleStudioEntry, 'Role Studio must appear in the top-level module menu');
assert.equal(roleStudioEntry[1], '🎭 Role Studio');
assert.equal(roleStudioEntry[2], 'Role Studio');

const firstPage = modulePanels.buildModuleListPanel(0, 'Smoke Test');
const secondPage = modulePanels.buildModuleListPanel(1, 'Smoke Test');
const serialize = (payload) => JSON.stringify(payload);
assert.ok(serialize(firstPage).includes('Page 1/2'));
assert.ok(serialize(secondPage).includes('Page 2/2'));
assert.ok(serialize(firstPage).includes('admin:modules:back'));
assert.ok(serialize(firstPage).includes('admin:home'));
assert.ok(serialize(firstPage).includes('admin:modules:page:1'));
assert.ok(serialize(secondPage).includes('admin:modules:page:0'));
assert.ok(serialize(secondPage).includes('admin:home'));

assert.ok(runtimePatchSource.includes("button('admin:modules', '⬅️ Back')"));
assert.ok(runtimePatchSource.includes("button('admin:home', '🏠 Admin Home')"));
assert.ok(runtimePatchSource.includes('installNavigationPatches'));

assert.ok(entry.includes('handleReactionRolesAdminInteraction'));
assert.ok(legacyEntry.includes('buildFallbackHub'));
assert.ok(legacyEntry.includes('loadReactionRolesPanel'));
assert.equal(legacyEntry.includes('roleStudioNavigationPatch'), false);
assert.ok(modulePanelSource.includes('// Canonical Admin Hub module menu.'));
assert.ok(modulePanelSource.includes("['admin:reactionRoles', '🎭 Role Studio'"));
assert.equal(fs.existsSync(path.join(root, 'src/modules/roleStudio/roleStudioNavigationPatch.js')), false);

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
console.log('✅ All 19 top-level Admin modules are present alphabetically.');
console.log('✅ Role systems are grouped only under Role Studio.');
console.log('✅ Two-page module navigation includes Back, paging and Admin Home.');
console.log('✅ Shared Admin module navigation patch is installed.');
console.log('✅ Auto, reaction, timed and temporary role modules are connected.');
console.log('ℹ️ Run the full doctor and a live development-guild acceptance test after pulling.');
