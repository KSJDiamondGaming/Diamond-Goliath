'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Real sends/tests/updates still use the full panel list.
// Discord does not reliably size embeds from footer padding, so width is held
// by an invisible U+2800 line in the description itself.
const panel = require('./embedPanel');

const WIDTH_GLYPH = '\u2800';
const WIDTH_MARKER = WIDTH_GLYPH.repeat(52);

function forceEmbedWidth(embed) {
  if (!embed || typeof embed.toJSON !== 'function' || typeof embed.setDescription !== 'function') return embed;

  const data = embed.toJSON();
  const description = String(data?.description || '');
  const cleanDescription = description
    .replace(new RegExp(`\\n?${WIDTH_GLYPH}+$`, 'u'), '')
    .replace(/\s+$/u, '');

  // Description content participates in Discord's embed width calculation;
  // footer whitespace does not. Keep the marker invisible on its own line.
  const widthDescription = cleanDescription
    ? `${cleanDescription}\n${WIDTH_MARKER}`
    : WIDTH_MARKER;

  embed.setDescription(widthDescription.slice(0, 4096));
  return embed;
}

function forcePayloadWidth(payload) {
  if (!payload || !Array.isArray(payload.embeds)) return payload;
  payload.embeds.forEach(forceEmbedWidth);
  return payload;
}

if (!panel.__consistentWidthPatched) {
  const originalBuildPreviewEmbeds = panel.buildPreviewEmbeds.bind(panel);
  const originalBuildPreviewEmbed = panel.buildPreviewEmbed.bind(panel);
  const originalBuildEmbedFromPanel = panel.buildEmbedFromPanel.bind(panel);

  panel.buildEmbedFromPanel = (...args) => forceEmbedWidth(originalBuildEmbedFromPanel(...args));
  panel.buildPreviewEmbeds = (...args) => originalBuildPreviewEmbeds(...args).map(forceEmbedWidth);
  panel.buildPreviewEmbed = (...args) => forceEmbedWidth(originalBuildPreviewEmbed(...args));
  panel.__consistentWidthPatched = true;
}

if (!panel.__compactPreviewPatched) {
  function compactPreviewPayload(builder) {
    if (typeof builder !== 'function') return builder;

    return function compactPreviewBuilder(interaction, ...args) {
      const payload = forcePayloadWidth(builder(interaction, ...args));
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
