'use strict';

const templates = require('./embedTemplates');
const deployments = require('./embedDeployments');
const panel = require('./embedButtonsCompat');
const interactions = require('./embedInteractionsActionsCompat');
const tracking = require('./embedTracking');
const validation = require('./embedValidation');
const health = require('./embedHealth');

function getOverview(guildId) {
  const allTemplates = templates.listTemplates(guildId) || {};
  const allDeployments = Object.values(deployments.getAllEmbedDeployments(guildId) || {});
  return {
    enabled: true,
    templates: { total: Object.keys(allTemplates).length },
    deployments: {
      total: allDeployments.length,
      active: allDeployments.filter((item) => !item.status || item.status === 'active').length,
      unavailable: allDeployments.filter((item) => item.status && item.status !== 'active').length,
    },
  };
}

module.exports = {
  getOverview,
  buildHealthReport: health.buildHealthReport,
  repairAll: health.repairAll,
  handleInteraction: interactions.handleInteraction,
  templates,
  deployments,
  panel,
  interactions,
  tracking,
  validation,
  health,
};
