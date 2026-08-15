'use strict';

// Legacy compatibility entrypoint retained until the core import is removed.
// Creator-channel routing is owned by socialStudioCreatorRoutingCompat, which
// the core calls immediately after this compatibility hook.

async function handle() {
  return false;
}

module.exports = { handle };
