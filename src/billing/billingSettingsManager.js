'use strict';

const fs = require('fs');
const path = require('path');

const { getRuntimeRoot } = require('../config/runtimePaths');

const DEFAULT_SETTINGS = Object.freeze({
  publicLifetimeEnabled: false,
  updatedAt: null,
  updatedBy: null,
});

function now() {
  return new Date().toISOString();
}

function getBillingDir() {
  const dir = path.join(getRuntimeRoot(process.env.BOT_MODE || 'DEV'), 'billing');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getSettingsFile() {
  return path.join(getBillingDir(), 'billingSettings.json');
}

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings && typeof settings === 'object' ? settings : {}),
    publicLifetimeEnabled: settings?.publicLifetimeEnabled === true,
    updatedAt: settings?.updatedAt || null,
    updatedBy: settings?.updatedBy || null,
  };
}

function getBillingSettings() {
  const file = getSettingsFile();
  if (!fs.existsSync(file)) return normalizeSettings();

  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return normalizeSettings();
  }
}

function saveBillingSettings(nextSettings = {}) {
  const settings = normalizeSettings(nextSettings);
  fs.writeFileSync(getSettingsFile(), JSON.stringify(settings, null, 2));
  return settings;
}

function updateBillingSettings(updates = {}, actor = 'owner') {
  const current = getBillingSettings();
  return saveBillingSettings({
    ...current,
    ...updates,
    publicLifetimeEnabled: updates.publicLifetimeEnabled === true,
    updatedAt: now(),
    updatedBy: actor,
  });
}

module.exports = {
  DEFAULT_SETTINGS,
  getBillingSettings,
  updateBillingSettings,
};
