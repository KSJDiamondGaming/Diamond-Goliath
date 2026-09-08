'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const {
  normalizeRecord,
  normaliseRequiredAction,
  createdObjectCount,
  hasManageChannels,
} = require('../../src/owner/dev/duplicator/hardening');

test('bulk-delete guidance never asks the operator to grant Administrator', () => {
  const text = normaliseRequiredAction('Grant Goliath Administrator temporarily, then retry.');
  assert.doesNotMatch(text, /Grant Goliath Administrator/i);
  assert.match(text, /No Administrator permission is required or requested/i);
  assert.match(text, /Manage Channels/i);
});

test('blocked bulk-delete with zero deletions is marked non-mutating and safe to clear', () => {
  const record = normalizeRecord({
    type: 'bulk-delete',
    status: 'blocked-preflight',
    outcome: 'failed',
    blockedPreflight: true,
    deletedCount: 0,
    requestedCount: 16,
    failed: [{ id: '1', error: 'missing access' }],
    requiredAction: 'Grant Goliath Administrator temporarily, then retry.',
  });
  assert.equal(record.mutationStarted, false);
  assert.equal(record.safeToClearHistory, true);
  assert.equal(record.noAdministratorRequired, true);
  assert.doesNotMatch(record.requiredAction, /Grant Goliath Administrator/i);
});

test('failed selective copy with no created objects is safe to clear', () => {
  const record = normalizeRecord({
    type: 'selective-copy',
    outcome: 'failed',
    status: 'blocked-preflight',
    transferObjects: {
      createdRoleIds: [],
      createdCategoryIds: [],
      createdChannelIds: [],
    },
  });
  assert.equal(createdObjectCount(record), 0);
  assert.equal(record.mutationStarted, false);
  assert.equal(record.safeToClearHistory, true);
});

test('undone selective copy is safe to clear from history', () => {
  const record = normalizeRecord({
    type: 'selective-copy',
    outcome: 'undone',
    status: 'undone',
    transferObjects: { createdChannelIds: ['1'] },
  });
  assert.equal(record.safeToClearHistory, true);
});

test('Manage Channels is sufficient for the hidden-channel delete fallback', () => {
  const me = { id: 'bot' };
  const channel = {
    guild: { members: { me } },
    permissionsFor(member) {
      assert.equal(member, me);
      return { has(bit) { return bit === PermissionFlagsBits.ManageChannels; } };
    },
  };
  assert.equal(hasManageChannels(channel), true);
});
