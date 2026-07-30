'use strict';

const PROVIDERS = {
  twitch: { label: 'Twitch', alertTypes: ['live', 'vod', 'clip'], env: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'] },
  youtube: { label: 'YouTube', alertTypes: ['live', 'vod', 'upload', 'short'], env: ['YOUTUBE_API_KEY'] },
  tiktok: { label: 'TikTok', alertTypes: ['live'], env: [] },
  kick: { label: 'Kick', alertTypes: ['live'], env: ['KICK_CLIENT_ID', 'KICK_CLIENT_SECRET'] },
  facebook: { label: 'Facebook', alertTypes: ['live', 'post'], envAny: [['FACEBOOK_ACCESS_TOKEN'], ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET']] },
  instagram: { label: 'Instagram', alertTypes: ['post', 'short'], env: ['INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID'] },
  x: { label: 'X', alertTypes: ['post'], env: ['X_BEARER_TOKEN'] },
};

const tokenCache = new Map();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36 GoliathSocialStudio/1.0';

function clean(value) { return String(value || '').trim(); }
function handle(account) { return clean(account.normalizedUsername || account.username).replace(/^@+/, '').replace(/^https?:\/\//i, '').split(/[/?#]/)[0]; }
function profileUrl(account) { return clean(account.profileUrl || account.url || account.username); }
function configured(def) {
  if (Array.isArray(def.env) && def.env.length) return def.env.every((key) => Boolean(process.env[key]));
  if (Array.isArray(def.envAny) && def.envAny.length) return def.envAny.some((set) => set.every((key) => Boolean(process.env[key])));
  return true;
}
function providerInfo(platform) {
  const def = PROVIDERS[platform];
  if (!def) return { id: platform, label: platform, supportedAlertTypes: [], status: 'unsupported', authorizationRequired: false, productionSupported: false };
  const ready = configured(def);
  return { id: platform, label: def.label, supportedAlertTypes: def.alertTypes, status: ready ? 'ready' : 'configuration_required', authorizationRequired: !ready, productionSupported: true };
}

async function request(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: 'follow', ...options, signal: controller.signal, headers: { 'User-Agent': UA, Accept: 'application/json,text/html;q=0.9,*/*;q=0.8', ...(options.headers || {}) } });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { }
    if (!response.ok) {
      const message = json?.message || json?.error?.message || json?.error_description || text.slice(0, 250) || `${response.status} ${response.statusText}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return { response, text, json };
  } finally { clearTimeout(timer); }
}

async function oauthClientToken(cacheKey, url, clientId, clientSecret) {
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' });
  const { json } = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!json?.access_token) throw new Error(`${cacheKey} did not return an access token.`);
  tokenCache.set(cacheKey, { token: json.access_token, expiresAt: Date.now() + Math.max(300, Number(json.expires_in || 3600)) * 1000 });
  return json.access_token;
}

function unavailable(platform, reason, status = 'unavailable') {
  return { platform, status, isLive: null, checkedAt: new Date().toISOString(), reason, providerSource: 'official_api' };
}
function result(platform, values = {}) {
  return { platform, status: values.isLive === true ? 'live' : values.status || 'offline', isLive: values.isLive === true, checkedAt: new Date().toISOString(), providerSource: values.providerSource || 'official_api', contentItems: Array.isArray(values.contentItems) ? values.contentItems : [], ...values };
}
function youtubeThumbnail(snippet = {}) {
  return snippet.thumbnails?.maxres?.url || snippet.thumbnails?.standard?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null;
}

async function checkTwitch(account) {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) return unavailable('twitch', 'Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.', 'configuration_required');
  const token = await oauthClientToken('twitch', 'https://id.twitch.tv/oauth2/token', process.env.TWITCH_CLIENT_ID, process.env.TWITCH_CLIENT_SECRET);
  const identifier = clean(account.externalId || handle(account));
  if (!identifier) return unavailable('twitch', 'Twitch username, channel ID or URL could not be resolved.');
  const byId = /^\d{4,20}$/.test(identifier);
  const headers = { Authorization: `Bearer ${token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID };
  const userQuery = byId ? `id=${encodeURIComponent(identifier)}` : `login=${encodeURIComponent(identifier)}`;
  const { json: userJson } = await request(`https://api.twitch.tv/helix/users?${userQuery}`, { headers });
  const user = userJson?.data?.[0];
  if (!user?.id) return unavailable('twitch', 'Twitch channel could not be resolved.');

  const [streamRes, videoRes, clipRes] = await Promise.all([
    request(`https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(user.id)}`, { headers }),
    request(`https://api.twitch.tv/helix/videos?user_id=${encodeURIComponent(user.id)}&first=1&type=archive`, { headers }).catch(() => ({ json: null })),
    request(`https://api.twitch.tv/helix/clips?broadcaster_id=${encodeURIComponent(user.id)}&first=1`, { headers }).catch(() => ({ json: null })),
  ]);

  const stream = streamRes.json?.data?.[0] || null;
  const video = videoRes.json?.data?.[0] || null;
  const clip = clipRes.json?.data?.[0] || null;
  const channelUrl = `https://www.twitch.tv/${encodeURIComponent(user.login)}`;
  const contentItems = [];

  if (video?.id) contentItems.push({
    type: 'vod', id: String(video.id), title: video.title || `${user.display_name || user.login} VOD`, url: video.url || `${channelUrl}/videos`,
    thumbnail: clean(video.thumbnail_url).replace('%{width}', '1280').replace('%{height}', '720'), duration: video.duration || null,
    viewCount: video.view_count, publishedAt: video.published_at || video.created_at || null,
  });
  if (clip?.id) contentItems.push({
    type: 'clip', id: String(clip.id), title: clip.title || `${user.display_name || user.login} clip`, url: clip.url,
    thumbnail: clip.thumbnail_url || null, viewCount: clip.view_count, publishedAt: clip.created_at || null, duration: clip.duration || null,
  });

  return result('twitch', {
    isLive: Boolean(stream), externalId: String(user.id), resolvedUsername: user.login, url: channelUrl, avatar: user.profile_image_url || null,
    contentItems, latestContent: contentItems[0] || null,
    event: stream ? {
      type: 'live', id: String(stream.id), title: stream.title || `${user.display_name || user.login} is live`, url: channelUrl,
      thumbnail: clean(stream.thumbnail_url).replace('{width}', '1280').replace('{height}', '720'), viewerCount: stream.viewer_count,
      startedAt: stream.started_at, category: stream.game_name, language: stream.language,
    } : null,
  });
}

async function youtubeChannel(account, key) {
  const username = handle(account);
  const suppliedId = clean(account.externalId || account.metadata?.channelId || (/^UC[\w-]{20,}$/.test(username) ? username : ''));
  const query = suppliedId ? `id=${encodeURIComponent(suppliedId)}` : `forHandle=${encodeURIComponent(username.replace(/^@/, ''))}`;
  const { json } = await request(`https://www.googleapis.com/youtube/v3/channels?part=id,snippet,contentDetails&${query}&key=${encodeURIComponent(key)}`);
  return json?.items?.[0] || null;
}
function isoSeconds(value) {
  const match = String(value || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  return match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : null;
}
async function checkYouTube(account) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return unavailable('youtube', 'Set YOUTUBE_API_KEY.', 'configuration_required');
  const channel = await youtubeChannel(account, key);
  if (!channel?.id) return unavailable('youtube', 'YouTube username, channel ID or URL could not be resolved.');

  const liveReq = request(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&eventType=live&channelId=${encodeURIComponent(channel.id)}&maxResults=1&key=${encodeURIComponent(key)}`);
  const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
  const uploadReq = uploadsId ? request(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(uploadsId)}&maxResults=5&key=${encodeURIComponent(key)}`) : Promise.resolve({ json: null });
  const [{ json: liveJson }, { json: uploadJson }] = await Promise.all([liveReq, uploadReq]);
  const live = liveJson?.items?.[0] || null;
  const uploadItems = Array.isArray(uploadJson?.items) ? uploadJson.items : [];
  const videoIds = uploadItems.map((item) => item.contentDetails?.videoId).filter(Boolean).slice(0, 5);
  let detailsById = new Map();

  if (videoIds.length) {
    try {
      const { json: detailsJson } = await request(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,liveStreamingDetails,statistics&id=${encodeURIComponent(videoIds.join(','))}&key=${encodeURIComponent(key)}`);
      detailsById = new Map((detailsJson?.items || []).map((video) => [video.id, video]));
    } catch { }
  }

  const contentItems = [];
  for (const item of uploadItems) {
    const id = item.contentDetails?.videoId;
    if (!id || id === live?.id?.videoId) continue;
    const details = detailsById.get(id) || {};
    const snippet = details.snippet || item.snippet || {};
    const seconds = isoSeconds(details.contentDetails?.duration);
    let type = 'upload';
    if (seconds !== null && seconds <= 60) type = 'short';
    else if (details.liveStreamingDetails?.actualStartTime || details.liveStreamingDetails?.actualEndTime) type = 'vod';
    contentItems.push({
      type, id, title: snippet.title || 'New YouTube video', url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: youtubeThumbnail(snippet), publishedAt: item.contentDetails?.videoPublishedAt || snippet.publishedAt || null,
      durationSeconds: seconds, viewCount: details.statistics?.viewCount ? Number(details.statistics.viewCount) : null,
      startedAt: details.liveStreamingDetails?.actualStartTime || null, endedAt: details.liveStreamingDetails?.actualEndTime || null,
    });
  }

  const channelUrl = `https://www.youtube.com/channel/${channel.id}`;
  return result('youtube', {
    isLive: Boolean(live?.id?.videoId), externalId: channel.id, resolvedUsername: channel.snippet?.customUrl?.replace(/^@/, '') || handle(account),
    url: channelUrl, avatar: youtubeThumbnail({ thumbnails: channel.snippet?.thumbnails || {} }), contentItems, latestContent: contentItems[0] || null,
    event: live?.id?.videoId ? {
      type: 'live', id: live.id.videoId, title: live.snippet?.title || 'YouTube LIVE', url: `https://www.youtube.com/watch?v=${live.id.videoId}`,
      thumbnail: youtubeThumbnail(live.snippet), startedAt: live.snippet?.publishedAt || null, category: null,
    } : null,
  });
}

function tiktokUsername(account) {
  const direct = handle(account);
  if (direct && !/^\d{6,30}$/.test(direct)) return direct;
  const candidates = [account.sourceInput, account.profileUrl, account.url]
    .map(clean)
    .filter(Boolean);
  for (const value of candidates) {
    const match = value.match(/tiktok\.com\/@([^/?#]+)/i);
    if (match?.[1]) return decodeURIComponent(match[1]).replace(/^@+/, '');
    if (!/^https?:\/\//i.test(value) && !/^\d{6,30}$/.test(value)) return value.replace(/^@+/, '').split(/[/?#]/)[0];
  }
  return '';
}

function tiktokApiResult(json, fallbackUsername, fallbackId, source) {
  const user = json?.data?.user && typeof json.data.user === 'object' ? json.data.user : {};
  const liveRoom = json?.data?.liveRoom && typeof json.data.liveRoom === 'object' ? json.data.liveRoom : {};
  const rawStatus = liveRoom.status ?? user.status;
  if (rawStatus === undefined || rawStatus === null) return null;

  const roomId = clean(liveRoom.roomId || liveRoom.room_id || user.roomId || user.room_id);
  const resolvedUsername = clean(user.uniqueId || user.unique_id || liveRoom.owner?.uniqueId || liveRoom.owner?.unique_id || fallbackUsername);
  const resolvedUserId = clean(user.id || user.userId || user.user_id || liveRoom.owner?.id || liveRoom.owner?.userId || fallbackId);
  const hasRoomId = /^[1-9]\d*$/.test(roomId);
  const isLive = Number(rawStatus) === 2 && hasRoomId;
  const resolvedProfile = resolvedUsername ? `https://www.tiktok.com/@${encodeURIComponent(resolvedUsername)}` : '';
  const resolvedLiveUrl = resolvedProfile ? `${resolvedProfile}/live` : '';
  const cover = liveRoom.cover?.url_list?.[0] || liveRoom.cover?.urlList?.[0] || liveRoom.coverUrl || liveRoom.cover_url || null;
  const avatar = user.avatarLarger || user.avatarMedium || user.avatarThumb || liveRoom.owner?.avatarLarger || null;
  const viewerCount = Number(liveRoom.user_count || liveRoom.userCount || liveRoom.viewer_count || liveRoom.viewerCount);
  const startedAtRaw = liveRoom.start_time || liveRoom.startTime;
  let startedAt = null;
  if (startedAtRaw) {
    const ms = Number(startedAtRaw) < 1000000000000 ? Number(startedAtRaw) * 1000 : Number(startedAtRaw);
    if (Number.isFinite(ms)) startedAt = new Date(ms).toISOString();
  }

  return result('tiktok', {
    isLive,
    providerSource: source,
    confidence: 'high',
    externalId: resolvedUserId || undefined,
    resolvedUsername: resolvedUsername || undefined,
    url: resolvedProfile || undefined,
    avatar,
    event: isLive ? {
      type: 'live',
      id: roomId || `tiktok-live:${resolvedUsername || resolvedUserId || fallbackUsername || fallbackId}`,
      title: clean(liveRoom.title) || `${resolvedUsername || fallbackUsername || 'Creator'} is LIVE on TikTok`,
      url: resolvedLiveUrl || profileUrl({ ...account, username: resolvedUsername || fallbackUsername }),
      thumbnail: cover,
      viewerCount: Number.isFinite(viewerCount) ? viewerCount : null,
      startedAt,
    } : null,
  });
}

async function tiktokApiLookup({ username = '', userId = '' }) {
  const lookup = username ? `uniqueId=${encodeURIComponent(username)}` : `userId=${encodeURIComponent(userId)}`;
  const referer = username ? `https://www.tiktok.com/@${encodeURIComponent(username)}/live` : '';
  const { json } = await request(`https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&${lookup}`, {
    headers: { Accept: 'application/json,text/plain,*/*', ...(referer ? { Referer: referer } : {}) },
  }, 10000);
  return json;
}

async function checkTikTok(account) {
  const username = tiktokUsername(account);
  const userId = /^\d{6,30}$/.test(clean(account.externalId)) ? clean(account.externalId) : '';
  if (!username && !userId) return unavailable('tiktok', 'TikTok username, channel ID or URL could not be resolved.');

  const errors = [];

  // Username is authoritative for TikTok LIVE checks. The saved numeric user ID is metadata,
  // not a replacement for the username: the api-live endpoint does not reliably resolve
  // offline accounts by userId.
  if (username) {
    try {
      const json = await tiktokApiLookup({ username });
      const resolved = tiktokApiResult(json, username, userId, 'tiktok_api_live_username');
      if (resolved) return resolved;
    } catch (error) { errors.push(`username API: ${error.message}`); }
  }

  // Keep ID lookup as a secondary path for ID-only records and recovery of legacy data.
  if (userId) {
    try {
      const json = await tiktokApiLookup({ userId });
      const resolved = tiktokApiResult(json, username, userId, 'tiktok_api_live_id');
      if (resolved) return resolved;
    } catch (error) { errors.push(`ID API: ${error.message}`); }
  }

  if (!username) {
    return unavailable('tiktok', `TikTok account has only a numeric ID and could not be resolved${errors.length ? `: ${errors.join('; ')}` : '.'}`);
  }

  const profile = `https://www.tiktok.com/@${encodeURIComponent(username)}`;
  const liveUrl = `${profile}/live`;
  try {
    const { response, text } = await request(liveUrl, { headers: { Accept: 'text/html,application/xhtml+xml' } }, 12000);
    const finalUrl = response.url || liveUrl;
    const body = text.slice(0, 2000000);
    const ended = /LIVE\s+has\s+ended|live\s+(?:has\s+)?ended|room\s+(?:has\s+)?ended|stream\s+(?:has\s+)?ended/i.test(body);
    const hasRoom = /"roomId"\s*:\s*"?[1-9]\d*/i.test(body) || /"room_id"\s*:\s*"?[1-9]\d*/i.test(body);
    const directLiveStatus = /"status"\s*:\s*2\b/.test(body) || /"isLive"\s*:\s*true/i.test(body);
    const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const creatorMarker = new RegExp(`(?:uniqueId|unique_id|author|nickname)[^\\n]{0,200}${escapedUsername}`, 'i').test(body);
    const onOwnLiveUrl = /\/live(?:[?#]|$)/i.test(finalUrl) && finalUrl.toLowerCase().includes(`@${username.toLowerCase()}`);
    const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
    const titleSaysLive = title.toLowerCase().includes(`@${username.toLowerCase()}`) && /\bis\s+LIVE\s*-\s*TikTok\s+LIVE\b/i.test(title);
    const isLive = !ended && onOwnLiveUrl && (titleSaysLive || (hasRoom && directLiveStatus && creatorMarker));

    if (isLive) return result('tiktok', {
      isLive: true,
      providerSource: 'public_page',
      confidence: 'high',
      externalId: userId || undefined,
      url: profile,
      resolvedUsername: username,
      event: { type: 'live', id: `tiktok-live:${username}`, title: `${username} is LIVE on TikTok`, url: liveUrl, thumbnail: null },
    });

    const redirectedAwayFromLive = !onOwnLiveUrl && finalUrl.toLowerCase().includes(`@${username.toLowerCase()}`);
    if (ended || redirectedAwayFromLive) return result('tiktok', {
      isLive: false,
      providerSource: 'public_page',
      confidence: 'high',
      externalId: userId || undefined,
      url: profile,
      resolvedUsername: username,
      event: null,
    });

    // If the profile identity is known and TikTok gives us a valid page but no LIVE markers,
    // that is an offline account, not a provider failure. This prevents stale LIVE states.
    if (response.ok && finalUrl.toLowerCase().includes(`@${username.toLowerCase()}`)) return result('tiktok', {
      isLive: false,
      providerSource: 'public_page',
      confidence: 'medium',
      externalId: userId || undefined,
      url: profile,
      resolvedUsername: username,
      event: null,
    });

    return unavailable('tiktok', `TikTok LIVE status was inconclusive${errors.length ? ` after ${errors.join('; ')}` : ''}.`);
  } catch (pageError) {
    errors.push(`page: ${pageError.message}`);
    return unavailable('tiktok', `TikTok LIVE check unavailable: ${errors.join('; ')}`);
  }
}

async function checkKick(account) {
  if (!process.env.KICK_CLIENT_ID || !process.env.KICK_CLIENT_SECRET) return unavailable('kick', 'Set KICK_CLIENT_ID and KICK_CLIENT_SECRET.', 'configuration_required');
  const token = await oauthClientToken('kick', 'https://id.kick.com/oauth/token', process.env.KICK_CLIENT_ID, process.env.KICK_CLIENT_SECRET);
  const username = handle(account);
  const headers = { Authorization: `Bearer ${token}` };
  const { json: channelJson } = await request(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(username)}`, { headers });
  const channel = Array.isArray(channelJson?.data) ? channelJson.data[0] : channelJson?.data;
  if (!channel) return unavailable('kick', 'Kick channel could not be resolved.');
  const broadcasterId = channel.broadcaster_user_id || channel.user_id || channel.id;
  const streamFromChannel = channel.stream;
  let stream = streamFromChannel?.is_live ? streamFromChannel : null;
  if (!stream && broadcasterId) {
    const { json: liveJson } = await request(`https://api.kick.com/public/v1/livestreams?broadcaster_user_id=${encodeURIComponent(broadcasterId)}`, { headers });
    stream = Array.isArray(liveJson?.data) ? liveJson.data[0] : liveJson?.data;
  }
  if (!stream) return result('kick', { isLive: false, externalId: String(broadcasterId || ''), url: `https://kick.com/${encodeURIComponent(username)}` });
  return result('kick', { isLive: true, externalId: String(broadcasterId || ''), event: { type: 'live', id: String(stream.id || `kick-live:${broadcasterId}`), title: stream.stream_title || stream.title || channel.stream_title || `${username} is live`, url: `https://kick.com/${encodeURIComponent(username)}`, thumbnail: stream.thumbnail || stream.thumbnail_url || stream.channel?.profile_picture, viewerCount: stream.viewer_count, startedAt: stream.started_at, category: stream.category?.name || channel.category?.name } });
}

async function facebookToken() {
  if (process.env.FACEBOOK_ACCESS_TOKEN) return process.env.FACEBOOK_ACCESS_TOKEN;
  if (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET) return null;
  const { json } = await request(`https://graph.facebook.com/oauth/access_token?client_id=${encodeURIComponent(process.env.FACEBOOK_APP_ID)}&client_secret=${encodeURIComponent(process.env.FACEBOOK_APP_SECRET)}&grant_type=client_credentials`);
  return json?.access_token || null;
}
async function checkFacebook(account) {
  const token = await facebookToken();
  if (!token) return unavailable('facebook', 'Set FACEBOOK_ACCESS_TOKEN or FACEBOOK_APP_ID + FACEBOOK_APP_SECRET.', 'configuration_required');
  const lookup = clean(account.externalId || account.metadata?.pageId || handle(account));
  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v23.0';
  try {
    const { json: pageJson } = await request(`https://graph.facebook.com/${version}/${encodeURIComponent(lookup)}?fields=id,name,picture&access_token=${encodeURIComponent(token)}`);
    if (!pageJson?.id) return unavailable('facebook', 'Facebook Page could not be resolved. Page Public Content Access may be required.');
    const [liveRes, feedRes] = await Promise.all([
      request(`https://graph.facebook.com/${version}/${pageJson.id}/live_videos?broadcast_status=LIVE&fields=id,title,status,permalink_url,creation_time&limit=1&access_token=${encodeURIComponent(token)}`).catch(() => ({ json: null })),
      request(`https://graph.facebook.com/${version}/${pageJson.id}/feed?fields=id,message,permalink_url,created_time,full_picture&limit=1&access_token=${encodeURIComponent(token)}`).catch(() => ({ json: null })),
    ]);
    const live = liveRes.json?.data?.[0];
    const post = feedRes.json?.data?.[0];
    const latestContent = post ? { type: 'post', id: post.id, title: clean(post.message || 'New Facebook post').slice(0, 180), url: post.permalink_url || `https://www.facebook.com/${pageJson.id}`, thumbnail: post.full_picture, publishedAt: post.created_time } : null;
    return result('facebook', { isLive: Boolean(live), externalId: pageJson.id, latestContent, contentItems: latestContent ? [latestContent] : [], event: live ? { type: 'live', id: live.id, title: live.title || `${pageJson.name || lookup} is live`, url: live.permalink_url || `https://www.facebook.com/${pageJson.id}`, startedAt: live.creation_time } : null, url: `https://www.facebook.com/${pageJson.id}` });
  } catch (error) { return unavailable('facebook', `Facebook Graph API unavailable: ${error.message}`); }
}

async function checkInstagram(account) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const businessId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!token || !businessId) return unavailable('instagram', 'Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID.', 'configuration_required');
  const username = handle(account);
  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v23.0';
  try {
    const fields = `business_discovery.username(${username}){id,username,profile_picture_url,media.limit(1){id,caption,media_type,media_url,permalink,thumbnail_url,timestamp}}`;
    const { json } = await request(`https://graph.facebook.com/${version}/${encodeURIComponent(businessId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`);
    const discovery = json?.business_discovery;
    if (!discovery?.id) return unavailable('instagram', 'Instagram account could not be resolved through Business Discovery.');
    const media = discovery.media?.data?.[0];
    const latestContent = media ? { type: media.media_type === 'REELS' ? 'short' : 'post', id: media.id, title: clean(media.caption || `New Instagram ${media.media_type || 'post'}`).slice(0, 180), url: media.permalink || `https://www.instagram.com/${username}/`, thumbnail: media.thumbnail_url || media.media_url, publishedAt: media.timestamp } : null;
    return result('instagram', { isLive: false, status: 'ok', externalId: discovery.id, latestContent, contentItems: latestContent ? [latestContent] : [], url: `https://www.instagram.com/${username}/`, avatar: discovery.profile_picture_url });
  } catch (error) { return unavailable('instagram', `Instagram Graph API unavailable: ${error.message}`); }
}

async function checkX(account) {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return unavailable('x', 'Set X_BEARER_TOKEN.', 'configuration_required');
  const username = handle(account);
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const { json: userJson } = await request(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=name,profile_image_url`, { headers });
    const user = userJson?.data;
    if (!user?.id) return unavailable('x', 'X account could not be resolved.');
    const { json: postsJson } = await request(`https://api.x.com/2/users/${encodeURIComponent(user.id)}/tweets?max_results=5&exclude=retweets,replies&tweet.fields=created_at,attachments,text`, { headers });
    const post = postsJson?.data?.[0];
    const latestContent = post ? { type: 'post', id: post.id, title: clean(post.text || 'New post on X').slice(0, 180), url: `https://x.com/${encodeURIComponent(username)}/status/${post.id}`, publishedAt: post.created_at } : null;
    return result('x', { isLive: false, status: 'ok', externalId: user.id, latestContent, contentItems: latestContent ? [latestContent] : [], url: `https://x.com/${encodeURIComponent(username)}`, avatar: user.profile_image_url });
  } catch (error) { return unavailable('x', `X API unavailable: ${error.message}`); }
}

async function checkAccount(account) {
  try {
    switch (account.platform) {
      case 'twitch': return await checkTwitch(account);
      case 'youtube': return await checkYouTube(account);
      case 'tiktok': return await checkTikTok(account);
      case 'kick': return await checkKick(account);
      case 'facebook': return await checkFacebook(account);
      case 'instagram': return await checkInstagram(account);
      case 'x': return await checkX(account);
      default: return unavailable(account.platform, 'Unsupported social platform.', 'unsupported');
    }
  } catch (error) { return unavailable(account.platform, error.message || 'Provider check failed.'); }
}

module.exports = { PROVIDERS, providerInfo, checkAccount };
