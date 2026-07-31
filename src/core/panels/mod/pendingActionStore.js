// Temporary compatibility shim. Pending moderation actions now live in punishments.js.
const {
  createPendingAction,
  getPendingAction,
  deletePendingAction,
} = require('./punishments');

module.exports = {
  createPendingAction,
  getPendingAction,
  deletePendingAction,
};
