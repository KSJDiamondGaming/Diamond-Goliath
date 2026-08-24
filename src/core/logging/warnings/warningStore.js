'use strict';

const storage = require('../../systems/mod/storage');

module.exports = {
  addWarning: storage.addWarning,
  getWarningById: storage.getWarningById,
  getWarningsForUser: storage.getWarningsForUser,
  getWarningCountForUser: storage.getWarningCountForUser,
  getWarningByCaseId: storage.getWarningByCaseId,
  deleteWarningByCaseId: storage.deleteWarningByCaseId,
  purgeExpiredWarnings: storage.purgeExpiredWarnings,
};
