const fs = require('fs');
const path = require('path');

const GUILDS_DIR = path.join(__dirname, '..', 'data', 'guilds');

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
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function mergeDefaults(data = {}) {
  const defaults = clone(DEFAULT_GUILD_DATA);
  const source =
    data && typeof data === 'object' && !Array.isArray(data) ? data : {};

  return {
    ...defaults,
    ...source,

    general: { ...defaults.general, ...(source.general || {}) },
    modules: { ...defaults.modules, ...(source.modules || {}) },
    automod: { ...defaults.automod, ...(source.automod || {}) },
    logs: { ...defaults.logs, ...(source.logs || {}) },
    cases: { ...defaults.cases, ...(source.cases || {}) },
    warnings: { ...defaults.warnings, ...(source.warnings || {}) },
    welcome: { ...defaults.welcome, ...(source.welcome || {}) },
    leave: { ...defaults.leave, ...(source.leave || {}) },
    tickets: { ...defaults.tickets, ...(source.tickets || {}) },
    levels: { ...defaults.levels, ...(source.levels || {}) },
    reactionRoles: {
      ...defaults.reactionRoles,
      ...(source.reactionRoles || {}),
    },
    giveaways: { ...defaults.giveaways, ...(source.giveaways || {}) },
    suggestions: { ...defaults.suggestions, ...(source.suggestions || {}) },
    stats: { ...defaults.stats, ...(source.stats || {}) },
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

function getGuildData(guildId) {
  const safeGuildId = normalizeGuildId(guildId);
  const filePath = getGuildFilePath(safeGuildId);
  const data = mergeDefaults(readJson(filePath, DEFAULT_GUILD_DATA));

  data.guildId = safeGuildId;

  if (!fs.existsSync(filePath)) {
    saveGuildData(safeGuildId, data);
  }

  return data;
}

function saveGuildData(guildId, data = {}, guildOrMeta = {}) {
  const safeGuildId = normalizeGuildId(guildId);
  const filePath = getGuildFilePath(safeGuildId);
  const current = readJson(filePath, DEFAULT_GUILD_DATA);
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
  return nextData;
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
  const data = getGuildData(guildId);

  data[sectionName] = {
    ...(sectionData || {}),
    updatedAt: new Date().toISOString(),
  };

  return saveGuildData(guildId, data, guildOrMeta)[sectionName];
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

  listGuildFiles,
};