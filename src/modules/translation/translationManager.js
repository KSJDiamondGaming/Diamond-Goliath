'use strict';

// src/modules/translation/translationManager.js
// Provider-ready manager. No external translation calls are made yet.

const { EmbedBuilder } = require('discord.js');
const translationStore = require('./translationStore');

const LANGUAGE_LABELS = Object.freeze({
  auto: 'Auto Detect',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  ar: 'Arabic',
  hi: 'Hindi',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
});

function languageLabel(code = 'en') {
  const safeCode = String(code || 'en').toLowerCase();
  return LANGUAGE_LABELS[safeCode] || safeCode.toUpperCase();
}

function normalizeLanguage(code = 'en') {
  const clean = String(code || 'en')
    .trim()
    .toLowerCase()
    .replace(/[^a-z-]/g, '')
    .slice(0, 12);

  return clean || 'en';
}

function buildOverviewEmbed(guildId) {
  const section = translationStore.getTranslationSection(guildId);
  const channelCount = Object.keys(section.channels || {}).length;
  const userCount = Object.keys(section.userPreferences || {}).length;
  const targetLanguages = section.settings?.targetLanguages || ['en'];

  return new EmbedBuilder()
    .setColor(section.enabled ? 0x57f287 : 0xed4245)
    .setTitle('🌐 Goliath Translation')
    .setDescription([
      `**Status:** ${section.enabled ? '🟢 Enabled' : '🔴 Disabled'}`,
      `**Provider:** \`${section.settings?.provider || 'manual'}\``,
      `**Default Target:** ${languageLabel(section.settings?.defaultTargetLanguage || 'en')}`,
      `**Targets:** ${targetLanguages.map(languageLabel).join(', ')}`,
      `**Thread Mode:** ${section.settings?.threadMode !== false ? 'Enabled' : 'Disabled'}`,
      `**Auto Detect:** ${section.settings?.autoDetect !== false ? 'Enabled' : 'Disabled'}`,
      '',
      `**Configured Channels:** ${channelCount}`,
      `**User Preferences:** ${userCount}`,
      '',
      '**Analytics**',
      `Manual: ${section.analytics?.manualTranslations || 0}`,
      `Auto: ${section.analytics?.autoTranslations || 0}`,
      `Threads: ${section.analytics?.threadsCreated || 0}`,
      `Failed: ${section.analytics?.failedTranslations || 0}`,
    ].join('\n'))
    .setFooter({ text: 'Goliath Translation • Config stored in modules.translation' })
    .setTimestamp(new Date());
}

function buildChannelEmbed(guildId, channelId) {
  const section = translationStore.getTranslationSection(guildId);
  const config = section.channels?.[channelId];

  if (!config) {
    return new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('🌐 Translation Channel')
      .setDescription(`No translation config found for <#${channelId}>.`)
      .setTimestamp(new Date());
  }

  return new EmbedBuilder()
    .setColor(config.enabled !== false ? 0x57f287 : 0xed4245)
    .setTitle('🌐 Translation Channel')
    .setDescription([
      `**Channel:** <#${channelId}>`,
      `**Status:** ${config.enabled !== false ? '🟢 Enabled' : '🔴 Disabled'}`,
      `**Mode:** \`${config.mode}\``,
      `**Thread Mode:** ${config.threadMode !== false ? 'Enabled' : 'Disabled'}`,
      `**Source:** ${languageLabel(config.sourceLanguage || 'auto')}`,
      `**Targets:** ${(config.targetLanguages || ['en']).map(languageLabel).join(', ')}`,
    ].join('\n'))
    .setTimestamp(new Date());
}

function buildProviderNotConnectedEmbed({ text, targetLanguage, sourceLanguage = 'auto' } = {}) {
  return new EmbedBuilder()
    .setColor(0xfaa61a)
    .setTitle('🌐 Translation Provider Not Connected')
    .setDescription([
      'The translation system is configured, but no real provider is connected yet.',
      '',
      `**Source:** ${languageLabel(sourceLanguage)}`,
      `**Target:** ${languageLabel(targetLanguage || 'en')}`,
      '',
      '**Text queued for translation:**',
      `>>> ${String(text || '').slice(0, 1500) || '_No text provided._'}`,
    ].join('\n'))
    .setFooter({ text: 'Next step: connect OpenAI, DeepL, or Google provider' })
    .setTimestamp(new Date());
}

async function translateText({ guildId, text, targetLanguage = 'en', sourceLanguage = 'auto', mode = 'manual' } = {}) {
  const section = translationStore.getTranslationSection(guildId);
  const provider = section.settings?.provider || 'manual';
  const safeText = String(text || '').trim().slice(0, section.settings?.maxCharacters || 1500);
  const safeTarget = normalizeLanguage(targetLanguage || section.settings?.defaultTargetLanguage || 'en');
  const safeSource = normalizeLanguage(sourceLanguage || section.settings?.defaultSourceLanguage || 'auto');

  if (!safeText) {
    return {
      ok: false,
      provider,
      sourceLanguage: safeSource,
      targetLanguage: safeTarget,
      originalText: '',
      translatedText: '',
      error: 'No text provided.',
    };
  }

  if (provider === 'manual') {
    translationStore.incrementAnalytics(guildId, {
      failedTranslations: 1,
    });

    return {
      ok: false,
      provider,
      sourceLanguage: safeSource,
      targetLanguage: safeTarget,
      originalText: safeText,
      translatedText: '',
      error: 'Translation provider is not connected yet.',
    };
  }

  // Future provider integration point.
  translationStore.incrementAnalytics(guildId, {
    [mode === 'auto' ? 'autoTranslations' : 'manualTranslations']: 1,
  });

  return {
    ok: true,
    provider,
    sourceLanguage: safeSource,
    targetLanguage: safeTarget,
    originalText: safeText,
    translatedText: safeText,
  };
}

module.exports = {
  LANGUAGE_LABELS,
  languageLabel,
  normalizeLanguage,
  buildOverviewEmbed,
  buildChannelEmbed,
  buildProviderNotConnectedEmbed,
  translateText,
};
