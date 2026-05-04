const fs = require('fs');
const path = require('path');

const GUILDS_DIR = path.join(__dirname, 'data');

const guildCache = new Map();

const DEFAULT_LOGS = Object.freeze({
  enabled: true,
  channels: {
    general: null,
    moderation: null,
    admin: null,
    automod: null,
    member: null,
    messageDelete: null,
    messageEdit: null,
    voice: null,
  },
  events: {
    moderationActions: true,
    adminActions: true,
    automodActions: true,

    memberJoin: true,
    memberLeave: true,
    memberUpdate: true,

    messageDelete: true,
    messageEdit: true,

    roleCreate: true,
    roleDelete: true,
    roleUpdate: true,

    channelCreate: true,
    channelDelete: true,
    channelUpdate: true,

    voiceJoin: true,
    voiceLeave: true,
    voiceMove: true,
  },
});

const DEFAULT_EMBED_DEFAULTS = Object.freeze({
  welcome: null,
  leave: null,
  rules: null,
  announcement: null,
  suggestion: null,
  giveaway: null,
  update: null,
  event: null,
  warning: null,
});

const DEFAULT_GUILD_DATA = Object.freeze({
  guildId: null,
  guildName: null,
  updatedAt: null,

  general: {
    enabled: true,
    prefix: '!',
    timezone: 'Europe/London',
  },

  modules: {},

  automod: {},
  logs: DEFAULT_LOGS,
  cases: {},
  warnings: {},
  welcome: {},
  leave: {},
  tickets: {},
  levels: {},
  reactionRoles: {},
  giveaways: {},
  suggestions: {},
  stats: {},

  autoRoles: {
    enabled: false,
    roleIds: [],
  },

  staffRoles: {
    roleIds: [],
  },

  modRoles: {
    roleIds: [],
  },

  embedPresets: {},
  embedDefaults: DEFAULT_EMBED_DEFAULTS,
});

const LEGACY_LOG_FIELDS = [
  'logsChannelId',
  'modLogChannelId',
  'adminLogChannelId',
  'automodLogChannelId',
  'memberLogChannelId',
  'messageLogChannelId',
  'voiceLogChannelId',
];

const LOG_CHANNEL_ALIASES = {
  logs: 'general',
  general: 'general',
  mod: 'moderation',
  moderation: 'moderation',
  admin: 'admin',
  automod: 'automod',
  member: 'member',
  message: 'messageDelete',
  messageDelete: 'messageDelete',
  messageEdit: 'messageEdit',
  voice: 'voice',
};

/* ---------------- BASIC HELPERS ---------------- */

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date().toISOString();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function ensureGuildsDir() {
  fs.mkdirSync(GUILDS_DIR, { recursive: true });
}

function normalizeGuildId(guildId) {
  const id = String(guildId || '').trim();

  if (!/^\d{16,20}$/.test(id)) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }

  return id;
}

function normalizeDiscordId(value) {
  const id = String(value || '').trim();
  return /^\d{16,20}$/.test(id) ? id : null;
}

function normalizeChannelId(value) {
  return normalizeDiscordId(value);
}

function cleanGuildName(guildName) {
  const name = String(guildName || '').trim();
  return name || null;
}

function sanitizeKey(value, label = 'Key') {
  const key = String(value || '').trim();

  if (!key) {
    throw new Error(`${label} is required.`);
  }

  return key.slice(0, 50);
}

function getGuildFilePath(guildId) {
  return path.join(GUILDS_DIR, `${normalizeGuildId(guildId)}.json`);
}

function readJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return clone(fallback);

    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return clone(fallback);

    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : clone(fallback);
  } catch (error) {
    console.error(`Failed to read guild JSON from ${filePath}:`, error);
    return clone(fallback);
  }
}

function writeJson(filePath, data) {
  ensureGuildsDir();

  const tempPath = `${filePath}.tmp`;

  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

function mergeDeep(defaults = {}, source = {}) {
  if (!isPlainObject(defaults)) return clone(source);
  if (!isPlainObject(source)) return clone(defaults);

  const output = clone(defaults);

  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = mergeDeep(output[key], value);
    } else {
      output[key] = clone(value);
    }
  }

  return output;
}

function resolveGuildMeta(guildOrMeta = {}) {
  if (!isPlainObject(guildOrMeta)) return {};

  return {
    guildId: guildOrMeta.id || guildOrMeta.guildId || null,
    guildName: cleanGuildName(guildOrMeta.name || guildOrMeta.guildName),
  };
}

function removeLegacyLogFields(data) {
  const clean = { ...data };

  for (const field of LEGACY_LOG_FIELDS) {
    delete clean[field];
  }

  return clean;
}

function cacheGuildData(guildId, data) {
  const safeGuildId = normalizeGuildId(guildId);
  const nextData = mergeDefaults(data);

  nextData.guildId = safeGuildId;

  guildCache.set(safeGuildId, clone(nextData));

  return clone(nextData);
}

/* ---------------- LOGS ---------------- */

function normalizeLogType(type = 'general') {
  return LOG_CHANNEL_ALIASES[type] || 'general';
}

function normalizeLogs(source = {}) {
  const logs = mergeDeep(DEFAULT_LOGS, isPlainObject(source.logs) ? source.logs : {});

  logs.enabled = logs.enabled !== false;

  logs.channels = mergeDeep(DEFAULT_LOGS.channels, logs.channels || {});
  logs.events = mergeDeep(DEFAULT_LOGS.events, logs.events || {});

  const legacyMessageChannelId = normalizeChannelId(source.messageLogChannelId);
  const oldMessageChannelId = normalizeChannelId(logs.channels.message);

  logs.channels.general =
    normalizeChannelId(logs.channels.general) ||
    normalizeChannelId(source.logsChannelId);

  logs.channels.moderation =
    normalizeChannelId(logs.channels.moderation) ||
    normalizeChannelId(source.modLogChannelId);

  logs.channels.admin =
    normalizeChannelId(logs.channels.admin) ||
    normalizeChannelId(source.adminLogChannelId);

  logs.channels.automod =
    normalizeChannelId(logs.channels.automod) ||
    normalizeChannelId(source.automodLogChannelId);

  logs.channels.member =
    normalizeChannelId(logs.channels.member) ||
    normalizeChannelId(source.memberLogChannelId);

  logs.channels.messageDelete =
    normalizeChannelId(logs.channels.messageDelete) ||
    oldMessageChannelId ||
    legacyMessageChannelId;

  logs.channels.messageEdit =
    normalizeChannelId(logs.channels.messageEdit) ||
    oldMessageChannelId ||
    legacyMessageChannelId;

  logs.channels.voice =
    normalizeChannelId(logs.channels.voice) ||
    normalizeChannelId(source.voiceLogChannelId);

  delete logs.channels.message;

  return logs;
}

/* ---------------- DEFAULT MERGE ---------------- */

function mergeDefaults(data = {}) {
  const source = isPlainObject(data) ? data : {};
  const merged = mergeDeep(DEFAULT_GUILD_DATA, source);

  merged.logs = normalizeLogs(source);
  merged.embedDefaults = mergeDeep(DEFAULT_EMBED_DEFAULTS, source.embedDefaults || {});

  return removeLegacyLogFields(merged);
}

/* ---------------- GUILD DATA ---------------- */

function getGuildData(guildId, options = {}) {
  const safeGuildId = normalizeGuildId(guildId);
  const filePath = getGuildFilePath(safeGuildId);

  if (!options.forceReload && guildCache.has(safeGuildId)) {
    return clone(guildCache.get(safeGuildId));
  }

  const exists = fs.existsSync(filePath);
  const rawData = readJson(filePath, DEFAULT_GUILD_DATA);
  const data = mergeDefaults(rawData);

  data.guildId = safeGuildId;

  const needsRewrite =
    !exists ||
    !rawData.embedDefaults ||
    LEGACY_LOG_FIELDS.some((field) =>
      Object.prototype.hasOwnProperty.call(rawData, field)
    );

  if (needsRewrite) {
    data.updatedAt = now();
    writeJson(filePath, data);
  }

  return cacheGuildData(safeGuildId, data);
}

function saveGuildData(guildId, data = {}, guildOrMeta = {}) {
  const safeGuildId = normalizeGuildId(guildId);
  const filePath = getGuildFilePath(safeGuildId);
  const current = getGuildData(safeGuildId);
  const meta = resolveGuildMeta(guildOrMeta);

  const nextData = mergeDefaults({
    ...current,
    ...(isPlainObject(data) ? data : {}),
  });

  nextData.guildId = safeGuildId;
  nextData.guildName =
    meta.guildName || cleanGuildName(nextData.guildName) || null;
  nextData.updatedAt = now();

  writeJson(filePath, nextData);

  return cacheGuildData(safeGuildId, nextData);
}

async function getGuildConfig(guildId) {
  return getGuildData(guildId);
}

async function saveGuildConfig(guildId, data = {}, guildOrMeta = {}) {
  return saveGuildData(guildId, data, guildOrMeta);
}

function syncGuildMeta(guildOrMeta = {}) {
  const meta = resolveGuildMeta(guildOrMeta);

  if (!meta.guildId) {
    throw new Error('Cannot sync guild meta without a guild ID.');
  }

  return saveGuildData(meta.guildId, {
    guildName: meta.guildName,
  });
}

/* ---------------- SECTIONS ---------------- */

function getGuildSection(guildId, sectionName, fallback = {}) {
  const data = getGuildData(guildId);
  const section = data[sectionName];

  if (!isPlainObject(section)) {
    return clone(fallback);
  }

  return mergeDeep(fallback, section);
}

function replaceGuildSection(
  guildId,
  sectionName,
  sectionData = {},
  guildOrMeta = {}
) {
  const nextSection = {
    ...(isPlainObject(sectionData) ? clone(sectionData) : {}),
    updatedAt: now(),
  };

  const updatedGuild = saveGuildData(
    guildId,
    {
      [sectionName]: nextSection,
    },
    guildOrMeta
  );

  return clone(updatedGuild[sectionName] || {});
}

function saveGuildSection(
  guildId,
  sectionName,
  sectionData = {},
  guildOrMeta = {}
) {
  const current = getGuildSection(guildId, sectionName);

  return replaceGuildSection(
    guildId,
    sectionName,
    {
      ...current,
      ...(isPlainObject(sectionData) ? sectionData : {}),
    },
    guildOrMeta
  );
}

function updateGuildSection(
  guildId,
  sectionName,
  updater,
  fallback = {},
  guildOrMeta = {}
) {
  const current = getGuildSection(guildId, sectionName, fallback);
  const next = typeof updater === 'function' ? updater(clone(current)) : updater;

  return replaceGuildSection(
    guildId,
    sectionName,
    isPlainObject(next) ? next : {},
    guildOrMeta
  );
}

/* ---------------- LOG HELPERS ---------------- */

function getLogChannelId(guildId, type = 'general', fallbackType = 'general') {
  const logs = getGuildSection(guildId, 'logs', DEFAULT_LOGS);
  const logType = normalizeLogType(type);
  const fallback = normalizeLogType(fallbackType);

  return logs.channels?.[logType] || logs.channels?.[fallback] || null;
}

function setLogChannelId(guildId, type = 'general', channelId = null, guildOrMeta = {}) {
  const logType = normalizeLogType(type);
  const safeChannelId = normalizeChannelId(channelId);

  return updateGuildSection(
    guildId,
    'logs',
    (logs) => ({
      ...logs,
      channels: {
        ...(logs.channels || {}),
        [logType]: safeChannelId,
      },
    }),
    DEFAULT_LOGS,
    guildOrMeta
  );
}

function isLogEventEnabled(guildId, eventName) {
  const logs = getGuildSection(guildId, 'logs', DEFAULT_LOGS);

  if (logs.enabled === false) return false;

  return logs.events?.[eventName] !== false;
}

function setLogEventEnabled(guildId, eventName, enabled = true, guildOrMeta = {}) {
  const key = sanitizeKey(eventName, 'Log event name');

  return updateGuildSection(
    guildId,
    'logs',
    (logs) => ({
      ...logs,
      events: {
        ...(logs.events || {}),
        [key]: Boolean(enabled),
      },
    }),
    DEFAULT_LOGS,
    guildOrMeta
  );
}

/* ---------------- MODULE HELPERS ---------------- */

function isModuleEnabled(guildId, moduleName) {
  const key = sanitizeKey(moduleName, 'Module name');
  const modules = getGuildSection(guildId, 'modules', {});
  const config = modules[key];

  if (config == null) return true;
  if (typeof config === 'boolean') return config !== false;
  if (isPlainObject(config)) return config.enabled !== false;

  return true;
}

function setModuleEnabled(guildId, moduleName, enabled = true, guildOrMeta = {}) {
  const key = sanitizeKey(moduleName, 'Module name');

  return updateGuildSection(
    guildId,
    'modules',
    (modules) => ({
      ...modules,
      [key]: {
        ...(isPlainObject(modules[key]) ? modules[key] : {}),
        enabled: Boolean(enabled),
      },
    }),
    {},
    guildOrMeta
  );
}

/* ---------------- EMBED PRESETS ---------------- */

function sanitizePresetName(name) {
  return sanitizeKey(name, 'Preset name');
}

function sanitizeTemplateKey(templateKey) {
  return sanitizeKey(templateKey, 'Template key');
}

function getEmbedPresets(guildId) {
  return getGuildSection(guildId, 'embedPresets', {});
}

function getEmbedPreset(guildId, presetName) {
  const name = sanitizePresetName(presetName);
  const presets = getEmbedPresets(guildId);
  const preset = presets[name];

  return isPlainObject(preset) ? clone(preset) : null;
}

function saveEmbedPreset(guildId, presetName, presetData = {}, guildOrMeta = {}) {
  const name = sanitizePresetName(presetName);

  const updatedPresets = updateGuildSection(
    guildId,
    'embedPresets',
    (presets) => ({
      ...presets,
      [name]: {
        ...(isPlainObject(presetData) ? clone(presetData) : {}),
        name,
        updatedAt: now(),
      },
    }),
    {},
    guildOrMeta
  );

  return clone(updatedPresets[name]);
}

function deleteEmbedPreset(guildId, presetName, guildOrMeta = {}) {
  const name = sanitizePresetName(presetName);
  const guildData = getGuildData(guildId);

  if (!isPlainObject(guildData.embedPresets) || !guildData.embedPresets[name]) {
    return false;
  }

  delete guildData.embedPresets[name];

  if (isPlainObject(guildData.embedDefaults)) {
    for (const [templateKey, defaultPresetName] of Object.entries(guildData.embedDefaults)) {
      if (defaultPresetName === name) {
        guildData.embedDefaults[templateKey] = null;
      }
    }
  }

  saveGuildData(guildId, guildData, guildOrMeta);
  return true;
}

/* ---------------- EMBED DEFAULTS ---------------- */

function getEmbedDefaults(guildId) {
  const guildData = getGuildData(guildId);
  return mergeDeep(DEFAULT_EMBED_DEFAULTS, guildData.embedDefaults || {});
}

function setEmbedDefault(guildId, templateKey, presetName, guildOrMeta = {}) {
  const key = sanitizeTemplateKey(templateKey);
  const name = sanitizePresetName(presetName);
  const preset = getEmbedPreset(guildId, name);

  if (!preset) {
    throw new Error(`Cannot set default. Preset "${name}" does not exist.`);
  }

  return updateGuildSection(
    guildId,
    'embedDefaults',
    (defaults) => ({
      ...mergeDeep(DEFAULT_EMBED_DEFAULTS, defaults),
      [key]: name,
    }),
    DEFAULT_EMBED_DEFAULTS,
    guildOrMeta
  );
}

function clearEmbedDefault(guildId, templateKey, guildOrMeta = {}) {
  const key = sanitizeTemplateKey(templateKey);

  return updateGuildSection(
    guildId,
    'embedDefaults',
    (defaults) => ({
      ...mergeDeep(DEFAULT_EMBED_DEFAULTS, defaults),
      [key]: null,
    }),
    DEFAULT_EMBED_DEFAULTS,
    guildOrMeta
  );
}

function getEmbedDefaultPresetName(guildId, templateKey) {
  const key = sanitizeTemplateKey(templateKey);
  const defaults = getEmbedDefaults(guildId);

  return defaults[key] || null;
}

function getEmbedDefaultPreset(guildId, templateKey) {
  const presetName = getEmbedDefaultPresetName(guildId, templateKey);
  return presetName ? getEmbedPreset(guildId, presetName) : null;
}

/* ---------------- CACHE / FILE HELPERS ---------------- */

function reloadGuild(guildId) {
  const safeGuildId = normalizeGuildId(guildId);

  guildCache.delete(safeGuildId);

  return getGuildData(safeGuildId, { forceReload: true });
}

function clearGuildCache(guildId) {
  if (guildId) {
    guildCache.delete(normalizeGuildId(guildId));
    return;
  }

  guildCache.clear();
}

function listGuildFiles() {
  ensureGuildsDir();

  return fs
    .readdirSync(GUILDS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\d{16,20}\.json$/.test(entry.name))
    .map((entry) => path.join(GUILDS_DIR, entry.name));
}

module.exports = {
  GUILDS_DIR,

  DEFAULT_GUILD_DATA,
  DEFAULT_LOGS,
  DEFAULT_EMBED_DEFAULTS,

  getGuildFilePath,

  getGuildConfig,
  saveGuildConfig,

  getGuildData,
  saveGuildData,
  syncGuildMeta,

  getGuildSection,
  saveGuildSection,
  replaceGuildSection,
  updateGuildSection,

  getLogChannelId,
  setLogChannelId,
  isLogEventEnabled,
  setLogEventEnabled,

  isModuleEnabled,
  setModuleEnabled,

  getEmbedPresets,
  getEmbedPreset,
  saveEmbedPreset,
  deleteEmbedPreset,

  getEmbedDefaults,
  setEmbedDefault,
  clearEmbedDefault,
  getEmbedDefaultPresetName,
  getEmbedDefaultPreset,

  reloadGuild,
  clearGuildCache,

  listGuildFiles,
};