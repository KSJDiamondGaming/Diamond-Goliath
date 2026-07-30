'use strict';

const PROVIDERS = {
  twitch: { label: 'Twitch', alertTypes: ['live'], env: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'] },
  youtube: { label: 'YouTube', alertTypes: ['live', 'upload', 'short'], env: ['YOUTUBE_API_KEY'] },
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
  return { platform, status: values.isLive === true ? 'live' : values.status || 'offline', isLive: values.isLive === true, checkedAt: new Date().toISOString(), providerSource: values.providerSource || 'official_api', ...values };
}

async function checkTwitch(account) {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) return unavailable('twitch', 'Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.', 'configuration_required');
  const token = await oauthClientToken('twitch', 'https://id.twitch.tv/oauth2/token', process.env.TWITCH_CLIENT_ID, process.env.TWITCH_CLIENT_SECRET);
  const identifier = clean(account.externalId || handle(account));
  if (!identifier) return unavailable('twitch', 'Twitch username, channel ID or URL could not be resolved.');
  const byId = /^\d{4,20}$/.test(identifier);
  const headers = { Authorization: `Bearer ${token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID };
  const query = byId ? `user_id=${encodeURIComponent(identifier)}` : `user_login=${encodeURIComponent(identifier)}`;
  const { json } = await request(`https://api.twitch.tv/helix/streams?${query}`, { headers });
  const stream = json?.data?.[0];
  let login = byId ? '' : identifier;
  if (!login) {
    try {
      const { json: userJson } = await request(`https://api.twitch.tv/helix/users?id=${encodeURIComponent(identifier)}`, { headers });
      login = clean(userJson?.data?.[0]?.login);
    } catch { }
  }
  const url = login ? `https://www.twitch.tv/${encodeURIComponent(login)}` : profileUrl(account);
  if (!stream) return result('twitch', { isLive: false, externalId: byId ? identifier : undefined, url });
  login = clean(stream.user_login || login || identifier);
  return result('twitch', { isLive: true, externalId: clean(stream.user_id || (byId ? identifier : '')) || undefined, event: { type: 'live', id: stream.id, title: stream.title || `${login} is live`, url: `https://www.twitch.tv/${encodeURIComponent(login)}`, thumbnail: clean(stream.thumbnail_url).replace('{width}', '1280').replace('{height}', '720'), viewerCount: stream.viewer_count, startedAt: stream.started_at, category: stream.game_name } });
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
  const uploadReq = uploadsId ? request(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(uploadsId)}&maxResults=1&key=${encodeURIComponent(key)}`) : Promise.resolve({ json: null });
  const [{ json: liveJson }, { json: uploadJson }] = await Promise.all([liveReq, uploadReq]);
  const live = liveJson?.items?.[0];
  const latest = uploadJson?.items?.[0];
  let latestContent = null;
  if (latest?.contentDetails?.videoId) {
    const videoId = latest.contentDetails.videoId;
    let type = 'upload';
    try {
      const { json: videoJson } = await request(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`);
      const seconds = isoSeconds(videoJson?.items?.[0]?.contentDetails?.duration);
      if (seconds !== null && seconds <= 60) type = 'short';
    } catch { }
    latestContent = { type, id: videoId, title: latest.snippet?.title || 'New YouTube video', url: `https://www.youtube.com/watch?v=${videoId}`, thumbnail: latest.snippet?.thumbnails?.high?.url || latest.snippet?.thumbnails?.medium?.url, publishedAt: latest.contentDetails?.videoPublishedAt || latest.snippet?.publishedAt };
  }
  if (live?.id?.videoId) return result('youtube', { isLive: true, externalId: channel.id, event: { type: 'live', id: live.id.videoId, title: live.snippet?.title || 'YouTube LIVE', url: `https://www.youtube.com/watch?v=${live.id.videoId}`, thumbnail: live.snippet?.thumbnails?.high?.url || live.snippet?.thumbnails?.medium?.url, startedAt: live.snippet?.publishedAt }, latestContent });
  return result('youtube', { isLive: false, externalId: channel.id, latestContent, url: `https://www.youtube.com/channel/${channel.id}` });
}

async function checkTikTok(account) {
  const identifier = clean(account.externalId || handle(account));
  if (!identifier) return unavailable('tiktok', 'TikTok username, channel ID or URL could not be resolved.');
  const byId = /^\d{6,30}$/.test(identifier);
  const username = byId ? '' : identifier;
  const liveUrl = username ? `https://www.tiktok.com/@${encodeURIComponent(username)}/live` : profileUrl(account);
  const profile = username ? `https://www.tiktok.com/@${encodeURIComponent(username)}` : profileUrl(account);
  const lookupParam = byId ? `userId=${encodeURIComponent(identifier)}` : `uniqueId=${encodeURIComponent(username)}`;
  const apiUrl = `https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&${lookupParam}`;
  let apiError = null;

  try {
    const { json } = await request(apiUrl, { headers: { Accept: 'application/json,text/plain,*/*', ...(liveUrl ? { Referer: liveUrl } : {}) } }, 10000);
    const user = json?.data?.user && typeof json.data.user === 'object' ? json.data.user : {};
    const liveRoom = json?.data?.liveRoom && typeof json.data.liveRoom === 'object' ? json.data.liveRoom : {};
    const rawStatus = liveRoom.status ?? user.status;
    const roomId = clean(liveRoom.roomId || liveRoom.room_id || user.roomId || user.room_id);
    const resolvedUsername = clean(user.uniqueId || user.unique_id || liveRoom.owner?.uniqueId || liveRoom.owner?.unique_id || username);
    const resolvedUserId = clean(user.id || user.userId || user.user_id || (byId ? identifier : ''));
    const hasRoomId = /^[1-9]\d*$/.test(roomId);
    if (rawStatus !== undefined && rawStatus !== null) {
      const isLive = Number(rawStatus) === 2 && hasRoomId;
      const resolvedProfile = resolvedUsername ? `https://www.tiktok.com/@${encodeURIComponent(resolvedUsername)}` : profile;
      const resolvedLiveUrl = resolvedUsername ? `${resolvedProfile}/live` : liveUrl;
      return result('tiktok', { isLive, providerSource: 'tiktok_api_live', confidence: 'high', externalId: resolvedUserId || undefined, url: resolvedProfile, resolvedUsername: resolvedUsername || undefined, event: isLive ? { type: 'live', id: roomId || `tiktok-live:${resolvedUsername || identifier}`, title: `${resolvedUsername || identifier} is LIVE on TikTok`, url: resolvedLiveUrl, thumbnail: null } : null });
    }
  } catch (error) { apiError = error; }

  if (!username) return unavailable('tiktok', `TikTok channel ID could not be resolved to a current LIVE state${apiError ? `: ${apiError.message}` : '.'}`);

  try {
    const { response, text } = await request(liveUrl, { headers: { Accept: 'text/html,application/xhtml+xml' } }, 12000);
    const finalUrl = response.url || liveUrl;
    const body = text.slice(0, 2000000);
    const ended = /LIVE\s+has\s+ended|live\s+(?:has\s+)?ended|room\s+(?:has\s+)?ended|stream\s+(?:has\s+)?ended/i.test(body);
    const hasRoom = /"roomId"\s*:\s*"?[1-9]\d*/i.test(body) || /"room_id"\s*:\s*"?[1-9]\d*/i.test(body);
    const directLiveStatus = /"status"\s*:\s*2\b/.test(body) || /"isLive"\s*:\s*true/i.test(body);
    const creatorMarker = new RegExp(`(?:uniqueId|unique_id|author|nickname)[^\\n]{0,200}${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(body);
    const onOwnLiveUrl = /\/live(?:[?#]|$)/i.test(finalUrl) && finalUrl.toLowerCase().includes(`@${username.toLowerCase()}`);
    const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
    const titleSaysLive = title.toLowerCase().includes(`@${username.toLowerCase()}`) && /\bis\s+LIVE\s*-\s*TikTok\s+LIVE\b/i.test(title);
    const isLive = !ended && onOwnLiveUrl && (titleSaysLive || (hasRoom && directLiveStatus && creatorMarker));
    if (isLive) return result('tiktok', { isLive: true, providerSource: 'public_page', confidence: 'high', url: profile, event: { type: 'live', id: `tiktok-live:${username}`, title: `${username} is LIVE on TikTok`, url: liveUrl, thumbnail: null } });
    const redirectedAwayFromLive = !onOwnLiveUrl && finalUrl.toLowerCase().includes(`@${username.toLowerCase()}`);
    if (ended || redirectedAwayFromLive) return result('tiktok', { isLive: false, providerSource: 'public_page', confidence: 'high', url: profile, event: null });
    return unavailable('tiktok', `TikTok LIVE status was inconclusive${apiError ? ` after API check failed: ${apiError.message}` : ''}.`);
  } catch (pageError) {
    const details = [apiError?.message, pageError?.message].filter(Boolean).join('; ');
    return unavailable('tiktok', `TikTok LIVE check unavailable: ${details || 'unknown error'}`);
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
    return result('facebook', { isLive: Boolean(live), externalId: pageJson.id, latestContent, event: live ? { type: 'live', id: live.id, title: live.title || `${pageJson.name || lookup} is live`, url: live.permalink_url || `https://www.facebook.com/${pageJson.id}`, startedAt: live.creation_time } : null, url: `https://www.facebook.com/${pageJson.id}` });
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
    return result('instagram', { isLive: false, status: 'ok', externalId: discovery.id, latestContent, url: `https://www.instagram.com/${username}/`, avatar: discovery.profile_picture_url });
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
    return result('x', { isLive: false, status: 'ok', externalId: user.id, latestContent, url: `https://x.com/${encodeURIComponent(username)}`, avatar: user.profile_image_url });
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
