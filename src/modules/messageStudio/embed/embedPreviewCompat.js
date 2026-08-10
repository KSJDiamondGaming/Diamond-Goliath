'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Real sends/tests/updates still use the full panel list.
//
// Discord can collapse an embed around a narrow Large Image even when the
// neighbouring panels naturally render at the full embed width. For image
// panels, add a visually blank non-inline field. Discord allocates that field
// across the full embed grid, widening the card itself while leaving the image,
// title and visible copy unchanged.
const panel = require('./embedPanel');

const WIDTH_FIELD_NAME = '\u200B';
const WIDTH_FIELD_VALUE = '\u200B';

function holdImagePanelWidth(embed) {
  if (!embed || typeof embed.toJSON !== 'function' || typeof embed.addFields !== 'function') return embed;

  const data = embed.toJSON();
  if (!data?.image?.url) return embed;

  const fields = Array.isArray(data.fields) ? data.fields : [];
  const alreadyAdded = fields.some((field) =>
    field?.name === WIDTH_FIELD_NAME && field?.value === WIDTH_FIELD_VALUE && field?.inline === false
  );
  if (alreadyAdded) return embed;

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

  panel.buildEmbedFromPanel = (...args) => holdImagePanelWidth(originalBuildEmbedFromPanel(...args));
  panel.buildPreviewEmbed = (...args) => holdImagePanelWidth(originalBuildPreviewEmbed(...args));
  panel.buildPreviewEmbeds = (...args) => originalBuildPreviewEmbeds(...args).map(holdImagePanelWidth);
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
