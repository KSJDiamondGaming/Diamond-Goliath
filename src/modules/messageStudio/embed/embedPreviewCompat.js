'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Deployed/test/update payloads still use the real panel
// builders and the deployment media-normalization path.
const panel = require('./embedPanel');

// Discord stops responding to ever-larger footer padding on image embeds.
// Use a real full-width field row instead, which participates in the embed's
// content grid and should force the card toward the same width as text panels.
const DEPLOYED_WIDTH_FIELD = '\u2800'.repeat(72);

function holdDeployedImagePanelWidth(embed) {
  if (!embed || typeof embed.toJSON !== 'function' || typeof embed.addFields !== 'function') return embed;

  const data = embed.toJSON();
  if (!data?.image?.url) return embed;

  // Leave the footer completely untouched. The extra field exists only in the
  // outgoing built embed; it is not saved back into the user's panel/preset.
  const fields = Array.isArray(data.fields) ? data.fields : [];
  if (fields.length >= 25) return embed;

  embed.addFields({
    name: '\u200B',
    value: DEPLOYED_WIDTH_FIELD,
    inline: false,
  });

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
