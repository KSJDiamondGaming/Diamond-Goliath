const fs = require('fs');
const path = require('path');

const GUILDS_DIR = path.join(__dirname, '..', 'data', 'guilds');

const guildCache = new Map();

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
  logs: {},
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
};

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
  const safeGuildId = normalizeGuildId(guildId);
  return path.join(GUILDS_DIR, `${safeGuildId}.json`);
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

function mergeDefaults(data = {}) {
  const defaults = clone(DEFAULT_GUILD_DATA);

  const source =
    data && typeof data === 'object' && !Array.isArray(data) ? data : {};

  return {
    ...defaults,
    ...source,

    general: mergeObject(defaults.general, source.general),
    modules: mergeObject(defaults.modules, source.modules),

    automod: mergeObject(defaults.automod, source.automod),
    logs: mergeObject(defaults.logs, source.logs),
    cases: mergeObject(defaults.cases, source.cases),
    warnings: mergeObject(defaults.warnings, source.warnings),
    welcome: mergeObject(defaults.welcome, source.welcome),
    leave: mergeObject(defaults.leave, source.leave),
    tickets: mergeObject(defaults.tickets, source.tickets),
    levels: mergeObject(defaults.levels, source.levels),
    reactionRoles: mergeObject(defaults.reactionRoles, source.reactionRoles),
    giveaways: mergeObject(defaults.giveaways, source.giveaways),
    suggestions: mergeObject(defaults.suggestions, source.suggestions),
    stats: mergeObject(defaults.stats, source.stats),
  };
}

function resolveGuildMeta(guildOrMeta = {}) {
  if (!guildOrMeta || typeof guildOrMeta !== 'object') {
    return {};
  }

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

  const data = mergeDefaults(readJson(filePath, DEFAULT_GUILD_DATA));

  data.guildId = safeGuildId;

  if (!fs.existsSync(filePath)) {
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
  nextData.updatedAt = new Date().toISOString();

  writeJson(filePath, nextData);

  return cacheGuildData(safeGuildId, nextData);
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

  getGuildFilePath,
  getGuildData,
  saveGuildData,
  syncGuildMeta,

  getGuildSection,
  saveGuildSection,
  replaceGuildSection,
  updateGuildSection,

  reloadGuild,
  clearGuildCache,

  listGuildFiles,
};