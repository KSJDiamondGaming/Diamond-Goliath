'use strict';

const {
  AttachmentBuilder,
  ContainerBuilder,
  FileBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const fetch = require('node-fetch');
const path = require('path');
const sharp = require('sharp');
const { getCachedAsset, saveCachedAsset, ensureAssetCached } = require('./embedAssetStore');
const { replaceVars } = require('./embedPanel');

const CANVAS_WIDTH = 600;
const PORTRAIT_WIDTH = 320;
const PORTRAIT_SHIFT_RIGHT = 0;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const PANEL_BG = { r: 19, g: 20, b: 22, alpha: 1 };

function isHttpsUrl(value) {
  try { return new URL(String(value || '')).protocol === 'https:'; } catch { return false; }
}
function resolveSource(value, interaction) {
  const resolved = interaction ? replaceVars(String(value || ''), interaction) : String(value || '');
  return String(resolved || '').trim();
}
async function fetchImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  timer.unref?.();
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Image fetch failed with HTTP ${response.status}`);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/')) throw new Error(`Media URL returned ${contentType}`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_SOURCE_BYTES) throw new Error('Media exceeds 8 MB limit.');
    const buffer = await response.buffer();
    if (buffer.length > MAX_SOURCE_BYTES) throw new Error('Media exceeds 8 MB limit.');
    return { buffer, contentType };
  } finally { clearTimeout(timer); }
}
async function sourceBuffer(url) {
  const cached = getCachedAsset('global', url);
  if (cached?.buffer) return cached.buffer;
  const remote = await fetchImage(url);
  saveCachedAsset('global', url, remote.buffer, { contentType: remote.contentType });
  return remote.buffer;
}
function circleMaskSvg(size) {
  const radius = size / 2;
  return Buffer.from(`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/></svg>`);
}
async function makeCenteredPortrait(buffer) {
  const meta = await sharp(buffer, { failOn: 'warning' }).metadata();
  const width = Number(meta.width || 0), height = Number(meta.height || 0);
  if (!width || !height) return null;
  if ((width / height) > 1.25) {
    return sharp(buffer, { failOn: 'warning' }).resize({ width: CANVAS_WIDTH, withoutEnlargement: false }).png().toBuffer();
  }
  const portrait = await sharp(buffer, { failOn: 'warning' })
    .resize(PORTRAIT_WIDTH, PORTRAIT_WIDTH, { fit: 'cover', position: 'centre', withoutEnlargement: false })
    .ensureAlpha().composite([{ input: circleMaskSvg(PORTRAIT_WIDTH), blend: 'dest-in' }]).png().toBuffer();
  const naturalLeft = Math.floor((CANVAS_WIDTH - PORTRAIT_WIDTH) / 2);
  const left = Math.min(CANVAS_WIDTH - PORTRAIT_WIDTH, Math.max(0, naturalLeft + PORTRAIT_SHIFT_RIGHT));
  return sharp({ create: { width: CANVAS_WIDTH, height: PORTRAIT_WIDTH, channels: 4, background: PANEL_BG } })
    .composite([{ input: portrait, left, top: 0 }]).png().toBuffer();
}
function cleanFooter(text) { return String(text || '').replace(/\u200B/g, '').trim(); }
function panelText(data) {
  const blocks = [];
  if (data.author?.name) blocks.push(`-# ${data.author.name}`);
  if (data.title) blocks.push(`**${data.title}**`);
  if (data.description) blocks.push(String(data.description));
  for (const field of Array.isArray(data.fields) ? data.fields : []) {
    if (field?.name && field?.value) blocks.push(`**${field.name}**\n${field.value}`);
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
function panelMedia(mediaV2, index) {
  return Array.isArray(mediaV2?.panels) ? (mediaV2.panels[index] || null) : null;
}
function isEnhancedMedia(media) {
  if (!media) return false;
  const gallery = Array.isArray(media.gallery) ? media.gallery : [];
  const first = gallery[0] || {};
  return gallery.length > 1 || Boolean(first.alt) || first.spoiler === true || first.type === 'video'
    || Boolean(media.thumbnail?.alt) || (Array.isArray(media.files) && media.files.length > 0);
}
function galleryItems(media, interaction) {
  return (Array.isArray(media?.gallery) ? media.gallery : []).slice(0, 10).map((item) => {
    const source = resolveSource(item?.source, interaction);
    if (!isHttpsUrl(source)) return null;
    const builder = new MediaGalleryItemBuilder().setURL(source).setSpoiler(item?.spoiler === true);
    if (item?.alt) builder.setDescription(String(item.alt).slice(0, 1024));
    return builder;
  }).filter(Boolean);
}
function safeFilename(name, fallback) {
  const base = String(name || fallback || 'file').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return (base || fallback || 'file').slice(0, 120);
}
function sourceFilename(source, fallback) {
  try {
    const parsed = new URL(source);
    return decodeURIComponent(path.basename(parsed.pathname || '')) || fallback;
  } catch { return fallback; }
}
async function addMediaFiles(container, media, interaction, payloadFiles, panelIndex) {
  const entries = (Array.isArray(media?.files) ? media.files : []).slice(0, 10);
  for (let fileIndex = 0; fileIndex < entries.length; fileIndex += 1) {
    const entry = entries[fileIndex];
    const source = resolveSource(entry?.source, interaction);
    if (!isHttpsUrl(source)) continue;
    try {
      const cached = await ensureAssetCached('global', source);
      if (!cached?.buffer) throw new Error('File could not be downloaded.');
      const originalName = entry?.name || sourceFilename(source, `file-${fileIndex + 1}`);
      const name = safeFilename(`p${panelIndex + 1}-${fileIndex + 1}-${originalName}`, `p${panelIndex + 1}-file-${fileIndex + 1}`);
      const attachment = new AttachmentBuilder(cached.buffer, { name });
      if (entry?.description) attachment.setDescription(String(entry.description).slice(0, 1024));
      if (entry?.spoiler) attachment.setSpoiler(true);
      payloadFiles.push(attachment);
      container.addFileComponents(new FileBuilder().setURL(`attachment://${name}`).setSpoiler(entry?.spoiler === true));
    } catch (error) {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`📎 [${String(entry?.name || 'Attached file').slice(0, 100)}](${source})`));
      console.warn(`[Embed] panel ${panelIndex + 1}: file attachment failed:`, error?.message || error);
    }
  }
}

async function buildEmbedPayload({ embeds = [], actionRows = [], allowUserPing = false, userId = null, ephemeral = false, mediaV2 = null, interaction = null }) {
  const components = [];
  const files = [];
  if (allowUserPing && userId) components.push(new TextDisplayBuilder().setContent(`<@${userId}>`));

  for (let index = 0; index < embeds.length; index += 1) {
    const embed = embeds[index];
    const data = typeof embed?.toJSON === 'function' ? embed.toJSON() : embed;
    if (!data || typeof data !== 'object') continue;

    const media = panelMedia(mediaV2, index);
    const container = new ContainerBuilder();
    if (Number.isInteger(data.color)) container.setAccentColor(data.color);
    const text = panelText(data);

    const thumbSource = resolveSource(media?.thumbnail?.source || data.thumbnail?.url, interaction);
    if (text && isHttpsUrl(thumbSource)) {
      const thumbnail = new ThumbnailBuilder().setURL(thumbSource);
      if (media?.thumbnail?.alt) thumbnail.setDescription(String(media.thumbnail.alt).slice(0, 1024));
      container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(text)).setThumbnailAccessory(thumbnail));
    } else if (text) {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
    }

    const enhanced = isEnhancedMedia(media);
    const items = enhanced ? galleryItems(media, interaction) : [];
    if (items.length) {
      container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(...items));
    } else {
      const imageUrl = data.image?.url;
      if (isHttpsUrl(imageUrl)) {
        try {
          const source = await sourceBuffer(imageUrl);
          const centered = await makeCenteredPortrait(source);
          if (centered) {
            const name = `embed-panel-${index + 1}.png`;
            files.push(new AttachmentBuilder(centered, { name }));
            container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${name}`)));
          }
        } catch (error) {
          container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl)));
          console.warn(`[Embed] panel ${index + 1}: centered media processing failed:`, error?.message || error);
        }
      }
    }

    if (media?.files?.length) await addMediaFiles(container, media, interaction, files, index);

    const footer = footerText(data);
    if (footer) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footer));
    components.push(container);
  }

  for (const row of actionRows || []) components.push(row);
  let flags = MessageFlags.IsComponentsV2;
  if (ephemeral) flags |= MessageFlags.Ephemeral;
  return { components, files, flags };
}

module.exports = {
  CANVAS_WIDTH,
  PORTRAIT_WIDTH,
  PORTRAIT_SHIFT_RIGHT,
  PANEL_BG,
  buildEmbedPayload,
};
