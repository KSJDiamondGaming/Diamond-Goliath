'use strict';

// src/modules/translation/translationThreadManager.js

const { ChannelType } = require('discord.js');

const translationStore = require('./translationStore');
const translationProviderManager = require('./translationProviderManager');
const translationManager = require('./translationManager');

function now() {
  return new Date().toISOString();
}

function isTextSourceChannel(channel) {
  return Boolean(channel) && [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
  ].includes(channel.type);
}

function isThreadChannel(channel) {
  return Boolean(channel?.isThread?.());
}

function buildThreadName(languageCode) {
  return `🌐 ${translationManager.languageLabel(languageCode)}`.slice(0, 100);
}

function formatThreadMessage({ message, result, targetLanguage }) {
  const authorLabel = message.member?.displayName || message.author?.username || 'Unknown User';
  const sourceUrl = message.url ? `\n[Jump to original](${message.url})` : '';

  return [
    `🌐 **${translationManager.languageLabel(result.sourceLanguage || 'auto')} → ${translationManager.languageLabel(targetLanguage)}**`,
    `👤 **Original Author:** ${authorLabel}`,
    sourceUrl,
    '',
    result.translatedText || result.originalText || '_No translated text returned._',
  ].filter(Boolean).join('\n');
}

async function fetchChannel(clientOrGuild, channelId) {
  if (!clientOrGuild || !channelId) return null;

  const client = clientOrGuild.client || clientOrGuild;
  const cached = client.channels?.cache?.get?.(channelId);
  if (cached) return cached;

  try {
    return await client.channels?.fetch?.(channelId);
  } catch {
    return null;
  }
}

async function fetchThread(clientOrGuild, threadId) {
  if (!threadId) return null;
  return fetchChannel(clientOrGuild, threadId);
}

async function createLanguageThread(sourceChannel, languageCode) {
  if (!isTextSourceChannel(sourceChannel)) {
    throw new Error('Translation source channel must be a text or announcement channel.');
  }

  const thread = await sourceChannel.threads.create({
    name: buildThreadName(languageCode),
    autoArchiveDuration: 10080,
    reason: `Goliath translation thread: ${languageCode}`,
  });

  return thread;
}

function getChannelConfig(section, channelId) {
  return section.threadChannels?.[channelId] || section.channels?.[channelId] || null;
}

function getTargetLanguages(section, config) {
  const languages = config?.languages || config?.targetLanguages || section.languages || section.settings?.targetLanguages || ['en'];

  return [...new Set(
    (Array.isArray(languages) ? languages : ['en'])
      .map((code) => translationManager.normalizeLanguage(code))
      .filter(Boolean)
  )].slice(0, 10);
}

async function ensureThreadsForChannel(guild, channelId, options = {}) {
  const section = translationStore.getTranslationSection(guild.id);
  const config = getChannelConfig(section, channelId);

  if (!config || config.enabled === false || config.threadMode === false) {
    return {
      ok: false,
      reason: 'Translation threads are not enabled for this channel.',
      created: [],
      recovered: [],
    };
  }

  const sourceChannel = await fetchChannel(guild, channelId);
  if (!isTextSourceChannel(sourceChannel)) {
    return {
      ok: false,
      reason: 'Source channel is missing or is not a supported text channel.',
      created: [],
      recovered: [],
    };
  }

  const targetLanguages = getTargetLanguages(section, config);
  const created = [];
  const recovered = [];

  for (const languageCode of targetLanguages) {
    const currentMapping = section.threadMappings?.[channelId]?.[languageCode] || null;
    let thread = currentMapping?.threadId
      ? await fetchThread(guild, currentMapping.threadId)
      : null;

    if (!thread && config.autoCreateThreads !== false) {
      thread = await createLanguageThread(sourceChannel, languageCode);
      created.push({ languageCode, threadId: thread.id });

      translationStore.incrementAnalytics(guild.id, {
        threadsCreated: 1,
        threadChannelsCreated: 1,
      }, guild);
    } else if (thread) {
      recovered.push({ languageCode, threadId: thread.id });
    }

    if (thread) {
      translationStore.saveThreadMapping(guild.id, channelId, languageCode, {
        threadId: thread.id,
        languageCode,
        threadName: thread.name,
        active: true,
        archived: thread.archived === true,
        locked: thread.locked === true,
        recoveredAt: options.recovery ? now() : currentMapping?.recoveredAt || null,
      }, guild);
    }
  }

  return {
    ok: true,
    sourceChannelId: channelId,
    created,
    recovered,
    languages: targetLanguages,
  };
}

async function recoverGuildThreads(guild) {
  const section = translationStore.getTranslationSection(guild.id);
  const channelIds = Object.keys(section.threadChannels || section.channels || {});
  const results = [];

  for (const channelId of channelIds) {
    const config = getChannelConfig(section, channelId);
    if (!config || config.enabled === false || config.threadMode === false) continue;

    try {
      const result = await ensureThreadsForChannel(guild, channelId, { recovery: true });
      results.push(result);

      translationStore.incrementAnalytics(guild.id, {
        threadRecoveries: 1,
      }, guild);
    } catch (error) {
      results.push({
        ok: false,
        sourceChannelId: channelId,
        reason: error.message,
      });

      translationStore.incrementAnalytics(guild.id, {
        failedTranslations: 1,
        threadFailures: 1,
      }, guild);
    }
  }

  return results;
}

async function handleMessageCreate(message) {
  if (!message?.guild || !message?.channel || !message?.content) return null;
  if (message.author?.bot || message.webhookId) return null;
  if (isThreadChannel(message.channel)) return null;

  const guildId = message.guild.id;
  const section = translationStore.getTranslationSection(guildId);

  if (section.enabled !== true) return null;

  const config = getChannelConfig(section, message.channelId);
  if (!config || config.enabled === false || config.mode === 'disabled') return null;
  if (config.mode !== 'auto') return null;
  if (config.threadMode === false) return null;

  await ensureThreadsForChannel(message.guild, message.channelId);

  const latestSection = translationStore.getTranslationSection(guildId);
  const mappings = latestSection.threadMappings?.[message.channelId] || {};
  const targetLanguages = getTargetLanguages(latestSection, config);
  const sent = [];
  const failed = [];

  for (const targetLanguage of targetLanguages) {
    const mapping = mappings[targetLanguage];
    if (!mapping?.threadId || mapping.active === false) continue;

    try {
      const thread = await fetchThread(message.guild, mapping.threadId);
      if (!thread) throw new Error(`Missing translation thread for ${targetLanguage}.`);

      const result = await translationProviderManager.translateText({
        provider: latestSection.settings?.provider || 'manual',
        text: message.content,
        sourceLanguage: config.sourceLanguage || latestSection.settings?.defaultSourceLanguage || 'auto',
        targetLanguage,
      });

      if (!result.ok) throw new Error(result.error || 'Translation failed.');

      const translatedMessage = await thread.send({
        content: formatThreadMessage({ message, result, targetLanguage }).slice(0, 2000),
        allowedMentions: { parse: [] },
      });

      translationStore.saveThreadMapping(guildId, message.channelId, targetLanguage, {
        ...mapping,
        lastMessageId: message.id,
        lastTranslatedMessageId: translatedMessage.id,
        lastTranslatedAt: now(),
      }, message.guild);

      translationStore.incrementAnalytics(guildId, {
        autoTranslations: 1,
        threadTranslations: 1,
      }, message.guild);

      sent.push({ targetLanguage, threadId: thread.id, messageId: translatedMessage.id });
    } catch (error) {
      failed.push({ targetLanguage, error: error.message });
      translationStore.incrementAnalytics(guildId, {
        failedTranslations: 1,
        threadFailures: 1,
      }, message.guild);
    }
  }

  translationStore.addTranslationLog(guildId, {
    type: 'thread_message',
    sourceChannelId: message.channelId,
    sourceMessageId: message.id,
    authorId: message.author?.id || null,
    sent,
    failed,
  }, message.guild);

  return {
    ok: failed.length === 0,
    sent,
    failed,
  };
}

module.exports = {
  ensureThreadsForChannel,
  recoverGuildThreads,
  handleMessageCreate,
};
