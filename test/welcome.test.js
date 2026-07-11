'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const welcomeStore = require('../src/modules/welcome/welcomeStore');
const welcomeManager = require('../src/modules/welcome/welcomeManager');
const embedTemplateManager = require('../src/modules/embed/embedTemplateManager');

const CHANNEL_ID = '123456789012345678';
const GUILD_ID = '323456789012345678';

test('welcome defaults are safe', () => {
  const section = welcomeStore.defaultWelcomeSection();
  assert.equal(section.enabled, false);
  assert.equal(section.channelId, null);
  assert.equal(section.dmEnabled, false);
  assert.equal(section.allowUserPing, true);
  assert.equal(section.ignoreBots, true);
  assert.equal(section.analytics.publicSent, 0);
});

test('welcome normalization preserves legacy channel configuration', () => {
  const section = welcomeStore.normalizeWelcomeSection({
    channelId: CHANNEL_ID,
    templateId: 'custom_welcome',
  });
  assert.equal(section.enabled, true);
  assert.equal(section.channelId, CHANNEL_ID);
  assert.equal(section.templateId, 'custom_welcome');
});

test('welcome normalization removes invalid IDs and analytics values', () => {
  const section = welcomeStore.normalizeWelcomeSection({
    enabled: true,
    channelId: 'not-an-id',
    analytics: { publicSent: 'bad', dmFailed: -3 },
  });
  assert.equal(section.channelId, null);
  assert.equal(section.analytics.publicSent, 0);
  assert.equal(section.analytics.dmFailed, 0);
});

test('welcome template variables contain member and guild aliases', () => {
  const member = {
    joinedTimestamp: 1710000000000,
    displayAvatarURL: () => 'https://example.com/avatar.png',
    user: {
      id: '223456789012345678',
      username: 'ExampleUser',
      createdTimestamp: 1700000000000,
      toString: () => '<@223456789012345678>',
    },
    guild: {
      id: GUILD_ID,
      name: 'Example Guild',
      memberCount: 42,
      iconURL: () => 'https://example.com/icon.png',
      bannerURL: () => null,
    },
  };

  const variables = welcomeManager.buildTemplateVariables(member);
  assert.equal(variables.guild, 'Example Guild');
  assert.equal(variables.guildName, 'Example Guild');
  assert.equal(variables.server, 'Example Guild');
  assert.equal(variables.serverName, 'Example Guild');
  assert.equal(variables.memberCount, 42);
  assert.equal(variables.userMention, '<@223456789012345678>');
  assert.equal(variables.username, 'ExampleUser');
});

test('binding an Embed Studio template synchronizes Welcome config', () => {
  const originalBind = embedTemplateManager.bindTemplate;
  const originalUpdate = welcomeStore.updateConfig;
  const calls = [];

  embedTemplateManager.bindTemplate = (guildId, moduleKey, slot, templateId) => {
    calls.push({ source: 'binding', guildId, moduleKey, slot, templateId });
    return { templateId, name: 'Slippery Welcome' };
  };
  welcomeStore.updateConfig = (guildId, patch) => {
    calls.push({ source: 'config', guildId, patch });
    return { ...patch };
  };

  try {
    const result = welcomeManager.bindWelcomeTemplate(GUILD_ID, 'slippery_welcome', 'welcome');
    assert.equal(result.binding.templateId, 'slippery_welcome');
    assert.equal(result.config.templateId, 'slippery_welcome');
    assert.deepEqual(calls, [
      { source: 'binding', guildId: GUILD_ID, moduleKey: 'welcome', slot: 'welcome', templateId: 'slippery_welcome' },
      { source: 'config', guildId: GUILD_ID, patch: { templateId: 'slippery_welcome' } },
    ]);
  } finally {
    embedTemplateManager.bindTemplate = originalBind;
    welcomeStore.updateConfig = originalUpdate;
  }
});

test('welcome export is portable and includes the active binding', () => {
  const originalGetSection = welcomeStore.getWelcomeSection;
  const originalGetBinding = embedTemplateManager.getBinding;
  welcomeStore.getWelcomeSection = () => ({ enabled: true, channelId: CHANNEL_ID });
  embedTemplateManager.getBinding = () => ({ templateId: 'slippery_welcome', name: 'Slippery Welcome' });
  try {
    const result = welcomeManager.exportConfiguration(GUILD_ID);
    assert.equal(result.module, 'welcome');
    assert.equal(result.config.channelId, CHANNEL_ID);
    assert.equal(result.binding.templateId, 'slippery_welcome');
    assert.ok(result.exportedAt);
  } finally {
    welcomeStore.getWelcomeSection = originalGetSection;
    embedTemplateManager.getBinding = originalGetBinding;
  }
});
