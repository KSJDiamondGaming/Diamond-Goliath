const fs = require('fs');
const path = require('path');

const { DEFAULT_GUILD_DATA, DEFAULT_LOGS } = require('./defaults');

const GUILDS_DIR = path.join(__dirname, '..', '..', '..', 'data', 'guilds');

const guildCache = new Map();

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
  return JSON.parse(JSON.stringify(value));
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

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : clone(fallback);
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

function mergeObject(defaultValue, sourceValue) {
  const defaults =
    defaultValue && typeof defaultValue === 'object' && !Array.isArray(defaultValue)
      ? defaultValue
      : {};

  const source =
    sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)
      ? sourceValue
      : {};

  return {
    ...defaults,
    ...source,
  };
}

function normalizeChannelId(value) {
  const id = String(value || '').trim();
  return /^\d{16,20}$/.test(id) ? id : null;
}

function normalizeLogs(source = {}) {
  const defaults = clone(DEFAULT_LOGS);
  const logs = mergeObject(defaults, source.logs);

  logs.channels = {
    ...defaults.channels,
    ...(logs.channels && typeof logs.channels === 'object' ? logs.channels : {}),
  };

  logs.events = {
    ...defaults.events,
    ...(logs.events && typeof logs.events === 'object' ? logs.events : {}),
  };

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

  logs.channels.messageDelete =
    normalizeChannelId(logs.channels.messageDelete) ||
    normalizeChannelId(logs.channels.message) ||
    legacyMessageChannelId;

  logs.channels.messageEdit =
    normalizeChannelId(logs.channels.messageEdit) ||
    normalizeChannelId(logs.channels.message) ||
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

  const source =
    data && typeof data === 'object' && !Array.isArray(data) ? data : {};

  const merged = {
    ...defaults,
    ...source,

    general: mergeObject(defaults.general, source.general),
    modules: mergeObject(defaults.modules, source.modules),

    logs: normalizeLogs(source),

    automod: mergeObject(defaults.automod, source.automod),
    moderation: mergeObject(defaults.moderation, source.moderation),
    purge: mergeObject(defaults.purge, source.purge),
    stats: mergeObject(defaults.stats, source.stats),
    suggestions: mergeObject(defaults.suggestions, source.suggestions),
    polls: mergeObject(defaults.polls, source.polls),
    roles: mergeObject(defaults.roles, source.roles),
    birthdays: mergeObject(defaults.birthdays, source.birthdays),
    tempVoice: mergeObject(defaults.tempVoice, source.tempVoice),
    tickets: mergeObject(defaults.tickets, source.tickets),
    giveaways: mergeObject(defaults.giveaways, source.giveaways),

    warnings: mergeObject(defaults.warnings, source.warnings),
    cases: mergeObject(defaults.cases, source.cases),
    welcome: mergeObject(defaults.welcome, source.welcome),
    leave: mergeObject(defaults.leave, source.leave),
    reactionRoles: mergeObject(defaults.reactionRoles, source.reactionRoles),
  };

  return removeLegacyLogFields(merged);
}

function resolveGuildMeta(guildOrMeta = {}) {
  if (!guildOrMeta || typeof guildOrMeta !== 'object') {
    return {};
  }

  return {
    guildId: guildOrMeta.id || guildOrMeta.guildId || null,
    guildName: cleanGuildName(guildOrMeta.name || guildOrMeta.guildName),
    ownerId: guildOrMeta.ownerId || null,
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
    ...(data || {}),
  });

  nextData.guildId = safeGuildId;
  nextData.guildName =
    meta.guildName || cleanGuildName(nextData.guildName) || null;

  if (meta.ownerId) {
    nextData.ownerId = meta.ownerId;
  }

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
    ownerId: meta.ownerId || current.ownerId || null,
  });
}

function getGuildSection(guildId, sectionName, fallback = {}) {
  const data = getGuildData(guildId);
  const section = data[sectionName];

  if (!section || typeof section !== 'object' || Array.isArray(section)) {
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
    ...(sectionData || {}),
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
      ...(sectionData || {}),
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

  return replaceGuildSection(guildId, sectionName, next || {}, guildOrMeta);
}

function getModuleConfig(guildId, moduleName, fallback = {}) {
  return getGuildSection(guildId, moduleName, fallback);
}

function saveModuleConfig(guildId, moduleName, config = {}, guildOrMeta = {}) {
  return saveGuildSection(guildId, moduleName, config, guildOrMeta);
}

function isModuleEnabled(guildId, moduleName) {
  const data = getGuildData(guildId);
  return data.modules?.[moduleName] !== false;
}

function setModuleEnabled(guildId, moduleName, enabled, guildOrMeta = {}) {
  const modules = getGuildSection(guildId, 'modules', DEFAULT_GUILD_DATA.modules);

  modules[moduleName] = enabled === true;

  return saveGuildSection(guildId, 'modules', modules, guildOrMeta);
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

  getModuleConfig,
  saveModuleConfig,
  isModuleEnabled,
  setModuleEnabled,

  getLogChannelId,
  isLogEventEnabled,

  reloadGuild,
  clearGuildCache,

  listGuildFiles,
};