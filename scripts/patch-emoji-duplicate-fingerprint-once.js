'use strict';

const fs = require('fs');

const file = 'src/modules/utilityStudio/emojis/emojiStudioService.js';
let source = fs.readFileSync(file, 'utf8');

const oldBlock = `async function imageHash(emoji) {
  if (!emoji?.url) return null;
  const response = await fetch(emoji.url, { headers: { 'User-Agent': 'KSJHub-Goliath/1.0' }, timeout: 15000 });
  if (!response.ok) return null;
  const buffer = await response.buffer();
  return crypto.createHash('sha256').update(buffer).digest('hex');
}`;

const newBlock = `function duplicateAssetUrl(emoji) {
  if (emoji?.animated && emoji?.id) return \`https://cdn.discordapp.com/emojis/\${emoji.id}.webp?size=128&animated=true\`;
  return emoji?.url || (emoji?.id ? \`https://cdn.discordapp.com/emojis/\${emoji.id}.webp?size=128\` : null);
}

function normalizedFrameDelays(metadata, pages) {
  const delays = Array.isArray(metadata?.delay) ? metadata.delay : [];
  return Array.from({ length: pages }, (_, index) => {
    const value = Math.max(0, Number(delays[index] ?? delays[delays.length - 1] ?? 0) || 0);
    return Math.round(value / 10) * 10;
  });
}

async function imageHash(emoji) {
  const assetUrl = duplicateAssetUrl(emoji);
  if (!assetUrl) return null;
  const response = await fetch(assetUrl, { headers: { 'User-Agent': 'KSJHub-Goliath/1.0' }, timeout: 15000 });
  if (!response.ok) return null;
  const buffer = await response.buffer();
  const rawHash = crypto.createHash('sha256').update(buffer).digest('hex');

  let sharp;
  try { sharp = require('sharp'); } catch { return \`raw:\${emoji?.animated ? 'animated' : 'static'}:\${rawHash}\`; }

  try {
    const metadata = await sharp(buffer, { animated: true, limitInputPixels: 80 * 1000 * 1000 }).metadata();
    const pages = Math.max(1, Number(metadata?.pages) || 1);
    const animated = Boolean(emoji?.animated) || pages > 1;
    const rendered = await sharp(buffer, { animated: true, limitInputPixels: 80 * 1000 * 1000 })
      .resize(24, 24, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Five-bit channels absorb tiny encoder differences while retaining enough
    // visual detail to avoid grouping merely similar emoji artwork together.
    const pixels = Buffer.from(rendered.data);
    for (let index = 0; index < pixels.length; index += 1) pixels[index] &= 0xF8;

    const identity = JSON.stringify({
      animated,
      pages,
      loop: Number.isFinite(Number(metadata?.loop)) ? Number(metadata.loop) : 0,
      delay: animated ? normalizedFrameDelays(metadata, pages) : [],
      width: Number(rendered.info?.width) || 24,
      pageHeight: Number(rendered.info?.pageHeight) || 24,
    });
    return crypto.createHash('sha256').update(identity).update(pixels).digest('hex');
  } catch (_) {
    return \`raw:\${emoji?.animated ? 'animated' : 'static'}:\${rawHash}\`;
  }
}`;

if (!source.includes(oldBlock)) throw new Error('Missing duplicate imageHash anchor.');
source = source.replace(oldBlock, newBlock);
fs.writeFileSync(file, source);
console.log('Animation-aware duplicate fingerprint added.');
