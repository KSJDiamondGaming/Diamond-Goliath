'use strict';

const { EmbedBuilder } = require('discord.js');
const guildManager = require('../../core/guild/guildManager');
const { checkAccount, providerInfo } = require('./socialStudioProviders');

const runningGuilds = new Set();
let timer = null;

const PLATFORM = {
  twitch: { label: 'Twitch', icon: '🟣', color: 0x9146FF },
  youtube: { label: 'YouTube', icon: '🔴', color: 0xFF0000 },
  tiktok: { label: 'TikTok', icon: '⚫', color: 0x111111 },
  kick: { label: 'Kick', icon: '🟢', color: 0x53FC18 },
  facebook: { label: 'Facebook', icon: '🔵', color: 0x1877F2 },
  instagram: { label: 'Instagram', icon: '🟠', color: 0xE1306C },
  x: { label: 'X', icon: '⚪', color: 0x000000 },
};

const now = () => new Date().toISOString();
const clean = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const intText = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-GB') : '';

function configFor(guildId) {
  const guild = guildManager.reloadGuild(guildId);
  const social = guild?.modules?.social && typeof guild.modules.social === 'object' ? guild.modules.social : {};
  return {
    ...social,
    enabled: guildManager.isModuleEnabled(guildId, 'social'),
    alertsChannelId: social.alertsChannelId || null,
    alertChannels: social.alertChannels && typeof social.alertChannels === 'object' ? social.alertChannels : {},
    accounts: social.accounts && typeof social.accounts === 'object' ? social.accounts : {},
    creators: social.creators && typeof social.creators === 'object' ? social.creators : {},
    templates: social.templates && typeof social.templates === 'object' ? social.templates : {},
    settings: social.settings && typeof social.settings === 'object' ? social.settings : {},
    history: Array.isArray(social.history) ? social.history : [],
    analytics: social.analytics && typeof social.analytics === 'object' ? social.analytics : {},
  };
}

function saveMonitorState(guildId, config, monitorUpdates, analyticsDelta, historyEntries, guild = null, duplicateMerges = new Map()) {
  const updated = guildManager.updateGuildSection(
    guildId,
    'social',
    (latest = {}) => {
      const latestAccounts = latest.accounts && typeof latest.accounts === 'object' ? latest.accounts : {};
      const accounts = { ...latestAccounts };
      const latestCreators = latest.creators && typeof latest.creators === 'object' ? latest.creators : {};
      const creators = Object.fromEntries(Object.entries(latestCreators).map(([id, creator]) => [id, { ...creator, accountIds: Array.isArray(creator?.accountIds) ? [...creator.accountIds] : [] }]));

      for (const [accountId, update] of monitorUpdates.entries()) {
        const current = accounts[accountId];
        if (!current || typeof current !== 'object') continue;
        accounts[accountId] = {
          ...current,
          state: update.state,
          ...(update.externalId ? { externalId: update.externalId } : {}),
          ...(update.resolvedUsername ? { username: update.resolvedUsername, normalizedUsername: update.resolvedUsername.toLowerCase() } : {}),
          ...(update.profileUrl ? { profileUrl: update.profileUrl } : {}),
          ...(update.avatar ? { avatar: update.avatar } : {}),
          updatedAt: update.updatedAt,
        };
      }

      for (const [duplicateId, survivorId] of duplicateMerges.entries()) {
        if (duplicateId === survivorId) continue;
        const duplicate = accounts[duplicateId];
        const survivor = accounts[survivorId];
        if (!duplicate || !survivor) continue;

        const alertTypes = [...new Set([
          ...(Array.isArray(survivor.alertTypes) ? survivor.alertTypes : []),
          ...(Array.isArray(duplicate.alertTypes) ? duplicate.alertTypes : []),
        ])];
        accounts[survivorId] = {
          ...survivor,
          ...(alertTypes.length ? { alertTypes } : {}),
          alertChannelId: survivor.alertChannelId || duplicate.alertChannelId || null,
          alertChannels: { ...(duplicate.alertChannels || {}), ...(survivor.alertChannels || {}) },
          mentionMode: survivor.mentionMode && survivor.mentionMode !== 'none' ? survivor.mentionMode : duplicate.mentionMode || survivor.mentionMode || 'none',
          mentionRoleId: survivor.mentionRoleId || duplicate.mentionRoleId || null,
          createdAt: survivor.createdAt || duplicate.createdAt,
          updatedAt: now(),
        };
        delete accounts[duplicateId];

        for (const creator of Object.values(creators)) {
          creator.accountIds = [...new Set((creator.accountIds || []).map((id) => id === duplicateId ? survivorId : id))];
        }
      }

      const latestAnalytics = latest.analytics && typeof latest.analytics === 'object' ? latest.analytics : {};
      const analytics = { ...latestAnalytics };
      for (const [key, amount] of Object.entries(analyticsDelta || {})) {
        if (!Number.isFinite(Number(amount)) || Number(amount) === 0) continue;
        analytics[key] = Number(analytics[key] || 0) + Number(amount);
      }

      const latestHistory = Array.isArray(latest.history) ? latest.history : [];
      const history = [...latestHistory, ...(historyEntries || [])].slice(-1000);
      return { ...latest, accounts, creators, analytics, history, updatedAt: now() };
    },
    {},
    guild || { guildId },
  );

  return { ...updated, enabled: guildManager.isModuleEnabled(guildId, 'social') };
}

function creatorFor(config, accountId) {
  return Object.values(config.creators).find((creator) => Array.isArray(creator.accountIds) && creator.accountIds.includes(accountId)) || null;
}

function identityToken(value) {
  return String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function validTikTokHandle(value) {
  return /^[a-z0-9._]{2,24}$/i.test(String(value || '').replace(/^@+/, ''));
}

function resolvedDuplicateIds(config, account, checked, creator) {
  if (!creator || !account?.accountId) return [];
  const platform = String(account.platform || '').toLowerCase();
  const externalId = clean(checked.externalId || account.externalId);
  const username = clean(checked.resolvedUsername || account.username).replace(/^@+/, '').toLowerCase();
  if (!externalId && !username) return [];

  const resolvedToken = identityToken(username);
  const duplicateIds = [];
  for (const otherId of creator.accountIds || []) {
    if (otherId === account.accountId) continue;
    const other = config.accounts[otherId];
    if (!other || String(other.platform || '').toLowerCase() !== platform) continue;

    const otherExternalId = clean(other.externalId);
    const otherUsername = clean(other.normalizedUsername || other.username).replace(/^@+/, '').toLowerCase();
    if (externalId && otherExternalId && externalId === otherExternalId) {
      duplicateIds.push(otherId);
      continue;
    }
    if (username && otherUsername && username === otherUsername) {
      duplicateIds.push(otherId);
      continue;
    }

    if (platform === 'tiktok' && externalId && !otherExternalId && !validTikTokHandle(otherUsername)) {
      const aliasToken = identityToken(otherUsername || other.sourceInput);
      if (aliasToken && resolvedToken.startsWith(aliasToken)) {
        const suffix = resolvedToken.slice(aliasToken.length);
        if (/^\d{2,6}$/.test(suffix)) duplicateIds.push(otherId);
      }
    }
  }
  return [...new Set(duplicateIds)];
}

function templateFor(config, type) {
  const defaults = {
    live: { title: '🔴 {creator} is LIVE', description: '**{title}**', buttonLabel: 'Watch Live' },
    ended: { title: '⚫ {creator} has ended their stream', description: '**{title}**', buttonLabel: 'View Channel' },
    vod: { title: '🎞️ New VOD from {creator}', description: '**{title}**', buttonLabel: 'Watch VOD' },
    clip: { title: '🎬 New clip from {creator}', description: '**{title}**', buttonLabel: 'Watch Clip' },
    upload: { title: '📺 New upload from {creator}', description: '**{title}**', buttonLabel: 'Watch Now' },
    short: { title: '📱 New short from {creator}', description: '**{title}**', buttonLabel: 'Watch Now' },
    post: { title: '📰 New post from {creator}', description: '**{title}**', buttonLabel: 'View Post' },
  };
  return { ...(defaults[type] || defaults.upload), ...(config.templates?.[type] || {}) };
}

function render(value, vars) {
  return String(value || '').replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_match, key) => vars[key] ?? '');
}

function addHistory(config, event) {
  config.history = [...(config.history || []), { id: `history_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, createdAt: now(), ...event }].slice(-1000);
}

function enabledAlert(account, type) {
  const rawSupported = providerInfo(account.platform).supportedAlertTypes || [];
  const supported = rawSupported.includes('live') ? [...new Set([...rawSupported, 'ended'])] : rawSupported;
  const configured = Array.isArray(account.alertTypes) ? account.alertTypes : supported;
  return supported.includes(type) && configured.includes(type);
}

function secondsBetween(start, end) {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.floor((b - a) / 1000) : null;
}

function eventCandidates(account, previous, checked) {
  const events = [];
  if (checked.isLive === true && previous.isLive !== true && checked.event) events.push(checked.event);

  if (checked.isLive === false && previous.isLive === true && enabledAlert(account, 'ended')) {
    const prior = previous.lastLiveEvent && typeof previous.lastLiveEvent === 'object' ? previous.lastLiveEvent : {};
    const endedAt = checked.checkedAt || now();
    events.push({
      type: 'ended',
      id: `ended:${previous.liveEventId || prior.id || account.accountId}:${endedAt}`,
      title: prior.title || `${account.username || account.displayName || 'Creator'} stream ended`,
      url: prior.url || account.profileUrl || account.url || '',
      thumbnail: prior.thumbnail || null,
      category: prior.category || null,
      startedAt: previous.liveStartedAt || prior.startedAt || null,
      endedAt,
      durationSeconds: secondsBetween(previous.liveStartedAt || prior.startedAt, endedAt),
      peakViewers: previous.peakViewers || prior.viewerCount || null,
    });
  }

  const contentItems = Array.isArray(checked.contentItems) && checked.contentItems.length
    ? checked.contentItems
    : checked.latestContent ? [checked.latestContent] : [];
  const previousIds = previous.contentIds && typeof previous.contentIds === 'object' ? previous.contentIds : {};

  for (const item of contentItems) {
    if (!item?.type || !item?.id) continue;
    const oldId = previousIds[item.type] || (previous.latestContentType === item.type ? previous.latestContentId : null);
    if (oldId && String(oldId) !== String(item.id)) events.push(item);
  }

  return events.filter((event) => enabledAlert(account, event.type));
}

function discordTimestamp(value, style = 'R') {
  const ms = new Date(value).getTime();
  const earliest = Date.UTC(2020, 0, 1);
  const latest = Date.now() + 24 * 60 * 60 * 1000;
  return Number.isFinite(ms) && ms >= earliest && ms <= latest ? `<t:${Math.floor(ms / 1000)}:${style}>` : '';
}

function humanDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '';
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = Math.floor(value % 60);
  return [h ? `${h}h` : '', m ? `${m}m` : '', !h && s ? `${s}s` : ''].filter(Boolean).join(' ');
}

function colorHex(color) {
  return `#${Number(color || 0).toString(16).padStart(6, '0').toUpperCase()}`;
}

function parseTemplateColor(value, fallback) {
  const raw = clean(value, 16).replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(raw) ? Number.parseInt(raw, 16) : fallback;
}

function accountAge(createdAt) {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return '';
  return humanDuration(Math.floor((Date.now() - created) / 1000));
}

async function resolveLinkedMember(discordGuild, account, creator) {
  const id = clean(account.discordUserId || creator?.discordUserId || creator?.userId);
  if (!/^\d{15,22}$/.test(id)) return null;
  return discordGuild.members.cache.get(id) || await discordGuild.members.fetch(id).catch(() => null);
}

function variableMap(discordGuild, member, account, creator, event) {
  const platform = PLATFORM[account.platform] || { label: account.platform || 'Unknown', icon: '🌐', color: 0x5865F2 };
  const creatorName = creator?.displayName || account.displayName || account.username || 'Creator';
  const profile = account.profileUrl || account.url || '';
  const url = event.url || profile;
  const duration = clean(event.duration) || humanDuration(event.durationSeconds);
  const viewers = Number(event.viewerCount) > 0 ? intText(event.viewerCount) : '';
  const views = Number(event.viewCount) > 0 ? intText(event.viewCount) : '';
  const peak = Number(event.peakViewers) > 0 ? intText(event.peakViewers) : '';
  const started = discordTimestamp(event.startedAt);
  const published = discordTimestamp(event.publishedAt);
  const user = member?.user || null;
  const userCreated = user?.createdAt || null;
  const joined = member?.joinedAt || null;
  const timestampValue = event.publishedAt || event.startedAt || event.endedAt || now();
  const thumb = event.thumbnail || '';
  const description = clean(event.description || event.summary || '');

  return {
    creator: creatorName,
    creatorName,
    creatorDisplayName: creatorName,
    creatorAvatar: account.avatar || creator?.avatar || '',
    creatorBanner: creator?.banner || '',
    creatorDescription: creator?.description || creator?.notes || '',
    platform: platform.label,
    platformIcon: platform.icon,
    platformColor: colorHex(platform.color),
    username: account.username || '',
    displayName: account.displayName || creatorName,
    channelId: account.externalId || '',
    profileUrl: profile,
    title: event.title || '',
    description,
    game: event.category || event.game || '',
    category: event.category || event.game || '',
    viewers,
    views,
    peakViewers: peak,
    started,
    duration,
    liveThumbnail: event.type === 'live' ? thumb : '',
    thumbnail: thumb,
    liveUrl: event.type === 'live' ? url : profile,
    videoTitle: ['vod', 'upload'].includes(event.type) ? event.title || '' : '',
    videoDescription: ['vod', 'upload'].includes(event.type) ? description : '',
    videoDuration: ['vod', 'upload'].includes(event.type) ? duration : '',
    videoViews: ['vod', 'upload'].includes(event.type) ? views : '',
    videoThumbnail: ['vod', 'upload'].includes(event.type) ? thumb : '',
    videoUrl: ['vod', 'upload'].includes(event.type) ? url : '',
    clipTitle: event.type === 'clip' ? event.title || '' : '',
    clipCreator: event.type === 'clip' ? event.creatorName || event.creator || creatorName : '',
    clipViews: event.type === 'clip' ? views : '',
    clipUrl: event.type === 'clip' ? url : '',
    uploadTitle: event.type === 'upload' ? event.title || '' : '',
    uploadDescription: event.type === 'upload' ? description : '',
    uploadThumbnail: event.type === 'upload' ? thumb : '',
    uploadUrl: event.type === 'upload' ? url : '',
    shortTitle: event.type === 'short' ? event.title || '' : '',
    shortThumbnail: event.type === 'short' ? thumb : '',
    shortUrl: event.type === 'short' ? url : '',
    url,
    published,
    userId: user?.id || '',
    userTag: user?.tag || user?.username || '',
    userName: user?.username || '',
    userGlobalName: user?.globalName || '',
    userMention: user?.id ? `<@${user.id}>` : '',
    userNoPing: user?.id ? `<@${user.id}>`.replace('@', '@\u200b') : '',
    userAvatar: user?.displayAvatarURL?.({ size: 1024 }) || '',
    userServerAvatar: member?.displayAvatarURL?.({ size: 1024 }) || '',
    userNickname: member?.nickname || '',
    userDisplay: member?.displayName || user?.globalName || user?.username || '',
    userCreatedAt: userCreated ? userCreated.toISOString() : '',
    userCreatedTimestamp: userCreated ? `<t:${Math.floor(userCreated.getTime() / 1000)}:F>` : '',
    userJoinedAt: joined ? joined.toISOString() : '',
    userJoinedTimestamp: joined ? `<t:${Math.floor(joined.getTime() / 1000)}:F>` : '',
    createdAt: event.publishedAt || event.startedAt || event.endedAt || '',
    joinedAt: joined ? joined.toISOString() : '',
    leftAt: event.leftAt || '',
    timestamp: discordTimestamp(timestampValue, 'F'),
    accountAge: accountAge(userCreated),
    membershipDuration: accountAge(joined),
    departureIcon: event.departureIcon || '',
    departureType: event.departureType || '',
    departureLabel: event.departureLabel || '',
    departureReason: event.departureReason || '',
    departureModerator: event.departureModerator || '',
    departureModeratorId: event.departureModeratorId || '',
    nowTimestamp: `<t:${Math.floor(Date.now() / 1000)}:F>`,
    successEmoji: '✅',
    warningEmoji: '⚠️',
    errorEmoji: '❌',
    proofVerifiedEmoji: '✅',
    successColor: '#57F287',
    warningColor: '#FEE75C',
    errorColor: '#ED4245',
    proofVerifiedColor: '#57F287',
    guildId: discordGuild.id,
    guildName: discordGuild.name,
    server: discordGuild.name,
    guildIcon: discordGuild.iconURL?.({ size: 1024 }) || '',
    serverIcon: discordGuild.iconURL?.({ size: 1024 }) || '',
    guildBanner: discordGuild.bannerURL?.({ size: 2048 }) || '',
    guildMemberCount: String(discordGuild.memberCount || ''),
    memberCount: String(discordGuild.memberCount || ''),
    guildVanityCode: discordGuild.vanityURLCode || '',
  };
}

async function resolveAlertChannel(discordGuild, config, account, eventType) {
  const candidates = [
    account.alertChannels?.[eventType],
    account.alertChannelId,
    config.alertChannels?.[eventType],
    config.alertsChannelId,
  ].filter(Boolean);

  for (const channelId of [...new Set(candidates)]) {
    const channel = discordGuild.channels.cache.get(channelId) || await discordGuild.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased?.() && typeof channel.send === 'function') return channel;
  }
  if (!candidates.length) throw new Error(`No Social Studio notification channel is configured for ${eventType}.`);
  throw new Error(`No configured Social Studio channel for ${eventType} is currently available.`);
}

const FORCE_LIVE_WINDOW_MS = 2 * 60 * 60 * 1000;

function livePostInWindow(config, creator, windowMs = FORCE_LIVE_WINDOW_MS) {
  const accountIds = new Set((creator?.accountIds || []).map(String));
  const cutoff = Date.now() - windowMs;
  const stateMatch = (creator?.accountIds || [])
    .map((id) => config.accounts?.[id])
    .filter(Boolean)
    .find((account) => {
      if (!String(account.state?.lastAlertKey || '').startsWith('live:')) return false;
      const sent = new Date(account.state?.lastAlertAt || '').getTime();
      return Number.isFinite(sent) && sent >= cutoff;
    });
  if (stateMatch) return { status: 'alert_sent', alertType: 'live', accountId: stateMatch.accountId, createdAt: stateMatch.state.lastAlertAt, source: 'account_state' };
  return [...(config.history || [])].reverse().find((entry) => {
    if (entry?.status !== 'alert_sent' || entry?.alertType !== 'live') return false;
    const created = new Date(entry.createdAt).getTime();
    if (!Number.isFinite(created) || created < cutoff) return false;
    if (entry.creatorId && String(entry.creatorId) === String(creator.creatorId)) return true;
    if (entry.accountId && accountIds.has(String(entry.accountId))) return true;
    return false;
  }) || null;
}

function liveAccountsForCreator(config, creator) {
  return (creator?.accountIds || [])
    .map((id) => config.accounts?.[id])
    .filter((account) => account && account.enabled !== false && account.state?.isLive === true && account.state?.lastLiveEvent)
    .sort((a, b) => new Date(b.state?.lastCheckedAt || 0) - new Date(a.state?.lastCheckedAt || 0));
}

async function forcePostCreatorLive(client, guildId, creatorId, options = {}) {
  const config = configFor(guildId);
  const creator = config.creators?.[creatorId];
  if (!creator) throw new Error('Select a creator profile first.');
  if (creator.enabled === false) throw new Error('This creator profile is paused.');
  const recent = options.bypassCooldown === true ? null : livePostInWindow(config, creator);
  if (recent) throw new Error('A LIVE post was already sent for this creator in the last 2 hours.');
  const liveAccounts = liveAccountsForCreator(config, creator);
  if (!liveAccounts.length) throw new Error('No checked LIVE account is available for this creator yet.');

  const account = liveAccounts[0];
  const sourceEvent = account.state.lastLiveEvent;
  const event = { ...sourceEvent, type: 'live', id: sourceEvent.id || account.state.liveEventId || 'manual-live:' + account.accountId };
  const message = await sendEvent(client, guildId, config, account, creator, event);
  const sentAt = now();
  const channelId = message.socialStudioChannelId || message.channelId || null;
  const alertKey = 'live:' + (event.id || event.url || event.title);

  guildManager.updateGuildSection(guildId, 'social', (latest = {}) => {
    const accounts = latest.accounts && typeof latest.accounts === 'object' ? { ...latest.accounts } : {};
    const current = accounts[account.accountId] && typeof accounts[account.accountId] === 'object' ? accounts[account.accountId] : account;
    accounts[account.accountId] = {
      ...current,
      state: {
        ...(current.state && typeof current.state === 'object' ? current.state : {}),
        lastAlertKey: alertKey,
        lastAlertAt: sentAt,
        lastAlertMessageId: message.id,
        lastAlertChannelId: channelId,
        lastDeliveryError: null,
      },
      updatedAt: sentAt,
    };
    const analytics = latest.analytics && typeof latest.analytics === 'object' ? { ...latest.analytics } : {};
    analytics.alertsSent = Number(analytics.alertsSent || 0) + 1;
    const history = [...(Array.isArray(latest.history) ? latest.history : []), {
      id: 'history_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      createdAt: sentAt,
      status: 'alert_sent',
      manual: true,
      actorId: options.actorId || null,
      creatorId: creator.creatorId,
      creator: creator.displayName || account.displayName,
      accountId: account.accountId,
      platform: account.platform,
      alertType: 'live',
      contentId: event.id || null,
      messageId: message.id,
      channelId,
    }].slice(-1000);
    return { ...latest, accounts, analytics, history, updatedAt: sentAt };
  }, {}, options.guild || { guildId });

  return { accountId: account.accountId, platform: account.platform, username: account.username || account.externalId || null, messageId: message.id, channelId };
}

async function sendEvent(client, guildId, config, account, creator, event) {
  const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!discordGuild) throw new Error('Discord guild is unavailable.');
  const channel = await resolveAlertChannel(discordGuild, config, account, event.type);
  const member = await resolveLinkedMember(discordGuild, account, creator);
  const vars = variableMap(discordGuild, member, account, creator, event);
  const template = templateFor(config, event.type);
  const platform = PLATFORM[account.platform] || { label: account.platform || 'Unknown', icon: '🌐', color: 0x5865F2 };
  const creatorName = vars.creator;
  const url = vars.url;
  const profileUrl = account.profileUrl || account.url || '';
  const durationText = vars.duration;
  const embedColor = parseTemplateColor(render(template.color || '', vars), platform.color);

  const baseDescription = clean(render(template.description, vars), 3800) || clean(event.title, 3800) || `${creatorName} has a new ${event.type}.`;
  const actionLabel = clean(render(template.buttonLabel || (event.type === 'live' ? 'Watch Live' : 'Open'), vars), 80) || (event.type === 'live' ? 'Watch Live' : 'Open');
  const actionLines = [];
  if (/^https?:\/\//i.test(url)) actionLines.push(`🚀 **[${actionLabel}](${url})**`);
  if (/^https?:\/\//i.test(profileUrl) && profileUrl !== url) actionLines.push(`👤 [Creator Profile](${profileUrl})`);
  const embedCallToAction = actionLines.length ? `\n\n${actionLines.join('\n')}` : '';

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(clean(render(template.title, vars), 256) || `${creatorName} update`)
    .setDescription(clean(baseDescription + embedCallToAction, 4096))
    .setFooter({ text: clean(render(template.footer || `Social Studio • ${platform.label}`, vars), 2048) || `Social Studio • ${platform.label}` })
    .setTimestamp();

  const authorIcon = account.avatar || creator?.avatar || null;
  const author = { name: `${platform.icon} ${creatorName}` };
  if (/^https?:\/\//i.test(authorIcon || '')) author.iconURL = authorIcon;
  if (/^https?:\/\//i.test(profileUrl)) author.url = profileUrl;
  embed.setAuthor(author);

  if (/^https?:\/\//i.test(event.thumbnail || '')) embed.setImage(event.thumbnail);
  if (/^https?:\/\//i.test(account.avatar || '')) embed.setThumbnail(account.avatar);

  const fields = [];
  if (account.platform !== 'tiktok' && (event.category || event.game)) fields.push({ name: '🎮 Game', value: clean(event.category || event.game, 1024), inline: true });
  if (vars.viewers) fields.push({ name: '👥 Viewers', value: vars.viewers, inline: true });
  if (vars.peakViewers) fields.push({ name: '📈 Peak', value: vars.peakViewers, inline: true });
  if (Number(event.viewCount) > 0) fields.push({ name: '👁️ Views', value: intText(event.viewCount), inline: true });
  if (durationText) fields.push({ name: '⏱️ Duration', value: durationText, inline: true });
  const started = discordTimestamp(event.startedAt);
  if (started) fields.push({ name: '🟢 Started', value: started, inline: true });
  const ended = discordTimestamp(event.endedAt);
  if (ended) fields.push({ name: '⚫ Ended', value: ended, inline: true });
  const published = discordTimestamp(event.publishedAt);
  if (published) fields.push({ name: '📅 Published', value: published, inline: true });

  if (fields.length) embed.addFields(fields.slice(0, 25));

  const components = [];

  const mentionMode = account.mentionMode || 'none';
  const content = mentionMode === 'everyone' ? '@everyone' : mentionMode === 'here' ? '@here' : mentionMode === 'role' && account.mentionRoleId ? `<@&${account.mentionRoleId}>` : undefined;
  const message = await channel.send({
    content,
    embeds: [embed],
    components,
    allowedMentions: {
      parse: mentionMode === 'everyone' || mentionMode === 'here' ? ['everyone'] : [],
      roles: account.mentionRoleId ? [account.mentionRoleId] : [],
    },
  });
  message.socialStudioChannelId = channel.id;
  return message;
}

async function checkGuildAccounts(client, guildId, options = {}) {
  if (!client || !guildId) throw new Error('Social Studio check requires a Discord client and guild ID.');
  if (runningGuilds.has(guildId)) return { guildId, skipped: true, reason: 'check_already_running', results: [] };
  runningGuilds.add(guildId);
  try {
    const config = configFor(guildId);
    if (!config.enabled && !options.manual) return { guildId, skipped: true, reason: 'module_disabled', results: [] };
    const interval = Math.max(60000, Number(config.settings?.checkIntervalMs || 300000));
    const accountFilter = new Set((options.accountIds || []).map(String));
    const creatorFilter = new Set((options.creatorIds || []).map(String));
    const results = [];
    const monitorUpdates = new Map();
    const duplicateMerges = new Map();
    const analyticsStart = { ...config.analytics };
    const historyStartLength = config.history.length;

    for (const account of Object.values(config.accounts)) {
      if (!account) continue;
      if (duplicateMerges.has(account.accountId)) continue;
      if (accountFilter.size && !accountFilter.has(String(account.accountId))) continue;
      const creator = creatorFor(config, account.accountId);
      if (creatorFilter.size && !creatorFilter.has(String(creator?.creatorId || ''))) continue;
      if (account.enabled === false && !options.includeDisabled) continue;
      if (creator?.enabled === false && !options.includeDisabled) continue;

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
        if (checked.isLive) {
          state.lastLiveEvent = checked.event ? { ...checked.event } : previous.lastLiveEvent || null;
          const viewers = Number(checked.event?.viewerCount);
          if (Number.isFinite(viewers) && viewers > 0) state.peakViewers = previous.isLive === true ? Math.max(Number(previous.peakViewers || 0), viewers) : viewers;
        }
        if (checked.isLive && previous.isLive !== true) {
          state.liveStartedAt = checked.event?.startedAt || checked.checkedAt || now();
          state.peakViewers = Number(checked.event?.viewerCount) > 0 ? Number(checked.event.viewerCount) : null;
        }
        if (!checked.isLive && previous.isLive === true) state.lastLiveEndedAt = checked.checkedAt || now();
      }

      const contentItems = Array.isArray(checked.contentItems) && checked.contentItems.length
        ? checked.contentItems
        : checked.latestContent ? [checked.latestContent] : [];
      const contentIds = { ...(previous.contentIds && typeof previous.contentIds === 'object' ? previous.contentIds : {}) };
      for (const item of contentItems) {
        if (!item?.type || !item?.id) continue;
        contentIds[item.type] = String(item.id);
      }
      state.contentIds = contentIds;
      if (checked.latestContent?.id) {
        state.latestContentId = checked.latestContent.id;
        state.latestContentType = checked.latestContent.type;
        state.latestContentAt = checked.latestContent.publishedAt || null;
      }

      account.state = state;
      if (checked.externalId) account.externalId = String(checked.externalId);
      if (checked.resolvedUsername) {
        account.username = String(checked.resolvedUsername);
        account.normalizedUsername = String(checked.resolvedUsername).toLowerCase();
      }
      if (checked.url) account.profileUrl = String(checked.url);
      if (checked.avatar) account.avatar = String(checked.avatar);
      account.updatedAt = now();
      config.analytics.checks = Number(config.analytics.checks || 0) + 1;

      const resolvedDuplicates = resolvedDuplicateIds(config, account, checked, creator);
      for (const duplicateId of resolvedDuplicates) {
        duplicateMerges.set(duplicateId, account.accountId);
        monitorUpdates.delete(duplicateId);
        addHistory(config, { status: 'account_merged', platform: account.platform, duplicateAccountId: duplicateId, accountId: account.accountId, externalId: account.externalId || null, username: account.username || null });
      }

      const delivered = [];
      for (const event of events) {
        try {
          const key = `${event.type}:${event.id || event.url || event.title}`;
          if (config.settings?.suppressDuplicates !== false && previous.lastAlertKey === key) continue;
          const message = await sendEvent(client, guildId, config, account, creator, event);
          state.lastAlertKey = key;
          state.lastAlertAt = now();
          state.lastAlertMessageId = message.id;
          state.lastAlertChannelId = message.socialStudioChannelId || message.channelId || null;
          state.lastDeliveryError = null;
          config.analytics.alertsSent = Number(config.analytics.alertsSent || 0) + 1;
          addHistory(config, { status: 'alert_sent', accountId: account.accountId, creatorId: creator?.creatorId || null, creator: creator?.displayName || account.displayName, platform: account.platform, alertType: event.type, contentId: event.id || null, messageId: message.id, channelId: state.lastAlertChannelId });
          delivered.push({ type: event.type, id: event.id || null, messageId: message.id, channelId: state.lastAlertChannelId });
        } catch (error) {
          state.lastDeliveryError = error.message;
          config.analytics.failures = Number(config.analytics.failures || 0) + 1;
          addHistory(config, { status: 'delivery_failed', accountId: account.accountId, platform: account.platform, alertType: event.type, contentId: event.id || null, error: error.message });
        }
      }

      addHistory(config, { status: 'checked', accountId: account.accountId, platform: account.platform, providerStatus: checked.status, isLive: checked.isLive, detectedEvents: events.map((event) => event.type), delivered: delivered.length });
      monitorUpdates.set(account.accountId, {
        state: { ...state },
        externalId: account.externalId ? String(account.externalId) : null,
        resolvedUsername: account.username || null,
        profileUrl: account.profileUrl || null,
        avatar: account.avatar || null,
        updatedAt: account.updatedAt,
      });
      results.push({
        accountId: account.accountId,
        creatorId: creator?.creatorId || null,
        creator: creator?.displayName || account.displayName || null,
        platform: account.platform,
        username: account.username,
        externalId: account.externalId || null,
        profileUrl: account.profileUrl || null,
        status: checked.status,
        isLive: checked.isLive,
        reason: checked.reason || null,
        providerSource: checked.providerSource || null,
        confidence: checked.confidence || null,
        live: checked.event || null,
        contentItems,
        events: events.map((event) => ({ type: event.type, id: event.id })),
        delivered,
      });
    }

    if (monitorUpdates.size || duplicateMerges.size) {
      const analyticsDelta = {};
      for (const key of new Set([...Object.keys(analyticsStart), ...Object.keys(config.analytics)])) {
        const delta = Number(config.analytics[key] || 0) - Number(analyticsStart[key] || 0);
        if (delta) analyticsDelta[key] = delta;
      }
      const historyEntries = config.history.slice(historyStartLength);
      saveMonitorState(guildId, config, monitorUpdates, analyticsDelta, historyEntries, client.guilds.cache.get(guildId) || null, duplicateMerges);
    }
    const finalResults = results.filter((item) => !duplicateMerges.has(item.accountId));
    return { guildId, checked: finalResults.length, results: finalResults, merged: duplicateMerges.size };
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

module.exports = { startupSocialStudio, checkGuildAccounts, forcePostCreatorLive, providerInfo };
