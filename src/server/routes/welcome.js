'use strict';

const express = require('express');
const welcomeStore = require('../../modules/welcome/welcomeStore');
const welcomeManager = require('../../modules/welcome/welcomeManager');

const router = express.Router();

function success(res, payload = {}) {
  return res.json({ success: true, ...payload });
}

function failure(res, error, status = 500) {
  console.error('[Welcome API]', error);
  return res.status(status).json({ success: false, error: error.message || 'Welcome API request failed.' });
}

function getGuildId(req) {
  const guildId = String(req.params.guildId || '').trim();
  if (!/^\d{15,25}$/.test(guildId)) throw new Error('Invalid guild ID.');
  return guildId;
}

function getActorId(req) {
  return String(req.session?.user?.id || req.body?.actorId || '').trim() || null;
}

function getClient(req) {
  return req.client || req.app?.get?.('goliath.client') || req.app?.locals?.client || null;
}

async function getGuild(req, guildId) {
  const client = getClient(req);
  if (!client?.guilds) return null;
  return client.guilds.cache.get(guildId) || client.guilds.fetch(guildId).catch(() => null);
}

async function buildOverview(req, guildId) {
  const config = welcomeStore.getWelcomeSection(guildId);
  const guild = await getGuild(req, guildId);
  const health = guild ? await welcomeManager.buildHealthReport(guild) : null;
  const templates = welcomeManager.getWelcomeTemplates(guildId, 'welcome');
  const binding = welcomeManager.getWelcomeBinding(guildId, 'welcome');
  return {
    guildId,
    config,
    templates,
    binding,
    overview: {
      enabled: config.enabled !== false,
      channelId: config.channelId,
      dmEnabled: config.dmEnabled === true,
      analytics: config.analytics,
      health,
      templateId: binding?.templateId || config.templateId,
      templateName: binding?.name || health?.templateName || null,
      templateBound: Boolean(binding),
    },
  };
}

router.get('/:guildId/overview', async (req, res) => {
  try {
    return success(res, await buildOverview(req, getGuildId(req)));
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.put('/:guildId/config', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const patch = req.body || {};
    let config;
    if (patch.templateId) {
      config = welcomeManager.bindWelcomeTemplate(guildId, patch.templateId, 'welcome', { actorId: getActorId(req) }).config;
      const { templateId, ...rest } = patch;
      if (Object.keys(rest).length) config = welcomeStore.updateConfig(guildId, rest, { actorId: getActorId(req) });
    } else {
      config = welcomeStore.updateConfig(guildId, patch, { actorId: getActorId(req) });
    }
    return success(res, { config, ...(await buildOverview(req, guildId)) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/enabled', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    welcomeStore.updateConfig(guildId, { enabled: req.body?.enabled === true }, { actorId: getActorId(req) });
    return success(res, await buildOverview(req, guildId));
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/template', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const templateId = String(req.body?.templateId || '').trim();
    if (!templateId) throw new Error('A template ID is required.');
    const result = welcomeManager.bindWelcomeTemplate(guildId, templateId, 'welcome', { actorId: getActorId(req) });
    return success(res, { ...result, ...(await buildOverview(req, guildId)) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/repair', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await getGuild(req, guildId);
    if (!guild) throw new Error('Guild is unavailable.');
    const config = await welcomeManager.repairConfiguration(guild, { actorId: getActorId(req) });
    return success(res, { config, ...(await buildOverview(req, guildId)) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/test', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await getGuild(req, guildId);
    if (!guild) throw new Error('Guild is unavailable.');
    const userId = String(req.body?.userId || getActorId(req) || '').trim();
    if (!/^\d{15,25}$/.test(userId)) throw new Error('A valid test user ID is required.');
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (!member) throw new Error('Test member could not be found in this server.');
    const config = welcomeStore.getWelcomeSection(guildId);
    if (!config.channelId && !config.dmEnabled) throw new Error('Select a welcome channel or enable welcome DMs before testing.');
    const result = await welcomeManager.sendWelcome(member, { silent: false, force: true, previewOnly: true });
    return success(res, { result, ...(await buildOverview(req, guildId)) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/reset', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    welcomeManager.resetWelcome(guildId, { actorId: getActorId(req) });
    return success(res, await buildOverview(req, guildId));
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/export', (req, res) => {
  try {
    const guildId = getGuildId(req);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="goliath-welcome-${guildId}.json"`);
    return res.send(JSON.stringify(welcomeManager.exportConfiguration(guildId), null, 2));
  } catch (error) {
    return failure(res, error, 400);
  }
});

module.exports = router;
