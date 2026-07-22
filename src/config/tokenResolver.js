'use strict';

const crypto = require('crypto');

const MODE_TOKEN_ENV = Object.freeze({
  DEV: [
    'DISCORD_BOT_TOKEN_DEV',
    'DEV_DISCORD_BOT_TOKEN',
    'DISCORD_TOKEN_DEV',
    'DEV_DISCORD_TOKEN',
  ],
  BETA: [
    'DISCORD_BOT_TOKEN_BETA',
    'BETA_DISCORD_BOT_TOKEN',
    'DISCORD_TOKEN_BETA',
    'BETA_DISCORD_TOKEN',
  ],
  PRODUCTION: [
    'DISCORD_BOT_TOKEN_PRODUCTION',
    'PRODUCTION_DISCORD_BOT_TOKEN',
    'DISCORD_TOKEN_PRODUCTION',
    'PRODUCTION_DISCORD_TOKEN',
  ],
});

const GENERIC_TOKEN_ENV = [
  'DISCORD_BOT_TOKEN',
  'DISCORD_TOKEN',
  'TOKEN',
];

let loggedResolution = false;

function normalizeMode(config = {}) {
  return String(config?.mode || config?.name || process.env.BOT_MODE || 'DEV')
    .trim()
    .toUpperCase();
}

function firstConfigured(names = []) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return { token: value, source: name };
  }
  return null;
}

function tokenFingerprint(token) {
  if (!token) return 'none';
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 12);
}

function resolveTokenDetails(config = {}) {
  const mode = normalizeMode(config);

  if (String(config?.token || '').trim()) {
    return {
      token: String(config.token).trim(),
      source: 'mode-config',
      mode,
      usedGenericFallback: false,
    };
  }

  const modeSpecific = firstConfigured(MODE_TOKEN_ENV[mode] || []);
  if (modeSpecific) {
    return {
      ...modeSpecific,
      mode,
      usedGenericFallback: false,
    };
  }

  const generic = firstConfigured(GENERIC_TOKEN_ENV);
  if (generic) {
    return {
      ...generic,
      mode,
      usedGenericFallback: true,
    };
  }

  return {
    token: null,
    source: null,
    mode,
    usedGenericFallback: false,
  };
}

function resolveToken(config = {}) {
  const details = resolveTokenDetails(config);

  if (!loggedResolution) {
    loggedResolution = true;
    console.log(
      `[TokenResolver] mode=${details.mode} source=${details.source || 'missing'} fingerprint=${tokenFingerprint(details.token)}`
    );

    if (details.usedGenericFallback && details.mode !== 'PRODUCTION') {
      console.warn(
        `[TokenResolver] ${details.mode} is using generic ${details.source}. ` +
        `If another Goliath deployment uses the same token, both processes will receive the same interactions and Discord will return 10062/40060. ` +
        `Set ${MODE_TOKEN_ENV[details.mode]?.[0] || 'a mode-specific token variable'} to a separate Discord application token.`
      );
    }
  }

  return details.token;
}

module.exports = {
  MODE_TOKEN_ENV,
  resolveToken,
  resolveTokenDetails,
  tokenFingerprint,
};
