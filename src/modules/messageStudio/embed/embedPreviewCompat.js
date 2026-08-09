'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Real sends/tests/updates still use the full panel list.
//
// Discord sizes an embed from its rendered body content. Footer whitespace and
// zero-width-style glyphs are not reliable width anchors. Use preserved figure
// spaces in the description so narrow/image-heavy panels occupy the same width
// as panels containing naturally long text, without changing visible content.
const panel = require('./embedPanel');

const WIDTH_GLYPH = '\u2007';
const WIDTH_GLYPH_COUNT = 64;
const WIDTH_MARKER = WIDTH_GLYPH.repeat(WIDTH_GLYPH_COUNT);
const MAX_DESCRIPTION = 4096;

function stripWidthMarker(value) {
  return String(value || '')
    .replace(new RegExp(`\\n?${WIDTH_GLYPH}{${WIDTH_GLYPH_COUNT},}$`, 'u'), '')
    .replace(/[ \u00A0\u2007\u2009\u200A\u200B\u2800]+$/gu, '');
}

function normalizeDescriptionWidth(embed) {
  if (!embed || typeof embed.toJSON !== 'function' || typeof embed.setDescription !== 'function') return embed;

  const data = embed.toJSON();
  const original = stripWidthMarker(data?.description || '');
  const separator = original ? '\n' : '';
  const available = Math.max(0, MAX_DESCRIPTION - separator.length - WIDTH_MARKER.length);
  const base = original.slice(0, available);
  embed.setDescription(`${base}${base ? '\n' : ''}${WIDTH_MARKER}`);
  return embed;
}

function normalizePayloadWidth(payload) {
  if (!payload || !Array.isArray(payload.embeds)) return payload;
  payload.embeds.forEach(normalizeDescriptionWidth);
  return payload;
}

if (!panel.__descriptionWidthPatched) {
  const originalBuildPreviewEmbeds = panel.buildPreviewEmbeds.bind(panel);
  const originalBuildPreviewEmbed = panel.buildPreviewEmbed.bind(panel);
  const originalBuildEmbedFromPanel = panel.buildEmbedFromPanel.bind(panel);

  panel.buildEmbedFromPanel = (...args) => normalizeDescriptionWidth(originalBuildEmbedFromPanel(...args));
  panel.buildPreviewEmbeds = (...args) => originalBuildPreviewEmbeds(...args).map(normalizeDescriptionWidth);
  panel.buildPreviewEmbed = (...args) => normalizeDescriptionWidth(originalBuildPreviewEmbed(...args));
  panel.__descriptionWidthPatched = true;
}

if (!panel.__compactPreviewPatched) {
  function compactPreviewPayload(builder) {
    if (typeof builder !== 'function') return builder;

    return function compactPreviewBuilder(interaction, ...args) {
      const payload = normalizePayloadWidth(builder(interaction, ...args));
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
