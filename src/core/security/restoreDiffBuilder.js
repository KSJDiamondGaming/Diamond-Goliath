'use strict';

// Compatibility bridge while restore callers are migrated into the consolidated
// security/restoreBackup subsystem. Keep legacy imports working without
// maintaining a second copy of the restore diff/risk implementation.
module.exports = require('../systems/security/restoreBackup/diff');
