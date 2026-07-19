'use strict';

const modulePanels = require('../../core/admin/functions/moduleAdminPanels');

const moduleEntry = modulePanels.SERVER_MODULES.find((entry) => entry[0] === 'admin:reactionRoles');
if (moduleEntry) {
  moduleEntry[1] = '🛡️ Role Studio';
  moduleEntry[2] = 'Role Studio';
  moduleEntry[3] = 'Auto roles, reaction roles, tenure milestones and temporary role assignments.';
}

if (modulePanels.MODULE_PANEL_REGISTRY?.reactionRoles) {
  modulePanels.MODULE_PANEL_REGISTRY.reactionRoles.title = '🛡️ Role Studio';
  modulePanels.MODULE_PANEL_REGISTRY.reactionRoles.summary = 'Manage auto roles, reaction roles, tenure milestones and temporary roles.';
}

module.exports = modulePanels;