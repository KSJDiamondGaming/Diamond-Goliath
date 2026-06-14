'use strict';

// src/server/routes/translation.js

const express = require('express');

require('../../modules/translation/translationStoreExtensions');
const translationStore = require('../../modules/translation/translationStore');
const translationThreadManager = require('../../modules/translation/translationThreadManager');

const router = express.Router();

function success(res, payload = {}) {
  return res.json({ success: true, ...payload });
}

function failure(res, error, status = 500) {
  console.error('[Translation API]', error);
  return res.status(status).json({
    success: false,
    error: error.message || 'Translation API request failed.',
  });
}

function getGuildId(req) {
  const guildId = String(req.params.guildId || '').replace(/\D/g, '');
  if (!guildId || guildId.length < 16) throw new Error('Invalid guild ID.');
  return guildId;
}

function cleanDiscordId(value, label = 'Discord ID') {
  const id = String(value || '').replace(/\D/g, '');
  if (!id || id.length < 15) throw new Error(`Invalid ${label}.`);
  return id;
}

async function getGuild(req, guildId) {
  const client = req.app.locals.discordClient || req.app.locals.client;
  const cachedGuild = client?.guilds?.cache?.get?.(guildId);
  if (cachedGuild) return cachedGuild;

  const fetchedGuild = typeof client?.guilds?.fetch === 'function'
    ? await client.guilds.fetch(guildId).catch(() => null)
    : null;

  if (!fetchedGuild) throw new Error('Guild is not available to the Discord client.');
  return fetchedGuild;
}

router.get('/:guildId/overview', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const section = translationStore.getTranslationSection(guildId);
    const channelConfigs = Object.values(section.channels || {});
    const userPreferences = Object.values(section.userPreferences || {});

    return success(res, {
      guildId,
      overview: {
        enabled: section.enabled === true,
        provider: section.settings?.provider || 'manual',
        autoDetect: section.settings?.autoDetect !== false,
        threadMode: section.settings?.threadMode !== false,
        defaultTargetLanguage: section.settings?.defaultTargetLanguage || 'en',
        targetLanguages: section.settings?.targetLanguages || ['en'],
        configuredChannelCount: channelConfigs.length,
        enabledChannelCount: channelConfigs.filter((channel) => channel.enabled !== false).length,
        userPreferenceCount: userPreferences.length,
        analytics: section.analytics || {},
      },
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    return success(res, { guildId, config: translationStore.getTranslationSection(guildId) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/enabled', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = translationStore.setTranslationEnabled(guildId, req.body?.enabled === true);
    return success(res, { guildId, config });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/settings', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = translationStore.updateTranslationSection(guildId, (current) => ({
      ...current,
      settings: { ...(current.settings || {}), ...(req.body?.settings || req.body || {}) },
    }));
    return success(res, { guildId, config });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/channels', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const section = translationStore.getTranslationSection(guildId);
    return success(res, { guildId, channels: section.channels || {} });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/channels/:channelId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const channelId = cleanDiscordId(req.params.channelId, 'channel ID');
    const section = translationStore.getTranslationSection(guildId);
    return success(res, { guildId, channelId, channel: section.channels?.[channelId] || null });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.put('/:guildId/channels/:channelId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const channelId = cleanDiscordId(req.params.channelId, 'channel ID');
    const channel = translationStore.saveChannelConfig(guildId, channelId, req.body || {});
    return success(res, { guildId, channelId, channel });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/threads', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const section = translationStore.getTranslationSection(guildId);
    return success(res, {
      guildId,
      threadChannels: section.threadChannels || section.channels || {},
      threadMappings: section.threadMappings || {},
      languages: section.languages || section.settings?.targetLanguages || ['en'],
      analytics: section.analytics || {},
      logs: section.logs || [],
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/threads/channels/:channelId/enable', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const channelId = cleanDiscordId(req.params.channelId, 'channel ID');
    const guild = await getGuild(req, guildId);
    const channel = translationStore.saveChannelConfig(guildId, channelId, {
      ...(req.body || {}),
      enabled: true,
      mode: req.body?.mode || 'auto',
      threadMode: true,
      autoCreateThreads: true,
    }, guild);
    const recovery = await translationThreadManager.ensureThreadsForChannel(guild, channelId);
    return success(res, { guildId, channelId, channel, recovery });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/threads/channels/:channelId/disable', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const channelId = cleanDiscordId(req.params.channelId, 'channel ID');
    const channel = translationStore.saveChannelConfig(guildId, channelId, { enabled: false, mode: 'disabled' });
    return success(res, { guildId, channelId, channel });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/threads/channels/:channelId/recover', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const channelId = cleanDiscordId(req.params.channelId, 'channel ID');
    const guild = await getGuild(req, guildId);
    const recovery = await translationThreadManager.ensureThreadsForChannel(guild, channelId, { recovery: true });
    return success(res, { guildId, channelId, recovery });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/threads/channels/:channelId/mappings', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const channelId = cleanDiscordId(req.params.channelId, 'channel ID');
    const section = translationStore.getTranslationSection(guildId);
    return success(res, { guildId, channelId, mappings: section.threadMappings?.[channelId] || {} });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/users', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const section = translationStore.getTranslationSection(guildId);
    return success(res, { guildId, userPreferences: section.userPreferences || {} });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/users/:userId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const userId = cleanDiscordId(req.params.userId, 'user ID');
    const section = translationStore.getTranslationSection(guildId);
    return success(res, { guildId, userId, preference: section.userPreferences?.[userId] || null });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.put('/:guildId/users/:userId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const userId = cleanDiscordId(req.params.userId, 'user ID');
    const preference = translationStore.saveUserPreference(guildId, userId, req.body || {});
    return success(res, { guildId, userId, preference });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/analytics', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const section = translationStore.getTranslationSection(guildId);
    return success(res, { guildId, analytics: section.analytics || {} });
  } catch (error) {
    return failure(res, error, 400);
  }
});

module.exports = router;
