'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Real sends/tests/updates still use the untouched panel
// builders and are not modified by this compatibility layer.
const { AttachmentBuilder } = require('discord.js');
const panel = require('./embedPanel');

// The width problem shown in Discord is the *setup/editor preview*, not a
// deployed embed payload. Previous width experiments modified the actual embed
// data (fields/title/footer/image processing), which was the wrong layer.
//
// Discord reserves a wider layout when an embed has a thumbnail column. For an
// image-heavy setup preview only, attach a 1x1 transparent PNG as a thumbnail.
// It is visually invisible but causes Discord to reserve the normal wide embed
// grid. The saved panel and the final deployed/test embed remain unchanged.
const PREVIEW_WIDTH_FILE = 'embed-preview-width.png';
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLqWQAAAABJRU5ErkJggg==',
  'base64',
);

function widenSetupPreview(embed) {
  if (!embed || typeof embed.toJSON !== 'function' || typeof embed.setThumbnail !== 'function') {
    return { embed, file: null };
  }

  const data = embed.toJSON();
  if (!data?.image?.url || data?.thumbnail?.url) return { embed, file: null };

  embed.setThumbnail(`attachment://${PREVIEW_WIDTH_FILE}`);
  return {
    embed,
    file: new AttachmentBuilder(TRANSPARENT_PNG, { name: PREVIEW_WIDTH_FILE }),
  };
}

if (!panel.__compactPreviewPatched) {
  function compactPreviewPayload(builder) {
    if (typeof builder !== 'function') return builder;

    return function compactPreviewBuilder(interaction, ...args) {
      const payload = builder(interaction, ...args);
      if (!payload || !Array.isArray(payload.embeds) || payload.embeds.length <= 1) return payload;

      const state = typeof panel.getSession === 'function' ? panel.getSession(interaction) : null;
      const selectedIndex = Math.max(0, Number(state?.selectedPanelIndex) || 0);
      const selectedPreview = payload.embeds[selectedIndex + 1] || payload.embeds[1];
      const widened = widenSetupPreview(selectedPreview);

      return {
        ...payload,
        embeds: widened.embed ? [payload.embeds[0], widened.embed] : [payload.embeds[0]],
        ...(widened.file
          ? { files: [...(Array.isArray(payload.files) ? payload.files : []), widened.file] }
          : {}),
      };
    };
  }

  panel.buildEditorPanel = compactPreviewPayload(panel.buildEditorPanel);
  panel.buildBuilderPanel = compactPreviewPayload(panel.buildBuilderPanel);
  panel.buildPanelsPanel = compactPreviewPayload(panel.buildPanelsPanel);
  panel.__compactPreviewPatched = true;
}

module.exports = panel;
