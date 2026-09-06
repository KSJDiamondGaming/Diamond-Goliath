'use strict';

const fetch = require('node-fetch');

const GIPHY_API_BASE = 'https://api.giphy.com/v1/gifs';
const GIPHY_WEB_BASE = 'https://giphy.com';
const SEARCH_CACHE_MS = 60 * 1000;
const MAX_RESULTS = 25;

const searchCache = new Map();
const itemCache = new Map();

function apiKey() {
  return String(process.env.GIPHY_API_KEY || '').trim();
}

function configured() {
  return Boolean(apiKey());
}

function normaliseLimit(value) {
  return Math.max(1, Math.min(Number(value) || MAX_RESULTS, MAX_RESULTS));
}

function cleanQuery(query) {
  return String(query || '').trim().slice(0, 80);
}

function searchPageUrl(query) {
  const value = cleanQuery(query);
  return value ? `${GIPHY_WEB_BASE}/search/${encodeURIComponent(value)}` : GIPHY_WEB_BASE;
}

function isGiphyUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(String(rawUrl || '').trim()); }
  catch { return false; }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  return host === 'giphy.com'
    || host.endsWith('.giphy.com')
    || host === 'giphyusercontent.com'
    || host.endsWith('.giphyusercontent.com');
}

function normaliseItem(raw) {
  if (!raw || !raw.id) return null;
  const images = raw.images || {};
  const previewUrl = images.downsized_medium?.url
    || images.downsized?.url
    || images.fixed_height?.url
    || images.original?.url
    || null;
  const stillUrl = images.fixed_height_still?.url
    || images.original_still?.url
    || null;
  const item = {
    id: String(raw.id),
    title: String(raw.title || raw.slug || 'GIPHY GIF').trim() || 'GIPHY GIF',
    slug: String(raw.slug || '').trim(),
    pageUrl: String(raw.url || `${GIPHY_WEB_BASE}/gifs/${raw.id}`),
    previewUrl,
    stillUrl,
    provider: 'Powered by GIPHY',
    animated: true,
  };
  itemCache.set(item.id, { expiresAt: Date.now() + SEARCH_CACHE_MS, item });
  return item;
}

async function requestJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'KSJHub-Goliath/1.0 (+https://github.com/KSJHub/Goliath)',
      Accept: 'application/json',
    },
    timeout: 15000,
  });
  if (!response.ok) throw new Error(`GIPHY request failed (${response.status}).`);
  return response.json();
}

async function search(query, limit = MAX_RESULTS) {
  const q = cleanQuery(query);
  if (!q) return { configured: configured(), items: [], query: q, searchUrl: searchPageUrl(q) };

  const key = apiKey();
  if (!key) {
    return {
      configured: false,
      items: [],
      query: q,
      searchUrl: searchPageUrl(q),
    };
  }

  const max = normaliseLimit(limit);
  const cacheKey = `${q.toLowerCase()}:${max}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const url = new URL(`${GIPHY_API_BASE}/search`);
  url.searchParams.set('api_key', key);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', String(max));
  url.searchParams.set('rating', 'pg-13');
  url.searchParams.set('lang', 'en');

  const payload = await requestJson(url.toString());
  const items = (Array.isArray(payload?.data) ? payload.data : [])
    .map(normaliseItem)
    .filter((item) => item && item.previewUrl)
    .slice(0, max);
  const value = { configured: true, items, query: q, searchUrl: searchPageUrl(q) };
  searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_MS, value });
  return value;
}

async function findById(id) {
  const wanted = String(id || '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(wanted)) return null;

  const cached = itemCache.get(wanted);
  if (cached && cached.expiresAt > Date.now()) return cached.item;

  const key = apiKey();
  if (!key) return null;

  const url = new URL(`${GIPHY_API_BASE}/${encodeURIComponent(wanted)}`);
  url.searchParams.set('api_key', key);
  const payload = await requestJson(url.toString());
  return normaliseItem(payload?.data);
}

module.exports = {
  configured,
  findById,
  isGiphyUrl,
  search,
  searchPageUrl,
};
