'use strict';

// Compatibility surface: Schedule member interactions and deployments are canonical in scheduleDeployment.js.
// Keep this file so existing imports continue to work without maintaining a second implementation.
module.exports = require('./scheduleDeployment');
