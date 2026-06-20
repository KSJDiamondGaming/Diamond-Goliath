'use strict';

// src/server/routes/social.js

const express = require('express');
const socialManager = require('../../modules/social/socialManager');

const router = express.Router();

function getDiscordClient(req) {
  return req.app?.locals?.client || req.app?.locals?.discordClient || global.client || global.discordClient || null;
}

router.get('/:guildId/overview', (req, res) => {
  try {
    const { guildId } = req.params;
    return res.json({ success: true, guildId, overview: socialManager.getOverview(guildId) });
  } catch (error) {
    console.error('[SocialRoute] OVERVIEW:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch social overview.' });
  }
});

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    return res.json({ success: true, guildId, config: socialManager.getConfig(guildId) });
  } catch (error) {
    console.error('[SocialRoute] GET:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch social config.' });
  }
});

router.patch('/:guildId/enabled', (req, res) => {
  try {
    const { guildId } = req.params;
    const section = socialManager.setEnabled(guildId, req.body?.enabled === true, { action: 'social_enabled_update' });
    return res.json({ success: true, section });
  } catch (error) {
    console.error('[SocialRoute] ENABLED:', error);
    return res.status(500).json({ success: false, error: 'Failed to update social module state.' });
  }
});

router.post('/:guildId/accounts', (req, res) => {
  try {
    const { guildId } = req.params;
    const account = socialManager.addAccount(guildId, req.body || {}, { action: 'social_account_save' });
    return res.status(201).json({ success: true, account });
  } catch (error) {
    console.error('[SocialRoute] ADD ACCOUNT:', error);
    return res.status(500).json({ success: false, error: 'Failed to save social account.' });
  }
});

router.patch('/:guildId/accounts/:accountId', (req, res) => {
  try {
    const { guildId, accountId } = req.params;
    const account = socialManager.updateAccount(guildId, accountId, req.body || {}, { action: 'social_account_update' });
    if (!account) return res.status(404).json({ success: false, error: 'Social account not found.' });
    return res.json({ success: true, account });
  } catch (error) {
    console.error('[SocialRoute] UPDATE ACCOUNT:', error);
    return res.status(500).json({ success: false, error: 'Failed to update social account.' });
  }
});

router.delete('/:guildId/accounts/:accountId', (req, res) => {
  try {
    const { guildId, accountId } = req.params;
    const section = socialManager.removeAccount(guildId, accountId, { action: 'social_account_remove' });
    return res.json({ success: true, section });
  } catch (error) {
    console.error('[SocialRoute] REMOVE ACCOUNT:', error);
    return res.status(500).json({ success: false, error: 'Failed to remove social account.' });
  }
});

router.post('/:guildId/accounts/:accountId/test', async (req, res) => {
  try {
    const { guildId, accountId } = req.params;
    const result = await socialManager.sendTestAlert(guildId, accountId, getDiscordClient(req), {
      actorId: req.session?.user?.id,
    });

    if (!result.success) {
      return res.status(result.status || 400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('[SocialRoute] TEST:', error);
    return res.status(500).json({ success: false, error: 'Failed to send test alert.' });
  }
});

module.exports = router;
