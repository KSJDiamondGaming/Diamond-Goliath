// functions/embed/embedDeploymentStore.js

const guildManager = require('../../guild/guildManager');

const EMBED_DEPLOYMENTS_SECTION = 'embedDeployments';

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function refreshGuild(guildId) {
  if (typeof guildManager.reloadGuild === 'function') {
    guildManager.reloadGuild(guildId);
  }
}

function getAllEmbedDeployments(guildId) {
  refreshGuild(guildId);

  const guildData =
    typeof guildManager.getGuildData === 'function'
      ? guildManager.getGuildData(guildId) || {}
      : {};

  return clone(guildData[EMBED_DEPLOYMENTS_SECTION] || {});
}

function getEmbedDeployment(guildId, key) {
  const deployments = getAllEmbedDeployments(guildId);
  return deployments[key] || null;
}

function saveEmbedDeployment(guildId, key, deployment) {
  const deployments = getAllEmbedDeployments(guildId);

  deployments[key] = {
    ...(deployments[key] || {}),
    ...deployment,
    guildId,
    key,
    lastUpdatedAt: new Date().toISOString(),
  };

  if (typeof guildManager.replaceGuildSection === 'function') {
    guildManager.replaceGuildSection(guildId, EMBED_DEPLOYMENTS_SECTION, deployments);
    refreshGuild(guildId);
    return deployments[key];
  }

  return null;
}

function deleteEmbedDeployment(guildId, key) {
  const deployments = getAllEmbedDeployments(guildId);

  if (!deployments[key]) return false;

  delete deployments[key];

  if (typeof guildManager.replaceGuildSection === 'function') {
    guildManager.replaceGuildSection(guildId, EMBED_DEPLOYMENTS_SECTION, deployments);
    refreshGuild(guildId);
    return true;
  }

  return false;
}

function getDeploymentKeyFromState(state) {
  return state.selectedPreset || `auto-${state.template || 'custom'}`;
}

module.exports = {
  EMBED_DEPLOYMENTS_SECTION,
  getAllEmbedDeployments,
  getEmbedDeployment,
  saveEmbedDeployment,
  deleteEmbedDeployment,
  getDeploymentKeyFromState,
};
