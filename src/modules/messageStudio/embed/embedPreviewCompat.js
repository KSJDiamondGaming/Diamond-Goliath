'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Real sends/tests/updates still use the full panel list.
const panel = require('./embedPanel');

// Footer/title whitespace is collapsed by Discord and was producing no visible
// width change. Use the earlier rendered Hangul Filler marker instead. U+3164 is
// visually blank but is still a real rendered glyph, so Discord measures it when
// calculating the card width. Apply it only to panels that contain a Large Image.
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
  const available = Math.max(0, MAX_DESCRIPTION - WIDTH_MARKER.length - (original ? 1 : 0));
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
