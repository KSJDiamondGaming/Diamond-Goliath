'use strict';

// Experiment branch shim: keep the original handler intact in
// embedInteractionsLegacy.js and route only selected deploy actions through
// the Components V2 experiment wrapper.
module.exports = require('./embedInteractionsExperiment');
