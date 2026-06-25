'use strict';

const fs = require('fs');
const path = require('path');

const { getRuntimePaths } = require('../../config/runtimePaths');

const DEV_MODE = 'dev';
const FILE_NAME = 'testDevOverride.json';
const PAYWALL_BYPASS_DEFAULT_ENABLED = true;
const PAYWALL_BYPASS_PLAN = 'lifetime';

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
    paywallBypass: {
      enabled: PAYWALL_BYPASS_DEFAULT_ENABLED,
      plan: PAYWALL_BYPASS_PLAN,
      updatedAt: null,
      updatedBy: 'system',
      note: 'DEV only. Set enabled false to test real plans, vouchers and locked paywall behaviour.',
    },
  };
}

function normaliseState(state = {}) {
  const defaults = defaultState();
  const paywallBypass = {
    ...defaults.paywallBypass,
    ...(state.paywallBypass || {}),
  };

  return {
    ...defaults,
    ...state,
    enabled: state.enabled === true,
    paywallBypass: {
      ...paywallBypass,
      enabled: paywallBypass.enabled === true,
      plan: String(paywallBypass.plan || PAYWALL_BYPASS_PLAN).trim().toLowerCase(),
    },
  };
}

function readState() {
  if (!isDevMode()) return defaultState();

  try {
    const filePath = getFilePath();
    if (!fs.existsSync(filePath)) return defaultState();
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return normaliseState(parsed);
  } catch (error) {
    console.warn('[TestDevOverride] Failed to read state:', error.message);
    return defaultState();
  }
}

function writeState(nextState = {}) {
  if (!isDevMode()) return defaultState();

  ensureFolder();
  const state = normaliseState({
    ...readState(),
    ...nextState,
    updatedAt: new Date().toISOString(),
  });

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

function shouldBypassPaywall() {
  const state = readState();
  return isDevMode() && state.paywallBypass?.enabled === true;
}

function getPaywallBypassPlan() {
  return shouldBypassPaywall() ? readState().paywallBypass.plan || PAYWALL_BYPASS_PLAN : null;
}

function getPaywallBypassState() {
  const state = readState();
  return {
    active: shouldBypassPaywall(),
    ...state.paywallBypass,
  };
}

function buildBypassMetadata(extra = {}) {
  return {
    ...extra,
    testDevOverride: true,
    warning: 'Goliath DEV safety guard bypassed. Discord API permissions are still enforced by Discord.',
  };
}

function buildPaywallBypassMetadata(extra = {}) {
  return {
    ...extra,
    testDevPaywallBypass: true,
    plan: getPaywallBypassPlan(),
    warning: 'Goliath DEV paywall bypass active. Disable paywallBypass.enabled in testDevOverride.json to test plans, vouchers and locked billing behaviour.',
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
  shouldBypassPaywall,
  getPaywallBypassPlan,
  getPaywallBypassState,
  buildBypassMetadata,
  buildPaywallBypassMetadata,
};
