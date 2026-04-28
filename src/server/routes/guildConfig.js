const express = require('express');
const guildManager = require('../utils/guildManager');
const { emitGuildUpdate } = require('../utils/socketHub');

const router = express.Router();

/* ================= AUTOMOD ================= */

router.get('/automod/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    const config = guildManager.getGuildSection(guildId, 'automod', {});
    return res.json({ ok: true, guildId, config });
  } catch (err) {
    console.error('AutoMod load failed:', err);
    return res.status(500).json({ error: 'Failed to load automod config.' });
  }
});

router.post('/automod/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    const config = guildManager.saveGuildSection(
      guildId,
      'automod',
      req.body || {}
    );

    emitGuildUpdate(guildId, {
      section: 'automod',
      data: config,
    });

    return res.json({ ok: true, guildId, config });
  } catch (err) {
    console.error('AutoMod save failed:', err);
    return res.status(500).json({ error: 'Failed to save automod config.' });
  }
});

/* ================= LOGS ================= */

router.get('/logs/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    const config = guildManager.getGuildSection(
      guildId,
      'logs',
      guildManager.DEFAULT_LOGS
    );

    return res.json({ ok: true, guildId, config });
  } catch (err) {
    console.error('Logs load failed:', err);
    return res.status(500).json({ error: 'Failed to load logs config.' });
  }
});

router.post('/logs/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const body = req.body || {};
    const current = guildManager.getGuildSection(
      guildId,
      'logs',
      guildManager.DEFAULT_LOGS
    );

    const config = guildManager.saveGuildSection(guildId, 'logs', {
      ...current,
      enabled: body.enabled !== false,

      channels: {
        ...current.channels,
        general: body.channels?.general || null,
        moderation: body.channels?.moderation || null,
        admin: body.channels?.admin || null,
        automod: body.channels?.automod || null,
        member: body.channels?.member || null,
        messageDelete: body.channels?.messageDelete || null,
        messageEdit: body.channels?.messageEdit || null,
        voice: body.channels?.voice || null,
      },

      events: {
        ...current.events,
        moderationActions: body.events?.moderationActions !== false,
        adminActions: body.events?.adminActions !== false,
        automodActions: body.events?.automodActions !== false,

        memberJoin: body.events?.memberJoin !== false,
        memberLeave: body.events?.memberLeave !== false,
        memberUpdate: body.events?.memberUpdate !== false,

        messageDelete: body.events?.messageDelete !== false,
        messageEdit: body.events?.messageEdit !== false,

        roleCreate: body.events?.roleCreate !== false,
        roleDelete: body.events?.roleDelete !== false,
        roleUpdate: body.events?.roleUpdate !== false,

        channelCreate: body.events?.channelCreate !== false,
        channelDelete: body.events?.channelDelete !== false,
        channelUpdate: body.events?.channelUpdate !== false,

        voiceJoin: body.events?.voiceJoin !== false,
        voiceLeave: body.events?.voiceLeave !== false,
        voiceMove: body.events?.voiceMove !== false,
      },
    });

    emitGuildUpdate(guildId, {
      section: 'logs',
      data: config,
    });

    return res.json({ ok: true, guildId, config });
  } catch (err) {
    console.error('Logs save failed:', err);
    return res.status(500).json({ error: 'Failed to save logs config.' });
  }
});

/* ================= MESSAGES ================= */

router.get('/messages/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    const welcome = guildManager.getGuildSection(guildId, 'welcome', {});
    const leave = guildManager.getGuildSection(guildId, 'leave', {});

    return res.json({ ok: true, guildId, welcome, leave });
  } catch (err) {
    console.error('Messages load failed:', err);
    return res.status(500).json({ error: 'Failed to load message config.' });
  }
});

router.post('/messages/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    const welcome = guildManager.saveGuildSection(guildId, 'welcome', {
      title: req.body.welcomeTitle || '',
      message: req.body.welcomeMessage || '',
      channelId: req.body.welcomeChannelId || null,
    });

    const leave = guildManager.saveGuildSection(guildId, 'leave', {
      title: req.body.leaveTitle || '',
      message: req.body.leaveMessage || '',
      channelId: req.body.leaveChannelId || null,
    });

    emitGuildUpdate(guildId, { section: 'welcome', data: welcome });
    emitGuildUpdate(guildId, { section: 'leave', data: leave });

    return res.json({ ok: true, guildId, welcome, leave });
  } catch (err) {
    console.error('Messages save failed:', err);
    return res.status(500).json({ error: 'Failed to save message config.' });
  }
});

/* ================= EMBEDS ================= */

router.get('/embeds/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    const config = guildManager.getGuildSection(guildId, 'embeds', {});
    return res.json({ ok: true, guildId, config });
  } catch (err) {
    console.error('Embeds load failed:', err);
    return res.status(500).json({ error: 'Failed to load embed config.' });
  }
});

router.post('/embeds/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    const config = guildManager.saveGuildSection(guildId, 'embeds', {
      defaultTitle: req.body.defaultTitle || '',
      footerText: req.body.footerText || '',
      footerIcon: req.body.footerIcon || '',
      color: req.body.color || '',
    });

    emitGuildUpdate(guildId, {
      section: 'embeds',
      data: config,
    });

    return res.json({ ok: true, guildId, config });
  } catch (err) {
    console.error('Embeds save failed:', err);
    return res.status(500).json({ error: 'Failed to save embed config.' });
  }
});

/* ================= FULL CONFIG ================= */

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    const config = guildManager.getGuildData(guildId);
    return res.json({ ok: true, guildId, config });
  } catch (err) {
    console.error('Full config load failed:', err);
    return res.status(500).json({ error: 'Failed to load guild config.' });
  }
});

router.post('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    const config = guildManager.saveGuildData(guildId, req.body || {});

    emitGuildUpdate(guildId, {
      section: 'all',
      data: config,
    });

    return res.json({ ok: true, guildId, config });
  } catch (err) {
    console.error('Full config save failed:', err);
    return res.status(500).json({ error: 'Failed to save guild config.' });
  }
});

module.exports = router;