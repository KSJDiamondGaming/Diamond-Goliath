'use strict';

const panel = require('./embedPreviewCompat');

function clone(value, fallback = null) {
  try { return JSON.parse(JSON.stringify(value ?? fallback)); } catch { return fallback; }
}

function normalizeState(state) {
  if (!state || typeof state !== 'object') return state;
  const source = state.media || state.mediaV2 || null;
  if (!source) return state;
  return { ...state, media: clone(source), mediaV2: clone(source) };
}

if (!panel.__neutralMediaStoragePatched) {
  if (typeof panel.getSession === 'function') {
    const originalGetSession = panel.getSession.bind(panel);
    panel.getSession = (interaction) => normalizeState(originalGetSession(interaction));
  }

  if (typeof panel.saveSession === 'function') {
    const originalSaveSession = panel.saveSession.bind(panel);
    panel.saveSession = (interaction, state) => originalSaveSession(interaction, normalizeState(state));
  }

  if (typeof panel.presetData === 'function') {
    const originalPresetData = panel.presetData.bind(panel);
    panel.presetData = (state) => {
      const normalized = normalizeState(state);
      const preset = originalPresetData(normalized) || {};
      const media = clone(preset.media || preset.mediaV2 || normalized?.media || normalized?.mediaV2, null);
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
      return normalizeState(source ? { ...result, media: clone(source) } : result);
    };
  }

  panel.__neutralMediaStoragePatched = true;
}

module.exports = panel;
