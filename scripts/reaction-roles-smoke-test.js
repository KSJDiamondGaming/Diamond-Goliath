'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

function test(label, fn) {
  try { fn(); console.log(`✅ ${label}`); }
  catch (error) { console.error(`❌ ${label}`); throw error; }
}

console.log('\nRole Studio Smoke Test');
console.log('======================');

const reactionRoles = require(path.join(root, 'src/modules/reactionroles/reactionRoles'));
const panelSource = read('src/modules/reactionroles/reactionRolesPanelV3.js');
const panelEntry = read('src/modules/reactionroles/reactionRolesPanel.js');
const runtimeSource = read('src/modules/reactionroles/reactionRoles.js');
const finderSource = read('src/modules/reactionroles/reactionRoleMessageFinder.js');
const routeSource = read('src/modules/reactionroles/reactionRolesRoute.js');
const interactionSource = read('src/events/interactions/interactionCreate.js');
const manifestSource = read('src/core/modules/moduleManifest.js');

test('Canonical Role Studio runtime exports are present', () => {
  for (const name of [
    'getSection', 'setEnabled', 'listPanels', 'getPanel', 'attachExistingMessage',
    'createFromTemplate', 'updatePanelMappings', 'detachPanel', 'deleteDeploymentMessage',
    'handleReactionAdd', 'handleReactionRemove', 'buildHealth', 'repairAll',
    'startup', 'exportConfiguration', 'reset',
  ]) assert.equal(typeof reactionRoles[name], 'function', `Missing runtime export: ${name}`);
});

test('Role Studio remains backwards compatible with the reactionRoles storage key', () => {
  assert.equal(reactionRoles.SECTION, 'reactionRoles');
  assert.ok(manifestSource.includes("reactionRoles: { key: 'reactionRoles', name: 'Role Studio'"));
});

test('Universal Discord administration entrypoint is active', () => {
  assert.ok(panelEntry.includes("require('./reactionRolesPanelV3')"));
  assert.equal(exists('src/modules/reactionroles/reactionRolesPanelV3.js'), true);
  assert.equal(exists('src/modules/reactionroles/reactionRoleMessageFinder.js'), true);
});

test('Overview follows the compact Studio and Admin Centre layout', () => {
  for (const token of ['🎭 Role Studio', 'Attach Existing Message', 'Create New Panel', 'Admin Centre', 'Back to Modules', 'Role Studio Admin Centre']) {
    assert.ok(panelSource.includes(token), `Missing overview control: ${token}`);
  }
  assert.ok(panelSource.includes("id === 'admin:reactionRoles:admin'"));
});

test('Every supported existing-message source is exposed', () => {
  for (const token of [
    'Choose channel or thread', 'Load Recent', 'Search Messages', 'Paste Link', 'Enter IDs',
    'source:channel', 'source:message', 'source:browse', 'source:search', 'source:link', 'source:ids',
    'ChannelType.PublicThread', 'ChannelType.PrivateThread', 'ChannelType.AnnouncementThread',
  ]) assert.ok(panelSource.includes(token), `Missing universal source option: ${token}`);
});

test('Message selection is verified before deployment', () => {
  for (const token of ['verifyAndSelect', 'searchGuildMessages', 'message could not be found', 'result.messages?.[0]']) {
    assert.ok(panelSource.includes(token), `Missing message verification behaviour: ${token}`);
  }
  assert.ok(finderSource.includes('channel.messages.fetch(options.messageId)'));
});

test('All Discord payload builders stay within five rows by design', () => {
  for (const functionName of ['buildReactionRolesAdminPanel', 'buildAdminCentre', 'buildSourcePicker', 'buildWizard', 'buildMappingRemoval', 'buildManagedPanel', 'buildRemovalChoices']) {
    const start = panelSource.indexOf(`function ${functionName}`);
    assert.ok(start >= 0, `Missing payload builder: ${functionName}`);
    const next = panelSource.indexOf('\nfunction ', start + 10);
    const body = panelSource.slice(start, next < 0 ? panelSource.length : next);
    const rowCount = (body.match(/row\(/g) || []).length;
    assert.ok(rowCount <= 5, `${functionName} contains more than five row builders: ${rowCount}`);
  }
});

test('Existing messages are never rewritten during attachment', () => {
  assert.ok(runtimeSource.includes('attachExistingMessage'));
  assert.ok(runtimeSource.includes('originalPayload = template ? messagePayload(message) : null'));
  assert.ok(panelSource.includes('templateId: null, applyTemplate: false'));
  assert.ok(panelSource.includes('Original content and unrelated reactions remain unchanged'));
});

test('Reaction add and remove events remain connected', () => {
  assert.ok(interactionSource.includes("startsWith(interaction, 'admin:reactionRoles')"));
  assert.equal(exists('src/events/messages/messageReactionAdd.js'), true);
  assert.equal(exists('src/events/messages/messageReactionRemove.js'), true);
});

test('API exposes deployment, maintenance, export and reset operations', () => {
  for (const token of [
    "router.post('/:guildId/attach'", "router.post('/:guildId/deploy'",
    "router.put('/:guildId/panels/:panelId'", "router.post('/:guildId/repair'",
    "router.get('/:guildId/export'", "router.post('/:guildId/reset'",
  ]) assert.ok(routeSource.includes(token), `Missing API route: ${token}`);
});

console.log('\n✅ Role Studio universal source, routing and component-limit smoke tests passed.');
console.log('ℹ️ Discord permissions, historical message fetching and live role assignment still require development-guild acceptance testing.');
