'use strict';

// Backwards-compatible bridge for moderation modules that still import the
// former feature-layer punishment engine path. The canonical implementation
// now lives in src/core/automod/punishmentEngine.js.
module.exports = require('../../../core/automod/punishmentEngine');
