'use strict';

// Legacy compatibility entrypoint retained for callers that still reference it.
// Creator-channel routing is canonically owned by socialStudioCreatorRoutingCompat.

const creatorRouting = require('./socialStudioCreatorRoutingCompat');

async function handle(interaction) {
  return creatorRouting.handle(interaction);
}

module.exports = { handle };
