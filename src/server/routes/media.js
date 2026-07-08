'use strict';

const express = require('express');

const mediaTools = require('../../core/mediaTools');

const router = express.Router();

function success(res, payload = {}) {
  return res.json({ success: true, ...payload });
}

function failure(res, error, status = 500) {
  console.error('[Media API]', error);
  return res.status(status).json({
    success: false,
    error: error.message || 'Media API request failed.',
  });
}

function getGuildId(req) {
  const guildId = String(req.params.guildId || req.body?.guildId || '').trim();
  if (!/^\d{15,25}$/.test(guildId)) throw new Error('Invalid guild ID.');
  return guildId;
}

router.get('/:guildId/library', (req, res) => {
  try {
    return success(res, { assets: mediaTools.listMediaAssets(getGuildId(req)) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/:tool/create', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const tool = String(req.params.tool || '').trim();
    const result = await mediaTools.createMediaAsset(guildId, tool, req.body || {});
    return success(res, result);
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.delete('/:guildId/assets/:assetId', (req, res) => {
  try {
    const result = mediaTools.deleteMediaAsset(getGuildId(req), req.params.assetId);
    return success(res, result);
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/assets/:assetId/download', (req, res) => {
  try {
    const asset = mediaTools.resolveAssetDownload(getGuildId(req), req.params.assetId);
    return res.download(asset.path, asset.filename);
  } catch (error) {
    return failure(res, error, 404);
  }
});

module.exports = router;
