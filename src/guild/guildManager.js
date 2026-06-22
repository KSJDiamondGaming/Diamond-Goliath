'use strict';

const fs = require('fs');
const path = require('path');

const { getRuntimePaths } = require('../config/runtimePaths');
const { clone, ensureDir, read, write } = require('./fileStore');

const {
  DEFAULT_GUILD_DATA,
  DEFAULT_LOGS,
  DEFAULT_SECURITY,
  DEFAULT_SERVER_BACKUPS,
  DEFAULT_EMBED,
  DEFAULT_EMBED_DEFAULTS,
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_TICKETS,
  DEFAULT_MODULES,
  DEFAULT_SUBSCRIPTION,
} = require('./defaults');

const {
  LEGACY_SECTION_MAP,
  LEGACY_TOP_LEVEL_SECTIONS,
  getRoutedSection,
  setRoutedSection,
  removeLegacyTopLevelSections,
  hasLegacyTopLevelSections,
} = require('./sectionRouting');

const runtimePaths = getRuntimePaths(process.env.BOT_MODE || 'DEV');
const GUILDS_DIR = runtimePaths.guilds;

const SAFE_DEFAULT_LOGS = DEFAULT_LOGS || { enabled: true, channels: {}, events: {} };
const SAFE_DEFAULT_SECURITY = DEFAULT_SECURITY || {};
const DEFAULT_TICKET_RUNTIME = DEFAULT_TICKETS || {};
const DEFAULT_EMBED_RUNTIME = DEFAULT_EMBED || {};
const DEFAULT_MODULE_RUNTIME = DEFAULT_MODULES || {};
const DEFAULT_SUBSCRIPTION_RUNTIME = DEFAULT_SUBSCRIPTION || {
  plan: 'free',
  status: 'active',
  source: 'system',
  expiresAt: null,
};

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

function now() {
  return new Date().toISOString();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function ensureGuildsDir() {
  ensureDir(GUILDS_DIR);
}

function normalizeGuildId(guildId) {
  const id = String(guildId || '').trim();
  if (!/^\d{16,20}$/.test(id)) throw new Error(`Invalid guild ID: ${guildId}`);
  return id;
}

function normalizeDiscordId(value) {
  const id = String(value || '').trim();
  return /^\d{16,20}$/.test(id) ? id : null;
}

function normalizeDiscordIdArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeDiscordId).filter(Boolean))];
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
  if (!key) throw new Error(`${label} is required.`);
  return key.slice(0, 50);
}

function cleanString(value, maxLength = 4000) {
  return String(value || '').trim().slice(0, maxLength);
}

function cleanEmbedUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';

  const allowedPlaceholders = new Set([
    '{guildIcon}',
    '{guildBanner}',
    '{botAvatar}',
    '{userAvatar}',
    '{memberAvatar}',
    '{serverIcon}',
    '{serverBanner}',
  ]);

  if (allowedPlaceholders.has(url)) return url;

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function getGuildFilePath(guildId) {
  return path.join(GUILDS_DIR, `${normalizeGuildId(guildId)}.json`);
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

function normalizeEmbed(embed = {}) {
  const source = isPlainObject(embed) ? embed : {};
  const merged = mergeDeep(DEFAULT_EMBED_RUNTIME, source);

  merged.title = cleanString(merged.title, 256);
  merged.description = cleanString(merged.description, 4096);
  merged.color = cleanString(merged.color || '#5865F2', 20) || '#5865F2';

  merged.author = isPlainObject(merged.author) ? merged.author : {};
  merged.author.name = cleanString(merged.author.name || merged.authorName, 256);
  merged.author.iconURL = cleanEmbedUrl(merged.author.iconURL || merged.authorIcon);
  merged.author.url = cleanEmbedUrl(merged.author.url || merged.authorUrl);

  merged.thumbnailURL = cleanEmbedUrl(merged.thumbnailURL || merged.thumbnail);
  merged.imageURL = cleanEmbedUrl(merged.imageURL || merged.image);

  merged.footer = isPlainObject(merged.footer) ? merged.footer : { text: merged.footer };
  merged.footer.text = cleanString(merged.footer.text || '', 2048);
  merged.footer.iconURL = cleanEmbedUrl(merged.footer.iconURL || merged.footerIcon);

  merged.fields = Array.isArray(merged.fields)
    ? merged.fields
        .filter(isPlainObject)
        .slice(0, 25)
        .map((field) => ({
          name: cleanString(field.name, 256),
          value: cleanString(field.value, 1024),
          inline: field.inline === true,
        }))
        .filter((field) => field.name && field.value)
    : [];

  merged.buttons = Array.isArray(merged.buttons)
    ? merged.buttons
        .filter(isPlainObject)
        .slice(0, 25)
        .map((button) => ({
          id: cleanString(button.id, 100),
          label: cleanString(button.label, 80),
          emoji: cleanString(button.emoji, 50),
          style: cleanString(button.style || 'Primary', 20),
          url: cleanEmbedUrl(button.url),
          action: cleanString(button.action, 100),
          data: isPlainObject(button.data) ? button.data : {},
        }))
    : [];

  return merged;
}

function sanitizePresetName(name) {
  return sanitizeKey(name, 'Preset name');
}

function sanitizeTemplateKey(templateKey) {
  return sanitizeKey(templateKey, 'Template key');
}

function normalizeSubscription(source = {}) {
  const subscription = mergeDeep(DEFAULT_SUBSCRIPTION_RUNTIME, isPlainObject(source) ? source : {});
  subscription.plan = String(subscription.plan || 'free').trim().toLowerCase() || 'free';
  if (!['free', 'plus', 'pro', 'lifetime'].includes(subscription.plan)) subscription.plan = 'free';
  subscription.status = String(subscription.status || 'active').trim().toLowerCase() || 'active';
  subscription.source = String(subscription.source || 'system').trim().toLowerCase() || 'system';
  subscription.expiresAt = subscription.expiresAt || null;
  return subscription;
}

function normalizeEmbedPresets(source = {}) {
  const rawPresets = getRoutedSection(source, 'embedPresets', {});
  if (!isPlainObject(rawPresets)) return {};

  const presets = {};

  for (const [presetName, presetData] of Object.entries(rawPresets)) {
    if (!isPlainObject(presetData)) continue;
    const name = sanitizePresetName(presetData.name || presetName);
    presets[name] = {
      ...normalizeEmbed(presetData),
      name,
      updatedAt: presetData.updatedAt || now(),
    };
  }

  return presets;
}

function normalizeEmbedBuilder(source = {}) {
  const builder = getRoutedSection(source, 'embedBuilder', {});
  const templates = {};

  if (isPlainObject(builder.templates)) {
    for (const [templateKey, templateData] of Object.entries(builder.templates)) {
      if (!isPlainObject(templateData)) continue;
      templates[sanitizeTemplateKey(templateKey)] = normalizeEmbed(templateData);
    }
  }

  return {
    draft: normalizeEmbed(builder.draft || {}),
    templates,
  };
}

function normalizeGeneralSettings(source = {}) {
  const generalSettings = mergeDeep(
    DEFAULT_GENERAL_SETTINGS || {},
    getRoutedSection(source, 'generalSettings', {})
  );

  generalSettings.prefix = String(generalSettings.prefix || '!').trim() || '!';
  generalSettings.appealUrl = String(generalSettings.appealUrl || '').trim();
  generalSettings.dashboardEnabled = generalSettings.dashboardEnabled !== false;
  generalSettings.managerRoleIds = normalizeDiscordIdArray(generalSettings.managerRoleIds);
  generalSettings.dashboardAccessRoleIds = normalizeDiscordIdArray(generalSettings.dashboardAccessRoleIds);
  generalSettings.commandManagerRoleIds = normalizeDiscordIdArray(generalSettings.commandManagerRoleIds);
  generalSettings.restrictedChannelIds = normalizeDiscordIdArray(generalSettings.restrictedChannelIds);
  generalSettings.commandNotFoundEnabled = generalSettings.commandNotFoundEnabled !== false;
  generalSettings.wrongCommandUsageEnabled = generalSettings.wrongCommandUsageEnabled !== false;
  generalSettings.noCommandPermissionsEnabled = generalSettings.noCommandPermissionsEnabled !== false;
  generalSettings.disabledInChannelEnabled = generalSettings.disabledInChannelEnabled === true;
  generalSettings.commandCooldownEnabled = generalSettings.commandCooldownEnabled !== false;
  generalSettings.instantDeleteDataEnabled = generalSettings.instantDeleteDataEnabled === true;

  return generalSettings;
}

function normalizeLogs(source = {}) {
  const logs = mergeDeep(SAFE_DEFAULT_LOGS, getRoutedSection(source, 'logs', {}));
  logs.enabled = logs.enabled !== false;
  logs.channels = mergeDeep(SAFE_DEFAULT_LOGS?.channels || {}, isPlainObject(logs.channels) ? logs.channels : {});
  logs.events = mergeDeep(SAFE_DEFAULT_LOGS?.events || {}, isPlainObject(logs.events) ? logs.events : {});

  const legacyMessageChannelId = normalizeChannelId(source.messageLogChannelId);
  const oldMessageChannelId = normalizeChannelId(logs.channels.message);

  logs.channels.general = normalizeChannelId(logs.channels.general) || normalizeChannelId(source.logsChannelId);
  logs.channels.moderation = normalizeChannelId(logs.channels.moderation) || normalizeChannelId(source.modLogChannelId);
  logs.channels.admin = normalizeChannelId(logs.channels.admin) || normalizeChannelId(source.adminLogChannelId);
  logs.channels.automod = normalizeChannelId(logs.channels.automod) || normalizeChannelId(source.automodLogChannelId);
  logs.channels.member = normalizeChannelId(logs.channels.member) || normalizeChannelId(source.memberLogChannelId);
  logs.channels.messageDelete = normalizeChannelId(logs.channels.messageDelete) || oldMessageChannelId || legacyMessageChannelId;
  logs.channels.messageEdit = normalizeChannelId(logs.channels.messageEdit) || oldMessageChannelId || legacyMessageChannelId;
  logs.channels.voice = normalizeChannelId(logs.channels.voice) || normalizeChannelId(source.voiceLogChannelId);
  delete logs.channels.message;

  return logs;
}

function normalizeLogType(type = 'general') {
  return LOG_CHANNEL_ALIASES[type] || 'general';
}

function normalizeSecurity(source = {}) {
  const security = mergeDeep(SAFE_DEFAULT_SECURITY, getRoutedSection(source, 'security', {}));
  security.enabled = security.enabled !== false;
  security.threatLevel = String(security.threatLevel || 'low').toLowerCase();
  if (!['low', 'medium', 'high', 'critical'].includes(security.threatLevel)) security.threatLevel = 'low';
  security.totalIncidents = Number(security.totalIncidents || 0);
  security.criticalIncidents = Number(security.criticalIncidents || 0);
  security.incidents = Array.isArray(security.incidents) ? security.incidents.slice(0, 250) : [];
  security.lockdown = mergeDeep(SAFE_DEFAULT_SECURITY.lockdown || {}, isPlainObject(security.lockdown) ? security.lockdown : {});
  security.lockdown.active = security.lockdown.active === true;
  security.lockdown.channels = Array.isArray(security.lockdown.channels) ? security.lockdown.channels : [];
  security.lockdown.bypassRoleIds = normalizeDiscordIdArray(security.lockdown.bypassRoleIds);
  security.ownerMonitoring = mergeDeep(SAFE_DEFAULT_SECURITY.ownerMonitoring || {}, isPlainObject(security.ownerMonitoring) ? security.ownerMonitoring : {});
  security.ownerMonitoring.enabled = security.ownerMonitoring.enabled !== false;
  security.ownerMonitoring.webhookMirrorEnabled = security.ownerMonitoring.webhookMirrorEnabled !== false;
  return security;
}

function normalizeTickets(source = {}) {
  const tickets = mergeDeep(DEFAULT_TICKET_RUNTIME, getRoutedSection(source, 'tickets', {}));
  tickets.settings = isPlainObject(tickets.settings) ? tickets.settings : {};
  tickets.panels = Array.isArray(tickets.panels) ? tickets.panels : [];
  tickets.tickets = Array.isArray(tickets.tickets) ? tickets.tickets : [];
  tickets.analytics = isPlainObject(tickets.analytics) ? tickets.analytics : {};
  return tickets;
}

function normalizeServerBackups(source = {}) {
  const serverBackups = mergeDeep(DEFAULT_SERVER_BACKUPS || {}, getRoutedSection(source, 'serverBackups', {}));
  serverBackups.enabled = serverBackups.enabled !== false;
  serverBackups.storage = mergeDeep(DEFAULT_SERVER_BACKUPS?.storage || {}, isPlainObject(serverBackups.storage) ? serverBackups.storage : {});
  serverBackups.retention = mergeDeep(DEFAULT_SERVER_BACKUPS?.retention || {}, isPlainObject(serverBackups.retention) ? serverBackups.retention : {});
  serverBackups.retention.maxBackups = Number(serverBackups.retention.maxBackups || process.env.SERVER_BACKUP_RETENTION || 4);
  serverBackups.retention.autoCleanup = serverBackups.retention.autoCleanup !== false;
  serverBackups.storage.path = serverBackups.storage.path || process.env.SERVER_BACKUP_DIR || runtimePaths.backups;
  return serverBackups;
}

function buildModules(source = {}) {
  const modules = mergeDeep(DEFAULT_MODULE_RUNTIME, isPlainObject(source.modules) ? source.modules : {});

  modules.generalSettings = normalizeGeneralSettings(source);
  modules.logs = normalizeLogs(source);
  modules.security = normalizeSecurity(source);
  modules.serverBackups = normalizeServerBackups(source);
  modules.embedDefaults = mergeDeep(DEFAULT_EMBED_DEFAULTS || {}, getRoutedSection(source, 'embedDefaults', {}));
  modules.embedPresets = normalizeEmbedPresets(source);
  modules.embedBuilder = normalizeEmbedBuilder(source);
  modules.tickets = normalizeTickets(source);

  return modules;
}

function mergeDefaults(data = {}) {
  const source = isPlainObject(data) ? data : {};
  const base = removeLegacyTopLevelSections(mergeDeep(DEFAULT_GUILD_DATA || {}, source));

  const merged = {
    guildId: source.guildId || base.guildId || null,
    guildName: cleanGuildName(source.guildName || source.name || base.guildName),
    createdAt: source.createdAt || base.createdAt || now(),
    updatedAt: source.updatedAt || base.updatedAt || now(),
    subscription: normalizeSubscription(source.subscription || base.subscription),
    modules: buildModules(source),
  };

  for (const field of LEGACY_LOG_FIELDS) delete merged[field];
  return merged;
}

function hasMissingDefaultModules(rawData = {}) {
  if (!isPlainObject(DEFAULT_MODULE_RUNTIME)) return false;
  if (!isPlainObject(rawData.modules)) return true;
  return Object.keys(DEFAULT_MODULE_RUNTIME).some((moduleName) => !isPlainObject(rawData.modules[moduleName]));
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

  if (!options.forceReload && guildCache.has(safeGuildId)) return clone(guildCache.get(safeGuildId));

  ensureGuildsDir();

  const exists = fs.existsSync(filePath);
  const rawData = read(filePath, DEFAULT_GUILD_DATA || {});
  const data = mergeDefaults(rawData);
  data.guildId = safeGuildId;

  const needsRewrite =
    !exists ||
    !isPlainObject(rawData.modules) ||
    !isPlainObject(rawData.subscription) ||
    hasMissingDefaultModules(rawData) ||
    hasLegacyTopLevelSections(rawData) ||
    LEGACY_LOG_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(rawData, field));

  if (needsRewrite) {
    data.updatedAt = now();
    write(filePath, data);
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
  nextData.guildName = meta.guildName || cleanGuildName(nextData.guildName) || null;
  nextData.updatedAt = now();

  write(filePath, nextData);
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
  if (!meta.guildId) throw new Error('Cannot sync guild meta without a guild ID.');
  return saveGuildData(meta.guildId, { guildName: meta.guildName });
}

function getGuildSection(guildId, sectionName, fallback = {}) {
  const data = getGuildData(guildId);
  return mergeDeep(fallback, getRoutedSection(data, sectionName, fallback));
}

function replaceGuildSection(guildId, sectionName, sectionData = {}, guildOrMeta = {}) {
  const nextSection = {
    ...(isPlainObject(sectionData) ? clone(sectionData) : {}),
    updatedAt: now(),
  };

  const current = getGuildData(guildId);
  const routedGuild = setRoutedSection(current, sectionName, nextSection);
  const updatedGuild = saveGuildData(guildId, routedGuild, guildOrMeta);
  return getRoutedSection(updatedGuild, sectionName, {});
}

function saveGuildSection(guildId, sectionName, sectionData = {}, guildOrMeta = {}) {
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

function updateGuildSection(guildId, sectionName, updater, fallback = {}, guildOrMeta = {}) {
  const current = getGuildSection(guildId, sectionName, fallback);
  const next = typeof updater === 'function' ? updater(clone(current)) : updater;
  return replaceGuildSection(guildId, sectionName, isPlainObject(next) ? next : {}, guildOrMeta);
}

function getLogChannelId(guildId, type = 'general', fallbackType = 'general') {
  const logs = getGuildSection(guildId, 'logs', SAFE_DEFAULT_LOGS);
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
    SAFE_DEFAULT_LOGS,
    guildOrMeta
  );
}

function isLogEventEnabled(guildId, eventName) {
  const logs = getGuildSection(guildId, 'logs', SAFE_DEFAULT_LOGS);
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
    SAFE_DEFAULT_LOGS,
    guildOrMeta
  );
}

function getSecurityConfig(guildId) {
  return getGuildSection(guildId, 'security', SAFE_DEFAULT_SECURITY);
}

function saveSecurityConfig(guildId, config = {}, guildOrMeta = {}) {
  return saveGuildSection(guildId, 'security', config, guildOrMeta);
}

function updateSecurityConfig(guildId, updater, guildOrMeta = {}) {
  return updateGuildSection(guildId, 'security', updater, SAFE_DEFAULT_SECURITY, guildOrMeta);
}

function getServerBackupConfig(guildId) {
  return getGuildSection(guildId, 'serverBackups', DEFAULT_SERVER_BACKUPS || {});
}

function saveServerBackupConfig(guildId, config = {}, guildOrMeta = {}) {
  return saveGuildSection(guildId, 'serverBackups', config, guildOrMeta);
}

function updateServerBackupConfig(guildId, updater, guildOrMeta = {}) {
  return updateGuildSection(guildId, 'serverBackups', updater, DEFAULT_SERVER_BACKUPS || {}, guildOrMeta);
}

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
        ...normalizeEmbed(presetData),
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
  const presets = getEmbedPresets(guildId);
  if (!isPlainObject(presets) || !presets[name]) return false;

  delete presets[name];
  saveGuildSection(guildId, 'embedPresets', presets, guildOrMeta);

  const defaults = getEmbedDefaults(guildId);
  let defaultsChanged = false;
  for (const [templateKey, defaultPresetName] of Object.entries(defaults)) {
    if (defaultPresetName === name) {
      defaults[templateKey] = null;
      defaultsChanged = true;
    }
  }
  if (defaultsChanged) saveGuildSection(guildId, 'embedDefaults', defaults, guildOrMeta);
  return true;
}

function getEmbedDefaults(guildId) {
  return mergeDeep(DEFAULT_EMBED_DEFAULTS || {}, getGuildSection(guildId, 'embedDefaults', {}));
}

function setEmbedDefault(guildId, templateKey, presetName, guildOrMeta = {}) {
  const key = sanitizeTemplateKey(templateKey);
  const name = sanitizePresetName(presetName);
  const preset = getEmbedPreset(guildId, name);
  if (!preset) throw new Error(`Cannot set default. Preset "${name}" does not exist.`);
  return updateGuildSection(
    guildId,
    'embedDefaults',
    (defaults) => ({
      ...mergeDeep(DEFAULT_EMBED_DEFAULTS || {}, defaults),
      [key]: name,
    }),
    DEFAULT_EMBED_DEFAULTS || {},
    guildOrMeta
  );
}

function clearEmbedDefault(guildId, templateKey, guildOrMeta = {}) {
  const key = sanitizeTemplateKey(templateKey);
  return updateGuildSection(
    guildId,
    'embedDefaults',
    (defaults) => ({
      ...mergeDeep(DEFAULT_EMBED_DEFAULTS || {}, defaults),
      [key]: null,
    }),
    DEFAULT_EMBED_DEFAULTS || {},
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

function saveEmbedBuilderDraft(guildId, draft = {}, guildOrMeta = {}) {
  return updateGuildSection(
    guildId,
    'embedBuilder',
    (builder) => ({
      ...builder,
      draft: normalizeEmbed(draft),
    }),
    { draft: DEFAULT_EMBED_RUNTIME, templates: {} },
    guildOrMeta
  );
}

function getEmbedBuilderDraft(guildId) {
  const builder = getGuildSection(guildId, 'embedBuilder', {
    draft: DEFAULT_EMBED_RUNTIME,
    templates: {},
  });
  return normalizeEmbed(builder.draft || {});
}

function saveEmbedTemplate(guildId, templateKey, templateData = {}, guildOrMeta = {}) {
  const key = sanitizeTemplateKey(templateKey);
  return updateGuildSection(
    guildId,
    'embedBuilder',
    (builder) => ({
      ...builder,
      templates: {
        ...(builder.templates || {}),
        [key]: normalizeEmbed(templateData),
      },
    }),
    { draft: DEFAULT_EMBED_RUNTIME, templates: {} },
    guildOrMeta
  );
}

function getEmbedTemplate(guildId, templateKey) {
  const key = sanitizeTemplateKey(templateKey);
  const builder = getGuildSection(guildId, 'embedBuilder', {
    draft: DEFAULT_EMBED_RUNTIME,
    templates: {},
  });
  return builder.templates?.[key] ? normalizeEmbed(builder.templates[key]) : null;
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
  DEFAULT_SUBSCRIPTION: DEFAULT_SUBSCRIPTION_RUNTIME,
  DEFAULT_LOGS: SAFE_DEFAULT_LOGS,
  DEFAULT_SECURITY: SAFE_DEFAULT_SECURITY,
  DEFAULT_EMBED,
  DEFAULT_EMBED_DEFAULTS,
  DEFAULT_SERVER_BACKUPS,
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_TICKETS: DEFAULT_TICKET_RUNTIME,
  DEFAULT_MODULES: DEFAULT_MODULE_RUNTIME,

  LEGACY_SECTION_MAP,
  LEGACY_TOP_LEVEL_SECTIONS,

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

  getSecurityConfig,
  saveSecurityConfig,
  updateSecurityConfig,

  getServerBackupConfig,
  saveServerBackupConfig,
  updateServerBackupConfig,

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

  saveEmbedBuilderDraft,
  getEmbedBuilderDraft,
  saveEmbedTemplate,
  getEmbedTemplate,

  reloadGuild,
  clearGuildCache,

  listGuildFiles,
};
