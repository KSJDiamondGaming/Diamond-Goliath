'use strict';

const express = require('express');
const social = require('./social');

const router = express.Router();

function getDiscordClient(req) {
  return req.client || req.app?.get?.('goliath.client') || req.app?.locals?.client || global.client || global.discordClient || null;
}

function actor(req, action) {
  return { action, actorId: req.session?.user?.id || req.body?.actorId || null };
}

function buildProviderMetadata(result = {}) {
  return {
    providerStatus: result.providerStatus || result.status || 'unknown',
    lastCheckedAt: result.checkedAt || new Date().toISOString(),
    lastError: result.success ? '' : result.error || '',
    isLive: result.isLive === true,
    lastTitle: result.title || '',
    lastGameName: result.gameName || '',
    lastViewerCount: Number(result.viewerCount || 0),
  };
}

router.get('/:guildId/providers', (req, res) => {
  try {
    return res.json({
      success: true,
      guildId: req.params.guildId,
      ownerManaged: true,
      credentialOwner: 'Goliath',
      credentialEmail: 'goliath@ksjdigital.co.uk',
      providers: social.providers.listProviders(),
    });
  } catch (error) {
    console.error('[SocialRoute] PROVIDERS:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch social providers.' });
  }
});

router.get('/:guildId/overview', (req, res) => {
  try {
    return res.json({ success: true, guildId: req.params.guildId, overview: social.getOverview(req.params.guildId) });
  } catch (error) {
    console.error('[SocialRoute] OVERVIEW:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch social overview.' });
  }
});

router.get('/:guildId', (req, res) => {
  try {
    return res.json({ success: true, guildId: req.params.guildId, config: social.getConfig(req.params.guildId) });
  } catch (error) {
    console.error('[SocialRoute] GET:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch social config.' });
  }
});

router.patch('/:guildId/enabled', (req, res) => {
  try {
    const section = social.setEnabled(req.params.guildId, req.body?.enabled === true, actor(req, 'social_enabled_update'));
    return res.json({ success: true, section });
  } catch (error) {
    console.error('[SocialRoute] ENABLED:', error);
    return res.status(500).json({ success: false, error: 'Failed to update social module state.' });
  }
});

router.post('/:guildId/accounts', (req, res) => {
  try {
    const account = social.addAccount(req.params.guildId, req.body || {}, actor(req, 'social_account_save'));
    return res.status(201).json({ success: true, account });
  } catch (error) {
    console.error('[SocialRoute] ADD ACCOUNT:', error);
    return res.status(500).json({ success: false, error: 'Failed to save social account.' });
  }
});

router.patch('/:guildId/accounts/:accountId', (req, res) => {
  try {
    const account = social.updateAccount(req.params.guildId, req.params.accountId, req.body || {}, actor(req, 'social_account_update'));
    if (!account) return res.status(404).json({ success: false, error: 'Social account not found.' });
    return res.json({ success: true, account });
  } catch (error) {
    console.error('[SocialRoute] UPDATE ACCOUNT:', error);
    return res.status(500).json({ success: false, error: 'Failed to update social account.' });
  }
});

router.delete('/:guildId/accounts/:accountId', (req, res) => {
  try {
    const section = social.removeAccount(req.params.guildId, req.params.accountId, actor(req, 'social_account_remove'));
    return res.json({ success: true, section });
  } catch (error) {
    console.error('[SocialRoute] REMOVE ACCOUNT:', error);
    return res.status(500).json({ success: false, error: 'Failed to remove social account.' });
  }
});

router.post('/:guildId/accounts/:accountId/check', async (req, res) => {
  try {
    const { guildId, accountId } = req.params;
    const account = social.getConfig(guildId).accounts.find((item) => item.accountId === accountId || item.id === accountId);
    if (!account) return res.status(404).json({ success: false, error: 'Social account not found.' });

    const result = await social.providers.checkAccount(account);
    const metadata = buildProviderMetadata(result);
    const updated = social.updateAccount(guildId, account.accountId, {
      externalId: result.externalId || account.externalId,
      metadata: { ...(account.metadata || {}), provider: metadata },
      lastSeen: {
        ...(account.lastSeen || {}),
        lastCheckedAt: metadata.lastCheckedAt,
        lastProviderStatus: metadata.providerStatus,
        lastProviderError: metadata.lastError,
        lastLiveState: metadata.isLive ? 'live' : 'offline',
      },
    }, actor(req, 'social_manual_provider_check'));

    return res.json({ success: true, result, account: updated });
  } catch (error) {
    console.error('[SocialRoute] CHECK:', error);
    return res.status(500).json({ success: false, error: 'Failed to check social account.' });
  }
});

router.post('/:guildId/accounts/:accountId/test', async (req, res) => {
  try {
    const result = await social.sendTestAlert(req.params.guildId, req.params.accountId, getDiscordClient(req), actor(req, 'social_test_alert'));
    if (!result.success) return res.status(result.status || 400).json(result);
    return res.json(result);
  } catch (error) {
    console.error('[SocialRoute] TEST:', error);
    return res.status(500).json({ success: false, error: 'Failed to send test alert.' });
  }
});

router.post('/:guildId/check', async (req, res) => {
  try {
    const client = getDiscordClient(req);
    if (!client) throw new Error('Discord client is unavailable.');
    const result = await social.scheduler.runSocialCheck(client, { guildIds: [req.params.guildId] });
    return res.json({ success: true, guildId: req.params.guildId, result });
  } catch (error) {
    console.error('[SocialRoute] RUN CHECK:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to run social check.' });
  }
});

module.exports = router;
