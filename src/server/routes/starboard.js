'use strict';

const express = require('express');

const starboardStore = require('../../modules/messageStudio/starboard/starboardStore');
const starboardManager = require('../../modules/messageStudio/starboard/starboardManager');
const { setModuleEnabled } = require('../../core/guild/guildManager');

const router = express.Router();

function success(res, payload = {}) {
  return res.json({ success: true, ...payload });
}

function failure(res, error, status = 500) {
  console.error('[Starboard API]', error);
  return res.status(status).json({ success: false, error: error.message || 'Starboard API request failed.' });
}

function getGuildId(req) {
  const guildId = String(req.params.guildId || '').trim();
  if (!/^\d{15,25}$/.test(guildId)) throw new Error('Invalid guild ID.');
  return guildId;
}

function cleanChannelId(value) {
  const channelId = String(value || '').replace(/[<#>]/g, '').trim();
  return /^\d{15,25}$/.test(channelId) ? channelId : null;
}

function summarize(config) {
  const posts = Object.values(config.posts || {});
  const totalStars = posts.reduce((sum, post) => sum + (Array.isArray(post.starUserIds) ? post.starUserIds.length : 0), 0);

  return {
    enabled: config.enabled !== false,
    channelId: config.channelId || null,
    threshold: config.threshold || 3,
    emoji: config.emoji || '⭐',
    postCount: posts.length,
    totalStars,
    allowBotMessages: config.allowBotMessages === true,
    allowSelfStar: config.allowSelfStar === true,
    updatedAt: config.updatedAt || null,
  };
}

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input || {}, key);
}

function prepareSettings(input = {}) {
  const settings = {};

  if (hasOwn(input, 'enabled')) {
    settings.enabled = input.enabled === true;
  }

  if (hasOwn(input, 'channelId')) {
    settings.channelId = input.channelId === '' || input.channelId === null
      ? null
      : cleanChannelId(input.channelId);
  }

  if (hasOwn(input, 'threshold')) {
    settings.threshold = Math.max(1, Math.floor(Number(input.threshold) || 3));
  }

  if (hasOwn(input, 'emoji')) {
    settings.emoji = String(input.emoji || '⭐').trim().slice(0, 40) || '⭐';
  }

  if (hasOwn(input, 'allowBotMessages')) {
    settings.allowBotMessages = input.allowBotMessages === true;
  }

  if (hasOwn(input, 'allowSelfStar')) {
    settings.allowSelfStar = input.allowSelfStar === true;
  }

  return settings;
}

router.get('/:guildId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = starboardStore.getStarboardSection(guildId);
    return success(res, { guildId, config, overview: summarize(config) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/enabled', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const enabled = req.body?.enabled === true;
    setModuleEnabled(guildId, 'starboard', enabled);
    const config = starboardStore.updateStarboardSection(guildId, (section) => ({ ...section, enabled }), { actorId: req.body?.actorId });
    return success(res, { guildId, config, overview: summarize(config) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/settings', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const current = starboardStore.getStarboardSection(guildId);
    const settings = prepareSettings(req.body?.settings || req.body || {});
    const config = starboardStore.updateStarboardSection(guildId, (section) => ({
      ...section,
      ...settings,
      updatedAt: starboardStore.now(),
    }), { actorId: req.body?.actorId });

    if (config.enabled !== current.enabled) {
      setModuleEnabled(guildId, 'starboard', config.enabled !== false);
    }

    return success(res, { guildId, config, overview: summarize(config) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.put('/:guildId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = starboardManager.configureStarboard(guildId, prepareSettings(req.body || {}));
    return success(res, { guildId, config, overview: summarize(config) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.delete('/:guildId/posts/:messageId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = starboardStore.deletePost(guildId, req.params.messageId, { actorId: req.body?.actorId });
    return success(res, { guildId, config, overview: summarize(config) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

module.exports = router;
