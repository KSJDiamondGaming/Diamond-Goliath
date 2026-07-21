'use strict';

// Legacy compatibility shim.
//
// Older consolidated Reaction Roles builds still require this path during
// module initialisation. Admin module registration and shared navigation are
// now owned by core/admin/functions/moduleAdminPanels.js and
// core/admin/functions/adminModuleRuntimePatch.js, so this file intentionally
// performs no mutation and exports no alternate registry.
module.exports = Object.freeze({});
