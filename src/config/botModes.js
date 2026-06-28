const BOT_MODES = Object.freeze({
  DEV: 'DEV',
  BETA: 'BETA',
  PRODUCTION: 'PRODUCTION',
});

const MODE_CONFIG = Object.freeze({
  [BOT_MODES.DEV]: {
    name: BOT_MODES.DEV,
    label: 'Development',
    strictGuildAccess: false,
    commandDeployType: 'GUILD',
    verboseLogging: true,
    startBackupScheduler: false,
    allowExperimentalFeatures: true,
  },

  [BOT_MODES.BETA]: {
    name: BOT_MODES.BETA,
    label: 'Beta',
    strictGuildAccess: true,
    commandDeployType: 'GUILD',
    verboseLogging: true,
    startBackupScheduler: true,
    allowExperimentalFeatures: false,
  },

  [BOT_MODES.PRODUCTION]: {
    name: BOT_MODES.PRODUCTION,
    label: 'Production',
    strictGuildAccess: false,
    commandDeployType: 'GLOBAL',
    verboseLogging: false,
    startBackupScheduler: true,
    allowExperimentalFeatures: false,
  },
});

function normalizeBotMode(value) {
  return String(value || BOT_MODES.DEV).trim().toUpperCase();
}

function isValidBotMode(value) {
  return Object.values(BOT_MODES).includes(normalizeBotMode(value));
}

function getBotModeConfig(value) {
  const mode = normalizeBotMode(value);

  if (!isValidBotMode(mode)) {
    throw new Error(
      `Invalid BOT_MODE "${value}". Valid modes: ${Object.values(BOT_MODES).join(', ')}`
    );
  }

  return MODE_CONFIG[mode];
}

module.exports = {
  BOT_MODES,
  MODE_CONFIG,
  normalizeBotMode,
  isValidBotMode,
  getBotModeConfig,
};
