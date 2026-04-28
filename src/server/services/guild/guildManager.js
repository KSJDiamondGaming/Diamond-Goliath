const fs = require('fs');
const path = require('path');

const GUILDS_DIR = path.join(__dirname, '..', '..', 'data', 'guilds');

const guildCache = new Map();

const DEFAULT_LOGS = {
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
};

const DEFAULT_GUILD_DATA = {
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
  embeds: {},
  tickets: {},
  levels: {},
  reactionRoles: {},
  giveaways: {},
  suggestions: {},
  stats: {},
};

const LEGACY_LOG_FIELDS = [
  'logsChannelId',
  'modLogChannelId',
  'adminLogChannelId',
  'automodLogChannelId',
  'memberLogChannelId',
  'messageLogChannelId',
  'voiceLogChannelId',
];

function clone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
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

function cleanGuildName(guildName) {
  const name = String(guildName || '').trim();
  return name || null;
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

    return isObject(parsed) ? parsed : clone(fallback);
  } catch (error) {
    console.error(`Failed to read guild JSON from ${filePath}:`, error);
    return clone(fallback);
  }
}

function writeJson(filePath, data) {
  ensureGuildsDir();

  const tempPath = `${filePath}.tmp`;

  fs.writeFileSync(tempPath, JSON.stringify(data ?? {}, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

function mergeObject(defaultValue, sourceValue) {
  return {
    ...(isObject(defaultValue) ? defaultValue : {}),
    ...(isObject(sourceValue) ? sourceValue : {}),
  };
}

function normalizeChannelId(value) {
  const id = String(value || '').trim();
  return /^\d{16,20}$/.test(id) ? id : null;
}

function normalizeLogs(source = {}) {
  const defaults = clone(DEFAULT_LOGS);
  const logs = mergeObject(defaults, source.logs);

  logs.channels = mergeObject(defaults.channels, logs.channels);
  logs.events = mergeObject(defaults.events, logs.events);
  logs.enabled = logs.enabled !== false;

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

  const legacyMessageChannelId = normalizeChannelId(source.messageLogChannelId);
  const sharedMessageChannelId = normalizeChannelId(logs.channels.message);

  logs.channels.messageDelete =
    normalizeChannelId(logs.channels.messageDelete) ||
    sharedMessageChannelId ||
    legacyMessageChannelId;

  logs.channels.messageEdit =
    normalizeChannelId(logs.channels.messageEdit) ||
    sharedMessageChannelId ||
    legacyMessageChannelId;

  delete logs.channels.message;

  logs.channels.voice =
    normalizeChannelId(logs.channels.voice) ||
    normalizeChannelId(source.voiceLogChannelId);

  return logs;
}

function removeLegacyLogFields(data) {
  const clean = { ...data };

  for (const key of LEGACY_LOG_FIELDS) {
    delete clean[key];
  }

  return clean;
}

function mergeDefaults(data = {}) {
  const defaults = clone(DEFAULT_GUILD_DATA);
  const source = isObject(data) ? data : {};

  const merged = {
    ...defaults,
    ...source,

    general: mergeObject(defaults.general, source.general),
    modules: mergeObject(defaults.modules, source.modules),

    automod: mergeObject(defaults.automod, source.automod),
    logs: normalizeLogs(source),
    cases: mergeObject(defaults.cases, source.cases),
    warnings: mergeObject(defaults.warnings, source.warnings),
    welcome: mergeObject(defaults.welcome, source.welcome),
    leave: mergeObject(defaults.leave, source.leave),
    embeds: mergeObject(defaults.embeds, source.embeds),
    tickets: mergeObject(defaults.tickets, source.tickets),
    levels: mergeObject(defaults.levels, source.levels),
    reactionRoles: mergeObject(defaults.reactionRoles, source.reactionRoles),
    giveaways: mergeObject(defaults.giveaways, source.giveaways),
    suggestions: mergeObject(defaults.suggestions, source.suggestions),
    stats: mergeObject(defaults.stats, source.stats),
  };

  return removeLegacyLogFields(merged);
}

function resolveGuildMeta(guildOrMeta = {}) {
  if (!isObject(guildOrMeta)) return {};

  return {
    guildId: guildOrMeta.id || guildOrMeta.guildId || null,
    guildName: cleanGuildName(guildOrMeta.name || guildOrMeta.guildName),
  };
}

function cacheGuildData(guildId, data) {
  const safeGuildId = normalizeGuildId(guildId);
  const nextData = mergeDefaults(data);

  nextData.guildId = safeGuildId;

  guildCache.set(safeGuildId, clone(nextData));

  return clone(nextData);
}

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

  if (!exists || LEGACY_LOG_FIELDS.some((field) => field in rawData)) {
    data.updatedAt = new Date().toISOString();
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
    ...(isObject(data) ? data : {}),
  });

  nextData.guildId = safeGuildId;
  nextData.guildName =
    meta.guildName || cleanGuildName(nextData.guildName) || null;
  nextData.updatedAt = new Date().toISOString();

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

  const current = getGuildData(meta.guildId);

  return saveGuildData(meta.guildId, {
    ...current,
    guildName: meta.guildName || current.guildName || null,
  });
}

function getGuildSection(guildId, sectionName, fallback = {}) {
  const data = getGuildData(guildId);
  const section = data[sectionName];

  if (!isObject(section)) {
    return clone(fallback);
  }

  return {
    ...clone(fallback),
    ...clone(section),
  };
}

function replaceGuildSection(
  guildId,
  sectionName,
  sectionData = {},
  guildOrMeta = {}
) {
  const nextSection = {
    ...(isObject(sectionData) ? sectionData : {}),
    updatedAt: new Date().toISOString(),
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
      ...(isObject(sectionData) ? sectionData : {}),
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
  const next =
    typeof updater === 'function' ? updater(clone(current)) : updater;

  return replaceGuildSection(
    guildId,
    sectionName,
    isObject(next) ? next : {},
    guildOrMeta
  );
}

function getLogChannelId(guildId, type = 'general', fallbackType = 'general') {
  const logs = getGuildSection(guildId, 'logs', DEFAULT_LOGS);

  return logs.channels?.[type] || logs.channels?.[fallbackType] || null;
}

function isLogEventEnabled(guildId, eventName) {
  const logs = getGuildSection(guildId, 'logs', DEFAULT_LOGS);

  if (logs.enabled === false) return false;

  return logs.events?.[eventName] !== false;
}

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
  isLogEventEnabled,

  reloadGuild,
  clearGuildCache,

  listGuildFiles,
};