'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Real sends/tests/updates still use the full panel list.
const panel = require('./embedPanel');

// Discord is ignoring width hints placed in the image raster, title, footer and
// description. Move the width anchor into the embed field grid instead. A
// non-inline field participates in Discord's full embed layout, while U+3164 is
// visually blank but still measurable text.
const WIDTH_GLYPH = '\u3164';
const WIDTH_FIELD_NAME = WIDTH_GLYPH;
const WIDTH_FIELD_VALUE = WIDTH_GLYPH.repeat(64);

function isWidthField(field) {
  return field?.name === WIDTH_FIELD_NAME && field?.value === WIDTH_FIELD_VALUE && field?.inline === false;
}

function holdImageEmbedWidth(embed) {
  if (!embed || typeof embed.toJSON !== 'function' || typeof embed.addFields !== 'function') return embed;

  const data = embed.toJSON();
  if (!data?.image?.url) return embed;

  const fields = Array.isArray(data.fields) ? data.fields : [];
  if (fields.some(isWidthField)) return embed;

  // Discord allows at most 25 fields. Only add the width probe where there is
  // capacity; normal content is never removed or altered.
  if (fields.length < 25) {
    embed.addFields({
      name: WIDTH_FIELD_NAME,
      value: WIDTH_FIELD_VALUE,
      inline: false,
    });
  }

  return embed;
}

if (!panel.__imageFieldWidthPatched) {
  const originalBuildEmbedFromPanel = panel.buildEmbedFromPanel.bind(panel);
  const originalBuildPreviewEmbed = panel.buildPreviewEmbed.bind(panel);
  const originalBuildPreviewEmbeds = panel.buildPreviewEmbeds.bind(panel);

  panel.buildEmbedFromPanel = (...args) => holdImageEmbedWidth(originalBuildEmbedFromPanel(...args));
  panel.buildPreviewEmbed = (...args) => holdImageEmbedWidth(originalBuildPreviewEmbed(...args));
  panel.buildPreviewEmbeds = (...args) => originalBuildPreviewEmbeds(...args).map(holdImageEmbedWidth);
  panel.__imageFieldWidthPatched = true;
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
