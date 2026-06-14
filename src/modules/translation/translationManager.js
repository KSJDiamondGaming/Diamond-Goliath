'use strict';

// src/modules/translation/translationManager.js
// Public translation API used by commands, dashboard, and future thread systems.

const { EmbedBuilder } = require('discord.js');
const translationStore = require('./translationStore');
const translationProviderManager = require('./translationProviderManager');

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

function providerLabel(provider = 'manual') {
  const clean = String(provider || 'manual').toLowerCase();
  if (clean === 'openai') return 'OpenAI';
  if (clean === 'deepl') return 'DeepL';
  if (clean === 'google') return 'Google Translate';
  return 'Manual / Not Connected';
}

function buildOverviewEmbed(guildId) {
  const section = translationStore.getTranslationSection(guildId);
  const providerStatus = translationProviderManager.getProviderStatus(section);
  const channelCount = Object.keys(section.channels || {}).length;
  const userCount = Object.keys(section.userPreferences || {}).length;
  const targetLanguages = section.settings?.targetLanguages || ['en'];

  return new EmbedBuilder()
    .setColor(section.enabled ? 0x57f287 : 0xed4245)
    .setTitle('🌐 Goliath Translation')
    .setDescription([
      `**Status:** ${section.enabled ? '🟢 Enabled' : '🔴 Disabled'}`,
      `**Provider:** \`${providerLabel(providerStatus.selectedProvider)}\`` ,
      `**Provider Health:** ${providerStatus.providers?.[providerStatus.selectedProvider]?.healthy ? '🟢 Healthy' : '🟠 Needs Attention'}`,
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

function buildProviderNotConnectedEmbed({ text, targetLanguage, sourceLanguage = 'auto', result = null } = {}) {
  const errorMessage = result?.errorMessage || result?.error || 'The translation provider is not connected yet.';
  const errorCode = result?.errorCode ? `\n**Error Code:** \`${result.errorCode}\`` : '';

  return new EmbedBuilder()
    .setColor(0xfaa61a)
    .setTitle('🌐 Translation Provider Issue')
    .setDescription([
      errorMessage,
      errorCode,
      '',
      `**Source:** ${languageLabel(sourceLanguage)}`,
      `**Target:** ${languageLabel(targetLanguage || 'en')}`,
      '',
      '**Text queued for translation:**',
      `>>> ${String(text || '').slice(0, 1500) || '_No text provided._'}`,
    ].filter(Boolean).join('\n'))
    .setFooter({ text: 'Configure OpenAI, DeepL, or Google Translate provider settings' })
    .setTimestamp(new Date());
}

async function translateText({ guildId, text, targetLanguage = 'en', sourceLanguage = 'auto', mode = 'manual', options = {} } = {}) {
  const section = translationStore.getTranslationSection(guildId);
  const provider = translationProviderManager.getConfiguredProvider(section);
  const maxCharacters = section.settings?.maxCharacters || 1500;
  const safeText = String(text || '').trim().slice(0, maxCharacters);
  const safeTarget = normalizeLanguage(targetLanguage || section.settings?.defaultTargetLanguage || 'en');
  const safeSource = normalizeLanguage(sourceLanguage || section.settings?.defaultSourceLanguage || 'auto');

  if (!safeText) {
    return translationProviderManager.createFailure(provider, 'EMPTY_TEXT', 'No text provided.', {
      originalText: '',
      sourceLanguage: safeSource,
      targetLanguage: safeTarget,
    });
  }

  const result = await translationProviderManager.translateText({
    section,
    guildId,
    text: safeText,
    sourceLanguage: safeSource,
    targetLanguage: safeTarget,
    options,
  });

  translationStore.incrementAnalytics(guildId, {
    [result.success ? (mode === 'auto' ? 'autoTranslations' : 'manualTranslations') : 'failedTranslations']: 1,
  });

  return {
    ...result,
    provider: result.provider || provider,
    originalText: result.originalText || safeText,
    translatedText: result.translatedText || '',
    sourceLanguage: result.sourceLanguage || safeSource,
    targetLanguage: result.targetLanguage || safeTarget,
  };
}

function getProviderStatus(guildId) {
  const section = translationStore.getTranslationSection(guildId);
  return translationProviderManager.getProviderStatus(section);
}

function listProviders() {
  return translationProviderManager.listProviders();
}

module.exports = {
  LANGUAGE_LABELS,
  languageLabel,
  normalizeLanguage,
  providerLabel,
  buildOverviewEmbed,
  buildChannelEmbed,
  buildProviderNotConnectedEmbed,
  translateText,
  getProviderStatus,
  listProviders,
};
