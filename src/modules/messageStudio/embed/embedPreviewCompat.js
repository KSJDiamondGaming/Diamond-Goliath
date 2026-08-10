'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Deployed/test/update payloads still use the real panel
// builders and the deployment media-normalization path.
const panel = require('./embedPanel');

const DEPLOYED_WIDTH_PAD = '\u00A0'.repeat(240);

function holdDeployedImagePanelWidth(embed) {
  if (!embed || typeof embed.toJSON !== 'function' || typeof embed.setFooter !== 'function') return embed;

  const data = embed.toJSON();
  if (!data?.image?.url) return embed;

  // Discord caps the visual Large Image area around ~400px, so widening the
  // raster alone cannot make the outer embed match a normal ~520px text card.
  // A preserved non-breaking-space run in the footer gives the embed a real
  // text-layout width anchor while remaining visually blank.
  const footer = data.footer || {};
  const existingText = String(footer.text || '')
    .replace(/[ \u00A0\u200B]+$/g, '')
    .trimEnd();

  embed.setFooter({
    text: `${existingText}${DEPLOYED_WIDTH_PAD}` || DEPLOYED_WIDTH_PAD,
    ...(footer.icon_url ? { iconURL: footer.icon_url } : {}),
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
