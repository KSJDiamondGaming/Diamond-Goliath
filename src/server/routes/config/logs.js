const express = require('express');

const guildManager = require('../../../guild/guildManager');
const { emitGuildUpdate } = require('../../sockets/socketHub');

const router = express.Router();

function getBody(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

function normalizeChannelId(value) {
  const channelId = typeof value === 'string' ? value.trim() : '';

  return channelId || null;
}

function normalizeLogChannels(bodyChannels = {}, currentChannels = {}) {
  const safeBody =
    bodyChannels && typeof bodyChannels === 'object' && !Array.isArray(bodyChannels)
      ? bodyChannels
      : {};

  const safeCurrent =
    currentChannels && typeof currentChannels === 'object' && !Array.isArray(currentChannels)
      ? currentChannels
      : {};

  return {
    ...safeCurrent,

    general: normalizeChannelId(safeBody.general),
    moderation: normalizeChannelId(safeBody.moderation),
    admin: normalizeChannelId(safeBody.admin),
    automod: normalizeChannelId(safeBody.automod),
    member: normalizeChannelId(safeBody.member),
    messageDelete: normalizeChannelId(safeBody.messageDelete),
    messageEdit: normalizeChannelId(safeBody.messageEdit),
    voice: normalizeChannelId(safeBody.voice),
  };
}

function normalizeBoolean(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function normalizeLogEvents(bodyEvents = {}, currentEvents = {}) {
  const safeBody =
    bodyEvents && typeof bodyEvents === 'object' && !Array.isArray(bodyEvents)
      ? bodyEvents
      : {};

  const safeCurrent =
    currentEvents && typeof currentEvents === 'object' && !Array.isArray(currentEvents)
      ? currentEvents
      : {};

  return {
    ...safeCurrent,

    moderationActions: normalizeBoolean(
      safeBody.moderationActions,
      safeCurrent.moderationActions !== false
    ),
    adminActions: normalizeBoolean(
      safeBody.adminActions,
      safeCurrent.adminActions !== false
    ),
    automodActions: normalizeBoolean(
      safeBody.automodActions,
      safeCurrent.automodActions !== false
    ),

    memberJoin: normalizeBoolean(
      safeBody.memberJoin,
      safeCurrent.memberJoin !== false
    ),
    memberLeave: normalizeBoolean(
      safeBody.memberLeave,
      safeCurrent.memberLeave !== false
    ),
    memberUpdate: normalizeBoolean(
      safeBody.memberUpdate,
      safeCurrent.memberUpdate !== false
    ),

    messageDelete: normalizeBoolean(
      safeBody.messageDelete,
      safeCurrent.messageDelete !== false
    ),
    messageEdit: normalizeBoolean(
      safeBody.messageEdit,
      safeCurrent.messageEdit !== false
    ),

    roleCreate: normalizeBoolean(
      safeBody.roleCreate,
      safeCurrent.roleCreate !== false
    ),
    roleDelete: normalizeBoolean(
      safeBody.roleDelete,
      safeCurrent.roleDelete !== false
    ),
    roleUpdate: normalizeBoolean(
      safeBody.roleUpdate,
      safeCurrent.roleUpdate !== false
    ),

    channelCreate: normalizeBoolean(
      safeBody.channelCreate,
      safeCurrent.channelCreate !== false
    ),
    channelDelete: normalizeBoolean(
      safeBody.channelDelete,
      safeCurrent.channelDelete !== false
    ),
    channelUpdate: normalizeBoolean(
      safeBody.channelUpdate,
      safeCurrent.channelUpdate !== false
    ),

    voiceJoin: normalizeBoolean(
      safeBody.voiceJoin,
      safeCurrent.voiceJoin !== false
    ),
    voiceLeave: normalizeBoolean(
      safeBody.voiceLeave,
      safeCurrent.voiceLeave !== false
    ),
    voiceMove: normalizeBoolean(
      safeBody.voiceMove,
      safeCurrent.voiceMove !== false
    ),
  };
}

function getDefaultLogsConfig() {
  return guildManager.DEFAULT_LOGS || {
    enabled: false,
    channels: {
      general: null,
      moderation: null,
      admin: null,
      automod: null,
      member: null,
      messageDelete: null,
      messageEdit: null,
      voice: null,
    },
    events: {
      moderationActions: true,
      adminActions: true,
      automodActions: true,

      memberJoin: true,
      memberLeave: true,
      memberUpdate: true,

      messageDelete: true,
      messageEdit: true,

      roleCreate: true,
      roleDelete: true,
      roleUpdate: true,

      channelCreate: true,
      channelDelete: true,
      channelUpdate: true,

      voiceJoin: true,
      voiceLeave: true,
      voiceMove: true,
    },
  };
}

function normalizeLogsConfig(config = {}) {
  const defaults = getDefaultLogsConfig();

  const safeConfig =
    config && typeof config === 'object' && !Array.isArray(config)
      ? config
      : {};

  return {
    ...defaults,
    ...safeConfig,
    enabled: safeConfig.enabled === true,
    channels: normalizeLogChannels(
      safeConfig.channels || {},
      defaults.channels || {}
    ),
    events: normalizeLogEvents(
      safeConfig.events || {},
      defaults.events || {}
    ),
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

    const current = guildManager.getGuildSection(
      guildId,
      'logs',
      getDefaultLogsConfig()
    );

    const config = normalizeLogsConfig(current);

    return res.json({
      ok: true,
      guildId,
      config,
    });
  } catch (error) {
    console.error('Logs load failed:', error);

    return res.status(500).json({
      ok: false,
      error: 'Failed to load logs config.',
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

    const current = normalizeLogsConfig(
      guildManager.getGuildSection(
        guildId,
        'logs',
        getDefaultLogsConfig()
      )
    );

    const payload = {
      ...current,
      enabled: body.enabled === true,
      channels: normalizeLogChannels(body.channels, current.channels),
      events: normalizeLogEvents(body.events, current.events),
    };

    const config = guildManager.saveGuildSection(
      guildId,
      'logs',
      payload
    );

    emitGuildUpdate(guildId, {
      section: 'logs',
      data: config,
    });

    return res.json({
      ok: true,
      guildId,
      config,
    });
  } catch (error) {
    console.error('Logs save failed:', error);

    return res.status(500).json({
      ok: false,
      error: 'Failed to save logs config.',
      message: error.message,
    });
  }
});

module.exports = router;