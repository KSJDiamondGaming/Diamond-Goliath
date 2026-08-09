'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Real sends/tests/updates still use the full panel list.
//
// Discord's embed width is driven by its internal layout grid. Large images can
// make an otherwise normal panel collapse narrower than neighbouring embeds.
// For image-bearing panels, append a visually blank non-inline field. Unlike a
// zero-width-space-only field, the Hangul filler run below has measurable layout
// width while still appearing blank, so Discord has a real grid width to hold.
const panel = require('./embedPanel');

const WIDTH_FIELD_NAME = '\u200B';
const WIDTH_FIELD_GLYPH = '\u3164';
const WIDTH_FIELD_VALUE = WIDTH_FIELD_GLYPH.repeat(48);

function isWidthField(field) {
  return field?.name === WIDTH_FIELD_NAME
    && typeof field?.value === 'string'
    && /^\u3164+$/u.test(field.value)
    && field?.inline === false;
}

function holdImagePanelOpen(embed) {
  if (!embed || typeof embed.toJSON !== 'function' || typeof embed.addFields !== 'function') return embed;

  const data = embed.toJSON();
  if (!data?.image?.url) return embed;

  const fields = Array.isArray(data.fields) ? data.fields : [];
  if (fields.some(isWidthField)) return embed;

  // Remove the previous zero-width-only compatibility field if this embed was
  // built by an older process in the same runtime, then add the measurable one.
  const realFields = fields.filter((field) => !(
    field?.name === '\u200B'
    && field?.value === '\u200B'
    && field?.inline === false
  ));

  if (realFields.length !== fields.length && typeof embed.setFields === 'function') {
    embed.setFields(realFields);
  }

  embed.addFields({
    name: WIDTH_FIELD_NAME,
    value: WIDTH_FIELD_VALUE,
    inline: false,
  });
  return embed;
}

if (!panel.__imageGridWidthPatched) {
  const originalBuildEmbedFromPanel = panel.buildEmbedFromPanel.bind(panel);
  const originalBuildPreviewEmbed = panel.buildPreviewEmbed.bind(panel);
  const originalBuildPreviewEmbeds = panel.buildPreviewEmbeds.bind(panel);

  panel.buildEmbedFromPanel = (...args) => holdImagePanelOpen(originalBuildEmbedFromPanel(...args));
  panel.buildPreviewEmbed = (...args) => holdImagePanelOpen(originalBuildPreviewEmbed(...args));
  panel.buildPreviewEmbeds = (...args) => originalBuildPreviewEmbeds(...args).map(holdImagePanelOpen);
  panel.__imageGridWidthPatched = true;
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
