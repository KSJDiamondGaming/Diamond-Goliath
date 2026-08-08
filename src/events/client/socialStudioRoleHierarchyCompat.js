'use strict';

// Compatibility bootstrap for Social Studio permission-role menus.
//
// The main interaction router already calls socialStudioCreatorActionCompat.handle().
// Patch that shared module export once at load time so the hierarchy-aware
// permission handler gets first refusal without adding a second competing
// interactionCreate listener.

const creatorCompat = require('../../modules/socialStudio/socialAlerts/socialStudioCreatorActionCompat');
const roleHierarchyCompat = require('../../modules/socialStudio/socialAlerts/socialStudioRoleHierarchyCompat');

if (!creatorCompat.__roleHierarchyCompatPatched) {
  const originalHandle = typeof creatorCompat.handle === 'function'
    ? creatorCompat.handle.bind(creatorCompat)
    : async () => false;

  creatorCompat.handle = async function handleWithRoleHierarchy(interaction) {
    if (await roleHierarchyCompat.handle(interaction)) return true;
    return originalHandle(interaction);
  };

  creatorCompat.__roleHierarchyCompatPatched = true;
}

module.exports = {
  name: 'clientReady',
  once: true,
  async execute() {
    // No runtime work is required. Loading this event installs the compatibility
    // wrapper above before permission interactions are handled.
  },
};
