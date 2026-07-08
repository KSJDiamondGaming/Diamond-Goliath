'use strict';

const fs = require('fs');
const path = require('path');

const { DISCORD_LIMITS } = require('./mediaConfig');
const {
  assertGuildId,
  getToolDir,
  addAsset,
  readLibrary,
  removeAsset,
  findAsset,
} = require('./mediaLibrary');
const { createGif } = require('./gifMaker/gifProcessor');
const { createEmoji } = require('./emojiMaker/emojiProcessor');

const ALLOWED_TOOLS = new Set(['gif', 'emoji']);

function cleanFilename(filename = 'upload.bin') {
  const base = path.basename(String(filename || 'upload.bin'));
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 90) || 'upload.bin';
}

function decodeDataUrl(dataUrl) {
  const value = String(dataUrl || '');
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Upload must be a base64 data URL.');
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function extensionFor(filename, fallback = 'bin') {
  const ext = path.extname(cleanFilename(filename)).replace('.', '').toLowerCase();
  return ext || fallback;
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function publicAsset(asset) {
  if (!asset) return null;
  return {
    ...asset,
    path: undefined,
    inputPath: undefined,
  };
}

async function createMediaAsset(guildId, tool, payload = {}) {
  const cleanGuildId = assertGuildId(guildId);
  const cleanTool = String(tool || '').trim();
  if (!ALLOWED_TOOLS.has(cleanTool)) throw new Error('Unsupported media tool.');

  const upload = decodeDataUrl(payload.fileData);
  const originalName = cleanFilename(payload.filename || `${cleanTool}-upload`);
  const inputExt = extensionFor(originalName);
  const id = makeId(cleanTool);

  const uploadDir = getToolDir(cleanGuildId, cleanTool, 'uploads');
  const outputDir = getToolDir(cleanGuildId, cleanTool, 'outputs');
  const inputPath = path.join(uploadDir, `${id}.${inputExt}`);
  fs.writeFileSync(inputPath, upload.buffer);

  const outputExt = cleanTool === 'gif'
    ? 'gif'
    : (String(payload.options?.format || 'png').toLowerCase() === 'webp' ? 'webp' : 'png');
  const outputPath = path.join(outputDir, `${id}.${outputExt}`);

  const result = cleanTool === 'gif'
    ? await createGif({ inputPath, outputPath, options: payload.options || {} })
    : await createEmoji({ inputPath, outputPath, options: payload.options || {} });

  const stats = fs.statSync(outputPath);
  const asset = {
    id,
    tool: cleanTool,
    type: cleanTool === 'gif' ? 'gif' : String(payload.options?.preset || 'emoji'),
    name: String(payload.name || originalName).trim().slice(0, 80) || originalName,
    filename: path.basename(outputPath),
    originalName,
    mimeType: cleanTool === 'gif' ? 'image/gif' : `image/${outputExt}`,
    sizeBytes: stats.size,
    path: outputPath,
    inputPath,
    downloadUrl: `/api/media/${cleanGuildId}/assets/${id}/download`,
    discordReady: cleanTool === 'gif'
      ? stats.size <= DISCORD_LIMITS.gif.maxBytes
      : stats.size <= DISCORD_LIMITS.emoji.maxBytes,
    fallback: Boolean(result.fallback),
    warning: result.warning || null,
    metadata: {
      uploadMimeType: upload.mimeType,
      options: payload.options || {},
      outputExt,
    },
  };

  const saved = addAsset(cleanGuildId, asset);
  return { asset: publicAsset(saved.asset), library: saved.library.assets.map(publicAsset) };
}

function listMediaAssets(guildId) {
  return readLibrary(guildId).assets.map(publicAsset);
}

function deleteMediaAsset(guildId, assetId) {
  const { asset, library } = removeAsset(guildId, String(assetId || ''));
  if (asset?.path && fs.existsSync(asset.path)) fs.unlinkSync(asset.path);
  if (asset?.inputPath && fs.existsSync(asset.inputPath)) fs.unlinkSync(asset.inputPath);
  return { asset: publicAsset(asset), library: library.assets.map(publicAsset) };
}

function resolveAssetDownload(guildId, assetId) {
  const asset = findAsset(guildId, String(assetId || ''));
  if (!asset?.path || !fs.existsSync(asset.path)) throw new Error('Media asset not found.');
  return asset;
}

module.exports = {
  createMediaAsset,
  listMediaAssets,
  deleteMediaAsset,
  resolveAssetDownload,
};
