'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Real sends/tests/updates still use the full panel list.
//
// Discord-hosted attachment images can make an embed collapse to the image's
// served width. For the large embed image only, request Discord's media proxy
// at the normal full embed width. This leaves thumbnails/author/footer icons
// and the saved source URL untouched.
const panel = require('./embedPanel');

const DISCORD_EMBED_IMAGE_WIDTH = 520;

function fullWidthDiscordImageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['media.discordapp.net', 'cdn.discordapp.com'].includes(url.hostname)) return value;

    // The media proxy supports resize query parameters. Using it for CDN URLs
    // as well gives the large-image renderer a consistent served width.
    url.hostname = 'media.discordapp.net';
    url.searchParams.set('width', String(DISCORD_EMBED_IMAGE_WIDTH));
    url.searchParams.delete('height');
    if (!url.searchParams.has('quality')) url.searchParams.set('quality', 'lossless');
    return url.toString();
  } catch {
    return value;
  }
}

function normalizeLargeEmbedImage(embed) {
  if (!embed || typeof embed.toJSON !== 'function' || typeof embed.setImage !== 'function') return embed;

  const data = embed.toJSON();
  const imageUrl = data?.image?.url;
  if (!imageUrl) return embed;

  const normalized = fullWidthDiscordImageUrl(imageUrl);
  if (normalized && normalized !== imageUrl) embed.setImage(normalized);
  return embed;
}

function normalizePayloadMedia(payload) {
  if (!payload || !Array.isArray(payload.embeds)) return payload;
  payload.embeds.forEach(normalizeLargeEmbedImage);
  return payload;
}

if (!panel.__discordLargeImageWidthPatched) {
  const originalBuildPreviewEmbeds = panel.buildPreviewEmbeds.bind(panel);
  const originalBuildPreviewEmbed = panel.buildPreviewEmbed.bind(panel);
  const originalBuildEmbedFromPanel = panel.buildEmbedFromPanel.bind(panel);

  panel.buildEmbedFromPanel = (...args) => normalizeLargeEmbedImage(originalBuildEmbedFromPanel(...args));
  panel.buildPreviewEmbeds = (...args) => originalBuildPreviewEmbeds(...args).map(normalizeLargeEmbedImage);
  panel.buildPreviewEmbed = (...args) => normalizeLargeEmbedImage(originalBuildPreviewEmbed(...args));
  panel.__discordLargeImageWidthPatched = true;
}

if (!panel.__compactPreviewPatched) {
  function compactPreviewPayload(builder) {
    if (typeof builder !== 'function') return builder;

    return function compactPreviewBuilder(interaction, ...args) {
      const payload = normalizePayloadMedia(builder(interaction, ...args));
      if (!payload || !Array.isArray(payload.embeds) || payload.embeds.length <= 2) return payload;

      const state = typeof panel.getSession === 'function' ? panel.getSession(interaction) : null;
      const selectedIndex = Math.max(0, Number(state?.selectedPanelIndex) || 0);
      const selectedPreview = payload.embeds[selectedIndex + 1] || payload.embeds[1];

      return {
        ...payload,
        embeds: selectedPreview ? [payload.embeds[0], selectedPreview] : [payload.embeds[0]],
      };
    };
  }

  panel.buildEditorPanel = compactPreviewPayload(panel.buildEditorPanel);
  panel.buildBuilderPanel = compactPreviewPayload(panel.buildBuilderPanel);
  panel.buildPanelsPanel = compactPreviewPayload(panel.buildPanelsPanel);

  panel.__compactPreviewPatched = true;
}

module.exports = panel;
