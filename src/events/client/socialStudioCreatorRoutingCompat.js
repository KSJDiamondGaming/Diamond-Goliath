'use strict';

// Install Social Studio automatic-post routing ahead of the main interaction
// handler without adding another competing interactionCreate listener.

const creatorCompat = require('../../modules/socialStudio/socialAlerts/socialStudioCreatorActionCompat');
const creatorRoutingCompat = require('../../modules/socialStudio/socialAlerts/socialStudioCreatorRoutingCompat');
const creatorRoutingLegacyFix = require('../../modules/socialStudio/socialAlerts/socialStudioCreatorRoutingLegacyFix');
const userChannelRouting = require('../../modules/socialStudio/socialAlerts/socialStudioUserChannelRouting');

creatorRoutingCompat.installStoreCompatibility();
userChannelRouting.installStoreCompatibility();

if (!creatorCompat.__creatorRoutingCompatPatched) {
  const originalHandle = typeof creatorCompat.handle === 'function'
    ? creatorCompat.handle.bind(creatorCompat)
    : async () => false;

  creatorCompat.handle = async function handleWithCreatorRouting(interaction) {
    // The user/content/channel router owns the new usable multi-user flow and
    // must run before the older creator-wide compatibility screens.
    if (await userChannelRouting.handle(interaction)) return true;
    if (await creatorRoutingLegacyFix.handle(interaction)) return true;
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
