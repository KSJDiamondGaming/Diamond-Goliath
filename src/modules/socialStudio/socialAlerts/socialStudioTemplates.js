'use strict';

const ALERT_TYPES = ['live', 'ended', 'vod', 'clip', 'upload', 'short', 'post'];

const DEFAULT_TEMPLATES = Object.freeze({
  live: Object.freeze({ title: '🔴 {creator} is LIVE', description: '**{title}**', buttonLabel: 'Watch Live', color: '{platformColor}', footer: 'Social Studio • {platform}' }),
  ended: Object.freeze({ title: '⚫ {creator} has ended their stream', description: '**{title}**', buttonLabel: 'View Channel', color: '{platformColor}', footer: 'Social Studio • {platform}' }),
  vod: Object.freeze({ title: '🎞️ New VOD from {creator}', description: '**{title}**', buttonLabel: 'Watch VOD', color: '{platformColor}', footer: 'Social Studio • {platform}' }),
  clip: Object.freeze({ title: '🎬 New clip from {creator}', description: '**{title}**', buttonLabel: 'Watch Clip', color: '{platformColor}', footer: 'Social Studio • {platform}' }),
  upload: Object.freeze({ title: '📺 New upload from {creator}', description: '**{title}**', buttonLabel: 'Watch Now', color: '{platformColor}', footer: 'Social Studio • {platform}' }),
  short: Object.freeze({ title: '📱 New short from {creator}', description: '**{title}**', buttonLabel: 'Watch Now', color: '{platformColor}', footer: 'Social Studio • {platform}' }),
  post: Object.freeze({ title: '📝 New post from {creator}', description: '**{title}**', buttonLabel: 'View Post', color: '{platformColor}', footer: 'Social Studio • {platform}' }),
});

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const cloneTemplate = (template = {}) => ({ ...template });

function normalizeTemplates(source = {}) {
  const raw = isObject(source) ? source : {};
  const rawDefaults = isObject(raw.defaults) ? raw.defaults : {};
  const rawCustom = isObject(raw.custom) ? raw.custom : raw;
  const defaults = {};
  const custom = {};

  for (const type of ALERT_TYPES) {
    defaults[type] = { ...DEFAULT_TEMPLATES[type], ...(isObject(rawDefaults[type]) ? rawDefaults[type] : {}) };
    const legacy = rawCustom === raw && (type === 'defaults' || type === 'custom') ? null : rawCustom[type];
    if (isObject(legacy)) custom[type] = cloneTemplate(legacy);
  }

  return { defaults, custom };
}

function resolveTemplate(templates, type) {
  const normalized = normalizeTemplates(templates);
  const fallback = normalized.defaults[type] || normalized.defaults.upload || DEFAULT_TEMPLATES.upload;
  return { ...fallback, ...(isObject(normalized.custom[type]) ? normalized.custom[type] : {}) };
}

function resetTemplate(templates, type) {
  const normalized = normalizeTemplates(templates);
  delete normalized.custom[type];
  return normalized;
}

module.exports = { ALERT_TYPES, DEFAULT_TEMPLATES, normalizeTemplates, resolveTemplate, resetTemplate };
