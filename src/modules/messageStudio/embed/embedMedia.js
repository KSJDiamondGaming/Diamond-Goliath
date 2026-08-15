'use strict';

const mediaModel = require('./embedMediaModel');

function getPanelMedia(stateValue, index = null) {
  return mediaModel.mediaForPanel(stateValue, index);
}

function setPanelMedia(stateValue, index, media) {
  return mediaModel.setPanelMedia(stateValue, index, media);
}

function normalizeThumbnail(value) {
  return mediaModel.normalizeThumbnail(value);
}

function ensureStateMedia(stateValue) {
  return mediaModel.ensureStateMedia(stateValue);
}

function reconcileMediaByPanels(previousState, nextState) {
  return mediaModel.reconcileMediaByPanels(previousState, nextState);
}

function syncLegacyPatch(stateValue, patch = {}) {
  return mediaModel.syncLegacyPatch(stateValue, patch);
}

module.exports = {
  ...mediaModel,
  mediaModel,
  getPanelMedia,
  setPanelMedia,
  normalizeThumbnail,
  ensureStateMedia,
  reconcileMediaByPanels,
  syncLegacyPatch,
};
