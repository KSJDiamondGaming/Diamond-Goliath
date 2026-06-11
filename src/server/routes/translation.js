'use strict';

// src/server/routes/translation.js

const express = require('express');

const translationStore = require('../../modules/translation/translationStore');

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
  const guildId = String(req.params.guildId || '').trim();
  if (!/^\d{16,25}$/.test(guildId)) {
    throw new Error('Invalid guild ID.');
  }
  return guildId;
}

function cleanDiscordId(value, label = 'Discord ID') {
  const id = String(value || '').replace(/[<@#!&>]/g, '').trim();
  if (!/^\d{15,25}$/.test(id)) {
    throw new Error(`Invalid ${label}.`);
  }
  return id;
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
    return success(res, {
      guildId,
      config: translationStore.getTranslationSection(guildId),
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/enabled', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = translationStore.setTranslationEnabled(
      guildId,
      req.body?.enabled === true
    );

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
      settings: {
        ...(current.settings || {}),
        ...(req.body?.settings || req.body || {}),
      },
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

    return success(res, {
      guildId,
      channels: section.channels || {},
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/channels/:channelId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const channelId = cleanDiscordId(req.params.channelId, 'channel ID');
    const section = translationStore.getTranslationSection(guildId);

    return success(res, {
      guildId,
      channelId,
      channel: section.channels?.[channelId] || null,
    });
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

router.get('/:guildId/users', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const section = translationStore.getTranslationSection(guildId);

    return success(res, {
      guildId,
      userPreferences: section.userPreferences || {},
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/users/:userId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const userId = cleanDiscordId(req.params.userId, 'user ID');
    const section = translationStore.getTranslationSection(guildId);

    return success(res, {
      guildId,
      userId,
      preference: section.userPreferences?.[userId] || null,
    });
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

    return success(res, {
      guildId,
      analytics: section.analytics || {},
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

module.exports = router;
