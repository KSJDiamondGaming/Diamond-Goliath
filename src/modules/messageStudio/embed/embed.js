'use strict';

const templates = require('./embedTemplates');
const deployments = require('./embedDeployments');
const panel = require('./embedPanel');
const media = require('./embedMedia');

function installMediaBoundary(targetPanel) {
  media.installStateCompatibility(targetPanel);
  media.installPersistentMediaCompatibility(targetPanel);
  media.installStorageNormalization(targetPanel);
  media.installUploadModals(targetPanel);
  media.installMediaOptionsUi(targetPanel);
  media.installMediaManagerUi(targetPanel);
  media.installThumbnailUi(targetPanel);
  targetPanel.getPanelMedia = media.getPanelMedia;
  targetPanel.setPanelMedia = media.setPanelMedia;
  targetPanel.mediaModel = media.mediaModel;
  return targetPanel;
}

installMediaBoundary(panel);

const interactions = require('./embedInteractions');
panel.handleButtonAction = interactions.handleButtonAction;
panel.EMBED_BUTTON_ACTIONS = deployments.EMBED_BUTTON_ACTIONS;

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
  installMediaBoundary,
  templates,
  deployments,
  panel,
  media,
  interactions,
  tracking: deployments,
  validation,
  health: validation,
};