'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Real sends/tests/updates still use the full panel list.
const panel = require('./embedPanel');

// Discord can collapse an embed around a narrow Large Image even when the
// neighbouring panels naturally render at the full embed width. For image
// panels that already have a title, extend that existing title with preserved
// non-breaking spaces. They are visually blank, stay on the same title line,
// and give Discord a real, non-collapsible width anchor without adding a field,
// changing the body copy, moving the timestamp, or touching the image itself.
const WIDTH_SPACE = '\u00A0';
const TITLE_WIDTH_PAD = WIDTH_SPACE.repeat(72);

function holdImagePanelWidth(embed) {
  if (!embed || typeof embed.toJSON !== 'function' || typeof embed.setTitle !== 'function') return embed;

  const data = embed.toJSON();
  if (!data?.image?.url || !data?.title) return embed;

  const cleanTitle = String(data.title).replace(/\u00A0+$/u, '');
  const maxPad = Math.max(0, 256 - cleanTitle.length);
  const pad = TITLE_WIDTH_PAD.slice(0, maxPad);
  embed.setTitle(`${cleanTitle}${pad}`);
  return embed;
}

if (!panel.__imageTitleWidthPatched) {
  const originalBuildEmbedFromPanel = panel.buildEmbedFromPanel.bind(panel);
  const originalBuildPreviewEmbed = panel.buildPreviewEmbed.bind(panel);
  const originalBuildPreviewEmbeds = panel.buildPreviewEmbeds.bind(panel);

  panel.buildEmbedFromPanel = (...args) => holdImagePanelWidth(originalBuildEmbedFromPanel(...args));
  panel.buildPreviewEmbed = (...args) => holdImagePanelWidth(originalBuildPreviewEmbed(...args));
  panel.buildPreviewEmbeds = (...args) => originalBuildPreviewEmbeds(...args).map(holdImagePanelWidth);
  panel.__imageTitleWidthPatched = true;
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
