'use strict';

// Compatibility bridge for the remaining legacy interaction path.
// Canonical media layout/rendering now lives in embedRenderer.js.
const renderer = require('./embedRenderer');

module.exports = {
  TARGET_WIDTH: renderer.LEGACY_TARGET_WIDTH,
  PORTRAIT_VISIBLE_WIDTH: renderer.LEGACY_PORTRAIT_VISIBLE_WIDTH,
  prepareEmbedMedia: renderer.prepareEmbedMedia,
};
