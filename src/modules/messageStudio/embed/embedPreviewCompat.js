'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Deployed/test/update payloads still use the real panel
// builders and the deployment media-normalization path.
const panel = require('./embedPanel');
const { persistPresetMedia } = require('./embedAssetStore');

function queuePersistentMediaImport(presetLike) {
  // Runtime storage is deployment-local and durable. Asset identity is derived
  // from the source attachment path rather than Discord's expiring signature.
  persistPresetMedia('global', presetLike).then((results) => {
    const failed = results.filter((result) => !result.ok);
    if (failed.length) {
      console.warn(
        '[EmbedAssets] persistence import failed:',
        failed.map((result) => ({
          url: String(result.url).slice(0, 120),
          error: result.error,
        })),
      );
    }
  }).catch((error) => {
    console.warn('[EmbedAssets] persistence import failed:', error?.message || error);
  });
}

// Import media as soon as it is edited or serialized into a preset so saved
// presets remain usable after the original signed Discord URL expires.
if (!panel.__persistentMediaPatched && typeof panel.saveSelected === 'function') {
  const originalSaveSelected = panel.saveSelected.bind(panel);
  panel.saveSelected = (state, patch = {}) => {
    const result = originalSaveSelected(state, patch);
    if (['image', 'thumbnail', 'authorIcon', 'footerIcon'].some((key) => patch && patch[key])) {
      queuePersistentMediaImport({ panels: [patch] });
    }
    return result;
  };

  if (typeof panel.presetData === 'function') {
    const originalPresetData = panel.presetData.bind(panel);
    panel.presetData = (state) => {
      const preset = originalPresetData(state);
      queuePersistentMediaImport(preset);
      return preset;
    };
  }

  panel.__persistentMediaPatched = true;
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
