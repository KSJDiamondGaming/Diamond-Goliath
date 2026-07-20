'use strict';

// Legacy compatibility entry used by interactionCreate.js.
// Loading the navigation patch first ensures the Admin module menu is
// consolidated before the canonical Role Studio panel handles interactions.
require('../roleStudio/roleStudioNavigationPatch');

module.exports = require('../roleStudio/reactionRoles/reactionRolesPanel');
