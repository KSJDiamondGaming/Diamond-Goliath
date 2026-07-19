'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

console.log('\nRole Studio Smoke Test');
console.log('======================');

const entry = read('src/modules/reactionroles/reactionRolesPanel.js');
const hub = read('src/modules/rolestudio/roleStudioPanel.js');
const navigation = read('src/modules/rolestudio/roleStudioNavigationPatch.js');
const temporary = require(path.join(root, 'src/modules/rolestudio/temporaryRoles'));
const temporaryPanel = read('src/modules/rolestudio/temporaryRolesPanel.js');
const startup = read('src/events/client/temporaryRolesStartup.js');

assert.ok(entry.includes("roleStudio.buildRoleStudioPanel"));
assert.ok(entry.includes("admin:reactionRoles:open"));
assert.ok(entry.includes('handleTemporaryRolesInteraction'));
assert.ok(hub.includes('👥 Auto Roles'));
assert.ok(hub.includes('😊 Reaction Roles'));
assert.ok(hub.includes('⏳ Timed Roles'));
assert.ok(hub.includes('⚡ Temporary Roles'));
assert.ok(navigation.includes("route === 'admin:autoRoles'"));
assert.ok(navigation.includes("moduleEntry[1] = '🛡️ Role Studio'"));
assert.equal(typeof temporary.assignTemporaryRole, 'function');
assert.equal(typeof temporary.removeAssignment, 'function');
assert.equal(typeof temporary.scanExpired, 'function');
assert.ok(temporaryPanel.includes('UserSelectMenuBuilder'));
assert.ok(temporaryPanel.includes('Assign Temporary Role'));
assert.ok(startup.includes('SCAN_INTERVAL_MS'));
assert.ok(startup.includes('scanExpired'));

console.log('✅ Role Studio is the parent role hub.');
console.log('✅ Auto Roles, Reaction Roles and Timed Roles remain connected.');
console.log('✅ Temporary Roles assignment, removal and expiry scanning are present.');
console.log('ℹ️ Run the full doctor and a live development-guild acceptance test after pulling.');