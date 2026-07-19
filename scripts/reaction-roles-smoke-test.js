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

const panelSource = read('src/modules/reactionroles/reactionRolesPanelV2.js');
const runtimeSource = read('src/modules/reactionroles/reactionRoles.js');
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

test('Dedicated Discord administration files exist', () => {
  assert.equal(exists('src/modules/reactionroles/reactionRolesPanel.js'), true);
  assert.equal(exists('src/modules/reactionroles/reactionRolesPanelV2.js'), true);
  assert.equal(exists('src/modules/reactionroles/reactionRolesRoute.js'), true);
});

test('Overview follows the compact Studio and Admin Centre layout', () => {
  for (const token of [
    '🎭 Role Studio', 'Attach Existing Message', 'Create New Panel',
    'Admin Centre', 'Back to Modules', 'Role Studio Admin Centre',
  ]) assert.ok(panelSource.includes(token), `Missing overview control: ${token}`);
  assert.ok(panelSource.includes("id === 'admin:reactionRoles:admin'"), 'Admin Centre button is not routed');
});

test('Wizard cannot exceed Discord five-row component limit', () => {
  const wizardStart = panelSource.indexOf('function buildWizard');
  const wizardEnd = panelSource.indexOf('function buildMappingRemoval');
  const wizard = panelSource.slice(wizardStart, wizardEnd);
  assert.ok(wizard.includes('const components = ['));
  assert.ok(wizard.includes('if (!existing) components.push'));
  assert.ok(!wizard.includes('wizard:applyTemplate'), 'Legacy sixth-row template toggle remains in wizard');

  // Existing-message wizard: channel + role + mode + actions = 4 rows.
  // New-panel wizard: channel + template + role + mode + actions = 5 rows.
  const unconditionalRows = (wizard.match(/row\(/g) || []).length;
  assert.ok(unconditionalRows <= 5, `Wizard source contains too many action rows: ${unconditionalRows}`);
});

test('Any existing accessible Discord message can be targeted safely', () => {
  for (const token of [
    'parseMessageReference', 'discord(?:app)?\\.com/channels',
    'The message link belongs to a different server', 'messageReference',
    'applyTemplate: false', 'Original content:** Preserved',
    'Unrelated reactions:** Preserved',
  ]) assert.ok(runtimeSource.includes(token) || panelSource.includes(token), `Missing existing-message behaviour: ${token}`);
});

test('Attachment preserves unrelated message data and adds only configured reactions', () => {
  assert.ok(runtimeSource.includes('if (!findMessageReaction(message, mapping)) await message.react'));
  assert.ok(runtimeSource.includes('attachExistingMessage'));
  assert.ok(runtimeSource.includes('originalPayload = template ? messagePayload(message) : null'));
  assert.ok(panelSource.includes('templateId: null, applyTemplate: false'));
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

console.log('\n✅ Role Studio routing, component-limit and existing-message smoke tests passed.');
console.log('ℹ️ Discord permissions, historical message fetching and live role assignment still require development-guild acceptance testing.');
