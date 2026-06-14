'use strict';

// src/modules/translation/translationProviderManager.js
// Provider abstraction layer. Real providers are wired in later.

const mockProvider = require('./providers/mockProvider');

const PROVIDERS = Object.freeze({
  manual: mockProvider,
  mock: mockProvider,
});

function resolveProvider(providerName = 'manual') {
  const key = String(providerName || 'manual').toLowerCase();
  return PROVIDERS[key] || mockProvider;
}

async function translateText({ provider = 'manual', text, sourceLanguage = 'auto', targetLanguage = 'en' } = {}) {
  const selectedProvider = resolveProvider(provider);

  try {
    return selectedProvider.translateText({
      text,
      sourceLanguage,
      targetLanguage,
    });
  } catch (error) {
    return {
      ok: false,
      provider,
      sourceLanguage,
      targetLanguage,
      originalText: String(text || ''),
      translatedText: '',
      error: error.message || 'Translation provider failed.',
    };
  }
}

module.exports = {
  translateText,
  resolveProvider,
};
