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

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input || {}, key);
}

function cleanIdArray(value) {
  return Array.isArray(value) ? [...new Set(value.map(cleanId).filter(Boolean))] : undefined;
}

function getClient(req) {
  return req.client || req.app?.get?.('goliath.client') || req.app?.locals?.client || global.client || null;
}

async function fetchGuild(req, guildId) {
  const client = getClient(req);
  if (!client?.guilds) return null;
  return client.guilds.cache.get(guildId) || client.guilds.fetch(guildId).catch(() => null);
}

function getActorId(req) {
  return cleanId(req.session?.user?.id || req.body?.actorId || req.query?.actorId);
}

function overview(section, guild = null) {
  const hubs = Object.values(section.hubs || {});
  const channels = Object.values(section.channels || {});
  const liveChannels = guild ? channels.filter((channel) => guild.channels.cache.has(channel.channelId)) : channels;
  const activity = Array.isArray(section.activity) ? [...section.activity].slice(-25).reverse() : [];

  return {
    enabled: section.enabled !== false,
    hubs: hubs.length,
    enabledHubs: hubs.filter((hub) => hub.enabled !== false).length,
    trackedChannels: channels.length,
    liveChannels: liveChannels.length,
    lockedChannels: channels.filter((channel) => channel.locked).length,
    hiddenChannels: channels.filter((channel) => channel.hidden).length,
    blockedUsers: channels.reduce((sum, channel) => sum + (channel.blockedUserIds?.length || 0), 0),
    defaultUserLimit: section.settings?.defaultUserLimit || 0,
    deleteWhenEmpty: section.settings?.deleteWhenEmpty !== false,
    ownerPanelEnabled: section.settings?.ownerPanelEnabled !== false,
    analytics: section.analytics || {},
    activity,
    updatedAt: section.updatedAt || null,
  };
}

function prepareSettings(input = {}) {
  const settings = {};

  for (const [key, fallback] of [['defaultUserLimit', 0]]) {
    if (hasOwn(input, key)) settings[key] = cleanNumber(input[key], fallback);
  }

  for (const key of [
    'deleteWhenEmpty',
    'ownerPanelEnabled',
    'allowOwnerRename',
    'allowOwnerStatus',
    'allowOwnerLock',
    'allowOwnerHide',
    'allowOwnerLimit',
    'allowOwnerPermits',
    'allowOwnerTransfer',
    'allowOwnerDelete',
  ]) {
    if (hasOwn(input, key)) settings[key] = input[key] !== false;
  }

  return settings;
}

function prepareHub(input = {}) {
  return {
    hubId: input.hubId || input.id,
    enabled: input.enabled !== false,
    joinChannelId: cleanId(input.joinChannelId),
    joinChannelName: cleanString(input.joinChannelName, '➕ Create Temp Voice', 80),
    categoryId: cleanId(input.categoryId),
    categoryName: cleanString(input.categoryName, 'Temporary Voice Channels', 80),
    nameTemplate: cleanString(input.nameTemplate, "{username}'s Channel", 80),
    userLimit: cleanNumber(input.userLimit, 0),
    bitrate: cleanNumber(input.bitrate, 0),
    lockedByDefault: input.lockedByDefault === true,
    hiddenByDefault: input.hiddenByDefault === true,
    ownerControlsEnabled: input.ownerControlsEnabled !== false,
    createCategory: input.createCategory !== false,
    createdBy: cleanId(input.createdBy || input.actorId),
    actorId: cleanId(input.actorId),
  };
}

function prepareChannelControls(input = {}) {
  const controls = {};

  if (hasOwn(input, 'name')) controls.name = cleanString(input.name, 'Temp Voice', 80);
  if (hasOwn(input, 'activityStatus')) controls.activityStatus = cleanString(input.activityStatus, '', 120);
  if (hasOwn(input, 'userLimit')) controls.userLimit = cleanNumber(input.userLimit, 0);
  if (hasOwn(input, 'locked')) controls.locked = input.locked === true;
  if (hasOwn(input, 'hidden')) controls.hidden = input.hidden === true;
  if (hasOwn(input, 'ownerId')) controls.ownerId = cleanId(input.ownerId);

  for (const key of ['allowedUserIds', 'blockedUserIds', 'allowedRoleIds', 'blockedRoleIds']) {
    if (hasOwn(input, key)) controls[key] = cleanIdArray(input[key]) || [];
  }

  return controls;
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

router.post('/:guildId/hubs/deploy', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await fetchGuild(req, guildId);
    if (!guild) throw new Error('Guild is not available to the bot.');

    const hub = await tempVoiceManager.deployHub(guild, prepareHub(req.body || {}));
    const config = tempVoiceStore.getTempVoiceSection(guildId);
    return success(res, { guildId, hub, config, overview: overview(config, guild) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/hubs', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const hub = tempVoiceManager.createHub(guildId, prepareHub(req.body || {}));
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

router.patch('/:guildId/channels/:channelId/controls', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await fetchGuild(req, guildId);
    if (!guild) throw new Error('Guild is not available to the bot.');

    const channel = await tempVoiceManager.updateTempChannelControls(
      guild,
      req.params.channelId,
      getActorId(req),
      prepareChannelControls(req.body?.controls || req.body || {})
    );

    const config = tempVoiceStore.getTempVoiceSection(guildId);
    return success(res, { guildId, channel, config, overview: overview(config, guild) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/channels/:channelId/claim', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await fetchGuild(req, guildId);
    if (!guild) throw new Error('Guild is not available to the bot.');
    const channel = await tempVoiceManager.claimTempChannel(guild, req.params.channelId, getActorId(req));
    const config = tempVoiceStore.getTempVoiceSection(guildId);
    return success(res, { guildId, channel, config, overview: overview(config, guild) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/channels/:channelId/kick', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await fetchGuild(req, guildId);
    const targetId = cleanId(req.body?.targetId || req.body?.userId);
    if (!guild) throw new Error('Guild is not available to the bot.');
    if (!targetId) throw new Error('Target user ID is required.');
    const channel = await tempVoiceManager.kickMemberFromTempChannel(guild, req.params.channelId, getActorId(req), targetId, req.body?.block === true);
    const config = tempVoiceStore.getTempVoiceSection(guildId);
    return success(res, { guildId, channel, config, overview: overview(config, guild) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.delete('/:guildId/channels/:channelId', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await fetchGuild(req, guildId);

    if (guild && getActorId(req)) {
      await tempVoiceManager.deleteOwnedTempChannel(guild, req.params.channelId, getActorId(req));
    } else {
      tempVoiceStore.deleteTempChannel(guildId, req.params.channelId, { actorId: req.body?.actorId });
      const channel = guild?.channels?.cache?.get(req.params.channelId) || await guild?.channels?.fetch?.(req.params.channelId).catch(() => null);
      if (channel?.deletable) await channel.delete('Goliath Temp Voice dashboard delete').catch(() => null);
    }

    const config = tempVoiceStore.getTempVoiceSection(guildId);
    return success(res, { guildId, config, overview: overview(config, guild) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

module.exports = router;
