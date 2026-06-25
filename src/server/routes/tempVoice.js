'use strict';

const express = require('express');

const tempVoiceStore = require('../../modules/tempvoice/tempVoiceStore');
const tempVoiceManager = require('../../modules/tempvoice/tempVoiceManager');
const { setModuleEnabled } = require('../../core/guild/guildManager');

const router = express.Router();

function success(res, payload = {}) {
  return res.json({ success: true, ...payload });
}

function failure(res, error, status = 500) {
  console.error('[TempVoice API]', error);
  return res.status(status).json({ success: false, error: error.message || 'Temp Voice API request failed.' });
}

function getGuildId(req) {
  const guildId = String(req.params.guildId || '').trim();
  if (!/^\d{15,25}$/.test(guildId)) throw new Error('Invalid guild ID.');
  return guildId;
}

function cleanId(value) {
  const id = String(value || '').replace(/[<#@&!>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function cleanString(value, fallback = '', max = 100) {
  const text = String(value ?? fallback).trim().slice(0, max);
  return text || fallback;
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Math.max(0, Math.floor(Number.isFinite(number) ? number : fallback));
}

function getClient(req) {
  return req.client || req.app?.get?.('goliath.client') || req.app?.locals?.client || global.client || null;
}

async function fetchGuild(req, guildId) {
  const client = getClient(req);
  if (!client?.guilds) return null;
  return client.guilds.cache.get(guildId) || client.guilds.fetch(guildId).catch(() => null);
}

function overview(section, guild = null) {
  const hubs = Object.values(section.hubs || {});
  const channels = Object.values(section.channels || {});
  const liveChannels = guild ? channels.filter((channel) => guild.channels.cache.has(channel.channelId)) : channels;

  return {
    enabled: section.enabled !== false,
    hubs: hubs.length,
    enabledHubs: hubs.filter((hub) => hub.enabled !== false).length,
    trackedChannels: channels.length,
    liveChannels: liveChannels.length,
    defaultUserLimit: section.settings?.defaultUserLimit || 0,
    deleteWhenEmpty: section.settings?.deleteWhenEmpty !== false,
    updatedAt: section.updatedAt || null,
  };
}

function prepareSettings(input = {}) {
  return {
    defaultUserLimit: cleanNumber(input.defaultUserLimit, 0),
    deleteWhenEmpty: input.deleteWhenEmpty !== false,
  };
}

function prepareHub(input = {}) {
  return {
    hubId: input.hubId || input.id,
    enabled: input.enabled !== false,
    joinChannelId: cleanId(input.joinChannelId),
    categoryId: cleanId(input.categoryId),
    nameTemplate: cleanString(input.nameTemplate, "{username}'s Channel", 80),
    userLimit: cleanNumber(input.userLimit, 0),
    bitrate: cleanNumber(input.bitrate, 0),
    createdBy: cleanId(input.createdBy),
  };
}

router.get('/:guildId', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await fetchGuild(req, guildId);
    const config = tempVoiceStore.getTempVoiceSection(guildId);
    return success(res, { guildId, config, overview: overview(config, guild) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/enabled', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const enabled = req.body?.enabled === true;
    setModuleEnabled(guildId, 'tempVoice', enabled);
    const config = tempVoiceStore.updateTempVoiceSection(guildId, (section) => ({ ...section, enabled, updatedAt: tempVoiceStore.now() }), { actorId: req.body?.actorId });
    const guild = await fetchGuild(req, guildId);
    return success(res, { guildId, config, overview: overview(config, guild) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/settings', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const settings = prepareSettings(req.body?.settings || req.body || {});
    const config = tempVoiceStore.updateTempVoiceSection(guildId, (section) => ({ ...section, settings: { ...(section.settings || {}), ...settings }, updatedAt: tempVoiceStore.now() }), { actorId: req.body?.actorId });
    const guild = await fetchGuild(req, guildId);
    return success(res, { guildId, config, overview: overview(config, guild) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/hubs', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const hub = tempVoiceStore.saveHub(guildId, prepareHub(req.body || {}), { actorId: req.body?.actorId });
    const config = tempVoiceStore.getTempVoiceSection(guildId);
    const guild = await fetchGuild(req, guildId);
    return success(res, { guildId, hub, config, overview: overview(config, guild) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.put('/:guildId/hubs/:hubId', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const hub = tempVoiceStore.saveHub(guildId, prepareHub({ ...(req.body || {}), hubId: req.params.hubId }), { actorId: req.body?.actorId });
    const config = tempVoiceStore.getTempVoiceSection(guildId);
    const guild = await fetchGuild(req, guildId);
    return success(res, { guildId, hub, config, overview: overview(config, guild) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.delete('/:guildId/hubs/:hubId', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = tempVoiceStore.updateTempVoiceSection(guildId, (section) => {
      const hubs = { ...(section.hubs || {}) };
      delete hubs[req.params.hubId];
      return { ...section, hubs, updatedAt: tempVoiceStore.now() };
    }, { actorId: req.body?.actorId });
    const guild = await fetchGuild(req, guildId);
    return success(res, { guildId, config, overview: overview(config, guild) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.delete('/:guildId/channels/:channelId', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = tempVoiceStore.deleteTempChannel(guildId, req.params.channelId, { actorId: req.body?.actorId });
    const guild = await fetchGuild(req, guildId);
    const channel = guild?.channels?.cache?.get(req.params.channelId) || await guild?.channels?.fetch?.(req.params.channelId).catch(() => null);
    if (channel?.deletable) await channel.delete('Goliath Temp Voice dashboard delete').catch(() => null);
    return success(res, { guildId, config, overview: overview(config, guild) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

module.exports = router;
