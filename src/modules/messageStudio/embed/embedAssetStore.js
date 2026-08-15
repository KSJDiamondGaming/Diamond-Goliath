'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const fetch = require('node-fetch');
const { getRuntimePaths } = require('../../../config/runtimePaths');

const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

function assetRoot(guildId) {
  const root = path.join(getRuntimePaths(process.env.BOT_MODE).data, 'embed-assets', String(guildId || 'global'));
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function stableSourceKey(url) {
  const text = String(url || '').trim();
  try {
    const parsed = new URL(text);
    if (parsed.hostname === 'cdn.discordapp.com' || parsed.hostname === 'media.discordapp.net') {
      return `${parsed.hostname.replace('media.', 'cdn.')}${parsed.pathname}`;
    }
  } catch {}
  return text;
}

function assetId(url) {
  return crypto.createHash('sha256').update(stableSourceKey(url)).digest('hex');
}

function pathsFor(guildId, url) {
  const id = assetId(url);
  const root = assetRoot(guildId);
  return { id, data: path.join(root, `${id}.bin`), meta: path.join(root, `${id}.json`) };
}

function getCachedAsset(guildId, url) {
  if (!url) return null;
  const p = pathsFor(guildId, url);
  if (!fs.existsSync(p.data)) return null;
  try {
    const buffer = fs.readFileSync(p.data);
    if (!buffer.length || buffer.length > MAX_ASSET_BYTES) return null;
    let meta = {};
    if (fs.existsSync(p.meta)) meta = JSON.parse(fs.readFileSync(p.meta, 'utf8'));
    return { buffer, meta, id: p.id };
  } catch { return null; }
}

function saveCachedAsset(guildId, url, buffer, meta = {}) {
  if (!url || !Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_ASSET_BYTES) return null;
  const p = pathsFor(guildId, url);
  fs.writeFileSync(p.data, buffer);
  fs.writeFileSync(p.meta, JSON.stringify({
    sourceKey: stableSourceKey(url), sourceUrl: String(url), contentType: meta.contentType || null,
    bytes: buffer.length, savedAt: new Date().toISOString(),
  }, null, 2));
  return { id: p.id, path: p.data };
}

function supportedPersistentType(contentType) {
  const type = String(contentType || '').toLowerCase().split(';')[0].trim();
  if (!type) return true;
  if (type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')) return true;
  return new Set(['application/pdf', 'application/zip', 'application/x-zip-compressed', 'application/octet-stream', 'text/plain', 'text/csv']).has(type);
}

async function downloadAsset(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  timer.unref?.();
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Media fetch failed with HTTP ${response.status}`);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!supportedPersistentType(contentType)) throw new Error(`Unsupported media type: ${contentType || 'unknown'}`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_ASSET_BYTES) throw new Error('Media exceeds the 8 MB persistence limit.');
    const buffer = await response.buffer();
    if (buffer.length > MAX_ASSET_BYTES) throw new Error('Media exceeds the 8 MB persistence limit.');
    return { buffer, contentType };
  } finally { clearTimeout(timer); }
}

async function ensureAssetCached(guildId, url) {
  if (!url || !/^https:\/\//i.test(String(url))) return null;
  const cached = getCachedAsset(guildId, url);
  if (cached) return { ...cached, cached: true };
  const downloaded = await downloadAsset(url);
  saveCachedAsset(guildId, url, downloaded.buffer, { contentType: downloaded.contentType });
  return { ...downloaded, id: assetId(url), cached: false };
}

function addHttpsSource(urls, value) {
  const source = String(value || '').trim();
  if (/^https:\/\//i.test(source)) urls.add(source);
}

function collectMediaUrls(urls, media) {
  for (const panel of Array.isArray(media?.panels) ? media.panels : []) {
    addHttpsSource(urls, panel?.thumbnail?.source);
    for (const item of Array.isArray(panel?.gallery) ? panel.gallery : []) addHttpsSource(urls, item?.source);
    for (const file of Array.isArray(panel?.files) ? panel.files : []) addHttpsSource(urls, file?.source);
  }
}

async function persistPresetMedia(guildId, preset) {
  const urls = new Set();
  const panels = Array.isArray(preset?.panels) ? preset.panels : [preset];
  for (const panel of panels) {
    for (const key of ['image', 'thumbnail', 'authorIcon', 'footerIcon']) addHttpsSource(urls, panel?.[key]);
  }
  collectMediaUrls(urls, preset?.media || preset?.mediaV2);

  const results = [];
  for (const url of urls) {
    try {
      const result = await ensureAssetCached(guildId, url);
      results.push({ url, ok: Boolean(result), cached: Boolean(result?.cached) });
    } catch (error) {
      results.push({ url, ok: false, error: error?.message || String(error) });
    }
  }
  return results;
}

module.exports = {
  MAX_ASSET_BYTES,
  supportedPersistentType,
  stableSourceKey,
  getCachedAsset,
  saveCachedAsset,
  ensureAssetCached,
  persistPresetMedia,
};
