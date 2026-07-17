'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

function pass(label) {
  console.log(`✅ ${label}`);
}

function test(label, fn) {
  try {
    fn();
    pass(label);
  } catch (error) {
    console.error(`❌ ${label}`);
    throw error;
  }
}

console.log('\nInvite Studio Smoke Test');
console.log('========================');

const invites = require(path.join(root, 'src/modules/invites/invites'));
const defaults = invites.defaults();

test('Canonical defaults are valid', () => {
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.settings.trackingEnabled, true);
  assert.equal(defaults.settings.removeOnLeave, true);
  assert.equal(defaults.settings.ignoreBots, true);
  assert.deepEqual(defaults.settings.rewardRoles, []);
  assert.deepEqual(defaults.inviteLinks, {});
  assert.deepEqual(defaults.inviters, {});
  assert.deepEqual(defaults.members, {});
  assert.deepEqual(defaults.history, []);
});

test('Runtime exports the complete lifecycle contract', () => {
  for (const name of [
    'getSection', 'setEnabled', 'updateSettings', 'syncGuild', 'trackJoin', 'trackLeave',
    'leaderboard', 'setBonus', 'createInviteLink', 'deleteInviteLink', 'listInviteLinks',
    'createManagedInvite', 'validateManagedInvite', 'buildHealth', 'repair', 'startup',
    'applyInviteRoles', 'exportConfiguration', 'reset',
  ]) assert.equal(typeof invites[name], 'function', `Missing export: ${name}`);
});

test('Invite Studio remains self-contained', () => {
  assert.equal(exists('src/commands/admin/invites.js'), false);
  assert.equal(exists('src/modules/invites/invitesPanel.js'), false);
  assert.equal(exists('src/core/admin/functions/invitesAdminPanel.js'), false);
  assert.equal(exists('src/modules/invites/invitesAdminPanel.js'), true);
});

const route = read('src/modules/invites/invitesRoute.js');
test('API exposes the complete management surface', () => {
  for (const token of [
    "router.get('/:guildId'",
    "router.patch('/:guildId/enabled'",
    "router.patch('/:guildId/settings'",
    "router.post('/:guildId/sync'",
    "router.get('/:guildId/links'",
    "router.post('/:guildId/links'",
    "router.delete('/:guildId/links/:code'",
    "router.post('/:guildId/managed-invite'",
    "router.post('/:guildId/managed-invite/validate'",
    "router.get('/:guildId/leaderboard'",
    "router.patch('/:guildId/inviters/:userId/bonus'",
    "router.get('/:guildId/history'",
    "router.get('/:guildId/health'",
    "router.post('/:guildId/repair'",
    "router.get('/:guildId/export'",
    "router.post('/:guildId/reset'",
  ]) assert.ok(route.includes(token), `Missing route: ${token}`);
});

const panel = read('src/modules/invites/invitesAdminPanel.js');
test('Admin Hub panel exposes invite creation controls', () => {
  for (const token of [
    'invites:draft-channel', 'invites:draft-expiry', 'invites:draft-uses',
    'invites:draft-roles', 'invites:draft-temporary', 'invites:generate',
    'invites:links', 'invites:sync', 'invites:health', 'invites:repair',
  ]) assert.ok(panel.includes(token), `Missing panel control: ${token}`);
});

const dashboard = read('src/dashboard/js/pages/modules/Invites.jsx');
test('Dashboard exposes all testable Invite Studio workspaces', () => {
  for (const token of [
    'Invite Links', 'Analytics', 'Rewards', 'Join History', 'Health', 'Settings',
    'Create invite link', 'Roles (optional)', 'Grant temporary membership',
    'navigator.clipboard.writeText',
  ]) assert.ok(dashboard.includes(token), `Missing dashboard feature: ${token}`);
});

test('Runtime events cover the full invite lifecycle', () => {
  const events = read('src/events/invites/inviteLogs.js');
  for (const token of ['ClientReady', 'InviteCreate', 'InviteDelete', 'GuildMemberAdd', 'GuildMemberRemove']) {
    assert.ok(events.includes(token), `Missing lifecycle event: ${token}`);
  }
});

test('Invite Studio is visible and reachable through the live Admin Hub', () => {
  const modules = read('src/core/admin/functions/moduleAdminPanels.js');
  const interactions = read('src/events/interactions/interactionCreate.js');
  assert.ok(modules.includes("['admin:invites'"), 'Invite Studio button is absent from the paginated module list');
  assert.ok(modules.includes("'admin:invites'"), 'Invite Studio is not marked as an external module route');
  assert.ok(interactions.includes("../../modules/invites/invitesAdminPanel"), 'Live interaction router does not import Invite Studio');
  assert.ok(interactions.includes("interaction.customId === 'admin:invites'"), 'Invite Studio entry button is not handled');
  assert.ok(interactions.includes("startsWith(interaction, 'invites:')"), 'Invite Studio child controls are not handled');
});

console.log('\n✅ Invite Studio is structurally complete and ready for live Discord testing.');
console.log('ℹ️ Live testing still requires a development guild because Discord invite creation, joins and role assignment cannot be simulated offline.');
