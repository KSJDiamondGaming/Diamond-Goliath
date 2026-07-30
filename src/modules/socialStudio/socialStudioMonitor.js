'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const guildManager = require('../../core/guild/guildManager');
const { checkAccount, providerInfo } = require('./socialStudioProviders');

const runningGuilds = new Set();
let timer = null;

const now = () => new Date().toISOString();
const clean = (value, max = 2000) => String(value || '').trim().slice(0, max);

function configFor(guildId) {
  const guild = guildManager.reloadGuild(guildId);
  const social = guild?.modules?.social && typeof guild.modules.social === 'object' ? guild.modules.social : {};
  return {
    ...social,
    enabled: guildManager.isModuleEnabled(guildId, 'social'),
    alertsChannelId: social.alertsChannelId || null,
    accounts: social.accounts && typeof social.accounts === 'object' ? social.accounts : {},
    creators: social.creators && typeof social.creators === 'object' ? social.creators : {},
    templates: social.templates && typeof social.templates === 'object' ? social.templates : {},
    settings: social.settings && typeof social.settings === 'object' ? social.settings : {},
    history: Array.isArray(social.history) ? social.history : [],
    analytics: social.analytics && typeof social.analytics === 'object' ? social.analytics : {},
  };
}

function saveMonitorState(guildId, config, monitorUpdates, analyticsDelta, historyEntries, guild = null) {
  const updated = guildManager.updateGuildSection(
    guildId,
    'social',
    (latest = {}) => {
      const latestAccounts = latest.accounts && typeof latest.accounts === 'object' ? latest.accounts : {};
      const accounts = { ...latestAccounts };

      for (const [accountId, update] of monitorUpdates.entries()) {
        const current = accounts[accountId];
        if (!current || typeof current !== 'object') continue;
        accounts[accountId] = {
          ...current,
          state: update.state,
          ...(update.externalId && !current.externalId ? { externalId: update.externalId } : {}),
          updatedAt: update.updatedAt,
        };
      }

      const latestAnalytics = latest.analytics && typeof latest.analytics === 'object' ? latest.analytics : {};
      const analytics = { ...latestAnalytics };
      for (const [key, amount] of Object.entries(analyticsDelta || {})) {
        if (!Number.isFinite(Number(amount)) || Number(amount) === 0) continue;
        analytics[key] = Number(analytics[key] || 0) + Number(amount);
      }

      const latestHistory = Array.isArray(latest.history) ? latest.history : [];
      const history = [...latestHistory, ...(historyEntries || [])].slice(-1000);

      return {
        ...latest,
        accounts,
        analytics,
        history,
        updatedAt: now(),
      };
    },
    {},
    guild || { guildId }
  );

  return { ...updated, enabled: guildManager.isModuleEnabled(guildId, 'social') };
}

function creatorFor(config, accountId) {
  return Object.values(config.creators).find((creator) => Array.isArray(creator.accountIds) && creator.accountIds.includes(accountId)) || null;
}

function templateFor(config, type) {
  const defaults = {
    live: { title: '{creator} is now live', description: '{title}', buttonLabel: 'Watch now' },
    upload: { title: '{creator} uploaded a new video', description: '{title}', buttonLabel: 'Watch now' },
    short: { title: '{creator} posted a new short', description: '{title}', buttonLabel: 'Watch now' },
    post: { title: '{creator} shared a new post', description: '{title}', buttonLabel: 'View post' },
  };
  return { ...defaults[type], ...(config.templates?.[type] || {}) };
}

function render(value, vars) {
  return String(value || '').replace(/\{(creator|title|platform|url)\}/g, (_match, key) => vars[key] || '');
}

function addHistory(config, event) {
  config.history = [...(config.history || []), { id: `history_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, createdAt: now(), ...event }].slice(-1000);
}

function enabledAlert(account, type) {
  const supported = providerInfo(account.platform).supportedAlertTypes || [];
  const configured = Array.isArray(account.alertTypes) && account.alertTypes.length ? account.alertTypes : [];
  const effective = configured.some((item) => supported.includes(item)) ? configured : supported;
  return effective.includes(type);
}

function eventCandidates(account, previous, checked) {
  const events = [];
  if (checked.isLive === true && previous.isLive !== true && checked.event) events.push(checked.event);
  const latest = checked.latestContent;
  if (latest?.id && previous.latestContentId && String(previous.latestContentId) !== String(latest.id)) events.push(latest);
  return events.filter((event) => enabledAlert(account, event.type));
}

async function sendEvent(client, guildId, config, account, creator, event) {
  const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!discordGuild) throw new Error('Discord guild is unavailable.');
  const channelId = account.alertChannelId || config.alertsChannelId;
  if (!channelId) throw new Error('No Social Studio notification channel is configured.');
  const channel = discordGuild.channels.cache.get(channelId) || await discordGuild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.() || typeof channel.send !== 'function') throw new Error('Configured Social Studio notification channel is unavailable.');

  const creatorName = creator?.displayName || account.displayName || account.username;
  const url = event.url || account.profileUrl || account.url || '';
  const vars = { creator: creatorName, title: event.title || '', platform: account.platform, url };
  const template = templateFor(config, event.type);
  const embed = new EmbedBuilder()
    .setColor(event.type === 'live' ? 0xED4245 : 0x5865F2)
    .setTitle(clean(render(template.title, vars), 256) || `${creatorName} update`)
    .setDescription(clean(render(template.description, vars), 4096) || clean(event.title, 4096) || `${creatorName} has a new ${event.type}.`)
    .setFooter({ text: `${account.platform.toUpperCase()} • Social Studio` })
    .setTimestamp();

  if (event.thumbnail && /^https?:\/\//i.test(event.thumbnail)) embed.setImage(event.thumbnail);
  const fields = [];
  if (event.category) fields.push({ name: 'Category', value: clean(event.category, 1024), inline: true });
  if (Number.isFinite(Number(event.viewerCount))) fields.push({ name: 'Viewers', value: Number(event.viewerCount).toLocaleString('en-GB'), inline: true });
  if (event.startedAt) fields.push({ name: 'Started', value: `<t:${Math.floor(new Date(event.startedAt).getTime() / 1000)}:R>`, inline: true });
  if (fields.length) embed.addFields(fields);

  const components = /^https?:\/\//i.test(url) ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(clean(template.buttonLabel || 'Open', 80)))] : [];
  const mentionMode = account.mentionMode || 'none';
  const content = mentionMode === 'everyone' ? '@everyone' : mentionMode === 'here' ? '@here' : mentionMode === 'role' && account.mentionRoleId ? `<@&${account.mentionRoleId}>` : undefined;
  return channel.send({ content, embeds: [embed], components, allowedMentions: { parse: mentionMode === 'everyone' || mentionMode === 'here' ? ['everyone'] : [], roles: account.mentionRoleId ? [account.mentionRoleId] : [] } });
}

async function checkGuildAccounts(client, guildId, options = {}) {
  if (!client || !guildId) throw new Error('Social Studio check requires a Discord client and guild ID.');
  if (runningGuilds.has(guildId)) return { guildId, skipped: true, reason: 'check_already_running', results: [] };
  runningGuilds.add(guildId);
  try {
    const config = configFor(guildId);
    if (!config.enabled && !options.manual) return { guildId, skipped: true, reason: 'module_disabled', results: [] };
    const interval = Math.max(60000, Number(config.settings?.checkIntervalMs || 300000));
    const results = [];
    const monitorUpdates = new Map();
    const analyticsStart = { ...config.analytics };
    const historyStartLength = config.history.length;

    for (const account of Object.values(config.accounts)) {
      if (!account || account.enabled === false) continue;
      const creator = creatorFor(config, account.accountId);
      if (creator?.enabled === false) continue;
      const previous = account.state && typeof account.state === 'object' ? { ...account.state } : {};
      const lastChecked = previous.lastCheckedAt ? new Date(previous.lastCheckedAt).getTime() : 0;
      if (!options.manual && !options.force && lastChecked && Date.now() - lastChecked < interval) continue;

      const checked = await checkAccount(account);
      const provider = providerInfo(account.platform);
      const events = eventCandidates(account, previous, checked);
      const state = {
        ...previous,
        lastCheckedAt: checked.checkedAt || now(),
        lastCheckStatus: checked.status,
        providerStatus: provider.status,
        providerSource: checked.providerSource || null,
        confidence: checked.confidence || null,
        lastError: checked.reason || null,
      };
      if (typeof checked.isLive === 'boolean') {
        state.isLive = checked.isLive;
        state.liveEventId = checked.isLive ? checked.event?.id || previous.liveEventId || null : null;
        if (checked.isLive && previous.isLive !== true) state.liveStartedAt = checked.event?.startedAt || checked.checkedAt || now();
        if (!checked.isLive && previous.isLive === true) state.lastLiveEndedAt = checked.checkedAt || now();
      }
      if (checked.latestContent?.id) {
        state.latestContentId = checked.latestContent.id;
        state.latestContentType = checked.latestContent.type;
        state.latestContentAt = checked.latestContent.publishedAt || null;
      }
      account.state = state;
      if (checked.externalId && !account.externalId) account.externalId = String(checked.externalId);
      account.updatedAt = now();
      config.analytics.checks = Number(config.analytics.checks || 0) + 1;

      const delivered = [];
      for (const event of events) {
        try {
          const key = `${event.type}:${event.id || event.url || event.title}`;
          if (config.settings?.suppressDuplicates !== false && previous.lastAlertKey === key) continue;
          const message = await sendEvent(client, guildId, config, account, creator, event);
          state.lastAlertKey = key;
          state.lastAlertAt = now();
          state.lastAlertMessageId = message.id;
          config.analytics.alertsSent = Number(config.analytics.alertsSent || 0) + 1;
          addHistory(config, { status: 'alert_sent', accountId: account.accountId, creator: creator?.displayName || account.displayName, platform: account.platform, alertType: event.type, messageId: message.id });
          delivered.push({ type: event.type, messageId: message.id });
        } catch (error) {
          state.lastDeliveryError = error.message;
          config.analytics.failures = Number(config.analytics.failures || 0) + 1;
          addHistory(config, { status: 'delivery_failed', accountId: account.accountId, platform: account.platform, alertType: event.type, error: error.message });
        }
      }
      addHistory(config, { status: 'checked', accountId: account.accountId, platform: account.platform, providerStatus: checked.status, isLive: checked.isLive, detectedEvents: events.map((event) => event.type), delivered: delivered.length });
      monitorUpdates.set(account.accountId, {
        state: { ...state },
        externalId: account.externalId ? String(account.externalId) : null,
        updatedAt: account.updatedAt,
      });
      results.push({ accountId: account.accountId, platform: account.platform, username: account.username, status: checked.status, isLive: checked.isLive, reason: checked.reason || null, events: events.map((event) => ({ type: event.type, id: event.id })), delivered });
    }

    if (monitorUpdates.size) {
      const analyticsDelta = {};
      for (const key of new Set([...Object.keys(analyticsStart), ...Object.keys(config.analytics)])) {
        const delta = Number(config.analytics[key] || 0) - Number(analyticsStart[key] || 0);
        if (delta) analyticsDelta[key] = delta;
      }
      const historyEntries = config.history.slice(historyStartLength);
      saveMonitorState(guildId, config, monitorUpdates, analyticsDelta, historyEntries, client.guilds.cache.get(guildId) || null);
    }
    return { guildId, checked: results.length, results };
  } finally {
    runningGuilds.delete(guildId);
  }
}

async function sweep(client) {
  for (const guild of client.guilds.cache.values()) {
    try { await checkGuildAccounts(client, guild.id); }
    catch (error) { console.error(`[Social Studio] automatic check failed for guild ${guild.id}:`, error?.message || error); }
  }
}

function startupSocialStudio(client) {
  if (timer) return timer;
  const tickMs = Math.max(30000, Number(process.env.SOCIAL_STUDIO_TICK_MS || 60000));
  setTimeout(() => sweep(client).catch((error) => console.error('[Social Studio] initial sweep failed:', error)), 5000).unref?.();
  timer = setInterval(() => sweep(client).catch((error) => console.error('[Social Studio] sweep failed:', error)), tickMs);
  timer.unref?.();
  console.log(`✅ Social Studio monitor started (${tickMs}ms scheduler tick)`);
  return timer;
}

module.exports = { startupSocialStudio, checkGuildAccounts, providerInfo };
