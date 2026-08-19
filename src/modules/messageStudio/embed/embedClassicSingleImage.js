'use strict';

const { AttachmentBuilder, MessageFlags } = require('discord.js');
const fetch = require('node-fetch');
const sharp = require('sharp');

const CLASSIC_CANVAS_WIDTH = 520;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

function hasAdvancedMedia(mediaState) {
  const panels = Array.isArray(mediaState?.panels) ? mediaState.panels : [];
  return panels.some((media) => {
    const gallery = Array.isArray(media?.gallery) ? media.gallery : [];
    const first = gallery[0] || {};
    const files = Array.isArray(media?.files) ? media.files : [];
    return gallery.length > 1
      || first.type === 'video'
      || first.spoiler === true
      || Boolean(first.alt)
      || Boolean(media?.thumbnail?.alt)
      || files.length > 0;
  });
}

function hasApplicationEmojiShortcode(embeds = []) {
  return embeds.some((embed) => {
    const data = typeof embed?.toJSON === 'function' ? embed.toJSON() : embed;
    if (!data || typeof data !== 'object') return false;
    const values = [
      data.title,
      data.description,
      data.author?.name,
      data.footer?.text,
      ...(Array.isArray(data.fields) ? data.fields.flatMap((field) => [field?.name, field?.value]) : []),
    ];
    return values.some((value) => /(^|[^<]):[a-zA-Z0-9_]{2,32}:/.test(String(value || '')));
  });
}

function syncSimpleMediaIntoEmbeds(embeds = [], mediaState = null) {
  const panels = Array.isArray(mediaState?.panels) ? mediaState.panels : [];
  for (let index = 0; index < embeds.length; index += 1) {
    const embed = embeds[index];
    if (!embed || typeof embed.setImage !== 'function') continue;
    const media = panels[index] || null;
    const image = Array.isArray(media?.gallery) ? String(media.gallery[0]?.source || '').trim() : '';
    const thumbnail = String(media?.thumbnail?.source || '').trim();
    if (image) embed.setImage(image);
    if (thumbnail && typeof embed.setThumbnail === 'function') embed.setThumbnail(thumbnail);
  }
  return embeds;
}

function isHttpsUrl(value) {
  try { return new URL(String(value || '')).protocol === 'https:'; }
  catch { return false; }
}

async function fetchImageBuffer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  timer.unref?.();
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error(`Image fetch failed with HTTP ${response.status}`);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/')) throw new Error(`Image URL returned ${contentType}`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_SOURCE_BYTES) throw new Error('Image exceeds 8 MB processing limit.');
    const buffer = await response.buffer();
    if (buffer.length > MAX_SOURCE_BYTES) throw new Error('Image exceeds 8 MB processing limit.');
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

async function prepareClassicCenteredImages(embeds = []) {
  const files = [];

  for (let index = 0; index < embeds.length; index += 1) {
    const embed = embeds[index];
    if (!embed || typeof embed.toJSON !== 'function' || typeof embed.setImage !== 'function') continue;
    const imageUrl = String(embed.toJSON()?.image?.url || '').trim();
    if (!isHttpsUrl(imageUrl)) continue;

    try {
      const buffer = await fetchImageBuffer(imageUrl);
      const source = sharp(buffer, { failOn: 'warning' });
      const meta = await source.metadata();
      const width = Number(meta.width || 0);
      const height = Number(meta.height || 0);
      if (!width || !height || width >= CLASSIC_CANVAS_WIDTH) continue;

      const left = Math.floor((CLASSIC_CANVAS_WIDTH - width) / 2);
      const right = CLASSIC_CANVAS_WIDTH - width - left;
      const centered = await source
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

      const name = `embed-panel-${index + 1}-centered.png`;
      files.push(new AttachmentBuilder(centered, { name }));
      embed.setImage(`attachment://${name}`);
    } catch (error) {
      // Best effort: preserve the original image rather than blocking delivery.
      console.warn(`[Embed Renderer] Could not center classic image for panel ${index + 1}:`, error?.message || error);
    }
  }

  return { embeds, files };
}

function installClassicSingleImagePayload(renderer) {
  if (!renderer || renderer.__classicSingleImagePayloadInstalled) return renderer;
  if (typeof renderer.buildEmbedPayload !== 'function') return renderer;

  const originalBuildEmbedPayload = renderer.buildEmbedPayload.bind(renderer);

  renderer.buildEmbedPayload = async function classicSingleImagePayload(options = {}) {
    const embeds = Array.isArray(options.embeds) ? options.embeds : [];
    const mediaState = options.media || options.mediaV2 || null;

    // Keep the normal Discord embed width and use the original centering method:
    // narrow images are placed unchanged on a transparent 520px canvas. This
    // forces the full embed image width while keeping visible artwork centered.
    if (!hasAdvancedMedia(mediaState) && !hasApplicationEmojiShortcode(embeds)) {
      syncSimpleMediaIntoEmbeds(embeds, mediaState);
      const prepared = await prepareClassicCenteredImages(embeds);
      const payload = {
        embeds: prepared.embeds,
        components: Array.isArray(options.actionRows) ? options.actionRows : [],
      };
      if (prepared.files.length) payload.files = prepared.files;
      if (options.allowUserPing && options.userId) payload.content = `<@${options.userId}>`;
      if (options.ephemeral) payload.flags = MessageFlags.Ephemeral;
      return payload;
    }

    return originalBuildEmbedPayload(options);
  };

  renderer.__classicSingleImagePayloadInstalled = true;
  console.log('[Embed Renderer] Full-width centered single-image path installed.');
  return renderer;
}

module.exports = { installClassicSingleImagePayload };
