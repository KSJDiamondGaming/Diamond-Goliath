'use strict';

// src/modules/social/providers/baseProvider.js

function createPlaceholderProvider({ id, label, supportedAlertTypes = [], requiredEnv = [], notes = '' }) {
  function isConfigured() {
    return requiredEnv.every((name) => Boolean(String(process.env[name] || '').trim()));
  }

  async function checkAccount(account = {}) {
    const configured = isConfigured();
    const checkedAt = new Date().toISOString();

    return {
      success: false,
      status: configured ? 'not_implemented' : 'not_configured',
      providerStatus: configured ? 'not_implemented' : 'not_configured',
      platform: id,
      provider: label,
      accountId: account.accountId,
      username: account.username,
      checkedAt,
      supportedAlertTypes,
      error: configured
        ? `${label} provider is prepared but polling is not implemented yet.`
        : `${label} provider is missing global Goliath credentials.`,
      notes,
    };
  }

  return {
    id,
    label,
    supportedAlertTypes,
    requiredEnv,
    isConfigured,
    checkAccount,
  };
}

module.exports = {
  createPlaceholderProvider,
};
