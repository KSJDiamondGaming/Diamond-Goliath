'use strict';

// Compatibility bootstrap for the Social Studio diagnostics Send Test button.
// The generic panel currently reaches its automation fallback before the
// diagnostics handler for social:test, so install a narrow first-refusal route
// on the already-central Social Studio compatibility handler.

const creatorCompat = require('../../modules/socialStudio/socialAlerts/socialStudioCreatorActionCompat');
const testCompat = require('../../modules/socialStudio/socialAlerts/socialStudioTestCompat');

if (!creatorCompat.__testCompatPatched) {
  const originalHandle = typeof creatorCompat.handle === 'function'
    ? creatorCompat.handle.bind(creatorCompat)
    : async () => false;

  creatorCompat.handle = async function handleWithSocialTest(interaction) {
    if (await testCompat.handle(interaction)) return true;
    return originalHandle(interaction);
  };

  creatorCompat.__testCompatPatched = true;
}

module.exports = {
  name: 'clientReady',
  once: true,
  async execute() {
    // Loading this module installs the route before interactions are handled.
  },
};
