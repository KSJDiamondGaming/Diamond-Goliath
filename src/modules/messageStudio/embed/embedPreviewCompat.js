'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Deployed/test/update payloads still use the real panel
// builders and the deployment media-normalization path.
const panel = require('./embedPanel');

// Use a visually blank but non-breaking run in the description so Discord has
// one real, unwrappable text-layout span to measure against. This exists only
// in the outgoing built embed and is never saved back into the user's preset.
const WIDTH_GLYPH = '\u2800';
const WORD_JOINER = '\u2060';
const DEPLOYED_WIDTH_ANCHOR = Array.from({ length: 42 }, () => `${WIDTH_GLYPH}${WORD_JOINER}`).join('');

function holdDeployedImagePanelWidth(embed) {
  if (!embed || typeof embed.toJSON !== 'function' || typeof embed.setDescription !== 'function') return embed;

  const data = embed.toJSON();
  if (!data?.image?.url) return embed;

  const description = String(data.description || '');
  // Keep the user's real text unchanged; append one blank-looking, unbreakable
  // measurement line only to the deployed/test/update payload.
  embed.setDescription(`${description}${description ? '\n' : ''}${DEPLOYED_WIDTH_ANCHOR}`);
  return embed;
}

if (!panel.__deployedImageWidthPatched) {
  const originalBuildPreviewEmbeds = panel.buildPreviewEmbeds.bind(panel);
  panel.buildPreviewEmbeds = (...args) =>
    originalBuildPreviewEmbeds(...args).map(holdDeployedImagePanelWidth);
  panel.__deployedImageWidthPatched = true;
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
