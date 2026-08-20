'use strict';

const { AttachmentBuilder } = require('discord.js');
const sharp = require('sharp');

const SINGLE_IMAGE_CANVAS_WIDTH = 900;
const SINGLE_IMAGE_CENTER_COMPENSATION = 340;

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

async function shiftSingleImageAttachment(file, index) {
  const name = attachmentName(file, index);
  const attachment = attachmentBuffer(file);
  if (!attachment) return file;

  try {
    // Keep the Components V2 container untouched so the panel remains full
    // width. Only move the visible artwork inside its transparent media canvas.
    const visible = await sharp(attachment, { failOn: 'warning' })
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const meta = await sharp(visible).metadata();
    const width = Number(meta.width || 0);
    const height = Number(meta.height || 0);
    if (!width || !height || width >= SINGLE_IMAGE_CANVAS_WIDTH) return file;

    const naturalLeft = Math.floor((SINGLE_IMAGE_CANVAS_WIDTH - width) / 2);
    const left = Math.min(
      SINGLE_IMAGE_CANVAS_WIDTH - width,
      Math.max(0, naturalLeft + SINGLE_IMAGE_CENTER_COMPENSATION),
    );

    const centered = await sharp({
      create: {
        width: SINGLE_IMAGE_CANVAS_WIDTH,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: visible, left, top: 0 }])
      .png()
      .toBuffer();

    return new AttachmentBuilder(centered, { name });
  } catch (error) {
    console.warn('[Embed Renderer] Single-image centering compensation failed:', error?.message || error);
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

    // Never switch this case to a classic embed payload: Components V2 is what
    // keeps the panel at the locked full width. For a simple single media image,
    // adjust only the transparent attachment canvas so the artwork is centered.
    if (!hasAdvancedMedia(mediaState) && Array.isArray(payload?.files) && payload.files.length) {
      payload.files = await Promise.all(payload.files.map((file, index) => shiftSingleImageAttachment(file, index)));
    }

    return payload;
  };

  renderer.__classicSingleImagePayloadInstalled = true;
  console.log('[Embed Renderer] Locked full-width panel + centered single-image path installed.');
  return renderer;
}

module.exports = { installClassicSingleImagePayload };
