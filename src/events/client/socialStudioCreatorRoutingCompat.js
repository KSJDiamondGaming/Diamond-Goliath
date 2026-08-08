'use strict';

// Install creator-level automatic-post routing ahead of the main Social Studio
// interaction handler. This follows the same compatibility pattern used by the
// role-hierarchy and diagnostics fixes so we do not add a second competing
// interactionCreate listener.

const creatorCompat = require('../../modules/socialStudio/socialAlerts/socialStudioCreatorActionCompat');
const creatorRoutingCompat = require('../../modules/socialStudio/socialAlerts/socialStudioCreatorRoutingCompat');

creatorRoutingCompat.installStoreCompatibility();

if (!creatorCompat.__creatorRoutingCompatPatched) {
  const originalHandle = typeof creatorCompat.handle === 'function'
    ? creatorCompat.handle.bind(creatorCompat)
    : async () => false;

  creatorCompat.handle = async function handleWithCreatorRouting(interaction) {
    if (await creatorRoutingCompat.handle(interaction)) return true;
    return originalHandle(interaction);
  };

  creatorCompat.__creatorRoutingCompatPatched = true;
}

module.exports = {
  name: 'clientReady',
  once: true,
  async execute() {
    // Loading this file installs the compatibility wrappers above.
  },
};
