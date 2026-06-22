'use strict';

const translationStore = require('../translationStore');

const PROVIDER_LABELS = Object.freeze({
  manual: 'Manual / Not configured',
  openai: 'OpenAI',
  deepl: 'DeepL',
  google: 'Google Translate',
});

const ENV_KEYS = Object.freeze({
  openai: 'OPENAI_API_KEY',
  deepl: 'DEEPL_API_KEY',
  google: 'GOOGLE_TRANSLATE_API_KEY',
});

function getConfiguredFromEnv(provider) {
  const envKey = ENV_KEYS[provider];
  return Boolean(envKey && process.env[envKey]);
}

function normalizeProvider(provider = 'manual') {
  const value = String(provider || 'manual').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PROVIDER_LABELS, value) ? value : 'manual';
}

function getProviderStatus(guildId) {
  const section = translationStore.getTranslationSection(guildId);
  const provider = normalizeProvider(section.provider || section.settings?.provider);
  const providerSettings = section.providerSettings || section.settings?.providerSettings || {};
  const providerConfig = providerSettings[provider] || {};
  const apiKeyConfigured = provider === 'manual'
    ? false
    : Boolean(getConfiguredFromEnv(provider) || providerConfig.apiKeyConfigured === true);

  return {
    provider,
    label: PROVIDER_LABELS[provider] || provider,
    defaultLanguage: section.settings?.defaultTargetLanguage || 'en',
    sourceLanguage: section.settings?.defaultSourceLanguage || 'auto',
    apiKeyConfigured,
    ready: provider !== 'manual' && apiKeyConfigured,
    status: provider === 'manual'
      ? 'not_configured'
      : apiKeyConfigured
        ? 'ready'
        : 'missing_api_key',
    supportedProviders: Object.entries(PROVIDER_LABELS).map(([id, label]) => ({
      id,
      label,
      apiKeyConfigured: id === 'manual' ? false : getConfiguredFromEnv(id) || Boolean(providerSettings[id]?.apiKeyConfigured),
    })),
  };
}

function sanitizeProviderSettings(input = {}) {
  const provider = normalizeProvider(input.provider || input.settings?.provider);
  const defaultLanguage = String(input.defaultLanguage || input.defaultTargetLanguage || input.settings?.defaultTargetLanguage || 'en')
    .trim()
    .toLowerCase()
    .replace(/[^a-z-]/g, '')
    .slice(0, 12) || 'en';
  const sourceLanguage = String(input.sourceLanguage || input.defaultSourceLanguage || input.settings?.defaultSourceLanguage || 'auto')
    .trim()
    .toLowerCase()
    .replace(/[^a-z-]/g, '')
    .slice(0, 12) || 'auto';

  return {
    provider,
    defaultTargetLanguage: defaultLanguage,
    defaultSourceLanguage: sourceLanguage,
  };
}

function saveProviderConfig(guildId, input = {}) {
  const settings = sanitizeProviderSettings(input);

  return translationStore.updateTranslationSection(guildId, (section) => ({
    ...section,
    provider: settings.provider,
    settings: {
      ...(section.settings || {}),
      provider: settings.provider,
      defaultTargetLanguage: settings.defaultTargetLanguage,
      defaultSourceLanguage: settings.defaultSourceLanguage,
    },
    updatedAt: new Date().toISOString(),
  }));
}

async function translate({ guildId, text, fromLanguage = 'auto', toLanguage = 'en' } = {}) {
  const status = getProviderStatus(guildId);
  if (!status.ready) {
    const error = new Error('Translation provider is not configured.');
    error.code = 'TRANSLATION_PROVIDER_NOT_READY';
    error.provider = status.provider;
    error.status = status.status;
    throw error;
  }

  return {
    provider: status.provider,
    fromLanguage,
    toLanguage,
    originalText: String(text || ''),
    translatedText: String(text || ''),
    simulated: true,
    note: 'Provider adapter scaffold is ready; live provider calls are intentionally not enabled yet.',
  };
}

module.exports = {
  PROVIDER_LABELS,
  normalizeProvider,
  getProviderStatus,
  saveProviderConfig,
  translate,
};
