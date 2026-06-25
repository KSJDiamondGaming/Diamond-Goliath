'use strict';

const fs = require('fs');
const path = require('path');

const { getRuntimePaths } = require('../../config/runtimePaths');

const DEV_MODE = 'dev';
const FILE_NAME = 'testDevOverride.json';

function mode() {
  return String(process.env.BOT_MODE || 'DEV').toLowerCase();
}

function isDevMode() {
  return mode() === DEV_MODE;
}

function getOwnerIds() {
  return String(process.env.OWNER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function isOwnerId(userId) {
  return getOwnerIds().includes(String(userId || ''));
}

function getFilePath() {
  const runtimePaths = getRuntimePaths('dev');
  return path.join(runtimePaths.data, FILE_NAME);
}

function ensureFolder() {
  fs.mkdirSync(path.dirname(getFilePath()), { recursive: true });
}

function defaultState() {
  return {
    enabled: false,
    updatedAt: null,
    updatedBy: null,
  };
}

function readState() {
  if (!isDevMode()) return defaultState();

  try {
    const filePath = getFilePath();
    if (!fs.existsSync(filePath)) return defaultState();
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      ...defaultState(),
      ...parsed,
      enabled: parsed.enabled === true,
    };
  } catch (error) {
    console.warn('[TestDevOverride] Failed to read state:', error.message);
    return defaultState();
  }
}

function writeState(nextState = {}) {
  if (!isDevMode()) return defaultState();

  ensureFolder();
  const state = {
    ...defaultState(),
    ...nextState,
    enabled: nextState.enabled === true,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(getFilePath(), JSON.stringify(state, null, 2));
  return state;
}

function isEnabled() {
  return isDevMode() && readState().enabled === true;
}

function toggle(userId) {
  if (!isDevMode()) {
    return {
      ...defaultState(),
      blocked: true,
      reason: 'Test dev override is only available in DEV mode.',
    };
  }

  if (!isOwnerId(userId)) {
    return {
      ...readState(),
      blocked: true,
      reason: 'Owner only.',
    };
  }

  const current = readState();
  return writeState({
    enabled: current.enabled !== true,
    updatedBy: String(userId),
  });
}

function shouldBypassGuard() {
  return isEnabled();
}

function buildBypassMetadata(extra = {}) {
  return {
    ...extra,
    testDevOverride: true,
    warning: 'Goliath DEV safety guard bypassed. Discord API permissions are still enforced by Discord.',
  };
}

module.exports = {
  isDevMode,
  isOwnerId,
  getOwnerIds,
  readState,
  isEnabled,
  toggle,
  shouldBypassGuard,
  buildBypassMetadata,
};
