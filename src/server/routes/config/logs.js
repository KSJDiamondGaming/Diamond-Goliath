const express = require('express');
const guildManager = require('../../services/guild/guildManager');
const { emitGuildUpdate } = require('../../sockets/socketHub');

const router = express.Router();

function getBody(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

function normalizeLogChannels(bodyChannels = {}, currentChannels = {}) {
  return {
    ...currentChannels,
    general: bodyChannels.general || null,
    moderation: bodyChannels.moderation || null,
    admin: bodyChannels.admin || null,
    automod: bodyChannels.automod || null,
    member: bodyChannels.member || null,
    messageDelete: bodyChannels.messageDelete || null,
    messageEdit: bodyChannels.messageEdit || null,
    voice: bodyChannels.voice || null,
  };
}

function normalizeLogEvents(bodyEvents = {}, currentEvents = {}) {
  return {
    ...currentEvents,

    moderationActions: bodyEvents.moderationActions !== false,
    adminActions: bodyEvents.adminActions !== false,
    automodActions: bodyEvents.automodActions !== false,

    memberJoin: bodyEvents.memberJoin !== false,
    memberLeave: bodyEvents.memberLeave !== false,
    memberUpdate: bodyEvents.memberUpdate !== false,

    messageDelete: bodyEvents.messageDelete !== false,
    messageEdit: bodyEvents.messageEdit !== false,

    roleCreate: bodyEvents.roleCreate !== false,
    roleDelete: bodyEvents.roleDelete !== false,
    roleUpdate: bodyEvents.roleUpdate !== false,

    channelCreate: bodyEvents.channelCreate !== false,
    channelDelete: bodyEvents.channelDelete !== false,
    channelUpdate: bodyEvents.channelUpdate !== false,

    voiceJoin: bodyEvents.voiceJoin !== false,
    voiceLeave: bodyEvents.voiceLeave !== false,
    voiceMove: bodyEvents.voiceMove !== false,
  };
}

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    const config = guildManager.getGuildSection(
      guildId,
      'logs',
      guildManager.DEFAULT_LOGS
    );

    return res.json({ ok: true, guildId, config });
  } catch (error) {
    console.error('Logs load failed:', error);
    return res.status(500).json({ error: 'Failed to load logs config.' });
  }
});

router.post('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const body = getBody(req);

    const current = guildManager.getGuildSection(
      guildId,
      'logs',
      guildManager.DEFAULT_LOGS
    );

    const config = guildManager.saveGuildSection(guildId, 'logs', {
      ...current,
      enabled: body.enabled !== false,
      channels: normalizeLogChannels(body.channels, current.channels),
      events: normalizeLogEvents(body.events, current.events),
    });

    emitGuildUpdate(guildId, {
      section: 'logs',
      data: config,
    });

    return res.json({ ok: true, guildId, config });
  } catch (error) {
    console.error('Logs save failed:', error);
    return res.status(500).json({ error: 'Failed to save logs config.' });
  }
});

module.exports = router;