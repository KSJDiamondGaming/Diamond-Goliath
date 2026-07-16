'use strict';

const twitchProvider = require('./providers/twitchProvider');
const youtubeProvider = require('./providers/youtubeProvider');
const kickProvider = require('./providers/kickProvider');
const tiktokProvider = require('./providers/tiktokProvider');
const instagramProvider = require('./providers/instagramProvider');
const xProvider = require('./providers/xProvider');

const PROVIDER_STATUSES = Object.freeze({ READY: 'ready', NOT_CONFIGURED: 'not_configured', NOT_IMPLEMENTED: 'not_implemented', ERROR: 'error' });
const PRODUCTION_PROVIDER_IDS = new Set(['twitch', 'youtube', 'kick', 'x']);
const providerDefinitions = Object.freeze({
  instagram: { id: 'instagram', label: 'Instagram', supportedAlertTypes: ['post'], requiredEnv: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'], handler: instagramProvider },
  kick: { id: 'kick', label: 'Kick', supportedAlertTypes: ['live'], requiredEnv: ['KICK_CLIENT_ID', 'KICK_CLIENT_SECRET'], handler: kickProvider },
  tiktok: { id: 'tiktok', label: 'TikTok', supportedAlertTypes: ['post', 'live'], requiredEnv: ['TIKTOK_CLIENT_ID', 'TIKTOK_CLIENT_SECRET'], handler: tiktokProvider },
  twitch: { id: 'twitch', label: 'Twitch', supportedAlertTypes: ['live'], requiredEnv: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'], handler: twitchProvider },
  x: { id: 'x', label: 'X', supportedAlertTypes: ['post'], requiredEnv: [], handler: xProvider },
  youtube: { id: 'youtube', label: 'YouTube', supportedAlertTypes: ['upload', 'short', 'live'], requiredEnv: ['YOUTUBE_API_KEY'], handler: youtubeProvider },
});
function hasRequiredEnv(requiredEnv = []) { return requiredEnv.every((name) => Boolean(String(process.env[name] || '').trim())); }
function getProvider(platform) {
  const provider = providerDefinitions[String(platform || '').toLowerCase()] || null;
  if (!provider) return null;
  const implemented = provider.handler?.implemented === true || PRODUCTION_PROVIDER_IDS.has(provider.handler?.id);
  let status = PROVIDER_STATUSES.NOT_IMPLEMENTED;
  if (implemented) {
    const configuredByHandler = typeof provider.handler?.isConfigured === 'function' ? provider.handler.isConfigured() : null;
    const configured = configuredByHandler === null ? hasRequiredEnv(provider.requiredEnv) : configuredByHandler;
    status = configured ? PROVIDER_STATUSES.READY : PROVIDER_STATUSES.NOT_CONFIGURED;
  }
  return { ...provider, status };
}
function listProviders() { return Object.keys(providerDefinitions).sort((a, b) => providerDefinitions[a].label.localeCompare(providerDefinitions[b].label)).map(getProvider); }
async function checkAccount(account = {}) {
  const provider = getProvider(account.platform);
  if (!provider) return { success: false, status: PROVIDER_STATUSES.ERROR, providerStatus: PROVIDER_STATUSES.ERROR, error: `Unsupported social platform: ${account.platform || 'unknown'}` };
  if (provider.status !== PROVIDER_STATUSES.READY) return { success: false, status: provider.status, providerStatus: provider.status, platform: provider.id, provider: provider.label, accountId: account.accountId, username: account.username, supportedAlertTypes: provider.supportedAlertTypes, checkedAt: new Date().toISOString(), error: provider.status === PROVIDER_STATUSES.NOT_CONFIGURED ? `${provider.label} provider is missing global Goliath credentials.` : `${provider.label} provider polling is not implemented yet.` };
  if (typeof provider.handler?.checkAccount === 'function') return provider.handler.checkAccount(account);
  return { success: false, status: PROVIDER_STATUSES.ERROR, providerStatus: PROVIDER_STATUSES.ERROR, error: `${provider.label} provider handler is unavailable.` };
}

module.exports = { PROVIDER_STATUSES, getProvider, listProviders, checkAccount };
