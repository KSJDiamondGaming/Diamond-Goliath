const express = require('express');

const guildManager = require('../../../core/guild/guildManager');
const { emitGuildUpdate } = require('../../sockets/socketHub');

const router = express.Router();

function getBody(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(0, number);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function normalizeAutomodConfig(config = {}) {
  const safeConfig =
    config && typeof config === 'object' && !Array.isArray(config)
      ? config
      : {};

  return {
    enabled: normalizeBoolean(safeConfig.enabled, false),

    antiSpam: {
      enabled: normalizeBoolean(safeConfig.antiSpam?.enabled, false),
      maxMessages: normalizeNumber(safeConfig.antiSpam?.maxMessages, 5),
      intervalSeconds: normalizeNumber(safeConfig.antiSpam?.intervalSeconds, 10),
      action: normalizeText(safeConfig.antiSpam?.action) || 'delete',
    },

    antiLinks: {
      enabled: normalizeBoolean(safeConfig.antiLinks?.enabled, false),
      allowStaff: normalizeBoolean(safeConfig.antiLinks?.allowStaff, true),
      allowedDomains: normalizeStringArray(safeConfig.antiLinks?.allowedDomains),
      action: normalizeText(safeConfig.antiLinks?.action) || 'delete',
    },

    badWords: {
      enabled: normalizeBoolean(safeConfig.badWords?.enabled, false),
      words: normalizeStringArray(safeConfig.badWords?.words),
      action: normalizeText(safeConfig.badWords?.action) || 'delete',
    },

    caps: {
      enabled: normalizeBoolean(safeConfig.caps?.enabled, false),
      percent: normalizeNumber(safeConfig.caps?.percent, 70),
      minLength: normalizeNumber(safeConfig.caps?.minLength, 12),
      action: normalizeText(safeConfig.caps?.action) || 'warn',
    },

    mentions: {
      enabled: normalizeBoolean(safeConfig.mentions?.enabled, false),
      maxMentions: normalizeNumber(safeConfig.mentions?.maxMentions, 5),
      action: normalizeText(safeConfig.mentions?.action) || 'warn',
    },

    ignoredRoles: normalizeStringArray(safeConfig.ignoredRoles),
    ignoredChannels: normalizeStringArray(safeConfig.ignoredChannels),
    logChannelId: normalizeText(safeConfig.logChannelId) || null,
  };
}

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    if (!guildId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing guild ID.',
      });
    }

    const current = guildManager.getGuildSection(guildId, 'automod', {});
    const config = normalizeAutomodConfig(current);

    return res.json({
      ok: true,
      guildId,
      config,
    });
  } catch (error) {
    console.error('AutoMod load failed:', error);

    return res.status(500).json({
      ok: false,
      error: 'Failed to load automod config.',
      message: error.message,
    });
  }
});

router.post('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const body = getBody(req);

    if (!guildId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing guild ID.',
      });
    }

    const current = normalizeAutomodConfig(
      guildManager.getGuildSection(guildId, 'automod', {})
    );

    const payload = normalizeAutomodConfig({
      ...current,
      ...body,
    });

    const config = guildManager.saveGuildSection(
      guildId,
      'automod',
      payload
    );

    emitGuildUpdate(guildId, {
      section: 'automod',
      data: config,
    });

    return res.json({
      ok: true,
      guildId,
      config,
    });
  } catch (error) {
    console.error('AutoMod save failed:', error);

    return res.status(500).json({
      ok: false,
      error: 'Failed to save automod config.',
      message: error.message,
    });
  }
});

router.post('/:guildId/reset', (req, res) => {
  try {
    const { guildId } = req.params;

    if (!guildId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing guild ID.',
      });
    }

    const config = guildManager.saveGuildSection(
      guildId,
      'automod',
      normalizeAutomodConfig({})
    );

    emitGuildUpdate(guildId, {
      section: 'automod',
      data: config,
    });

    return res.json({
      ok: true,
      guildId,
      config,
    });
  } catch (error) {
    console.error('AutoMod reset failed:', error);

    return res.status(500).json({
      ok: false,
      error: 'Failed to reset automod config.',
      message: error.message,
    });
  }
});

module.exports = router;
