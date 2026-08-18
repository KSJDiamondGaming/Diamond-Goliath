'use strict';

const templates = require('./embedTemplates');
const deployments = require('./embedDeployments');
const panel = require('./embedPanel');
const media = require('./embedMedia');

media.installStateCompatibility(panel);
media.installPersistentMediaCompatibility(panel);
media.installStorageNormalization(panel);
media.installUploadModals(panel);
media.installMediaOptionsUi(panel);
media.installMediaManagerUi(panel);
media.installThumbnailUi(panel);

const interactions = require('./embedInteractions');
const validation = require('./embedValidation');

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
  buildHealthReport: validation.buildHealthReport,
  repairAll: validation.repairAll,
  handleInteraction: interactions.handleInteraction,
  templates,
  deployments,
  panel,
  media,
  interactions,
  tracking: deployments,
  validation,
  health: validation,
};
