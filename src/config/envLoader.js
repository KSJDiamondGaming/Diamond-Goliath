'use strict';

require('../runtime/warningFilter');

const path = require('node:path');
const dotenv = require('dotenv');

const { normalizeBotMode, isValidBotMode } = require('./botModes');

function normalizeClientUrlEnvironment() {
  const keys = ['CLIENT_URL', 'DASHBOARD_CLIENT_URL', 'DASHBOARD_URL', 'VITE_CLIENT_URL', 'TWOTONETAJ_CLIENT_URL'];
  for (const key of keys) {
    const raw = String(process.env[key] || '').trim();
    if (!raw) continue;
    try {
      process.env[key] = new URL(raw).origin;
    } catch {
      console.warn(`⚠️ Ignoring invalid ${key}; expected an absolute URL.`);
      delete process.env[key];
    }
  }
}

function applyModePublicClientOrigin(requestedMode) {
  if (requestedMode !== 'DEV') return;
  process.env.CLIENT_URL = 'https://dev.goliath.ksjdigital.co.uk';
}

function loadEnvironment(mode = process.env.BOT_MODE) {
  const requestedMode = normalizeBotMode(mode);

  if (!isValidBotMode(requestedMode)) {
    console.error(`❌ Invalid BOT_MODE: ${requestedMode}`);
    console.error('✅ Valid modes: DEV, BETA, PRODUCTION');
    process.exit(1);
  }

  const envFile = `.env.${requestedMode.toLowerCase()}`;
  const envPath = path.resolve(process.cwd(), envFile);

  const result = dotenv.config({ path: envPath });

  if (result.error) {
    console.error(`❌ Failed to load ${envFile}`);
    console.error(`Expected path: ${envPath}`);
    console.error(result.error.message);
    process.exit(1);
  }

  process.env.BOT_MODE = requestedMode;
  normalizeClientUrlEnvironment();
  applyModePublicClientOrigin(requestedMode);

  return {
    mode: requestedMode,
    envFile,
    envPath,
  };
}

module.exports = {
  loadEnvironment,
};
