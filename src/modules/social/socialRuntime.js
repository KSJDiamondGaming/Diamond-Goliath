'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const socialStore = require('./socialStore');
const socialManager = require('./socialManager');
const socialScheduler = require('./socialScheduler');
const socialQueue = require('./socialQueue');
const socialHistory = require('./socialHistory');
const socialCreators = require('./socialCreators');
const socialDelivery = require('./socialDelivery');
const providerRegistry = require('./providerRegistry');

socialManager.deliverQueuedAlert = (guildId, account, providerResult, client, meta = {}) => socialDelivery.deliver(guildId, account, providerResult, client, {
  ...meta,
  bypassQueue: true,
  bypassDuplicate: true,
  action: meta.action || 'social_queue_delivery',
});

const SIMULATOR_ALERT_TYPES = new Set(['live', 'upload', 'short', 'post']);
const SIMULATOR_SAMPLE = Object.freeze({
  live: { title: 'Example live stream', description: 'A simulated live alert from Social Studio.', url: 'https://example.com/live', gameName: 'Gaming', viewerCount: 1234 },
  upload: { title: 'Example new video', description: 'A simulated upload alert from Social Studio.', url: 'https://example.com/video', duration: '12:34' },
  short: { title: 'Example short-form video', description: 'A simulated short alert from Social Studio.', url: 'https://example.com/short', duration: '0:42' },
  post: { title: 'Example social update', description: 'A simulated post alert from Social Studio.', url: 'https://example.com/post' },
});

function simulatorClean(value, fallback = '', max = 1000) {
  return String(value ?? fallback).trim().slice(0, max);
}

function simulatorAlertType(value) {
  const type = simulatorClean(value, 'live', 20).toLowerCase();
  return SIMULATOR_ALERT_TYPES.has(type) ? type : 'live';
}

function replaceSimulatorVariables(value, variables) {
  return simulatorClean(value, '', 4096).replace(/\{([a-zA-Z]+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key] ?? '') : match
  ));
}

function simulatorVariablesFor(account, type, sample) {
  return {
    creator: account.displayName || account.username || 'Creator',
    platform: account.platform || 'Social',
    title: sample.title,
    game: sample.gameName || 'Gaming',
    category: sample.gameName || 'Community',
    viewers: Number(sample.viewerCount || 0).toLocaleString('en-GB'),
    thumbnail: sample.thumbnailUrl || '',
    streamUrl: sample.url || '',
    videoUrl: sample.url || '',
    uploadTime: new Date().toISOString(),
    duration: sample.duration || '',
    alertType: type,
  };
}

function buildSimulation(guildId, account, requestedType = 'live', overrides = {}) {
  const type = simulatorAlertType(requestedType);
  const config = socialStore.getSocialSection(guildId);
  const template = config.templates?.[type] || {};
  const sample = { ...SIMULATOR_SAMPLE[type], ...(overrides && typeof overrides === 'object' ? overrides : {}) };
  const variables = simulatorVariablesFor(account, type, sample);
  const title = replaceSimulatorVariables(template.title || `{creator} ${type === 'live' ? 'is now live' : 'posted new content'}`, variables).slice(0, 256);
  const description = replaceSimulatorVariables(template.description || '{title}', variables).slice(0, 4096);
  const embed = new EmbedBuilder()
    .setColor(Number(template.color || 0x5865f2))
    .setTitle(title || `${variables.creator} alert`)
    .setDescription(description || sample.description)
    .addFields(
      { name: 'Creator', value: variables.creator, inline: true },
      { name: 'Platform', value: variables.platform, inline: true },
      { name: 'Simulation', value: type, inline: true },
    )
    .setFooter({ text: simulatorClean(template.footer || 'Goliath Social Studio • Simulation', 'Goliath Social Studio • Simulation', 2048) })
    .setTimestamp();
  if (template.thumbnail || sample.thumbnailUrl) embed.setThumbnail(replaceSimulatorVariables(template.thumbnail || sample.thumbnailUrl, variables));
  if (template.image) embed.setImage(replaceSimulatorVariables(template.image, variables));
  const buttonLabel = simulatorClean(template.buttonLabel || 'View', 'View', 80);
  const components = sample.url
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(buttonLabel).setURL(sample.url))]
    : [];
  return {
    type,
    sample,
    variables,
    embed,
    components,
    channelId: socialManager.routeChannelId(account, type),
    quietHours: socialManager.isQuietHours(guildId, account),
  };
}

function simulatorMention(account = {}) {
  if (account.mentionMode === 'everyone') return '@everyone';
  if (account.mentionMode === 'here') return '@here';
  if (account.mentionRoleId) return `<@&${account.mentionRoleId}>`;
  return '';
}

async function simulateSocialAlert(guildId, accountId, requestedType, client, options = {}, meta = {}) {
  const account = Object.values(socialStore.getSocialSection(guildId).accounts || {})
    .find((item) => item.accountId === accountId || item.id === accountId);
  if (!account) return { success: false, status: 404, error: 'Social account not found.' };

  const preview = buildSimulation(guildId, account, requestedType, options.overrides || {});
  const response = {
    success: true,
    preview: {
      alertType: preview.type,
      channelId: preview.channelId,
      quietHours: preview.quietHours,
      title: preview.embed.data.title,
      description: preview.embed.data.description,
      variables: preview.variables,
    },
  };
  if (options.send !== true) return response;
  if (preview.quietHours && options.force !== true) return { ...response, success: false, status: 409, blocked: true, error: 'Quiet hours are active. Use force to send this simulation now.' };
  if (!preview.channelId) return { ...response, success: false, status: 400, error: `No ${preview.type} destination is configured for this creator.` };

  const discordClient = client || global.client || global.discordClient;
  const channel = await discordClient?.channels?.fetch?.(preview.channelId).catch(() => null);
  if (!channel?.send) return { ...response, success: false, status: 400, error: 'The routed Discord channel is unavailable.' };

  const content = simulatorMention(account);
  try {
    const message = await channel.send({
      content: content || undefined,
      embeds: [preview.embed],
      components: preview.components,
      allowedMentions: {
        parse: content === '@everyone' || content === '@here' ? ['everyone'] : [],
        roles: account.mentionRoleId ? [account.mentionRoleId] : [],
      },
    });
    socialHistory.record(guildId, {
      status: 'test',
      eventType: 'simulation',
      alertType: preview.type,
      accountId: account.accountId,
      creator: account.displayName || account.username,
      platform: account.platform,
      channelId: channel.id,
      messageId: message.id,
      title: preview.embed.data.title,
      isTest: true,
      metadata: { forced: options.force === true },
    }, meta);
    return { ...response, sent: true, channelId: channel.id, messageId: message.id };
  } catch (error) {
    socialHistory.record(guildId, {
      status: 'failed',
      eventType: 'simulation',
      alertType: preview.type,
      accountId: account.accountId,
      creator: account.displayName || account.username,
      platform: account.platform,
      channelId: channel.id,
      title: preview.embed.data.title,
      error: error.message,
      isTest: true,
    }, meta);
    return { ...response, success: false, status: 500, error: error.message };
  }
}

const socialSimulator = Object.freeze({
  ALERT_TYPES: SIMULATOR_ALERT_TYPES,
  SAMPLE: SIMULATOR_SAMPLE,
  build: buildSimulation,
  simulate: simulateSocialAlert,
});

const DIAGNOSTIC_SCORE_WEIGHTS = Object.freeze({
  identifier: 20,
  destination: 20,
  provider: 20,
  providerCheck: 15,
  providerError: 15,
  queue: 10,
});

function diagnosticAgeMs(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, Date.now() - timestamp) : Infinity;
}

function diagnosticGrade(score) {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'healthy';
  if (score >= 50) return 'warning';
  return 'critical';
}

function providerDiagnostics(guildId) {
  const config = socialManager.getConfig(guildId);
  const accounts = config.accounts || [];
  return providerRegistry.listProviders().map((provider) => {
    const providerAccounts = accounts.filter((account) => account.platform === provider.id);
    const enabledAccounts = providerAccounts.filter((account) => account.enabled !== false);
    const checkedAccounts = enabledAccounts.filter((account) => account.lastSeen?.lastCheckedAt);
    const failedAccounts = enabledAccounts.filter((account) => account.lastSeen?.lastProviderError);
    const latestCheck = checkedAccounts.map((account) => account.lastSeen.lastCheckedAt).sort().at(-1) || null;
    const responseTimes = enabledAccounts
      .map((account) => Number(account.metadata?.provider?.responseTimeMs || 0))
      .filter((value) => Number.isFinite(value) && value > 0);

    return {
      id: provider.id,
      label: provider.label,
      status: config.providers?.[provider.id]?.enabled === false ? 'disabled' : provider.status,
      enabled: config.providers?.[provider.id]?.enabled !== false,
      supportedAlertTypes: provider.supportedAlertTypes || [],
      accountCount: providerAccounts.length,
      enabledAccountCount: enabledAccounts.length,
      checkedAccountCount: checkedAccounts.length,
      failedAccountCount: failedAccounts.length,
      latestCheck,
      latestCheckAgeMs: latestCheck ? diagnosticAgeMs(latestCheck) : null,
      averageResponseMs: responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length) : null,
      credentialOwner: 'Goliath',
      userCredentialsRequired: false,
      ready: provider.status === 'ready',
    };
  });
}

function accountDiagnostics(account, providerMap, queueItems) {
  let score = 100;
  const issues = [];
  const provider = providerMap.get(account.platform);
  const routedChannel = socialManager.routeChannelId(account, account.alertTypes?.[0] || 'live');
  const accountQueue = queueItems.filter((item) => item.accountId === account.accountId);

  if (!account.username && !account.externalId && !account.url) {
    score -= DIAGNOSTIC_SCORE_WEIGHTS.identifier;
    issues.push({ code: 'identifier_missing', severity: 'error' });
  }
  if (!routedChannel) {
    score -= DIAGNOSTIC_SCORE_WEIGHTS.destination;
    issues.push({ code: 'destination_missing', severity: 'error' });
  }
  if (!provider || provider.status !== 'ready') {
    score -= DIAGNOSTIC_SCORE_WEIGHTS.provider;
    issues.push({ code: `provider_${provider?.status || 'unknown'}`, severity: provider?.status === 'disabled' ? 'warning' : 'error' });
  }
  if (!account.lastSeen?.lastCheckedAt || diagnosticAgeMs(account.lastSeen.lastCheckedAt) > 24 * 60 * 60 * 1000) {
    score -= DIAGNOSTIC_SCORE_WEIGHTS.providerCheck;
    issues.push({ code: 'provider_check_stale', severity: 'warning' });
  }
  if (account.lastSeen?.lastProviderError) {
    score -= DIAGNOSTIC_SCORE_WEIGHTS.providerError;
    issues.push({ code: 'provider_last_error', severity: 'warning', error: account.lastSeen.lastProviderError });
  }
  if (accountQueue.some((item) => item.status === 'failed')) {
    score -= DIAGNOSTIC_SCORE_WEIGHTS.queue;
    issues.push({ code: 'delivery_failed', severity: 'warning' });
  }

  score = Math.max(0, Math.min(100, score));
  return {
    accountId: account.accountId,
    creatorId: account.metadata?.creatorId || null,
    displayName: account.displayName || account.username || account.platform,
    platform: account.platform,
    enabled: account.enabled !== false,
    score,
    grade: diagnosticGrade(score),
    lastCheckedAt: account.lastSeen?.lastCheckedAt || null,
    lastAlertAt: account.lastSeen?.lastAlertAt || null,
    lastProviderStatus: account.lastSeen?.lastProviderStatus || provider?.status || 'unknown',
    queuedDeliveries: accountQueue.filter((item) => item.status === 'queued').length,
    failedDeliveries: accountQueue.filter((item) => item.status === 'failed').length,
    issues,
  };
}

function creatorDiagnostics(guildId) {
  const config = socialManager.getConfig(guildId);
  const providers = providerDiagnostics(guildId);
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));
  const queueItems = socialQueue.list(guildId);
  const accounts = (config.accounts || []).map((account) => accountDiagnostics(account, providerMap, queueItems));
  const profiles = socialCreators.list(guildId).map((profile) => {
    const linked = accounts.filter((account) => profile.accountIds.includes(account.accountId));
    const score = linked.length ? Math.round(linked.reduce((sum, account) => sum + account.score, 0) / linked.length) : 0;
    const issues = linked.flatMap((account) => account.issues.map((issue) => ({ ...issue, accountId: account.accountId, platform: account.platform })));
    if (!linked.length) issues.push({ code: 'profile_has_no_accounts', severity: 'warning' });
    return {
      creatorId: profile.creatorId,
      displayName: profile.displayName,
      enabled: profile.enabled !== false,
      group: profile.group,
      tags: profile.tags,
      accountCount: linked.length,
      score,
      grade: diagnosticGrade(score),
      issues,
    };
  });

  return { accounts, profiles };
}

function buildDiagnostics(guildId) {
  const providers = providerDiagnostics(guildId);
  const creators = creatorDiagnostics(guildId);
  const scored = creators.accounts.filter((account) => account.enabled);
  const score = scored.length ? Math.round(scored.reduce((sum, account) => sum + account.score, 0) / scored.length) : 100;
  return {
    module: 'social',
    guildId: String(guildId),
    checkedAt: new Date().toISOString(),
    score,
    grade: diagnosticGrade(score),
    providers,
    accounts: creators.accounts,
    profiles: creators.profiles,
    queue: socialQueue.summary(guildId),
    history: socialHistory.summary(guildId),
  };
}

const socialDiagnostics = Object.freeze({
  SCORE_WEIGHTS: DIAGNOSTIC_SCORE_WEIGHTS,
  grade: diagnosticGrade,
  providerDiagnostics,
  creatorDiagnostics,
  buildDiagnostics,
});

const STARTUP_KEY = Symbol.for('goliath.social.startup');

async function startup(client, options = {}) {
  if (!client?.guilds?.cache) throw new Error('Discord client is unavailable.');
  if (client[STARTUP_KEY]) return client[STARTUP_KEY];
  const initialCheck = await socialScheduler.runSocialCheck(client, options);
  const schedulerTimer = socialScheduler.startSocialScheduler(client, options);
  const queueTimer = socialQueue.start(client, options.queue || {});
  client[STARTUP_KEY] = { startedAt: new Date().toISOString(), initialCheck, schedulerTimer, queueTimer };
  return client[STARTUP_KEY];
}

module.exports = {
  ...socialManager,
  history: socialHistory,
  queue: socialQueue,
  creators: socialCreators,
  simulator: socialSimulator,
  diagnostics: socialDiagnostics,
  delivery: socialDelivery,
  providers: providerRegistry,
  scheduler: socialScheduler,
  startup,
};