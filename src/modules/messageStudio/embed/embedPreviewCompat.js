'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Real sends/tests/updates still use the full panel list.
//
// The canonical embed builder already tries to hold every panel at a consistent
// Discord width by padding the footer to a fixed length, but it uses ordinary
// spaces. Discord collapses those spaces, allowing image/narrow-content panels
// to shrink. Normalize that existing footer padding to non-breaking spaces so
// Discord preserves the intended width without changing visible panel content.
const panel = require('./embedPanel');

const FOOTER_WIDTH = 164;
const NBSP = '\u00A0';
const ZWSP = '\u200B';

function normalizeFooterWidth(embed) {
  if (!embed || typeof embed.toJSON !== 'function' || typeof embed.setFooter !== 'function') return embed;

  const data = embed.toJSON();
  if (!data?.footer) return embed;

  const current = String(data.footer.text || '');
  // Remove the builder's collapsible trailing spaces / previous invisible
  // width markers while preserving the user's actual footer text.
  const base = current.replace(/[ \u00A0\u2007\u2009\u200A\u200B\u2800]+$/gu, '');
  const visibleLength = Array.from(base).length;
  const padLength = Math.max(1, FOOTER_WIDTH - visibleLength);
  const text = `${base}${NBSP.repeat(padLength)}${ZWSP}`;

  embed.setFooter({
    text,
    ...(data.footer.icon_url ? { iconURL: data.footer.icon_url } : {}),
  });

  return embed;
}

function normalizePayloadWidth(payload) {
  if (!payload || !Array.isArray(payload.embeds)) return payload;
  payload.embeds.forEach(normalizeFooterWidth);
  return payload;
}

if (!panel.__preservedFooterWidthPatched) {
  const originalBuildPreviewEmbeds = panel.buildPreviewEmbeds.bind(panel);
  const originalBuildPreviewEmbed = panel.buildPreviewEmbed.bind(panel);
  const originalBuildEmbedFromPanel = panel.buildEmbedFromPanel.bind(panel);

  panel.buildEmbedFromPanel = (...args) => normalizeFooterWidth(originalBuildEmbedFromPanel(...args));
  panel.buildPreviewEmbeds = (...args) => originalBuildPreviewEmbeds(...args).map(normalizeFooterWidth);
  panel.buildPreviewEmbed = (...args) => normalizeFooterWidth(originalBuildPreviewEmbed(...args));
  panel.__preservedFooterWidthPatched = true;
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
