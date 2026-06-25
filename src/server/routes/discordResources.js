'use strict';

const express = require('express');
const {
  ChannelType,
} = require('discord.js');

const {
  getDiscordResources,
  syncDiscordResources,
} = require('../../core/guild/discordResourceManager');

const router = express.Router();

function getDiscordClient(req) {
  return (
    req.client ||
    req.app?.get?.('goliath.client') ||
    req.app?.locals?.client ||
    req.app?.locals?.discordClient ||
    global.client ||
    global.discordClient ||
    null
  );
}

function isAuthenticated(req) {
  return Boolean(req.session?.user);
}

function readCache(guildId, extra = {}) {
  return {
    ...getDiscordResources(guildId),
    ...extra,
  };
}

function readList(guildId, key) {
  const resources = readCache(guildId);
  return Array.isArray(resources[key]) ? resources[key] : [];
}

function serialiseChannel(channel) {
  if (!channel?.id || !channel?.name) return null;

  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    parentId: channel.parentId || null,
    position: Number.isFinite(channel.rawPosition)
      ? channel.rawPosition
      : Number.isFinite(channel.position)
        ? channel.position
        : 0,
  };
}

function buildLiveResources(guild) {
  const allChannels = [...(guild.channels.cache?.values?.() || [])]
    .map(serialiseChannel)
    .filter(Boolean)
    .sort((a, b) => {
      const pos = (a.position || 0) - (b.position || 0);
      return pos || String(a.name).localeCompare(String(b.name));
    });

  return {
    lastSync: new Date().toISOString(),
    guild: {
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconURL?.({ extension: 'png', size: 128 }) || null,
    },
    channels: allChannels.filter((channel) => channel.type !== ChannelType.GuildCategory),
    categories: allChannels.filter((channel) => channel.type === ChannelType.GuildCategory),
    roles: [...(guild.roles.cache?.values?.() || [])]
      .filter((role) => role.id !== guild.id)
      .map((role) => ({
        id: role.id,
        name: role.name,
        position: role.position || 0,
        color: role.hexColor || '#000000',
      }))
      .sort((a, b) => (b.position || 0) - (a.position || 0)),
    emojis: [...(guild.emojis.cache?.values?.() || [])]
      .map((emoji) => ({
        id: emoji.id,
        name: emoji.name,
        animated: emoji.animated === true,
      }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
  };
}

async function fetchGuild(req, guildId) {
  const client = getDiscordClient(req);

  if (!client?.guilds) return null;

  const id = String(guildId || '').trim();
  const cachedGuild = client.guilds.cache?.get(id);

  if (cachedGuild) return cachedGuild;
  if (client.isReady && !client.isReady()) return null;
  if (typeof client.guilds.fetch !== 'function') return null;

  return client.guilds.fetch(id).catch(() => null);
}

async function getLiveOrCachedResources(req, guildId) {
  const guild = await fetchGuild(req, guildId);

  if (!guild) {
    return readCache(guildId, {
      warning: 'Discord client or guild unavailable. Returned cached resources.',
    });
  }

  const synced = await syncDiscordResources(guild).catch(() => null);

  if (synced && Array.isArray(synced.channels)) {
    return synced;
  }

  return buildLiveResources(guild);
}

router.get('/:guildId/resources', async (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' });
    return res.json(await getLiveOrCachedResources(req, req.params.guildId));
  } catch (error) {
    console.error('Failed to read Discord resources:', error);
    return res.json(readCache(req.params.guildId, { warning: 'Resource cache unavailable' }));
  }
});

router.get('/:guildId/channels', async (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' });
    const resources = await getLiveOrCachedResources(req, req.params.guildId);
    return res.json(Array.isArray(resources.channels) ? resources.channels : []);
  } catch (error) {
    console.error('Failed to read Discord channels:', error);
    return res.json(readList(req.params.guildId, 'channels'));
  }
});

router.get('/:guildId/categories', async (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' });
    const resources = await getLiveOrCachedResources(req, req.params.guildId);
    return res.json(Array.isArray(resources.categories) ? resources.categories : []);
  } catch (error) {
    console.error('Failed to read Discord categories:', error);
    return res.json(readList(req.params.guildId, 'categories'));
  }
});

router.get('/:guildId/roles', async (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' });
    const resources = await getLiveOrCachedResources(req, req.params.guildId);
    return res.json(Array.isArray(resources.roles) ? resources.roles : []);
  } catch (error) {
    console.error('Failed to read Discord roles:', error);
    return res.json(readList(req.params.guildId, 'roles'));
  }
});

router.get('/:guildId/emojis', async (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' });
    const resources = await getLiveOrCachedResources(req, req.params.guildId);
    return res.json(Array.isArray(resources.emojis) ? resources.emojis : []);
  } catch (error) {
    console.error('Failed to read Discord emojis:', error);
    return res.json(readList(req.params.guildId, 'emojis'));
  }
});

router.post('/:guildId/resources/sync', async (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' });
    return res.json(await getLiveOrCachedResources(req, req.params.guildId));
  } catch (error) {
    console.error('Failed to sync Discord resources:', error);
    return res.json(readCache(req.params.guildId, {
      warning: 'Live Discord sync failed. Returned cached resources.',
    }));
  }
});

module.exports = router;
