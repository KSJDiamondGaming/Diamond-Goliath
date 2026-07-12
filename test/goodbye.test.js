'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const goodbyeStore = require('../src/modules/goodbye/goodbyeStore');
const goodbyeManager = require('../src/modules/goodbye/goodbyeManager');

const CHANNEL_ID = '123456789012345678';

test('goodbye defaults are safe', () => {
  const section = goodbyeStore.defaultGoodbyeSection();
  assert.equal(section.enabled, false);
  assert.equal(section.channelId, null);
  assert.equal(section.ignoreBots, true);
  assert.equal(section.analytics.sent, 0);
});

test('goodbye normalization preserves legacy channel configuration', () => {
  const section = goodbyeStore.normalizeGoodbyeSection({ channelId: CHANNEL_ID, templateId: 'custom_goodbye' });
  assert.equal(section.enabled, true);
  assert.equal(section.channelId, CHANNEL_ID);
  assert.equal(section.templateId, 'custom_goodbye');
});

test('goodbye normalization removes invalid IDs and analytics values', () => {
  const section = goodbyeStore.normalizeGoodbyeSection({ enabled: true, channelId: 'bad', analytics: { sent: 'bad', failed: -3 } });
  assert.equal(section.channelId, null);
  assert.equal(section.analytics.sent, 0);
  assert.equal(section.analytics.failed, 0);
});

test('goodbye template variables contain member and guild aliases', () => {
  const member = {
    joinedTimestamp: 1710000000000,
    displayAvatarURL: () => 'https://example.com/avatar.png',
    user: { id: '223456789012345678', username: 'ExampleUser', createdTimestamp: 1700000000000, toString: () => '<@223456789012345678>' },
    guild: { id: '323456789012345678', name: 'Example Guild', memberCount: 41, iconURL: () => 'https://example.com/icon.png', bannerURL: () => null },
  };
  const variables = goodbyeManager.buildTemplateVariables(member);
  assert.equal(variables.guild, 'Example Guild');
  assert.equal(variables.guildName, 'Example Guild');
  assert.equal(variables.serverName, 'Example Guild');
  assert.equal(variables.memberCount, 41);
  assert.equal(variables.username, 'ExampleUser');
  assert.ok(variables.leftAt);
});

test('goodbye export is portable', () => {
  const original = goodbyeStore.getGoodbyeSection;
  goodbyeStore.getGoodbyeSection = () => ({ enabled: true, channelId: CHANNEL_ID });
  try {
    const result = goodbyeManager.exportConfiguration('323456789012345678');
    assert.equal(result.module, 'goodbye');
    assert.equal(result.config.channelId, CHANNEL_ID);
    assert.ok(result.exportedAt);
  } finally {
    goodbyeStore.getGoodbyeSection = original;
  }
});
