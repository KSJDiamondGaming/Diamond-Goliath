'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Real sends/tests/updates still use the full panel list.
//
// Discord's embed width is driven by its internal layout grid. Large images can
// make an otherwise normal panel collapse narrower than neighbouring embeds.
// For image-bearing panels, append a visually blank non-inline field. Both the
// field name and value use measurable Hangul filler glyphs so Discord has a
// stronger real layout width to hold, while the field still appears blank.
const panel = require('./embedPanel');

const WIDTH_FIELD_GLYPH = '\u3164';
const WIDTH_FIELD_NAME = WIDTH_FIELD_GLYPH.repeat(12);
const WIDTH_FIELD_VALUE = WIDTH_FIELD_GLYPH.repeat(96);

function isWidthField(field) {
  return typeof field?.name === 'string'
    && /^\u3164+$/u.test(field.name)
    && typeof field?.value === 'string'
    && /^\u3164+$/u.test(field.value)
    && field?.inline === false;
}

function holdImagePanelOpen(embed) {
  if (!embed || typeof embed.toJSON !== 'function' || typeof embed.addFields !== 'function') return embed;

  const data = embed.toJSON();
  if (!data?.image?.url) return embed;

  const fields = Array.isArray(data.fields) ? data.fields : [];

  // Remove older compatibility width fields so the current stronger anchor is
  // always the one Discord measures in this runtime.
  const realFields = fields.filter((field) => !(
    (field?.name === '\u200B' && field?.value === '\u200B' && field?.inline === false)
    || isWidthField(field)
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
