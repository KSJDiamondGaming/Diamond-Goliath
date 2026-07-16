'use strict';

/**
 * Temporary startup compatibility for server.js.
 *
 * Runtime ownership has moved to:
 * - src/modules/reactionroles/reactionRoles.js
 * - src/modules/reactionroles/reactionRolesLegacyButtons.js
 * - src/modules/timedroles/timedRoles.js
 *
 * Remove this shim when the obsolete Roles startup entry is removed from server.js.
 */
async function initializeRoles() {
  return {
    deprecated: true,
    runtimeMovedToCanonicalModules: true,
  };
}

module.exports = { initializeRoles };
