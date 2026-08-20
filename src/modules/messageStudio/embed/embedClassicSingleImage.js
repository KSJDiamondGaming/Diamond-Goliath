'use strict';

const { AttachmentBuilder } = require('discord.js');
const sharp = require('sharp');

const CANVAS_WIDTH = 600;
const VISIBLE_WIDTH = 320;
const PANEL_BG = { r: 19, g: 20, b: 22, alpha: 1 };

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

function attachmentName(file, index) {
  return String(file?.name || file?.data?.name || `embed-panel-${index + 1}.png`).trim();
}

function attachmentBuffer(file) {
  const value = file?.attachment ?? file?.data?.attachment;
  return Buffer.isBuffer(value) ? value : null;
}

async function restoreFixedCanvasCentering(file, index) {
  const attachment = attachmentBuffer(file);
  if (!attachment) return file;

  try {
    const trimmed = await sharp(attachment, { failOn: 'warning' })
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .png()
      .toBuffer();

    const meta = await sharp(trimmed).metadata();
    const width = Number(meta.width || 0);
    const height = Number(meta.height || 0);
    if (!width || !height) return file;

    const visible = await sharp(trimmed, { failOn: 'warning' })
      .resize({
        width: VISIBLE_WIDTH,
        height: VISIBLE_WIDTH,
        fit: 'inside',
        withoutEnlargement: false,
      })
      .ensureAlpha()
      .png()
      .toBuffer();

    const visibleMeta = await sharp(visible).metadata();
    const visibleWidth = Number(visibleMeta.width || VISIBLE_WIDTH);
    const visibleHeight = Number(visibleMeta.height || VISIBLE_WIDTH);
    const left = Math.floor((CANVAS_WIDTH - visibleWidth) / 2);

    const centered = await sharp({
      create: {
        width: CANVAS_WIDTH,
        height: visibleHeight,
        channels: 4,
        background: PANEL_BG,
      },
    })
      .composite([{ input: visible, left, top: 0 }])
      .png()
      .toBuffer();

    return new AttachmentBuilder(centered, { name: attachmentName(file, index) });
  } catch (error) {
    console.warn('[Embed Renderer] Fixed-canvas centering failed:', error?.message || error);
    return file;
  }
}

function installClassicSingleImagePayload(renderer) {
  if (!renderer || renderer.__classicSingleImagePayloadInstalled) return renderer;
  if (typeof renderer.buildEmbedPayload !== 'function') return renderer;

  const originalBuildEmbedPayload = renderer.buildEmbedPayload.bind(renderer);

  renderer.buildEmbedPayload = async function fullWidthCenteredSingleImage(options = {}) {
    const mediaState = options.media || options.mediaV2 || null;
    const payload = await originalBuildEmbedPayload(options);

    // Keep Components V2 so the panel width stays locked. For a simple single
    // image, restore the old proven 600px fixed-canvas centering geometry.
    if (!hasAdvancedMedia(mediaState) && Array.isArray(payload?.files) && payload.files.length) {
      payload.files = await Promise.all(
        payload.files.map((file, index) => restoreFixedCanvasCentering(file, index)),
      );
    }

    return payload;
  };

  renderer.__classicSingleImagePayloadInstalled = true;
  console.log('[Embed Renderer] Proven 600px fixed-canvas centering installed.');
  return renderer;
}

module.exports = { installClassicSingleImagePayload };
