'use strict';

const { AttachmentBuilder } = require('discord.js');
const sharp = require('sharp');

const SINGLE_IMAGE_CANVAS_WIDTH = 900;
const SINGLE_IMAGE_CENTER_COMPENSATION = 180;

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

async function shiftSingleImageAttachment(file) {
  const name = String(file?.name || '').trim();
  const attachment = file?.attachment;
  if (!/^embed-panel-\d+\.png$/i.test(name) || !Buffer.isBuffer(attachment)) return file;

  try {
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

    // Keep Components V2 so the panel remains full width. Only compensate the
    // visual position of a single static image inside Discord's gallery.
    if (!hasAdvancedMedia(mediaState) && Array.isArray(payload?.files) && payload.files.length) {
      payload.files = await Promise.all(payload.files.map(shiftSingleImageAttachment));
    }

    return payload;
  };

  renderer.__classicSingleImagePayloadInstalled = true;
  console.log('[Embed Renderer] Full-width panel + centered single-image path installed.');
  return renderer;
}

module.exports = { installClassicSingleImagePayload };
