'use strict';

const { AttachmentBuilder } = require('discord.js');
const fetch = require('node-fetch');
const sharp = require('sharp');
const { getCachedAsset, saveCachedAsset } = require('./embedAssetStore');

// LOCKED EMBED RENDERER BEHAVIOUR
// Keep large portrait media below Discord's ~300 px image-width threshold.
// 299 px allows the surrounding text/footer layout to hold the normal full
// embed width. Do not raise this to 300+.
const TARGET_WIDTH = 299;
const PORTRAIT_VISIBLE_WIDTH = 212;
const PORTRAIT_RIGHT_INSET = 0;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

function isHttpsImageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function fetchRemoteImageBuffer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  timer.unref?.();

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Image fetch failed with HTTP ${response.status}`);

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/')) {
      throw new Error(`Large image URL returned ${contentType || 'non-image content'}`);
    }

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_SOURCE_BYTES) {
      throw new Error('Large image exceeds the 8 MB processing limit.');
    }

    const buffer = await response.buffer();
    if (buffer.length > MAX_SOURCE_BYTES) {
      throw new Error('Large image exceeds the 8 MB processing limit.');
    }

    return { buffer, contentType };
  } finally {
    clearTimeout(timer);
  }
}

async function sourceImageBuffer(guildId, url) {
  const cached = getCachedAsset(guildId, url);
  if (cached?.buffer) return cached.buffer;

  const remote = await fetchRemoteImageBuffer(url);
  saveCachedAsset(guildId, url, remote.buffer, { contentType: remote.contentType });
  return remote.buffer;
}

async function centerOnEmbedCanvas(buffer) {
  const input = sharp(buffer, { failOn: 'warning' });
  const metadata = await input.metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (!width || !height) return null;

  const aspect = width / height;
  if (aspect > 1.25) {
    return sharp(buffer, { failOn: 'warning' })
      .resize({ width: TARGET_WIDTH, withoutEnlargement: false })
      .png()
      .toBuffer();
  }

  // Portraits stay on a transparent 299px canvas so the embed keeps its full
  // text-card width. The visible portrait is pushed to the far right of that
  // media box, which is the furthest Discord lets us move it toward the visual
  // centre without crossing the 300px renderer threshold.
  const visibleWidth = Math.min(PORTRAIT_VISIBLE_WIDTH, TARGET_WIDTH);
  const resized = await sharp(buffer, { failOn: 'warning' })
    .resize({ width: visibleWidth, withoutEnlargement: false })
    .ensureAlpha()
    .png()
    .toBuffer();

  const resizedMeta = await sharp(resized).metadata();
  const renderedWidth = Number(resizedMeta.width || visibleWidth);
  const right = Math.min(PORTRAIT_RIGHT_INSET, Math.max(0, TARGET_WIDTH - renderedWidth));
  const left = Math.max(0, TARGET_WIDTH - renderedWidth - right);

  return sharp(resized)
    .extend({
      top: 0,
      bottom: 0,
      left,
      right,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function prepareEmbedMedia(embeds = [], options = {}) {
  const files = [];
  const output = Array.isArray(embeds) ? embeds : [];
  const guildId = options.guildId || 'global';

  for (let index = 0; index < output.length; index += 1) {
    const embed = output[index];
    if (!embed || typeof embed.toJSON !== 'function' || typeof embed.setImage !== 'function') continue;

    const imageUrl = embed.toJSON()?.image?.url;
    if (!imageUrl || !isHttpsImageUrl(imageUrl)) continue;

    try {
      const source = await sourceImageBuffer(guildId, imageUrl);
      const processed = await centerOnEmbedCanvas(source);
      if (!processed) continue;

      const name = `embed-panel-${index + 1}-large.png`;
      files.push(new AttachmentBuilder(processed, { name }));
      embed.setImage(`attachment://${name}`);
    } catch (error) {
      // Media normalization is best-effort. Preserve the original image URL if
      // processing fails so one bad asset never blocks the entire embed post.
      console.warn(
        `[EmbedMedia] panel ${index + 1}: media normalization failed:`,
        error?.message || error,
      );
    }
  }

  return { embeds: output, files };
}

module.exports = {
  TARGET_WIDTH,
  PORTRAIT_VISIBLE_WIDTH,
  prepareEmbedMedia,
};
