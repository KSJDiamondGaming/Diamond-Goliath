const express = require('express');
const guildManager = require('../utils/guildManager');

const router = express.Router();

const DEFAULT_LOGS = {
  logsChannelId: null,
  modLogChannelId: null,
  adminLogChannelId: null,
  automodLogChannelId: null,
  adminActionLoggerEnabled: false,
};

router.get('/logs/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const config = guildManager.getGuildSection(guildId, 'logs', DEFAULT_LOGS);

    return res.json({ ok: true, guildId, config });
  } catch (error) {
    console.error('Failed to get logs config:', error);
    return res.status(500).json({ error: 'Failed to load logs config.' });
  }
});

router.post('/logs/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    const config = guildManager.saveGuildSection(guildId, 'logs', {
      logsChannelId: req.body.logsChannelId || null,
      modLogChannelId: req.body.modLogChannelId || null,
      adminLogChannelId: req.body.adminLogChannelId || null,
      automodLogChannelId: req.body.automodLogChannelId || null,
      adminActionLoggerEnabled: req.body.adminActionLoggerEnabled === true,
    });

    return res.json({ ok: true, guildId, config });
  } catch (error) {
    console.error('Failed to save logs config:', error);
    return res.status(500).json({ error: 'Failed to save logs config.' });
  }
});

router.get('/messages/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const welcome = guildManager.getGuildSection(guildId, 'welcome', {});
    const leave = guildManager.getGuildSection(guildId, 'leave', {});

    return res.json({ ok: true, guildId, welcome, leave });
  } catch (error) {
    console.error('Failed to get message config:', error);
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

    return res.json({ ok: true, guildId, welcome, leave });
  } catch (error) {
    console.error('Failed to save message config:', error);
    return res.status(500).json({ error: 'Failed to save message config.' });
  }
});

router.get('/embeds/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const embeds = guildManager.getGuildSection(guildId, 'embeds', {});

    return res.json({ ok: true, guildId, config: embeds });
  } catch (error) {
    console.error('Failed to get embed config:', error);
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

    return res.json({ ok: true, guildId, config });
  } catch (error) {
    console.error('Failed to save embed config:', error);
    return res.status(500).json({ error: 'Failed to save embed config.' });
  }
});

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const config = guildManager.getGuildData(guildId);

    return res.json({ ok: true, guildId, config });
  } catch (error) {
    console.error('Failed to get guild config:', error);
    return res.status(500).json({ error: 'Failed to load guild config.' });
  }
});

router.post('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const config = guildManager.saveGuildData(guildId, req.body || {});

    return res.json({ ok: true, guildId, config });
  } catch (error) {
    console.error('Failed to save guild config:', error);
    return res.status(500).json({ error: 'Failed to save guild config.' });
  }
});

module.exports = router;