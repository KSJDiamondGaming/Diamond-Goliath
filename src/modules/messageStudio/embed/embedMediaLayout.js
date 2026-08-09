'use strict';

const { AttachmentBuilder } = require('discord.js');
const fetch = require('node-fetch');
const sharp = require('sharp');

const TARGET_WIDTH = 520;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const DISCORD_IMAGE_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);

function isDiscordHostedImage(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && DISCORD_IMAGE_HOSTS.has(url.hostname);
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
  const source = sharp(buffer, { failOn: 'warning' });
  const metadata = await source.metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);

  if (!width || !height || width >= TARGET_WIDTH) return null;

  const left = Math.floor((TARGET_WIDTH - width) / 2);
  const right = TARGET_WIDTH - width - left;

  return source
    .ensureAlpha()
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
 * Prepare embed large images for Discord's renderer.
 *
 * Narrow Discord-hosted images are placed unchanged on a transparent 520 px
 * canvas. Discord therefore lays the embed out at full image width while the
 * visible image remains centred. The persisted/source URL is never modified.
 */
async function prepareEmbedMedia(embeds = []) {
  const files = [];
  const output = Array.isArray(embeds) ? embeds : [];

  for (let index = 0; index < output.length; index += 1) {
    const embed = output[index];
    if (!embed || typeof embed.toJSON !== 'function' || typeof embed.setImage !== 'function') continue;

    const imageUrl = embed.toJSON()?.image?.url;
    if (!imageUrl || !isDiscordHostedImage(imageUrl)) continue;

    try {
      const source = await fetchImageBuffer(imageUrl);
      const processed = await centerOnEmbedCanvas(source);
      if (!processed) continue;

      const name = `embed-panel-${index + 1}-large.png`;
      files.push(new AttachmentBuilder(processed, { name }));
      embed.setImage(`attachment://${name}`);
    } catch (error) {
      // Media enhancement is best-effort. If Discord's CDN is temporarily
      // unavailable, keep the original image URL rather than blocking the post.
      console.warn(`[Embed] Could not centre large image for panel ${index + 1}:`, error.message || error);
    }
  }

  return { embeds: output, files };
}

module.exports = {
  TARGET_WIDTH,
  prepareEmbedMedia,
};
