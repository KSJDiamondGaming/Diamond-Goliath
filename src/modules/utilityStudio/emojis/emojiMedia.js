'use strict';

const emojiProcessor = require('../../../core/mediaTools/emojiMaker/emojiProcessor');

const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_ANIMATION_FRAMES = 240;
const MAX_ANIMATION_DURATION_MS = 60 * 1000;
const MAX_DECODED_PIXELS = 80 * 1000 * 1000;
const ANIMATED_OUTPUT_SIZE = 128;

function optionalSharp() {
  try {
    return require('sharp');
  } catch {
    return null;
  }
}

function clampInteger(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function frameHeight(metadata) {
  const pages = Math.max(1, Number(metadata?.pages) || 1);
  const explicit = Number(metadata?.pageHeight) || 0;
  if (explicit > 0) return explicit;
  const totalHeight = Number(metadata?.height) || 0;
  return pages > 1 && totalHeight > 0 ? Math.max(1, Math.round(totalHeight / pages)) : totalHeight;
}

function animationDuration(metadata) {
  const delays = Array.isArray(metadata?.delay) ? metadata.delay : [];
  return delays.reduce((sum, delay) => sum + Math.max(0, Number(delay) || 0), 0);
}

function inspectSafety(metadata, sourceBytes, options = {}) {
  const maxSourceBytes = Math.max(DEFAULT_MAX_BYTES, Number(options.maxSourceBytes) || DEFAULT_MAX_SOURCE_BYTES);
  if (sourceBytes > maxSourceBytes) throw new Error(`Emoji source is too large (${sourceBytes} bytes; max ${maxSourceBytes}).`);

  const pages = Math.max(1, Number(metadata?.pages) || 1);
  const width = Math.max(0, Number(metadata?.width) || 0);
  const height = Math.max(0, frameHeight(metadata) || 0);
  const durationMs = animationDuration(metadata);
  const decodedPixels = width * height * pages;

  if (pages > MAX_ANIMATION_FRAMES) {
    throw new Error(`Animated emoji has too many frames (${pages}; max ${MAX_ANIMATION_FRAMES}).`);
  }
  if (durationMs > MAX_ANIMATION_DURATION_MS) {
    throw new Error(`Animated emoji is too long (${Math.ceil(durationMs / 1000)}s; max ${MAX_ANIMATION_DURATION_MS / 1000}s).`);
  }
  if (decodedPixels > MAX_DECODED_PIXELS) {
    throw new Error('Animated emoji is too large to process safely.');
  }

  return { pages, width, height, durationMs, decodedPixels };
}

function processingSummary(result) {
  if (!result) return '';
  const originalBytes = Number(result.originalBytes) || Number(result.bytes) || 0;
  const finalBytes = Number(result.bytes) || 0;
  const type = result.animated ? 'Animated' : 'Static';
  const compression = originalBytes && finalBytes && originalBytes !== finalBytes
    ? ` • ${Math.ceil(originalBytes / 1024)} KB → ${Math.ceil(finalBytes / 1024)} KB`
    : (finalBytes ? ` • ${Math.ceil(finalBytes / 1024)} KB` : '');
  const dimensions = result.width && result.height ? ` • ${result.width}×${result.height}` : '';
  const frames = result.animated && result.pages ? ` • ${result.pages} frames` : '';
  const frameRate = result.frameRateReduced ? ' • reduced frame rate' : '';
  return `${type}${dimensions}${frames}${frameRate}${compression}`;
}

function frameDelays(metadata, pages) {
  const source = Array.isArray(metadata?.delay) ? metadata.delay : [];
  return Array.from({ length: pages }, (_, index) => {
    const fallback = source.length ? source[Math.min(index, source.length - 1)] : 100;
    const delay = Number(fallback);
    return Number.isFinite(delay) && delay > 0 ? Math.round(delay) : 100;
  });
}

async function reduceAnimationFrameRate(sharp, source, stride) {
  const metadata = await sharp(source, {
    animated: true,
    limitInputPixels: MAX_DECODED_PIXELS,
  }).metadata();
  const pages = Math.max(1, Number(metadata?.pages) || 1);
  if (pages <= 1 || stride <= 1) return null;

  const raw = await sharp(source, {
    animated: true,
    limitInputPixels: MAX_DECODED_PIXELS,
  })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = Number(raw.info?.width) || Number(metadata?.width) || 0;
  const totalHeight = Number(raw.info?.height) || 0;
  const pageHeight = Number(raw.info?.pageHeight) || frameHeight(metadata) || Math.round(totalHeight / pages);
  const channels = Number(raw.info?.channels) || 4;
  if (!width || !pageHeight || !channels) return null;

  const bytesPerFrame = width * pageHeight * channels;
  if (!bytesPerFrame || raw.data.length < bytesPerFrame * pages) return null;

  const delays = frameDelays(metadata, pages);
  const frames = [];
  const reducedDelays = [];
  for (let start = 0; start < pages; start += stride) {
    frames.push(raw.data.subarray(start * bytesPerFrame, (start + 1) * bytesPerFrame));
    let delay = 0;
    for (let index = start; index < Math.min(pages, start + stride); index += 1) delay += delays[index];
    reducedDelays.push(Math.max(1, delay));
  }
  if (frames.length >= pages || !frames.length) return null;

  const stacked = Buffer.concat(frames);
  const gifOptions = {
    reuse: false,
    colours: 16,
    effort: 8,
    dither: 0,
    interFrameMaxError: 24,
    interPaletteMaxError: 40,
    loop: Number.isFinite(Number(metadata?.loop)) ? Number(metadata.loop) : 0,
    delay: reducedDelays,
  };
  const output = await sharp(stacked, {
    raw: {
      width,
      height: pageHeight * frames.length,
      channels,
      pageHeight,
    },
  })
    .gif(gifOptions)
    .toBuffer({ resolveWithObject: true });

  return {
    data: output.data,
    info: output.info,
    pagesBefore: pages,
    pagesAfter: Number(output.info?.pages) || frames.length,
    stride,
  };
}

async function prepareAnimatedEmoji(source, metadata, options = {}) {
  const sharp = optionalSharp();
  if (!sharp) {
    const maxBytes = Math.max(0, Number(options.maxBytes) || DEFAULT_MAX_BYTES);
    if (maxBytes && source.length > maxBytes) throw new Error('Sharp is required to optimise oversized animated emojis.');
    return {
      buffer: source,
      processed: false,
      animated: true,
      animationPreserved: true,
      originalFormat: metadata?.format || null,
      format: metadata?.format || null,
      originalBytes: source.length,
      bytes: source.length,
      width: Number(metadata?.width) || null,
      height: frameHeight(metadata) || null,
      pages: Number(metadata?.pages) || null,
      durationMs: animationDuration(metadata),
      warning: 'Sharp is unavailable; animation was preserved unchanged.',
    };
  }

  const maxBytes = Math.max(0, Number(options.maxBytes) || DEFAULT_MAX_BYTES);
  const safety = inspectSafety(metadata, source.length, options);

  // Preserve already-compliant animations byte-for-byte. This avoids needless
  // quality loss and keeps GIF/WebP timing and transparency untouched.
  if (!maxBytes || source.length <= maxBytes) {
    return {
      buffer: source,
      processed: false,
      animated: true,
      animationPreserved: true,
      originalFormat: metadata?.format || null,
      format: metadata?.format || null,
      originalBytes: source.length,
      bytes: source.length,
      width: safety.width || null,
      height: safety.height || null,
      pages: safety.pages,
      durationMs: safety.durationMs,
    };
  }

  const target = clampInteger(options.animatedSize, ANIMATED_OUTPUT_SIZE, 32, 128);
  const attempts = [
    { size: target, colours: 128, dither: 0.7, interFrameMaxError: 4, interPaletteMaxError: 8 },
    { size: target, colours: 96, dither: 0.5, interFrameMaxError: 8, interPaletteMaxError: 12 },
    { size: 112, colours: 96, dither: 0.5, interFrameMaxError: 8, interPaletteMaxError: 16 },
    { size: 96, colours: 64, dither: 0.4, interFrameMaxError: 10, interPaletteMaxError: 20 },
    { size: 80, colours: 48, dither: 0.3, interFrameMaxError: 12, interPaletteMaxError: 24 },
    { size: 64, colours: 32, dither: 0.2, interFrameMaxError: 16, interPaletteMaxError: 28 },
    { size: 48, colours: 24, dither: 0.1, interFrameMaxError: 20, interPaletteMaxError: 32 },
    { size: 32, colours: 16, dither: 0, interFrameMaxError: 24, interPaletteMaxError: 40 },
  ];

  let best = null;
  for (const attempt of attempts) {
    const gifOptions = {
      reuse: false,
      colours: attempt.colours,
      effort: 8,
      dither: attempt.dither,
      interFrameMaxError: attempt.interFrameMaxError,
      interPaletteMaxError: attempt.interPaletteMaxError,
      loop: Number.isFinite(Number(metadata?.loop)) ? Number(metadata.loop) : 0,
    };
    if (Array.isArray(metadata?.delay) && metadata.delay.length) gifOptions.delay = metadata.delay;

    const output = await sharp(source, {
      animated: true,
      limitInputPixels: MAX_DECODED_PIXELS,
    })
      .resize(attempt.size, attempt.size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        withoutEnlargement: true,
      })
      .gif(gifOptions)
      .toBuffer({ resolveWithObject: true });

    const result = {
      buffer: output.data,
      processed: true,
      animated: true,
      animationPreserved: true,
      originalFormat: metadata?.format || null,
      format: 'gif',
      originalBytes: source.length,
      bytes: output.data.length,
      originalWidth: safety.width || null,
      originalHeight: safety.height || null,
      width: Number(output.info?.width) || attempt.size,
      height: Number(output.info?.pageHeight) || attempt.size,
      pages: Number(output.info?.pages) || safety.pages,
      durationMs: safety.durationMs,
      colours: attempt.colours,
      frameRateReduced: false,
    };
    if (!best || result.bytes < best.bytes) best = result;
    if (!maxBytes || result.bytes <= maxBytes) return result;
  }

  // Frame-rate reduction is deliberately the final fallback. By this point the
  // animation has already been reduced through palette, quality and dimensions.
  // We drop evenly-spaced frames and add their delays to retained frames so the
  // animation duration and loop behaviour remain intact.
  if (best?.buffer && Number(best.pages || 0) > 1) {
    for (const stride of [2, 3, 4]) {
      const reduced = await reduceAnimationFrameRate(sharp, best.buffer, stride);
      if (!reduced?.data?.length) continue;
      const result = {
        ...best,
        buffer: reduced.data,
        bytes: reduced.data.length,
        width: Number(reduced.info?.width) || best.width,
        height: Number(reduced.info?.pageHeight) || best.height,
        pages: reduced.pagesAfter,
        durationMs: safety.durationMs,
        frameRateReduced: true,
        frameReductionStride: stride,
        pagesBeforeFrameReduction: reduced.pagesBefore,
      };
      if (!best || result.bytes < best.bytes) best = result;
      if (!maxBytes || result.bytes <= maxBytes) return result;
    }
  }

  throw new Error(`Animated emoji could not be reduced below Discord's ${maxBytes} byte limit without flattening the animation (best ${best?.bytes || source.length} bytes).`);
}

async function prepareEmojiAsset(input, options = {}) {
  const source = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (!source.length) throw new Error('Emoji image buffer is empty.');

  const maxSourceBytes = Math.max(DEFAULT_MAX_BYTES, Number(options.maxSourceBytes) || DEFAULT_MAX_SOURCE_BYTES);
  if (source.length > maxSourceBytes) throw new Error(`Emoji source is too large (${source.length} bytes; max ${maxSourceBytes}).`);

  const sharp = optionalSharp();
  if (!sharp) return emojiProcessor.prepareEmojiBuffer(source, options);

  let metadata;
  try {
    metadata = await sharp(source, { animated: true, limitInputPixels: MAX_DECODED_PIXELS }).metadata();
  } catch (error) {
    throw new Error(`Emoji file could not be read as an image: ${error?.message || error}`);
  }

  if (!metadata?.format || !metadata?.width || !metadata?.height) throw new Error('Emoji file is not a supported image.');
  const animated = Number(metadata.pages || 1) > 1;
  if (animated) return prepareAnimatedEmoji(source, metadata, { ...options, maxSourceBytes });

  const prepared = await emojiProcessor.prepareEmojiBuffer(source, options);
  return {
    ...prepared,
    animated: false,
    animationPreserved: false,
    originalFormat: metadata.format || null,
    originalBytes: source.length,
    bytes: prepared.buffer?.length || prepared.bytes || source.length,
    originalWidth: Number(metadata.width) || null,
    originalHeight: Number(metadata.height) || null,
    width: prepared.size || Number(metadata.width) || null,
    height: prepared.size || Number(metadata.height) || null,
    pages: 1,
    durationMs: 0,
  };
}

module.exports = {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_SOURCE_BYTES,
  MAX_ANIMATION_FRAMES,
  MAX_ANIMATION_DURATION_MS,
  MAX_DECODED_PIXELS,
  ANIMATED_OUTPUT_SIZE,
  prepareEmojiAsset,
  processingSummary,
};
