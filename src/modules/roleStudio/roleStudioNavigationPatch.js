'use strict';

const modulePanels = require('../../core/admin/functions/moduleAdminPanels');

// Keep the Admin module menu focused on real top-level studios and modules.
// Child role systems are intentionally available only through Role Studio.
const TOP_LEVEL_MODULE_ROUTES = new Set([
  'admin:embed',
  'admin:goodbye',
  'admin:invites',
  'admin:polls',
  'admin:reactionRoles',
  'admin:social',
  'admin:verification',
  'admin:welcome',
]);

for (let index = modulePanels.SERVER_MODULES.length - 1; index >= 0; index -= 1) {
  const route = modulePanels.SERVER_MODULES[index][0];
  if (!TOP_LEVEL_MODULE_ROUTES.has(route)) {
    modulePanels.SERVER_MODULES.splice(index, 1);
  }
}

const moduleEntry = modulePanels.SERVER_MODULES.find(
  (entry) => entry[0] === 'admin:reactionRoles'
);

if (moduleEntry) {
  moduleEntry[1] = '🛡️ Role Studio';
  moduleEntry[2] = 'Role Studio';
  moduleEntry[3] =
    'Manage Auto Roles, Reaction Roles, Timed Roles and Temporary Roles in one place.';
}

modulePanels.SERVER_MODULES.sort((a, b) => a[2].localeCompare(b[2]));

if (modulePanels.MODULE_PANEL_REGISTRY?.reactionRoles) {
  modulePanels.MODULE_PANEL_REGISTRY.reactionRoles.title = '🛡️ Role Studio';
  modulePanels.MODULE_PANEL_REGISTRY.reactionRoles.summary =
    'Manage Auto Roles, Reaction Roles, Timed Roles and Temporary Roles in one place.';
}

module.exports = modulePanels;
