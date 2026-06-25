'use strict';

const fs = require('fs');
const path = require('path');

const { getRuntimePaths } = require('../../config/runtimePaths');
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
  const key = String(type || '').trim();
  return LOG_CHANNEL_ALIASES[key] || key || 'general';
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

  return tickets;
}

function normalizeGuildData(source = {}, meta = {}) {
  const guildMeta = resolveGuildMeta(meta);
  const base = mergeDeep(DEFAULT_GUILD_DATA, isPlainObject(source) ? source : {});

  if (guildMeta.guildId) base.guildId = guildMeta.guildId;
  if (guildMeta.guildName) base.guildName = guildMeta.guildName;

  base.logs = normalizeLogs(base);
  base.security = normalizeSecurity(base);
  base.serverBackups = mergeDeep(DEFAULT_SERVER_BACKUPS || {}, getRoutedSection(base, 'serverBackups', {}));
  base.embed = normalizeEmbed(getRoutedSection(base, 'embed', {}));
  base.embedPresets = normalizeEmbedPresets(base);
  base.embedBuilder = normalizeEmbedBuilder(base);
  base.embedDefaults = mergeDeep(DEFAULT_EMBED_DEFAULTS || {}, getRoutedSection(base, 'embedDefaults', {}));
  base.generalSettings = normalizeGeneralSettings(base);
  base.tickets = normalizeTickets(base);
  base.modules = mergeDeep(DEFAULT_MODULE_RUNTIME, getRoutedSection(base, 'modules', {}));
  base.subscription = normalizeSubscription(getRoutedSection(base, 'subscription', {}));

  if (hasLegacyTopLevelSections(base)) removeLegacyTopLevelSections(base);

  return base;
}

function saveGuildData(guildId, data = {}, guildOrMeta = {}) {
  ensureGuildsDir();
  const safeGuildId = normalizeGuildId(guildId);
  const meta = resolveGuildMeta(guildOrMeta);
  const normalized = normalizeGuildData(data, {
    guildId: safeGuildId,
    guildName: meta.guildName,
  });

  normalized.updatedAt = now();

  write(getGuildFilePath(safeGuildId), normalized);
  guildCache.set(safeGuildId, clone(normalized));
  return clone(normalized);
}

function getGuildData(guildId, options = {})
{
  ensureGuildsDir();
  const safeGuildId = normalizeGuildId(guildId);
  if (!options.forceReload && guildCache.has(safeGuildId)) return clone(guildCache.get(safeGuildId));

  const filePath = getGuildFilePath(safeGuildId);
  const data = read(filePath, null);

  if (!data) return saveGuildData(safeGuildId, DEFAULT_GUILD_DATA, { guildId: safeGuildId });

