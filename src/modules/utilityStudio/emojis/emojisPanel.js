'use strict';

const express = require('express');
const guildManager = require('../../../core/guild/guildManager');
const emojiApi = require('./emojisApi');
const emojis = require('./emojis');
const emojiStore = require('./emojisStore');

const router = express.Router();
const ok = (res, payload = {}) => res.json({ success: true, ...payload });
const fail = (res, error, status = 400) => res.status(status).json({ success: false, error: error?.message || 'Emoji request failed.' });

function guildId(req) {
  const id = String(req.params.guildId || '').trim();
  if (!/^\d{16,20}$/.test(id)) throw new Error('Invalid guild ID.');
  return id;
}

function actor(req) {
  return String(req.session?.user?.id || req.body?.actorId || '').trim() || null;
}

function client(req) {
  return req.client || req.app?.get?.('goliath.client') || null;
}

async function payload(req, id) {
  const overview = await emojis.overview(client(req), id);
  return {
    guildId: id,
    ...overview,
    source: 'Discord application emojis',
    imageStorage: 'Discord-hosted',
  };
}

router.get('/:guildId/overview', async (req, res) => {
  try { return ok(res, await payload(req, guildId(req))); }
  catch (error) { return fail(res, error); }
});

router.patch('/:guildId/enabled', async (req, res) => {
  try {
    const id = guildId(req);
    guildManager.setModuleEnabled(id, 'emojis', req.body?.enabled === true, { actorId: actor(req), action: 'emoji_panel_toggle' });
    return ok(res, await payload(req, id));
  } catch (error) { return fail(res, error); }
});

router.get('/:guildId/search', async (req, res) => {
  try {
    const id = guildId(req);
    const results = await emojiApi.search(req.query?.q || '', Number(req.query?.limit) || 25);
    return ok(res, { guildId: id, results });
  } catch (error) { return fail(res, error); }
});

router.post('/:guildId/import', async (req, res) => {
  try {
    const id = guildId(req);
    if (!emojiStore.getSection(id).enabled) throw new Error('Emoji module is disabled for this server.');
    const result = await emojis.importFromEmojiGG(client(req), req.body?.emojiGgId, req.body?.name || null);
    if (req.body?.selectForGuild !== false) {
      emojiStore.setFavourite(id, result.emoji.id, true, { actorId: actor(req), action: 'emoji_panel_import' });
    }
    return ok(res, { result, ...(await payload(req, id)) });
  } catch (error) { return fail(res, error); }
});

router.patch('/:guildId/favourites/:emojiId', async (req, res) => {
  try {
    const id = guildId(req);
    emojiStore.setFavourite(id, req.params.emojiId, req.body?.selected !== false, { actorId: actor(req), action: 'emoji_panel_favourite' });
    return ok(res, await payload(req, id));
  } catch (error) { return fail(res, error); }
});

router.patch('/:guildId/bank/:emojiId', async (req, res) => {
  try {
    const id = guildId(req);
    const emoji = await emojis.renameInBank(client(req), req.params.emojiId, req.body?.name);
    return ok(res, { emoji, ...(await payload(req, id)) });
  } catch (error) { return fail(res, error); }
});

router.delete('/:guildId/bank/:emojiId', async (req, res) => {
  try {
    const id = guildId(req);
    await emojis.removeFromBank(client(req), req.params.emojiId);
    const section = emojiStore.getSection(id);
    if (section.favourites.includes(String(req.params.emojiId))) {
      emojiStore.setFavourite(id, req.params.emojiId, false, { actorId: actor(req), action: 'emoji_panel_delete' });
    }
    return ok(res, await payload(req, id));
  } catch (error) { return fail(res, error); }
});

module.exports = router;
