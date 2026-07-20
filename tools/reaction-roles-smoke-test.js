'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const resolve = (file) => path.join(root, file);
const exists = (file) => fs.existsSync(resolve(file));
const read = (file) => fs.readFileSync(resolve(file), 'utf8');

function test(label, fn) {
  try {
    fn();
    console.log(`[PASS] ${label}`);
  } catch (error) {
    console.error(`[FAIL] ${label}`);
    throw error;
  }
}

console.log('');
console.log('Reaction Roles Smoke Test');
console.log('=========================');

const panelPath =
  'src/modules/roleStudio/reactionRoles/reactionRolesPanel.js';

const removedPanels = [
  'src/modules/roleStudio/reactionRoles/reactionRolesPanelV2.js',
  'src/modules/roleStudio/reactionRoles/reactionRolesPanelV3.js',
  'src/modules/roleStudio/reactionRoles/reactionRolesPanelV4.js',
  'src/modules/roleStudio/reactionRoles/reactionRolesPanelV5.js',
  'src/modules/roleStudio/reactionRoles/reactionRolesPanelV6.js',
  'src/modules/roleStudio/reactionRoles/reactionRolesPanelV7.js',
];

test('consolidated panel exists', () => {
  assert.equal(exists(panelPath), true);
});

const panel = read(panelPath);

test('consolidated panel is not empty', () => {
  assert.ok(panel.trim().length > 0);
});

test('consolidated panel exports an API', () => {
  assert.ok(panel.includes('module.exports'));
});

test('consolidated panel contains Reaction Roles handlers', () => {
  assert.ok(panel.includes('reactionRoles'));
  assert.ok(
    panel.includes('handleInteraction') ||
    panel.includes('buildReactionRolesPanel') ||
    panel.includes('buildPanel'),
  );
});

test('consolidated panel has no version-chain imports', () => {
  assert.doesNotMatch(
    panel,
    /reactionRolesPanelV[2-7]/,
  );
});

test('legacy versioned panel files were removed', () => {
  for (const file of removedPanels) {
    assert.equal(
      exists(file),
      false,
      `${file} should not exist`,
    );
  }
});

console.log('');
console.log('[PASS] Reaction Roles consolidated architecture verified.');
console.log(
  'A development-guild restart and live smart-builder acceptance test are still required.',
);
