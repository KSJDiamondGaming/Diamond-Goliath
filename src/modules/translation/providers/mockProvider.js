'use strict';

// src/modules/translation/providers/mockProvider.js
// Placeholder provider used until OpenAI/DeepL/Google are connected.

async function translateText({ text, sourceLanguage = 'auto', targetLanguage = 'en' } = {}) {
  const safeText = String(text || '').trim();

  if (!safeText) {
    return {
      ok: false,
      provider: 'mock',
      sourceLanguage,
      targetLanguage,
      originalText: '',
      translatedText: '',
      error: 'No text provided.',
    };
  }

  return {
    ok: true,
    provider: 'mock',
    sourceLanguage,
    targetLanguage,
    originalText: safeText,
    translatedText: [
      `🌐 [${targetLanguage.toUpperCase()} translation placeholder]`,
      '',
      safeText,
    ].join('\n'),
  };
}

module.exports = {
  translateText,
};
