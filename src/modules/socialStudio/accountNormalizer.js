'use strict';

const PLATFORM_HOSTS = {
  twitch: ['twitch.tv', 'www.twitch.tv', 'm.twitch.tv'],
  youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'],
  kick: ['kick.com', 'www.kick.com'],
  facebook: ['facebook.com', 'www.facebook.com', 'fb.com', 'www.fb.com'],
  instagram: ['instagram.com', 'www.instagram.com'],
  x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
};

function cleanRaw(value) {
  return String(value || '').trim();
}

function parseUrl(value) {
  const raw = cleanRaw(value);
  if (!raw) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

function cleanHandle(value) {
  return cleanRaw(value)
    .replace(/^@+/, '')
    .replace(/[?#].*$/, '')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

function firstUsefulSegment(pathname, ignored = []) {
  const ignoredSet = new Set(ignored.map((value) => String(value).toLowerCase()));
  return String(pathname || '')
    .split('/')
    .map((value) => cleanHandle(value))
    .find((value) => value && !ignoredSet.has(value.toLowerCase())) || '';
}

function extractUsername(platform, rawValue) {
  const raw = cleanRaw(rawValue);
  const parsed = parseUrl(raw);

  if (!parsed || !Object.values(PLATFORM_HOSTS).flat().includes(parsed.hostname.toLowerCase())) {
    return cleanHandle(raw.replace(/^https?:\/\//i, ''));
  }

  const segments = parsed.pathname.split('/').filter(Boolean).map(cleanHandle);

  switch (platform) {
    case 'twitch':
      return firstUsefulSegment(parsed.pathname, ['directory', 'downloads', 'jobs', 'p', 'settings', 'videos']);
    case 'tiktok':
      return cleanHandle((segments.find((value) => value.startsWith('@')) || segments[0] || '').replace(/^@/, ''));
    case 'youtube': {
      const handle = segments.find((value) => value.startsWith('@'));
      if (handle) return cleanHandle(handle);
      const channelIndex = segments.findIndex((value) => ['channel', 'c', 'user'].includes(value.toLowerCase()));
      return cleanHandle(channelIndex >= 0 ? segments[channelIndex + 1] : segments[0]);
    }
    case 'kick':
      return firstUsefulSegment(parsed.pathname, ['categories', 'search']);
    case 'instagram':
      return firstUsefulSegment(parsed.pathname, ['accounts', 'explore', 'reel', 'reels', 'p', 'stories']);
    case 'facebook':
      return firstUsefulSegment(parsed.pathname, ['people', 'profile.php', 'watch', 'gaming']);
    case 'x':
      return firstUsefulSegment(parsed.pathname, ['home', 'explore', 'notifications', 'messages', 'i']);
    default:
      return cleanHandle(segments[0] || raw);
  }
}

function buildProfileUrl(platform, username) {
  const encoded = encodeURIComponent(username);
  switch (platform) {
    case 'twitch': return `https://www.twitch.tv/${encoded}`;
    case 'youtube': return username.startsWith('UC')
      ? `https://www.youtube.com/channel/${encoded}`
      : `https://www.youtube.com/@${encoded.replace(/^%40/i, '')}`;
    case 'tiktok': return `https://www.tiktok.com/@${encoded.replace(/^%40/i, '')}`;
    case 'kick': return `https://kick.com/${encoded}`;
    case 'facebook': return `https://www.facebook.com/${encoded}`;
    case 'instagram': return `https://www.instagram.com/${encoded}`;
    case 'x': return `https://x.com/${encoded}`;
    default: return '';
  }
}

function normalizeAccountInput(platform, value) {
  const username = extractUsername(platform, value);
  if (!username) throw new Error(`${platform} account username or URL is required.`);

  return {
    username,
    normalizedUsername: username.toLowerCase(),
    profileUrl: buildProfileUrl(platform, username),
    sourceInput: cleanRaw(value),
  };
}

function migrateAccount(account = {}) {
  const normalized = normalizeAccountInput(account.platform, account.profileUrl || account.username || '');
  return {
    ...account,
    username: normalized.username,
    normalizedUsername: normalized.normalizedUsername,
    profileUrl: normalized.profileUrl,
  };
}

module.exports = {
  PLATFORM_HOSTS,
  normalizeAccountInput,
  migrateAccount,
  buildProfileUrl,
};
