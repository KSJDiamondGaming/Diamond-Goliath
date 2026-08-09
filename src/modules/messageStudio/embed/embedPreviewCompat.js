'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Real sends/tests/updates still use the full panel list.
//
// Discord does not size an embed from transparent image padding. For panels
// with a Large Image, add a visually blank Hangul Filler line to the body.
// U+3164 is treated as a real rendered character rather than collapsible
// whitespace, so it can hold the embed at the same width as naturally wide
// text panels without showing a visible separator.
const panel = require('./embedPanel');

const WIDTH_GLYPH = '\u3164';
const WIDTH_MARKER = WIDTH_GLYPH.repeat(42);
const MAX_DESCRIPTION = 4096;

function stripWidthMarker(value) {
  return String(value || '')
    .replace(new RegExp(`\\n?${WIDTH_GLYPH}{20,}$`, 'u'), '')
    .replace(/\n+$/u, '');
}

function holdImageEmbedWidth(embed) {
  if (!embed || typeof embed.toJSON !== 'function' || typeof embed.setDescription !== 'function') return embed;

  const data = embed.toJSON();
  if (!data?.image?.url) return embed;

  const original = stripWidthMarker(data.description || '');
  const separator = original ? '\n' : '';
  const available = Math.max(0, MAX_DESCRIPTION - separator.length - WIDTH_MARKER.length);
  const base = original.slice(0, available);
  embed.setDescription(`${base}${base ? '\n' : ''}${WIDTH_MARKER}`);
  return embed;
}

if (!panel.__imageWidthMarkerPatched) {
  const originalBuildEmbedFromPanel = panel.buildEmbedFromPanel.bind(panel);
  const originalBuildPreviewEmbed = panel.buildPreviewEmbed.bind(panel);
  const originalBuildPreviewEmbeds = panel.buildPreviewEmbeds.bind(panel);

  panel.buildEmbedFromPanel = (...args) => holdImageEmbedWidth(originalBuildEmbedFromPanel(...args));
  panel.buildPreviewEmbed = (...args) => holdImageEmbedWidth(originalBuildPreviewEmbed(...args));
  panel.buildPreviewEmbeds = (...args) => originalBuildPreviewEmbeds(...args).map(holdImageEmbedWidth);
  panel.__imageWidthMarkerPatched = true;
}

if (!panel.__compactPreviewPatched) {
  function compactPreviewPayload(builder) {
    if (typeof builder !== 'function') return builder;

    return function compactPreviewBuilder(interaction, ...args) {
      const payload = builder(interaction, ...args);
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
