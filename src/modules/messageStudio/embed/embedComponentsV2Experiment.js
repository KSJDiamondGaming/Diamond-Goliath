'use strict';

const {
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  TextDisplayBuilder,
} = require('discord.js');
const fetch = require('node-fetch');
const sharp = require('sharp');
const { getCachedAsset, saveCachedAsset } = require('./embedAssetStore');

const CANVAS_WIDTH = 520;
const PORTRAIT_WIDTH = 300;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

function isHttpsUrl(value) {
  try {
    return new URL(String(value || '')).protocol === 'https:';
  } catch {
    return false;
  }
}

async function fetchImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  timer.unref?.();

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Image fetch failed with HTTP ${response.status}`);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/')) {
      throw new Error(`Media URL returned ${contentType}`);
    }
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_SOURCE_BYTES) throw new Error('Media exceeds 8 MB limit.');
    const buffer = await response.buffer();
    if (buffer.length > MAX_SOURCE_BYTES) throw new Error('Media exceeds 8 MB limit.');
    return { buffer, contentType };
  } finally {
    clearTimeout(timer);
  }
}

async function sourceBuffer(url) {
  const cached = getCachedAsset('global', url);
  if (cached?.buffer) return cached.buffer;
  const remote = await fetchImage(url);
  saveCachedAsset('global', url, remote.buffer, { contentType: remote.contentType });
  return remote.buffer;
}

async function makeCenteredPortrait(buffer) {
  const meta = await sharp(buffer, { failOn: 'warning' }).metadata();
  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  if (!width || !height) return null;

  const aspect = width / height;
  if (aspect > 1.25) {
    return sharp(buffer, { failOn: 'warning' })
      .resize({ width: CANVAS_WIDTH, withoutEnlargement: false })
      .png()
      .toBuffer();
  }

  const portrait = await sharp(buffer, { failOn: 'warning' })
    .resize({ width: PORTRAIT_WIDTH, withoutEnlargement: false })
    .ensureAlpha()
    .png()
    .toBuffer();

  const portraitMeta = await sharp(portrait).metadata();
  const renderedWidth = Number(portraitMeta.width || PORTRAIT_WIDTH);
  const left = Math.max(0, Math.floor((CANVAS_WIDTH - renderedWidth) / 2));
  const right = Math.max(0, CANVAS_WIDTH - renderedWidth - left);

  return sharp(portrait)
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

function cleanFooter(text) {
  return String(text || '').replace(/\u200B/g, '').trim();
}

function panelText(data) {
  const blocks = [];
  if (data.author?.name) blocks.push(`-# ${data.author.name}`);
  if (data.title) blocks.push(`**${data.title}**`);
  if (data.description) blocks.push(String(data.description));

  for (const field of Array.isArray(data.fields) ? data.fields : []) {
    if (!field?.name || !field?.value) continue;
    blocks.push(`**${field.name}**\n${field.value}`);
  }

  return blocks.join('\n\n').trim();
}

function footerText(data) {
  const bits = [];
  const footer = cleanFooter(data.footer?.text);
  if (footer) bits.push(footer);
  if (data.timestamp) {
    const unix = Math.floor(new Date(data.timestamp).getTime() / 1000);
    if (Number.isFinite(unix)) bits.push(`• Today at <t:${unix}:t>`);
  }
  return bits.length ? `-# ${bits.join(' · ')}` : '';
}

async function buildComponentsV2Payload({ embeds = [], actionRows = [], allowUserPing = false, userId = null, ephemeral = false }) {
  const components = [];
  const files = [];

  if (allowUserPing && userId) {
    components.push(new TextDisplayBuilder().setContent(`<@${userId}>`));
  }

  for (let index = 0; index < embeds.length; index += 1) {
    const embed = embeds[index];
    const data = typeof embed?.toJSON === 'function' ? embed.toJSON() : embed;
    if (!data || typeof data !== 'object') continue;

    const container = new ContainerBuilder();
    if (Number.isInteger(data.color)) container.setAccentColor(data.color);

    const text = panelText(data);
    if (text) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));

    const imageUrl = data.image?.url;
    if (isHttpsUrl(imageUrl)) {
      try {
        const source = await sourceBuffer(imageUrl);
        const centered = await makeCenteredPortrait(source);
        if (centered) {
          const name = `embed-v2-panel-${index + 1}.png`;
          files.push(new AttachmentBuilder(centered, { name }));
          const gallery = new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(`attachment://${name}`),
          );
          container.addMediaGalleryComponents(gallery);
        }
      } catch (error) {
        const gallery = new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(imageUrl),
        );
        container.addMediaGalleryComponents(gallery);
        console.warn(`[EmbedV2] panel ${index + 1}: centered media processing failed:`, error?.message || error);
      }
    }

    const footer = footerText(data);
    if (footer) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footer));

    components.push(container);
  }

  for (const row of actionRows || []) components.push(row);

  let flags = MessageFlags.IsComponentsV2;
  if (ephemeral) flags |= MessageFlags.Ephemeral;

  return {
    components,
    files,
    flags,
  };
}

module.exports = {
  CANVAS_WIDTH,
  PORTRAIT_WIDTH,
  buildComponentsV2Payload,
};
