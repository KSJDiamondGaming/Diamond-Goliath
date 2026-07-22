'use strict';

/**
 * Temporary compatibility entry for the legacy module path.
 *
 * Canonical Role Studio and Reaction Roles behaviour lives in:
 *   src/modules/roleStudio/reactionRoles/reactionRolesPanel.js
 *
 * interactionCreate.js still imports this legacy path. Keep the shared Admin
 * shell installation explicit here until that import is repointed, then remove
 * this file and the remaining src/modules/reactionroles directory.
 */
const adminModuleRuntimePatch = require('../../core/admin/functions/adminModuleRuntimePatch');

adminModuleRuntimePatch.install();

module.exports = require('../roleStudio/reactionRoles/reactionRolesPanel');
