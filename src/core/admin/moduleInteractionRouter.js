'use strict';

// src/modules/admin/moduleInteractionRouter.js

const MODULE_INTERACTIONS = {
  autoRoles: ['admin:autoRoles', 'autoRoles:refresh'],
  verification: ['admin:verification', 'verification:refresh'],
  giveaways: ['admin:giveaways', 'giveaway:refresh'],
  starboard: ['admin:starboard', 'starboard:refresh'],
  tempVoice: ['admin:tempvoice', 'tempvoice:refresh'],
  sticky: ['admin:sticky'],
  suggestions: ['admin:suggestions', 'suggestions:refresh', 'suggestions:pending'],
};

const CUSTOM_ID_TO_MODULE = Object.entries(MODULE_INTERACTIONS).reduce((map, [moduleKey, customIds]) => {
  for (const customId of customIds) {
    map[customId] = moduleKey;
  }
  return map;
}, {});

function resolveAdminModuleKey(customId) {
  return CUSTOM_ID_TO_MODULE[String(customId || '')] || null;
}

function isRegisteredAdminModuleInteraction(customId) {
  return Boolean(resolveAdminModuleKey(customId));
}

function listModuleInteractionIds() {
  return Object.keys(CUSTOM_ID_TO_MODULE);
}

module.exports = {
  MODULE_INTERACTIONS,
  CUSTOM_ID_TO_MODULE,
  resolveAdminModuleKey,
  isRegisteredAdminModuleInteraction,
  listModuleInteractionIds,
};
