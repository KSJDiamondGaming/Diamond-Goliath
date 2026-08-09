'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Real sends/tests/updates still use the full panel list.
// Discord collapses ordinary trailing spaces, so use the preserved U+2800
// Braille blank to keep narrow embeds at a consistent visual width.
const panel = require('./embedPanel');

const WIDTH_GLYPH = '\u2800';
const TARGET_FOOTER_WIDTH = 64;

function forceEmbedWidth(embed) {
  if (!embed || typeof embed.toJSON !== 'function' || typeof embed.setFooter !== 'function') return embed;

  const data = embed.toJSON();
  const footer = data?.footer || {};
  const footerBase = String(footer.text || '')
    .replace(/[\s\u200B\u2800]+$/gu, '')
    .slice(0, 1900);
  const padding = WIDTH_GLYPH.repeat(Math.max(1, TARGET_FOOTER_WIDTH - [...footerBase].length));

  embed.setFooter({
    text: `${footerBase}${padding}`,
    ...(footer.icon_url ? { iconURL: footer.icon_url } : {}),
  });

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
