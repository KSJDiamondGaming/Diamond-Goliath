'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Real sends/tests/updates still use the full panel list.
const panel = require('./embedPanel');

// embedPanel already pads every footer to a fixed width, but it uses ordinary
// spaces. Discord collapses those spaces, so short/image-heavy panels can shrink
// while neighbouring panels stay wider. Rebuild that footer padding with NBSPs
// so Discord preserves the intended width without changing visible content.
//
// 164 characters was still only holding portrait-image panels at roughly the
// narrow width shown in Discord. Increase the preserved width anchor so image
// panels reach the same practical card width as neighbouring text panels.
const FOOTER_WIDTH = 240;
const NBSP = '\u00A0';
const ZWSP = '\u200B';

function normalizeFooterWidth(embed) {
  if (!embed || typeof embed.toJSON !== 'function' || typeof embed.setFooter !== 'function') return embed;

  const data = embed.toJSON();
  if (!data?.footer) return embed;

  const current = String(data.footer.text || '');
  const base = current.replace(/[ \u00A0\u2003\u2007\u2009\u200A\u200B\u2800]+$/gu, '');
  const visibleLength = Array.from(base).length;
  const padLength = Math.max(1, FOOTER_WIDTH - visibleLength);

  embed.setFooter({
    text: `${base}${NBSP.repeat(padLength)}${ZWSP}`,
    ...(data.footer.icon_url ? { iconURL: data.footer.icon_url } : {}),
  });

  return embed;
}

if (!panel.__preservedFooterWidthPatched) {
  const originalBuildEmbedFromPanel = panel.buildEmbedFromPanel.bind(panel);
  const originalBuildPreviewEmbed = panel.buildPreviewEmbed.bind(panel);
  const originalBuildPreviewEmbeds = panel.buildPreviewEmbeds.bind(panel);

  panel.buildEmbedFromPanel = (...args) => normalizeFooterWidth(originalBuildEmbedFromPanel(...args));
  panel.buildPreviewEmbed = (...args) => normalizeFooterWidth(originalBuildPreviewEmbed(...args));
  panel.buildPreviewEmbeds = (...args) => originalBuildPreviewEmbeds(...args).map(normalizeFooterWidth);
  panel.__preservedFooterWidthPatched = true;
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
