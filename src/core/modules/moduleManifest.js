'use strict';

const {
  MODULE_MATURITY,
  createCapabilityMap,
} = require('./moduleStandard');

const completeVerification = createCapabilityMap({
  guildStorage: true,
  runtime: true,
  adminPanel: true,
  dashboard: true,
  api: true,
  health: true,
  startupRecovery: true,
  export: true,
  reset: true,
  tests: true,
  doctor: true,
  documentation: true,
});

const loggingCapabilities = createCapabilityMap({
  guildStorage: true,
});

const moduleManifest = Object.freeze({
  verification: {
    key: 'verification',
    name: 'Verification',
    maturity: MODULE_MATURITY.COMPLETE,
    capabilities: completeVerification,
  },
  logging: {
    key: 'logging',
    name: 'Logging',
    maturity: MODULE_MATURITY.IN_PROGRESS,
    capabilities: loggingCapabilities,
  },
  autoRoles: { key: 'autoRoles', name: 'Auto Roles', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
  forms: { key: 'forms', name: 'Forms', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
  giveaways: { key: 'giveaways', name: 'Giveaways', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
  leveling: { key: 'leveling', name: 'Leveling', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
  polls: { key: 'polls', name: 'Polls', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
  reactionRoles: { key: 'reactionRoles', name: 'Reaction Roles', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
  social: { key: 'social', name: 'Social Alerts', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
  starboard: { key: 'starboard', name: 'Starboard', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
  stats: { key: 'stats', name: 'Stats', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
  sticky: { key: 'sticky', name: 'Sticky Messages', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
  tempVoice: { key: 'tempVoice', name: 'Temp Voice', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
  tickets: { key: 'tickets', name: 'Tickets', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
  translation: { key: 'translation', name: 'Translation', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
  welcome: { key: 'welcome', name: 'Welcome', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
  goodbye: { key: 'goodbye', name: 'Goodbye', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
  moderation: { key: 'moderation', name: 'Moderation', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
  automod: { key: 'automod', name: 'AutoMod', maturity: MODULE_MATURITY.NOT_STARTED, capabilities: createCapabilityMap() },
});

module.exports = {
  moduleManifest,
};
