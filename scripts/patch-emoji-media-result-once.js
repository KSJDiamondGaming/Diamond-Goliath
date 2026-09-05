'use strict';

const fs = require('fs');

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing patch anchor: ${label}`);
  return source.replace(from, to);
}

{
  const file = 'src/modules/utilityStudio/emojis/emojis.js';
  let source = fs.readFileSync(file, 'utf8');
  const anchor = "async function createStudioEmoji(client, attachment, requestedName) {";
  const helper = `function preparedMediaResult(prepared) {
  return {
    processed: prepared?.processed === true,
    animated: prepared?.animated === true,
    animationPreserved: prepared?.animationPreserved === true,
    originalFormat: prepared?.originalFormat || null,
    format: prepared?.format || null,
    originalBytes: Number(prepared?.originalBytes) || null,
    bytes: Number(prepared?.bytes) || prepared?.buffer?.length || null,
    originalWidth: Number(prepared?.originalWidth) || null,
    originalHeight: Number(prepared?.originalHeight) || null,
    width: Number(prepared?.width) || null,
    height: Number(prepared?.height) || null,
    pages: Number(prepared?.pages) || 1,
    durationMs: Number(prepared?.durationMs) || 0,
    frameRateReduced: prepared?.frameRateReduced === true,
    frameReductionStride: Number(prepared?.frameReductionStride) || null,
  };
}

${anchor}`;
  source = replaceOnce(source, anchor, helper, 'prepared media result helper');
  source = replaceOnce(
    source,
    "  return { ...result, processed: prepared.processed === true, animated: prepared.animated === true };\n}\n\nasync function importFromEmojiGG",
    "  return { ...result, ...preparedMediaResult(prepared) };\n}\n\nasync function importFromEmojiGG",
    'URL import media result'
  );
  source = replaceOnce(
    source,
    "  return { ...result, sourceId: String(source.id), processed: prepared.processed === true, animated: prepared.animated === true };",
    "  return { ...result, sourceId: String(source.id), ...preparedMediaResult(prepared) };",
    'Emoji.gg import media result'
  );
  fs.writeFileSync(file, source);
}

{
  const file = 'src/modules/utilityStudio/emojis/emojiMedia.js';
  let source = fs.readFileSync(file, 'utf8');
  const anchor = "function processingSummary(result) {\n";
  const helper = `function mediaTypeLabel(result) {
  if (!result?.animated) return 'Static';
  const format = String(result.originalFormat || result.format || '').toLowerCase();
  const label = format === 'png' ? 'APNG' : format === 'webp' ? 'WebP' : format === 'avif' ? 'AVIF' : format === 'gif' ? 'GIF' : '';
  return label ? \`Animated \${label}\` : 'Animated';
}

${anchor}`;
  source = replaceOnce(source, anchor, helper, 'media type label');
  source = replaceOnce(source, "  const type = result.animated ? 'Animated' : 'Static';", "  const type = mediaTypeLabel(result);", 'processing summary type');
  source = replaceOnce(source, "  prepareEmojiAsset,\n  processingSummary,", "  prepareEmojiAsset,\n  mediaTypeLabel,\n  processingSummary,", 'media type export');
  fs.writeFileSync(file, source);
}

{
  const file = 'src/modules/utilityStudio/emojis/emojisPanel.js';
  let source = fs.readFileSync(file, 'utf8');
  source = replaceOnce(
    source,
    "const details = [`**Type:** ${result?.animated || emoji?.animated ? '🎞️ Animated' : '🖼️ Static'}`, result?.processed ? '**Processing:** Optimised automatically ✅' : '**Processing:** Preserved as uploaded ✅'];",
    "const details = [`**Type:** ${result?.animated || emoji?.animated ? `🎞️ ${emojiMedia.mediaTypeLabel({ ...result, animated: true })}` : '🖼️ Static'}`, result?.processed ? '**Processing:** Optimised automatically ✅' : '**Processing:** Preserved as uploaded ✅', ...(result?.animated && result?.pages ? [`**Frames:** ${result.pages}${result.frameRateReduced ? ' • frame rate reduced' : ''}`] : [])];",
    'added emoji type details'
  );
  fs.writeFileSync(file, source);
}

console.log('Emoji media metadata now survives import results and UI reporting.');
