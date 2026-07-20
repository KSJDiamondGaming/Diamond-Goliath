'use strict';

// Temporary compatibility bridge for modules moved from src/modules/roleStudio/*
// to src/modules/*. Remove after their relative imports are normalised.
module.exports = require('../../src/core/security/securityCore');
