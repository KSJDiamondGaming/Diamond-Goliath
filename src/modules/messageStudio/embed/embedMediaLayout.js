'use strict';

const { AttachmentBuilder } = require('discord.js');
const fetch = require('node-fetch');
const sharp = require('sharp');

const TARGET_WIDTH = 520;
const PORTRAIT_VISIBLE_WIDTH = 320;
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

async function fetchImageBuffer(url) {
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
    if (declaredLength > MAX_SOURCE_BYTES) throw new Error('Large image exceeds the 8 MB processing limit.');

    const buffer = await response.buffer();
    if (buffer.length > MAX_SOURCE_BYTES) throw new Error('Large image exceeds the 8 MB processing limit.');
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

async function centerOnEmbedCanvas(buffer) {
  const input = sharp(buffer, { failOn: 'warning' });
  const metadata = await input.metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (!width || !height) return null;

  const aspect = width / height;
  const visibleWidth = aspect <= 1.25
    ? Math.min(width, PORTRAIT_VISIBLE_WIDTH)
    : Math.min(width, TARGET_WIDTH);

  const resized = await sharp(buffer, { failOn: 'warning' })
    .resize({ width: visibleWidth, withoutEnlargement: true })
    .ensureAlpha()
    .png()
    .toBuffer();

  const resizedMeta = await sharp(resized).metadata();
  const renderedWidth = Number(resizedMeta.width || visibleWidth);
  const left = Math.max(0, Math.floor((TARGET_WIDTH - renderedWidth) / 2));
  const right = Math.max(0, TARGET_WIDTH - renderedWidth - left);

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

/**
 * Normalize every HTTPS large-image URL to a 520 px attachment canvas before
 * sending it to Discord. Previously this only ran for Discord CDN/media hosts,
 * which meant external image URLs completely bypassed the width-normalization
 * path and made every width tweak appear to do nothing.
 */
async function prepareEmbedMedia(embeds = []) {
  const files = [];
  const output = Array.isArray(embeds) ? embeds : [];

  for (let index = 0; index < output.length; index += 1) {
    const embed = output[index];
    if (!embed || typeof embed.toJSON !== 'function' || typeof embed.setImage !== 'function') continue;

    const imageUrl = embed.toJSON()?.image?.url;
    if (!imageUrl || !isHttpsImageUrl(imageUrl)) continue;

    try {
      const source = await fetchImageBuffer(imageUrl);
      const processed = await centerOnEmbedCanvas(source);
      if (!processed) continue;

      const name = `embed-panel-${index + 1}-large.png`;
      files.push(new AttachmentBuilder(processed, { name }));
      embed.setImage(`attachment://${name}`);
    } catch (error) {
      console.warn(`[Embed] Could not centre large image for panel ${index + 1}:`, error.message || error);
    }
  }

  return { embeds: output, files };
}

module.exports = {
  TARGET_WIDTH,
  PORTRAIT_VISIBLE_WIDTH,
  prepareEmbedMedia,
};
