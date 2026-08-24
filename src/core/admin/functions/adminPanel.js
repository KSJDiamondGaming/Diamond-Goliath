'use strict';

const adminPanel = require('../../systems/admin/panel');
const automodPanel = require('../../systems/automod/panel');

async function handleAdminNavigation(interaction) {
  if (await automodPanel.handleAutomodInteraction(interaction)) return true;
  return adminPanel.handleAdminNavigation(interaction);
}

module.exports = {
  ...adminPanel,
  buildAutomodPanel: automodPanel.buildAutomodPanel,
  buildAutomodConfigurePanel: automodPanel.buildAutomodConfigurePanel,
  buildAutomodRulePanel: automodPanel.buildAutomodRulePanel,
  handleAdminNavigation,
};
