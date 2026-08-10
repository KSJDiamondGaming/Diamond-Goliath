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
const PORTRAIT_VISIBLE_WIDTH = 220;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const EMBED_BG = { r: 17, g: 18, b: 20, alpha: 1 };

// EXPERIMENT ONLY:
// Discord left-aligns the 299px large-image box inside a legacy embed and gives
// us no native centre-alignment control. To move the visible portrait toward
// the centre of the full card without crossing the 300px width threshold, keep
// the raster at 299px and right-align a slightly narrower portrait inside it.
// The locked 299px rule remains untouched.
const SHIFT_PORTRAIT_RIGHT = true;

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
  const visibleWidth = aspect <= 1.25
    ? Math.min(PORTRAIT_VISIBLE_WIDTH, TARGET_WIDTH)
    : TARGET_WIDTH;

  const resized = await sharp(buffer, { failOn: 'warning' })
    .resize({ width: visibleWidth, withoutEnlargement: false })
    .ensureAlpha()
    .png()
    .toBuffer();

  const resizedMeta = await sharp(resized).metadata();
  const renderedWidth = Number(resizedMeta.width || visibleWidth);

  let left;
  let right;
  if (SHIFT_PORTRAIT_RIGHT && aspect <= 1.25) {
    left = Math.max(0, TARGET_WIDTH - renderedWidth);
    right = 0;
  } else {
    left = Math.max(0, Math.floor((TARGET_WIDTH - renderedWidth) / 2));
    right = Math.max(0, TARGET_WIDTH - renderedWidth - left);
  }

  return sharp(resized)
    .flatten({ background: EMBED_BG })
    .extend({ top: 0, bottom: 0, left, right, background: EMBED_BG })
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
