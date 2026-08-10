'use strict';

const { AttachmentBuilder } = require('discord.js');
const fetch = require('node-fetch');
const sharp = require('sharp');

// Keep the current media geometry unchanged while we compare the exact embed
// payloads Discord receives for wide text panels versus the narrow image panel.
const TARGET_WIDTH = 800;
const PORTRAIT_VISIBLE_WIDTH = 440;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const EMBED_BG = { r: 17, g: 18, b: 20, alpha: 1 };

function isHttpsImageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function payloadLayoutSummary(embed, index, stage) {
  if (!embed || typeof embed.toJSON !== 'function') return;
  const data = embed.toJSON();
  const description = String(data.description || '');
  const lines = description.split('\n');
  const longestDescriptionLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const fields = Array.isArray(data.fields) ? data.fields : [];
  const longestFieldValue = fields.reduce((max, field) => Math.max(max, String(field?.value || '').length), 0);

  console.log('[EmbedLayout]', JSON.stringify({
    stage,
    panel: index + 1,
    title: String(data.title || ''),
    titleLength: String(data.title || '').length,
    descriptionLength: description.length,
    descriptionLines: lines.length,
    longestDescriptionLine,
    footerLength: String(data.footer?.text || '').length,
    footerTextTail: String(data.footer?.text || '').slice(-24),
    fields: fields.length,
    longestFieldValue,
    hasImage: Boolean(data.image?.url),
    imageUrl: data.image?.url ? String(data.image.url).slice(0, 90) : null,
    hasThumbnail: Boolean(data.thumbnail?.url),
    hasAuthor: Boolean(data.author?.name || data.author?.icon_url),
    timestamp: Boolean(data.timestamp),
  }));
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
    .resize({ width: visibleWidth, withoutEnlargement: false })
    .ensureAlpha()
    .png()
    .toBuffer();

  const resizedMeta = await sharp(resized).metadata();
  const renderedWidth = Number(resizedMeta.width || visibleWidth);
  const left = Math.max(0, Math.floor((TARGET_WIDTH - renderedWidth) / 2));
  const right = Math.max(0, TARGET_WIDTH - renderedWidth - left);

  return sharp(resized)
    .flatten({ background: EMBED_BG })
    .extend({
      top: 0,
      bottom: 0,
      left,
      right,
      background: EMBED_BG,
    })
    .png()
    .toBuffer();
}

async function prepareEmbedMedia(embeds = []) {
  const files = [];
  const output = Array.isArray(embeds) ? embeds : [];

  // Log every panel before any media rewriting so we can compare the exact
  // structural properties that Discord uses for intrinsic embed width.
  output.forEach((embed, index) => payloadLayoutSummary(embed, index, 'before-media'));

  for (let index = 0; index < output.length; index += 1) {
    const embed = output[index];
    if (!embed || typeof embed.toJSON !== 'function' || typeof embed.setImage !== 'function') continue;

    const imageUrl = embed.toJSON()?.image?.url;
    if (!imageUrl) continue;

    if (!isHttpsImageUrl(imageUrl)) {
      console.warn(`[EmbedMedia] panel ${index + 1}: large image skipped; unsupported URL scheme: ${String(imageUrl).slice(0, 180)}`);
      continue;
    }

    try {
      console.log(`[EmbedMedia] panel ${index + 1}: processing large image ${String(imageUrl).slice(0, 180)}`);
      const source = await fetchImageBuffer(imageUrl);
      const sourceMeta = await sharp(source).metadata();
      const processed = await centerOnEmbedCanvas(source);
      if (!processed) {
        console.warn(`[EmbedMedia] panel ${index + 1}: processor returned no image.`);
        continue;
      }

      const processedMeta = await sharp(processed).metadata();
      const name = `embed-panel-${index + 1}-large.png`;
      files.push(new AttachmentBuilder(processed, { name }));
      embed.setImage(`attachment://${name}`);

      console.log(
        `[EmbedMedia] panel ${index + 1}: attached ${name}; ` +
        `source=${sourceMeta.width || '?'}x${sourceMeta.height || '?'} ` +
        `output=${processedMeta.width || '?'}x${processedMeta.height || '?'} target=${TARGET_WIDTH}px`,
      );
    } catch (error) {
      console.error(
        `[EmbedMedia] panel ${index + 1}: FAILED to normalize ${String(imageUrl).slice(0, 180)}:`,
        error?.stack || error?.message || error,
      );
    }
  }

  output.forEach((embed, index) => payloadLayoutSummary(embed, index, 'after-media'));
  console.log(`[EmbedMedia] deploy payload: embeds=${output.length}, processedFiles=${files.length}`);
  return { embeds: output, files };
}

module.exports = {
  TARGET_WIDTH,
  PORTRAIT_VISIBLE_WIDTH,
  prepareEmbedMedia,
};
