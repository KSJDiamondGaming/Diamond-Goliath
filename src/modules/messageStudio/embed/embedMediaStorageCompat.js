'use strict';

const panel = require('./embedPreviewCompat');

function clone(value, fallback = null) {
  try { return JSON.parse(JSON.stringify(value ?? fallback)); } catch { return fallback; }
}

if (!panel.__neutralMediaStoragePatched) {
  if (typeof panel.presetData === 'function') {
    const originalPresetData = panel.presetData.bind(panel);
    panel.presetData = (state) => {
      const preset = originalPresetData(state) || {};
      const media = clone(preset.media || preset.mediaV2 || state?.media || state?.mediaV2, null);
      const output = { ...preset };
      delete output.mediaV2;
      if (media) output.media = media;
      return output;
    };
  }

  if (typeof panel.applyPreset === 'function') {
    const originalApplyPreset = panel.applyPreset.bind(panel);
    panel.applyPreset = (interaction, name, preset = {}) => {
      const source = preset?.media || preset?.mediaV2 || null;
      const compatiblePreset = source ? { ...preset, mediaV2: clone(source) } : preset;
      const result = originalApplyPreset(interaction, name, compatiblePreset);
      if (!result || typeof result !== 'object') return result;
      const output = { ...result };
      if (source) output.media = clone(source);
      return output;
    };
  }

  panel.__neutralMediaStoragePatched = true;
}

module.exports = panel;
