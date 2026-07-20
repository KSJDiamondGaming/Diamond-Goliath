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

console.log('\nReaction Roles Smoke Test');
console.log('=========================');

const panelPath = 'src/modules/roleStudio/reactionRoles/reactionRolesPanel.js';
const runtimePath = 'src/modules/roleStudio/reactionRoles/reactionRoles.js';
const removedPanels = [2, 3, 4, 5, 6, 7]
  .map((version) => `src/modules/roleStudio/reactionRoles/reactionRolesPanelV${version}.js`);

test('consolidated panel exists', () => {
  assert.equal(exists(panelPath), true);
});

test('reaction roles runtime exists', () => {
  assert.equal(exists(runtimePath), true);
});

const panelSource = read(panelPath);

test('consolidated panel exposes the production API', () => {
  assert.match(panelSource, /buildReactionRolesAdminPanel\s*:/);
  assert.match(panelSource, /handleReactionRolesAdminInteraction/);
  assert.match(panelSource, /module\.exports\s*=/);
});

test('production interaction namespace is wired', () => {
  assert.ok(panelSource.includes('admin:reactionRoles'));
});

test('consolidated panel has no external version-chain imports', () => {
  assert.doesNotMatch(panelSource, /require\(['"]\.\/reactionRolesPanelV[2-7]['"]\)/);
});

test('legacy versioned panel files were removed', () => {
  for (const file of removedPanels) {
    assert.equal(exists(file), false, `${file} should not exist`);
  }
});

console.log('\n[PASS] Reaction Roles production entry verified.');
console.log('A development-guild restart and live builder acceptance test are still required.');
