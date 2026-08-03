'use strict';
const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, EmbedBuilder, ModalBuilder, PermissionFlagsBits, RoleSelectMenuBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const crypto = require('crypto');
const guildManager = require('../../../core/guild/guildManager');
const security = require('../../../core/security/securityCore');
const { normalizeAccountInput, migrateAccount } = require('./accountNormalizer');
const { providerInfo } = require('./socialStudioProviders');
const { forcePostCreatorLive } = require('./socialStudioMonitor');

const P = 'social:';
const PAGE_SIZE = 25;
const PLATFORMS = ['twitch', 'youtube', 'tiktok', 'kick', 'facebook', 'instagram', 'x'];
const ALERT_TYPES = ['live', 'ended', 'vod', 'clip', 'upload', 'short', 'post'];
const ALERT_LABEL = { live: 'LIVE', ended: 'Stream Ended', vod: 'VOD', clip: 'Clip', upload: 'Upload', short: 'Short', post: 'Post' };
const ALERT_EMOJI = { live: '🔴', ended: '⚫', vod: '🎥', clip: '🎬', upload: '📺', short: '📱', post: '📝' };
const LABEL = { twitch: 'Twitch', youtube: 'YouTube', tiktok: 'TikTok', kick: 'Kick', facebook: 'Facebook', instagram: 'Instagram', x: 'X' };
const ICON = { twitch: '🟣', youtube: '🔴', tiktok: '⚫', kick: '🟢', facebook: '🔵', instagram: '🟠', x: '⚪' };
const PLATFORM_COLOR = { twitch: 0x9146FF, youtube: 0xFF0000, tiktok: 0x2F3136, kick: 0x53FC18, facebook: 0x1877F2, instagram: 0xE1306C, x: 0xFFFFFF };
const NAV = new Set(['creators', 'accounts', 'notifications', 'templates', 'variables', 'channels', 'settings', 'permissions', 'roles', 'operations', 'monitoring', 'liveMessages', 'diagnostics', 'automation', 'testing', 'data']);
const SETTINGS_CHILDREN = new Set(['permissions', 'roles', 'operations', 'monitoring', 'liveMessages', 'diagnostics', 'automation', 'testing', 'data']);
const accountSessions = new Map();
const creatorSessions = new Map();
const feedSessions = new Map();
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const linkBtn = (url, label) => new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(label);
const sessionKey = (i) => `${i.guildId}:${i.user?.id || 'unknown'}`;
const who = (i) => i.member?.displayName || i.user?.displayName || i.user?.username || 'Unknown User';
const makeId = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const now = () => new Date().toISOString();
const MONITORING_INTERVALS = [
  { label: 'Interval: 30 seconds', value: '30000', description: 'Check providers every 30 seconds.' },
  { label: 'Interval: 1 minute', value: '60000', description: 'Check providers every minute.' },
  { label: 'Interval: 5 minutes', value: '300000', description: 'Check providers every 5 minutes.' },
  { label: 'Interval: 10 minutes', value: '600000', description: 'Check providers every 10 minutes.' },
  { label: 'Interval: 15 minutes', value: '900000', description: 'Check providers every 15 minutes.' },
  { label: 'Interval: 30 minutes', value: '1800000', description: 'Check providers every 30 minutes.' },
  { label: 'Interval: 1 hour', value: '3600000', description: 'Check providers every hour.' },
];
const accountSort = (a, b) => {
  const platform = String(LABEL[a?.platform] || a?.platform || '').localeCompare(String(LABEL[b?.platform] || b?.platform || ''), undefined, { sensitivity: 'base' });
  if (platform) return platform;
  return String(a?.username || a?.externalId || '').localeCompare(String(b?.username || b?.externalId || ''), undefined, { sensitivity: 'base' });
};
const supportedAlerts = (platform) => {
  const supported = (providerInfo(platform).supportedAlertTypes || []).filter((type) => ALERT_TYPES.includes(type));
  if (supported.includes('live') && !supported.includes('ended')) supported.splice(1, 0, 'ended');
  return supported;
};
const hasAnyRole = (member, roleIds = []) => Array.isArray(roleIds) && roleIds.some((id) => member?.roles?.cache?.has?.(id));
function canManageSocialStudio(i, config = getConfig(i.guildId)) {
  return Boolean(
    security.isBotOwner?.(i.user?.id) ||
    i.guild?.ownerId === i.user?.id ||
    i.member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
    hasAnyRole(i.member, config.managerRoleIds),
  );
}
async function denySocialAccess(i) {
  const payload = { content: 'You do not have permission to manage Social Studio.', flags: 64 };
  if (i.deferred || i.replied) await i.followUp(payload).catch(() => null);
  else await i.reply(payload);
  return true;
}

function getConfig(guildId) {
  const guild = guildManager.reloadGuild(guildId);
  const s = guild?.modules?.social && typeof guild.modules.social === 'object' ? guild.modules.social : {};
  return {
    ...s,
    enabled: guildManager.isModuleEnabled(guildId, 'social'),
    alertsChannelId: s.alertsChannelId || null,
    alertChannels: s.alertChannels && typeof s.alertChannels === 'object' ? s.alertChannels : {},
    managerRoleIds: Array.isArray(s.managerRoleIds) ? s.managerRoleIds : [],
    userRoleIds: Array.isArray(s.userRoleIds) ? s.userRoleIds : [],
    notificationMentionMode: ['none', 'role', 'everyone', 'here'].includes(s.notificationMentionMode) ? s.notificationMentionMode : 'none',
    notificationRoleId: s.notificationRoleId || null,
    accounts: s.accounts && typeof s.accounts === 'object' ? s.accounts : {},
    creators: s.creators && typeof s.creators === 'object' ? s.creators : {},
    templates: s.templates && typeof s.templates === 'object' ? s.templates : {},
    settings: s.settings && typeof s.settings === 'object' ? s.settings : {},
    history: Array.isArray(s.history) ? s.history : [],
    queue: Array.isArray(s.queue) ? s.queue : [],
    analytics: s.analytics && typeof s.analytics === 'object' ? s.analytics : {},
  };
}

function saveConfig(guildId, config, guild, actorId = null) {
  const { enabled: _enabled, ...storedConfig } = config;
  const next = { ...storedConfig, updatedAt: now(), lastActorId: actorId };
  guildManager.replaceGuildSection(guildId, 'social', next, guild);
  const saved = guildManager.reloadGuild(guildId)?.modules?.social;
  if (!saved || typeof saved !== 'object') throw new Error('Social Studio could not verify its saved guild data.');
  for (const id of Object.keys(next.creators || {})) if (!saved.creators?.[id]) throw new Error(`Creator profile ${id} was not persisted.`);
  for (const id of Object.keys(next.accounts || {})) if (!saved.accounts?.[id]) throw new Error(`Social account ${id} was not persisted.`);
  return { ...saved, enabled: guildManager.isModuleEnabled(guildId, 'social') };
}

function applyNotificationDefaults(config) {
  const mode = ['none', 'role', 'everyone', 'here'].includes(config.notificationMentionMode)
    ? config.notificationMentionMode
    : 'none';
  const roleId = mode === 'role' ? config.notificationRoleId || null : null;
  for (const account of Object.values(config.accounts || {})) {
    if (!account || typeof account !== 'object') continue;
    account.mentionMode = mode;
    account.mentionRoleId = roleId;
    account.updatedAt = now();
  }
}

function getAccountSession(i) { return accountSessions.get(sessionKey(i)) || { creatorId: null, platforms: [], accountId: null, routeType: 'default' }; }
function setAccountSession(i, patch) { const next = { ...getAccountSession(i), ...patch }; accountSessions.set(sessionKey(i), next); return next; }
function getCreatorSession(i) { return creatorSessions.get(sessionKey(i)) || { creatorId: null, page: 0 }; }
function setCreatorSession(i, patch) { const next = { ...getCreatorSession(i), ...patch }; creatorSessions.set(sessionKey(i), next); return next; }
function getFeedSession(i) { return feedSessions.get(sessionKey(i)) || { routeType: 'default' }; }
function setFeedSession(i, patch) { const next = { ...getFeedSession(i), ...patch }; feedSessions.set(sessionKey(i), next); return next; }
function embed(config, title, description, requestedBy, color = null) { return new EmbedBuilder().setColor(color || (config.enabled ? 0x5865F2 : 0x747F8D)).setTitle(title).setDescription(description).setFooter({ text: `Requested by ${requestedBy}` }).setTimestamp(); }
function platformColor(platform) { return PLATFORM_COLOR[platform] || 0x5865F2; }
function creatorAccent(linked) { const platforms = [...new Set((linked || []).map((account) => account?.platform).filter(Boolean))]; return platforms.length === 1 ? platformColor(platforms[0]) : null; }
function navigation(active = 'main') {
  let backId = 'admin:studio:socialStudio';
  let secondaryId = `${P}settings`;
  let secondaryLabel = '⚙️ Settings';
  let secondaryDisabled = active === 'settings';
  if (active === 'settings') backId = `${P}main`;
  else if (SETTINGS_CHILDREN.has(active)) { backId = `${P}settings`; secondaryId = `${P}main`; secondaryLabel = '🏠 Social Studio'; secondaryDisabled = false; }
  else if (active !== 'main') backId = `${P}main`;
  return row(btn(backId, '⬅️ Back'), btn(secondaryId, secondaryLabel, ButtonStyle.Secondary, secondaryDisabled));
}

function creatorSelect(creators, selected, id = `${P}account:creator`, placeholder = '1. Select the creator profile') {
  return row(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).setMinValues(1).setMaxValues(1).addOptions(creators.slice(0, 25).map((c) => ({ label: String(c.displayName || 'Unnamed creator').slice(0, 100), value: c.creatorId, description: `${(c.accountIds || []).length} linked account(s)`.slice(0, 100), default: c.creatorId === selected }))));
}
function accountSelect(accounts, selected) {
  return row(new StringSelectMenuBuilder().setCustomId(`${P}account:select`).setPlaceholder('2. Select an account to manage').setMinValues(1).setMaxValues(1).addOptions(accounts.slice(0, 25).map((a) => ({ label: `${LABEL[a.platform] || a.platform} · ${a.username || a.externalId || 'Resolving'}`.slice(0, 100), value: a.accountId, description: String(a.profileUrl || a.externalId || '').slice(0, 100), default: a.accountId === selected }))));
}
function platformSelect(selected = []) { return row(new StringSelectMenuBuilder().setCustomId(`${P}account:platforms`).setPlaceholder('3. Select one or more platforms to add').setMinValues(1).setMaxValues(5).addOptions(PLATFORMS.map((p) => ({ label: LABEL[p], value: p, default: selected.includes(p) })))); }
function alertTypeSelect(account) {
  const supported = supportedAlerts(account.platform); if (!supported.length) return null;
  const configured = Array.isArray(account.alertTypes) ? account.alertTypes : supported;
  return row(new StringSelectMenuBuilder().setCustomId(`${P}account:alerts`).setPlaceholder('Notifications to post for this account').setMinValues(0).setMaxValues(supported.length).addOptions(supported.map((type) => ({ label: `${ALERT_EMOJI[type] || '🔔'} ${ALERT_LABEL[type] || type}`, value: type, description: `Post ${ALERT_LABEL[type] || type} updates to Discord`, default: configured.includes(type) }))));
}
function routeTypeSelect(id, selected, types = ALERT_TYPES) {
  const copy = {
    default: { label: '🏠 Default Channel', description: 'All social posts go here unless you choose a dedicated channel below.' },
    live: { label: '🔴 LIVE Alerts', description: 'When a creator starts streaming.' },
    ended: { label: '⚫ Stream Ended', description: 'When a live stream finishes.' },
    vod: { label: '🎥 VOD Posts', description: 'When a stream replay is available.' },
    clip: { label: '🎬 Clip Posts', description: 'When a new clip is found.' },
    upload: { label: '📺 Video Uploads', description: 'When a new video is uploaded.' },
    short: { label: '📱 Shorts', description: 'When a short-form video is found.' },
    post: { label: '📝 Social Posts', description: 'When a normal social post is found.' },
  };
  const options = [copy.default, ...types.map((type) => ({ label: copy[type]?.label || ALERT_LABEL[type] || type, value: type, description: copy[type]?.description || ('Choose where ' + (ALERT_LABEL[type] || type) + ' posts go.') }))];
  options[0] = { ...options[0], value: 'default' };
  return row(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder('Choose what you want to send').setMinValues(1).setMaxValues(1).addOptions(options.map((o) => ({ ...o, default: o.value === selected }))));
}
function notificationTargetSelect(i, config) {
  const selected = config.notificationMentionMode === 'role' && config.notificationRoleId
    ? `role:${config.notificationRoleId}`
    : config.notificationMentionMode;
  const roles = [...(i.guild?.roles?.cache?.values?.() || [])]
    .filter((role) => role && role.id !== i.guildId && !role.managed)
    .sort((a, b) => b.position - a.position)
    .slice(0, 22);
  return row(new StringSelectMenuBuilder()
    .setCustomId(`${P}notification:mode`)
    .setPlaceholder('Select LIVE notification target')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions([
      ...roles.map((role) => ({
        label: role.name.slice(0, 100),
        value: `role:${role.id}`,
        description: 'Ping this role when a creator goes LIVE.',
        default: selected === `role:${role.id}`,
      })),
      {
        label: '@here',
        value: 'here',
        description: 'Ping currently online members.',
        default: selected === 'here',
      },
      {
        label: '@everyone',
        value: 'everyone',
        description: 'Ping everyone when a creator goes LIVE.',
        default: selected === 'everyone',
      },
      {
        label: 'No notification ping',
        value: 'none',
        description: 'Post alerts without pinging members.',
        default: selected === 'none',
      },
    ]));
}
function monitoringIntervalSelect(settings = {}) {
  const current = String(Math.max(30000, Number(settings.checkIntervalMs || 300000)));
  return row(new StringSelectMenuBuilder()
    .setCustomId(`${P}automation:interval`)
    .setPlaceholder('Choose check interval')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(MONITORING_INTERVALS.map((option) => ({ ...option, default: option.value === current }))));
}
function monitoringBooleanSelect(id, label, enabled) {
  return row(new StringSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder(label)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions([
      { label: `${label}: Enabled`, value: 'true', description: `Turn ${label.toLowerCase()} on.`, default: enabled === true },
      { label: `${label}: Disabled`, value: 'false', description: `Turn ${label.toLowerCase()} off.`, default: enabled !== true },
    ]));
}
function channelSelect(id, selected, placeholder) { const m = new ChannelSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1); if (selected) m.setDefaultChannels([selected]); return row(m); }
function roleSelect(ids, customId = `${P}roles:select`, placeholder = 'Select Social Studio manager roles') { const m = new RoleSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setMinValues(0).setMaxValues(10); if (ids?.length) m.setDefaultRoles(ids.slice(0, 10)); return row(m); }
function notificationRoleSelect(roleId, disabled = false) {
  const menu = new RoleSelectMenuBuilder()
    .setCustomId(`${P}notification:role`)
    .setPlaceholder('Select the role pinged for LIVE alerts')
    .setMinValues(0)
    .setMaxValues(1)
    .setDisabled(disabled);
  if (roleId) menu.setDefaultRoles([roleId]);
  return row(menu);
}

function creatorModal(c = null) {
  return new ModalBuilder().setCustomId(c ? `${P}creator:update:${c.creatorId}` : `${P}creator:create`).setTitle(c ? 'Edit Creator Profile' : 'Create Creator Profile').addComponents(
    row(new TextInputBuilder().setCustomId('displayName').setLabel('Creator display name').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(true).setValue(String(c?.displayName || ''))),
    row(new TextInputBuilder().setCustomId('group').setLabel('Group or team').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(false).setValue(String(c?.group || ''))),
    row(new TextInputBuilder().setCustomId('tags').setLabel('Tags (comma separated)').setStyle(TextInputStyle.Short).setMaxLength(300).setRequired(false).setValue(Array.isArray(c?.tags) ? c.tags.join(', ') : '')),
    row(new TextInputBuilder().setCustomId('notes').setLabel('Notes').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(false).setValue(String(c?.notes || ''))),
  );
}
function accountModal(platforms) { const m = new ModalBuilder().setCustomId(`${P}account:create-multi`).setTitle('Add Social Accounts'); for (const p of platforms.slice(0, 5)) m.addComponents(row(new TextInputBuilder().setCustomId(`account_${p}`).setLabel(`${LABEL[p]} username, channel ID or URL`).setStyle(TextInputStyle.Short).setMaxLength(500).setRequired(true))); return m; }
function accountEditModal(a) { return new ModalBuilder().setCustomId(`${P}account:update:${a.accountId}`).setTitle(`Edit ${LABEL[a.platform] || a.platform} Account`).addComponents(row(new TextInputBuilder().setCustomId('accountValue').setLabel('Username, channel ID or URL').setStyle(TextInputStyle.Short).setMaxLength(500).setRequired(true).setValue(String(a.sourceInput || a.profileUrl || a.externalId || a.username || '')))); }
function templateModal(type, config) {
  const c = config.templates?.[type] || {};
  return new ModalBuilder().setCustomId(`${P}template:save:${type}`).setTitle(`${ALERT_LABEL[type] || type} Template`).addComponents(
    row(new TextInputBuilder().setCustomId('title').setLabel('Embed title').setStyle(TextInputStyle.Short).setMaxLength(256).setValue(String(c.title || '{creator} alert')).setRequired(true)),
    row(new TextInputBuilder().setCustomId('description').setLabel('Embed description').setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setValue(String(c.description || '{title}')).setRequired(true)),
    row(new TextInputBuilder().setCustomId('buttonLabel').setLabel('Primary button label').setStyle(TextInputStyle.Short).setMaxLength(80).setValue(String(c.buttonLabel || 'Watch now')).setRequired(true)),
    row(new TextInputBuilder().setCustomId('color').setLabel('Embed colour (#RRGGBB or variable)').setStyle(TextInputStyle.Short).setMaxLength(40).setRequired(false).setValue(String(c.color || '{platformColor}'))),
    row(new TextInputBuilder().setCustomId('footer').setLabel('Embed footer').setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(false).setValue(String(c.footer || '{platform} • Social Studio'))),
  );
}
function quietHoursModal(config) {
  const quiet = config.settings?.quietHours && typeof config.settings.quietHours === 'object' ? config.settings.quietHours : {};
  return new ModalBuilder().setCustomId(`${P}automation:quiet`).setTitle('Configure Quiet Hours').addComponents(
    row(new TextInputBuilder().setCustomId('enabled').setLabel('Enabled? yes or no').setStyle(TextInputStyle.Short).setMaxLength(3).setRequired(true).setValue(quiet.enabled === true ? 'yes' : 'no')),
    row(new TextInputBuilder().setCustomId('start').setLabel('Start time, HH:MM').setStyle(TextInputStyle.Short).setMaxLength(5).setRequired(true).setValue(String(quiet.start || '23:00'))),
    row(new TextInputBuilder().setCustomId('end').setLabel('End time, HH:MM').setStyle(TextInputStyle.Short).setMaxLength(5).setRequired(true).setValue(String(quiet.end || '08:00'))),
    row(new TextInputBuilder().setCustomId('timezone').setLabel('Timezone').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true).setValue(String(quiet.timezone || 'Europe/London'))),
  );
}

function removeAccountReferences(config, ids) { const set = new Set(ids); for (const c of Object.values(config.creators)) c.accountIds = (c.accountIds || []).filter((id) => !set.has(id)); }
function canonicalIdentity(a) { return String(a.canonicalIdentity || a.externalId || a.normalizedUsername || a.username || '').toLowerCase(); }
function canonicalKey(a) { return `${String(a.platform || '').toLowerCase()}:${canonicalIdentity(a)}`; }
function upsertAccount(config, creator, platform, rawValue) {
  const n = normalizeAccountInput(platform, rawValue); const key = `${platform}:${String(n.canonicalIdentity || n.externalId || n.normalizedUsername || n.username || '').toLowerCase()}`;
  const matches = Object.values(config.accounts).filter((a) => { try { return canonicalKey(migrateAccount(a)) === key; } catch { return false; } });
  const primary = matches[0] || null; const accountId = primary?.accountId || makeId('account'); const duplicates = matches.slice(1).map((a) => a.accountId);
  if (duplicates.length) { removeAccountReferences(config, duplicates); for (const id of duplicates) delete config.accounts[id]; }
  config.accounts[accountId] = { ...(primary || {}), accountId, platform, username: n.username, normalizedUsername: n.normalizedUsername, externalId: primary?.externalId || n.externalId || null, inputType: n.inputType, canonicalIdentity: n.canonicalIdentity, profileUrl: n.profileUrl, sourceInput: n.sourceInput, displayName: creator.displayName, enabled: primary?.enabled !== false, alertTypes: Array.isArray(primary?.alertTypes) ? primary.alertTypes : supportedAlerts(platform), alertChannelId: primary?.alertChannelId || null, alertChannels: primary?.alertChannels && typeof primary.alertChannels === 'object' ? primary.alertChannels : {}, mentionMode: primary?.mentionMode || config.notificationMentionMode || 'none', mentionRoleId: primary?.mentionRoleId || (config.notificationMentionMode === 'role' ? config.notificationRoleId || null : null), createdAt: primary?.createdAt || now(), updatedAt: now() };
  creator.accountIds = [...new Set([...(creator.accountIds || []), accountId])]; creator.updatedAt = now(); return { accountId, created: !primary, removedDuplicates: duplicates.length };
}
function accountState(a) { const s = a.state || {}; return a.enabled === false ? '⏸️ Paused' : s.isLive === true ? '🔴 LIVE' : s.isLive === false ? '⚫ Offline' : s.lastError ? '🟡 Unavailable' : '🟢 Monitoring'; }
function ts(value) { const ms = new Date(value || '').getTime(); return Number.isFinite(ms) ? `<t:${Math.floor(ms / 1000)}:R>` : 'Never'; }
function dashboardStats(config) {
  const accounts = Object.values(config.accounts);
  return { live: accounts.filter((a) => a.enabled !== false && a.state?.isLive === true).length, offline: accounts.filter((a) => a.enabled !== false && a.state?.isLive === false).length, unavailable: accounts.filter((a) => a.enabled !== false && a.state?.lastError).length, monitored: accounts.filter((a) => a.enabled !== false).length };
}
function creatorLivePostState(config, creator, options = {}) {
  if (!creator) return { canPost: false, reason: 'Select a profile first.' };
  const linked = (creator.accountIds || []).map((id) => config.accounts[id]).filter(Boolean);
  const liveAccounts = linked.filter((account) => account.enabled !== false && account.state?.isLive === true && account.state?.lastLiveEvent && account.state?.lastCheckedAt);
  if (!liveAccounts.length) return { canPost: false, reason: 'No checked LIVE account.' };
  const accountIds = new Set(linked.map((account) => String(account.accountId)));
  const cutoff = Date.now() - (2 * 60 * 60 * 1000);
  if (options.bypassCooldown !== true) {
    const recentState = linked.find((account) => {
      if (!String(account.state?.lastAlertKey || '').startsWith('live:')) return false;
      const sent = new Date(account.state?.lastAlertAt || '').getTime();
      return Number.isFinite(sent) && sent >= cutoff;
    });
    if (recentState) return { canPost: false, reason: 'LIVE post sent recently.' };
    const recent = [...(config.history || [])].reverse().find((entry) => {
      if (entry?.status !== 'alert_sent' || entry?.alertType !== 'live') return false;
      const created = new Date(entry.createdAt).getTime();
      if (!Number.isFinite(created) || created < cutoff) return false;
      return String(entry.creatorId || '') === String(creator.creatorId) || accountIds.has(String(entry.accountId || ''));
    });
    if (recent) return { canPost: false, reason: 'LIVE post sent recently.' };
  }
  return { canPost: true, reason: `${liveAccounts.length} LIVE account${liveAccounts.length === 1 ? '' : 's'} ready.` };
}
function buildMainPanel(guild, requestedBy = 'Unknown User') {
  const c = getConfig(guild.id), creators = Object.keys(c.creators).length, accounts = Object.keys(c.accounts).length, ready = creators && accounts && c.alertsChannelId, stats = dashboardStats(c);
  const d = [`${ready ? '✅' : '⚠️'} **${ready ? 'Social Studio is ready.' : 'Setup required'}**`, '', `**Creators:** ${creators}  •  **Accounts:** ${accounts}`, `🔴 **LIVE:** ${stats.live}  •  ⚫ **Offline:** ${stats.offline}  •  🟡 **Issues:** ${stats.unavailable}`, `📡 **Monitoring:** ${stats.monitored}/${accounts}`, `📨 **Alerts Sent:** ${Number(c.analytics?.alertsSent || 0).toLocaleString('en-GB')}`, `📂 **Default Channel:** ${c.alertsChannelId ? `<#${c.alertsChannelId}>` : 'Not configured'}`, `🔔 **Notifications:** ${c.enabled ? '🟢 Enabled' : '🔴 Disabled'}`].join('\n');
  return { embeds: [embed(c, '📣 Social Studio', d, requestedBy)], components: [row(btn(`${P}creators`, '👥 Creator Profiles', ButtonStyle.Primary), btn(`${P}channels`, '📂 Channels')), row(btn(`${P}templates`, '🎨 Templates')), navigation('main')] };
}
function buildCreatorPanel(i, config, creators) {
  const view = getCreatorSession(i), pages = Math.max(1, Math.ceil(creators.length / PAGE_SIZE)); if (view.page >= pages) setCreatorSession(i, { page: pages - 1 });
  let current = getCreatorSession(i), selected = config.creators[current.creatorId] || null; if (current.creatorId && !selected) { setCreatorSession(i, { creatorId: null }); selected = null; }
  const linked = selected ? (selected.accountIds || []).map((id) => config.accounts[id]).filter(Boolean).sort(accountSort) : [];
  const d = selected ? [`👤 **${selected.displayName}**`, '', ...(linked.length ? linked.map((a) => `${ICON[a.platform]} **${LABEL[a.platform]}** — ${a.profileUrl ? `[${a.username || a.externalId}](${a.profileUrl})` : a.username || a.externalId} — ${accountState(a)}`) : ['No linked social accounts.']), '', `**Status:** ${selected.enabled === false ? '⏸️ Paused' : '🟢 Monitoring'}`, `**Accounts:** ${linked.length}`].join('\n') : `Select a creator profile below.\n\n**Profiles:** ${creators.length}`;
  const postState = creatorLivePostState(config, selected, { bypassCooldown: true });
  const components = [], page = getCreatorSession(i).page, items = creators.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE); if (items.length) components.push(creatorSelect(items, getCreatorSession(i).creatorId, `${P}creator:select`, `Select a creator - Page ${page + 1}/${pages}`)); components.push(row(btn(`${P}creator:new`, '➕ New Profile', ButtonStyle.Success), btn(`${P}creator:accounts`, '🔗 Accounts', ButtonStyle.Primary, !selected), btn(`${P}creator:post`, '📣 Post LIVE', ButtonStyle.Primary, !postState.canPost))); components.push(row(btn(`${P}creator:edit`, '✏️ Manage Profile', ButtonStyle.Primary, !selected))); if (pages > 1) components.push(row(btn(`${P}creator:page:prev`, '⬅️ Previous', ButtonStyle.Secondary, page <= 0), btn(`${P}creator:page:next`, 'Next ➡️', ButtonStyle.Secondary, page >= pages - 1))); components.push(navigation('creators')); return { embeds: [embed(config, '👥 Creator Profiles', selected ? `${d}\n**Post LIVE:** ${postState.reason}` : d, who(i), selected ? creatorAccent(linked) : null)], components };
}
function buildCreatorEditPanel(i, config, creator) {
  const linked = (creator.accountIds || []).map((id) => config.accounts[id]).filter(Boolean).sort(accountSort);
  return { embeds: [embed(config, '✏️ Manage Creator', [`👤 **${creator.displayName}**`, `**Group / Team:** ${creator.group || 'Not set'}`, `**Tags:** ${creator.tags?.length ? creator.tags.join(', ') : 'None'}`, `**Accounts:** ${linked.length}`, `**Status:** ${creator.enabled === false ? '⏸️ Paused' : '🟢 Enabled'}`, `**Notes:** ${creator.notes || 'None'}`].join('\n'), who(i))], components: [row(btn(`${P}creator:check:${creator.creatorId}`, '🔄 Check Creator', ButtonStyle.Primary, !linked.length), btn(`${P}creator:accounts`, '🔗 Accounts', ButtonStyle.Primary), btn(`${P}creator:toggle`, creator.enabled === false ? '▶️ Resume' : '⏸️ Pause', creator.enabled === false ? ButtonStyle.Success : ButtonStyle.Secondary)), row(btn(`${P}creator:change`, '📝 Edit Details'), btn(`${P}creator:delete`, '🗑️ Delete', ButtonStyle.Danger), btn(`${P}creators`, '⬅️ Back')), navigation('creators')] };
}
function buildAccountEditPanel(i, config, creator, account) {
  const supported = supportedAlerts(account.platform), alerts = Array.isArray(account.alertTypes) ? account.alertTypes : supported, s = account.state || {}, components = [], session = getAccountSession(i), routeType = supported.includes(session.routeType) ? session.routeType : 'default';
  const alertMenu = alertTypeSelect(account); if (alertMenu) components.push(alertMenu); components.push(routeTypeSelect(`${P}account:route:type`, routeType, supported));
  const routeChannelId = routeType === 'default' ? account.alertChannelId : account.alertChannels?.[routeType]; components.push(channelSelect(`${P}account:route:channel`, routeChannelId, routeType === 'default' ? 'Account default notification channel' : `${ALERT_LABEL[routeType]} notification channel`));
  const actions = [btn(`${P}account:check:${account.accountId}`, '🔄 Check Now', ButtonStyle.Primary), btn(`${P}account:change`, '📝 Edit Details'), btn(`${P}account:toggle`, account.enabled === false ? '▶️ Resume' : '⏸️ Pause', account.enabled === false ? ButtonStyle.Success : ButtonStyle.Secondary)]; if (account.profileUrl && /^https?:\/\//i.test(account.profileUrl)) actions.push(linkBtn(account.profileUrl, '🔗 Profile')); actions.push(btn(`${P}account:delete`, '🗑️ Delete', ButtonStyle.Danger)); components.push(row(...actions.slice(0, 5))); components.push(row(btn(`${P}accounts`, '⬅️ Creator Accounts'), btn(`${P}settings`, '⚙️ Settings')));
  const routes = Object.entries(account.alertChannels || {}).filter(([, channelId]) => channelId).map(([type, channelId]) => `${ALERT_LABEL[type] || type}: <#${channelId}>`).join(' • ');
  const d = [`${ICON[account.platform]} **${LABEL[account.platform]} — ${account.username || account.externalId || 'Resolving…'}**`, '', `**Creator:** ${creator.displayName}`, `**Status:** ${accountState(account)}`, `**Last Checked:** ${ts(s.lastCheckedAt)}`, `**Alerts:** ${alerts.length ? alerts.map((t) => ALERT_LABEL[t] || t).join(', ') : 'None'}`, `**Default Channel:** ${account.alertChannelId ? `<#${account.alertChannelId}>` : config.alertsChannelId ? `Server default <#${config.alertsChannelId}>` : 'Not configured'}`, `**Dedicated Channels:** ${routes || 'None'}`, `**Monitoring:** ${account.enabled === false ? '⏸️ Paused' : '🟢 Enabled'}`, ...(s.lastDeliveryError ? ['', `⚠️ **Last delivery:** ${String(s.lastDeliveryError).slice(0, 400)}`] : []), ...(s.lastError ? ['', `⚠️ **Provider:** ${String(s.lastError).slice(0, 400)}`] : [])].join('\n'); return { embeds: [embed(config, '🔗 Manage Social Account', d, who(i), platformColor(account.platform))], components: components.slice(0, 5) };
}
function variablesDescription() { return ['**🌍 Global / Server**','`{timestamp}` `{nowTimestamp}` `{guildId}` `{guildName}` `{server}` `{guildIcon}` `{serverIcon}` `{guildBanner}` `{guildMemberCount}` `{memberCount}` `{guildVanityCode}`','`{successEmoji}` `{warningEmoji}` `{errorEmoji}` `{proofVerifiedEmoji}` `{successColor}` `{warningColor}` `{errorColor}` `{proofVerifiedColor}`','','**👤 Discord User Context**','`{userId}` `{userTag}` `{userName}` `{userGlobalName}` `{userMention}` `{userNoPing}` `{userAvatar}` `{userServerAvatar}` `{userNickname}` `{userDisplay}`','`{userCreatedAt}` `{userCreatedTimestamp}` `{userJoinedAt}` `{userJoinedTimestamp}` `{createdAt}` `{joinedAt}` `{leftAt}` `{accountAge}` `{membershipDuration}`','`{departureIcon}` `{departureType}` `{departureLabel}` `{departureReason}` `{departureModerator}` `{departureModeratorId}`','','**📣 Creator / Platform**','`{creator}` `{creatorName}` `{creatorDisplayName}` `{creatorAvatar}` `{creatorBanner}` `{creatorDescription}` `{platform}` `{platformIcon}` `{platformColor}` `{username}` `{displayName}` `{channelId}` `{profileUrl}`','','**🔴 LIVE / Stream**','`{title}` `{description}` `{game}` `{category}` `{viewers}` `{peakViewers}` `{started}` `{duration}` `{liveThumbnail}` `{thumbnail}` `{liveUrl}` `{url}`','','**🎥 Video / VOD / Upload / Clip / Short**','`{videoTitle}` `{videoDescription}` `{videoDuration}` `{videoViews}` `{videoThumbnail}` `{videoUrl}`','`{clipTitle}` `{clipCreator}` `{clipViews}` `{clipUrl}` `{uploadTitle}` `{uploadDescription}` `{uploadThumbnail}` `{uploadUrl}` `{shortTitle}` `{shortThumbnail}` `{shortUrl}`','','*Variables without context resolve to an empty value instead of breaking the message.*'].join('\n'); }

function buildSectionPanel(i, name) {
  const config = getConfig(i.guildId), accounts = Object.values(config.accounts), creators = Object.values(config.creators).sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''), undefined, { sensitivity: 'base' })); if (name === 'creators') return buildCreatorPanel(i, config, creators);
  if (name === 'accounts') {
    const session = getAccountSession(i), creator = session.creatorId ? config.creators[session.creatorId] || null : null; if (session.creatorId && !creator) { accountSessions.delete(sessionKey(i)); return buildSectionPanel(i, 'accounts'); }
    const linked = creator ? (creator.accountIds || []).map((id) => config.accounts[id]).filter(Boolean).sort(accountSort) : []; if (session.accountId && !linked.some((a) => a.accountId === session.accountId)) setAccountSession(i, { accountId: null }); const active = creator ? config.accounts[getAccountSession(i).accountId] || null : null;
    const list = linked.map((a) => `• ${ICON[a.platform]} **${LABEL[a.platform]}** — ${a.profileUrl ? `[${a.username || a.externalId}](${a.profileUrl})` : a.username || a.externalId} — ${accountState(a)}`).join('\n');
    const d = creator ? [`Managing accounts for **${creator.displayName}**.`, '', `**Accounts:** ${linked.length}`, `**Selected:** ${active ? `${LABEL[active.platform]} — ${active.username || active.externalId}` : 'None'}`, ...(list ? ['', list] : ['', 'No linked accounts.'])].join('\n') : `Accounts are managed from Creator Profiles.\n\nSelect a creator profile to view and add linked accounts.\n\n**Profiles:** ${creators.length}`;
    const components = []; if (creators.length) { components.push(creatorSelect(creators, session.creatorId)); if (linked.length) components.push(accountSelect(linked, getAccountSession(i).accountId)); components.push(platformSelect(getAccountSession(i).platforms)); components.push(row(btn(`${P}account:continue`, '➕ Add Account', ButtonStyle.Success, !session.creatorId || !getAccountSession(i).platforms.length), btn(`${P}account:edit`, '⚙️ Manage Selected', ButtonStyle.Primary, !active), btn(`${P}account:reset`, '🔄 Reset'))); } else components.push(row(btn(`${P}creators`, '👥 Create Creator Profile', ButtonStyle.Primary))); components.push(row(btn(`${P}creators`, '⬅️ Creator Profiles'), btn(`${P}settings`, '⚙️ Settings'))); return { embeds: [embed(config, '🔗 Creator Accounts', d, who(i), active ? platformColor(active.platform) : creator ? creatorAccent(linked) : null)], components };
  }
  if (name === 'notifications') return buildSectionPanel(i, 'operations');
  if (name === 'templates') {
    const templateButtons = ALERT_TYPES.map((t) => btn(`${P}template:${t}`, `${ALERT_EMOJI[t] || '🔔'} ${ALERT_LABEL[t]}`, ButtonStyle.Primary));
    const c = [row(...templateButtons.slice(0, 5)), row(...templateButtons.slice(5)), row(btn(`${P}variables`, '🧩 Variables')), navigation('templates')];
    return { embeds: [embed(config, '🎨 Alert Templates', 'Build rich notification embeds for each alert type. Templates support dynamic variables, platform colours, thumbnails, metadata fields and link buttons.\n\nUse **🧩 Variables** for the complete helper list.', who(i))], components: c };
  }
  if (name === 'variables') return { embeds: [embed(config, '🧩 Template Variables', variablesDescription(), who(i))], components: [row(btn(`${P}templates`, '⬅️ Templates'), btn(`${P}main`, '🏠 Social Studio'))] };
  if (name === 'feeds') return buildSectionPanel(i, 'channels');
  if (name === 'channels') {
    const session = getFeedSession(i), routeType = ALERT_TYPES.includes(session.routeType) ? session.routeType : 'default', selected = routeType === 'default' ? config.alertsChannelId : config.alertChannels?.[routeType];
    const routeSummary = ALERT_TYPES.map((type) => `${ALERT_EMOJI[type] || '🔔'} **${ALERT_LABEL[type]}:** ${config.alertChannels?.[type] ? `<#${config.alertChannels[type]}>` : 'Default channel'}`).join('\n');
    const d = `Choose which Discord channels receive Social Studio posts.\n\n**🏠 Default Channel:** ${config.alertsChannelId ? `<#${config.alertsChannelId}>` : 'Not set'}\nEverything posts here unless you choose a separate channel below.\n\n**Dedicated Channels**\n${routeSummary}\n\nPick what you want to configure, then choose the Discord channel.`;
    const components = [routeTypeSelect(`${P}channel:type`, routeType), channelSelect(`${P}channel:route`, selected, routeType === 'default' ? 'Choose the default channel' : `Choose where ${ALERT_LABEL[routeType]} posts go`)];
    if (routeType !== 'default' && selected) components.push(row(btn(`${P}channel:default`, '🏠 Use Default Channel')));
    components.push(navigation('channels'));
    return { embeds: [embed(config, '📂 Channels', d, who(i))], components };
  }
  if (name === 'settings') return { embeds: [embed(config, '⚙️ Social Studio Settings', 'Manage access, monitoring, live message behaviour and diagnostics.', who(i))], components: [row(btn(`${P}permissions`, '🔐 Permissions', ButtonStyle.Primary), btn(`${P}monitoring`, '📡 Monitoring', ButtonStyle.Primary), btn(`${P}liveMessages`, '🔴 Live Messages', ButtonStyle.Primary), btn(`${P}diagnostics`, '🧪 Diagnostics', ButtonStyle.Primary)), navigation('settings')] };
  if (name === 'permissions') {
    const managerRoles = config.managerRoleIds.length ? config.managerRoleIds.map((id) => `<@&${id}>`).join(', ') : 'None';
    const userRoles = config.userRoleIds.length ? config.userRoleIds.map((id) => `<@&${id}>`).join(', ') : 'Everyone';
    const pingTarget = config.notificationMentionMode === 'everyone'
      ? '@everyone'
      : config.notificationMentionMode === 'here'
        ? '@here'
        : config.notificationMentionMode === 'role' && config.notificationRoleId
          ? `<@&${config.notificationRoleId}>`
          : 'No ping';
    const d = [
      '👥 **Manager roles**',
      `Current: ${managerRoles}`,
      '',
      '👤 **User access roles**',
      `Current: ${userRoles}`,
      '',
      '📢 **LIVE Notification Target**',
      `Current: ${pingTarget}`,
    ].join('\n');
    const components = [
      roleSelect(config.managerRoleIds, `${P}roles:select`, 'Select Social Studio manager roles'),
      roleSelect(config.userRoleIds, `${P}userroles:select`, 'Select roles allowed to use /user Social Studio'),
      notificationTargetSelect(i, config),
      navigation('permissions'),
    ];
    return { embeds: [embed(config, '🔐 Permissions', d, who(i))], components };
  }
  if (name === 'roles') return buildSectionPanel(i, 'permissions');
  if (name === 'automation') return buildSectionPanel(i, 'monitoring');
  if (name === 'testing' || name === 'data') return buildSectionPanel(i, 'diagnostics');
  if (name === 'operations') return { embeds: [embed(config, '⚙️ Operations', 'Choose the area you want to manage.', who(i))], components: [row(btn(`${P}monitoring`, '📡 Monitoring', ButtonStyle.Primary), btn(`${P}liveMessages`, '🔴 Live Messages', ButtonStyle.Primary), btn(`${P}diagnostics`, '🧪 Diagnostics', ButtonStyle.Primary)), navigation('operations')] };
  if (name === 'monitoring') {
    const settings = config.settings || {}, interval = Math.max(30000, Number(settings.checkIntervalMs || 300000)), mins = interval / 60000, quiet = settings.quietHours && typeof settings.quietHours === 'object' ? settings.quietHours : { enabled: false, start: '23:00', end: '08:00', timezone: 'Europe/London' };
    const monitored = accounts.filter((a) => a.enabled !== false).length;
    const lastCheck = [...config.history].reverse().find((entry) => entry?.status === 'checked' || entry?.providerStatus);
    const failures = accounts.filter((a) => a.state?.lastError || a.state?.lastDeliveryError).length + Number(config.queue?.length || 0);
    const d = [
      `${failures ? 'Warning' : 'Operational'} **System Health**`,
      failures ? `${failures} item(s) need attention` : 'Operational',
      '',
      `**Module Status**\n${config.enabled ? 'Enabled' : 'Disabled'}`,
      '',
      `**Check Interval**\n${interval < 60000 ? 'Every 30 seconds' : `Every ${mins} minute${mins === 1 ? '' : 's'}`}`,
      '',
      `**Duplicate Protection**\n${settings.suppressDuplicates === false ? 'Disabled' : 'Enabled'}`,
      '',
      `**Failed Delivery Retry**\n${settings.retryDeliveries === false ? 'Disabled' : 'Enabled'}`,
      '',
      `**Quiet Hours**\n${quiet.enabled === true ? `${quiet.start || '23:00'} - ${quiet.end || '08:00'} (${quiet.timezone || 'Europe/London'})` : 'Disabled'}`,
      '',
      `**Monitored Accounts**\n${monitored} / ${accounts.length}`,
      '',
      `**Last Provider Check**\n${ts(lastCheck?.createdAt || lastCheck?.checkedAt || lastCheck?.lastCheckedAt)}`,
    ].join('\n');
    return {
      embeds: [embed(config, 'Social Studio Monitoring', d, who(i))],
      components: [
        monitoringIntervalSelect(settings),
        monitoringBooleanSelect(`${P}automation:dupes`, 'Duplicate protection', settings.suppressDuplicates !== false),
        monitoringBooleanSelect(`${P}automation:retry`, 'Failed delivery retry', settings.retryDeliveries !== false),
        row(btn(`${P}automation:quiet`, 'Configure Quiet Hours'), btn(`${P}account:check`, 'Run Provider Check', ButtonStyle.Secondary, !accounts.length), btn(`${P}test`, 'Send Test LIVE Alert', ButtonStyle.Secondary, !config.alertsChannelId)),
        row(btn(`${P}settings`, '⬅️ Back'), btn(`${P}toggle`, config.enabled ? 'Disable Monitoring' : 'Enable Monitoring', config.enabled ? ButtonStyle.Danger : ButtonStyle.Success)),
      ],
    };
  }
  if (name === 'liveMessages') {
    const settings = config.settings || {};
    const d = ['**Live Message Behaviour**', `✏️ **Edit:** ${settings.editLiveNotifications !== false ? 'On' : 'Off'} - update the same LIVE post.`, `🗑️ **Cleanup:** ${settings.deleteEndedNotifications !== false ? 'On' : 'Off'} - remove ended LIVE posts.`, `👥 **Viewers:** ${settings.includeViewerCount === false ? 'Off' : 'On'} - show viewer count.`, `⏱️ **Duration:** ${settings.includeLiveDuration === false ? 'Off' : 'On'} - show time live.`].join('\n');
    return { embeds: [embed(config, '🔴 Live Messages', d, who(i))], components: [row(btn(`${P}automation:editlive`, settings.editLiveNotifications !== false ? '✏️ Edit: On' : '✏️ Edit: Off'), btn(`${P}automation:deleteended`, settings.deleteEndedNotifications !== false ? '🗑️ Cleanup: On' : '🗑️ Cleanup: Off'), btn(`${P}automation:viewers`, settings.includeViewerCount === false ? '👥 Viewers: Off' : '👥 Viewers: On'), btn(`${P}automation:duration`, settings.includeLiveDuration === false ? '⏱️ Duration: Off' : '⏱️ Duration: On')), row(btn(`${P}settings`, '⬅️ Back'), btn(`${P}main`, '🏠 Social Studio'))] };
  }
  if (name === 'diagnostics') {
    const checks = Number(config.analytics?.checks || 0), alerts = Number(config.analytics?.alertsSent || 0), failures = Number(config.analytics?.failures || 0), monitored = accounts.filter((a) => a.enabled !== false).length;
    const checkedEntries = config.history.filter((e) => e?.status === 'checked'), failedEntries = config.history.filter((e) => e?.status === 'delivery_failed' || e?.providerStatus === 'error' || e?.providerStatus === 'unavailable');
    const lastSuccess = [...checkedEntries].reverse().find((e) => e?.isLive === true || e?.isLive === false || e?.providerStatus === 'ok' || e?.providerStatus === 'live' || e?.providerStatus === 'offline'), lastFailure = failedEntries.at(-1);
    const recent = config.history.slice(-3).reverse().map((entry) => `- ${entry.status || 'event'}${entry.platform ? ` - ${LABEL[entry.platform] || entry.platform}` : ''}${entry.alertType ? ` - ${ALERT_LABEL[entry.alertType] || entry.alertType}` : ''}`).join('\n') || 'No history yet.';
    const d = ['**Testing & Data**', `Default channel: ${config.alertsChannelId ? `<#${config.alertsChannelId}>` : 'Not configured'}`, `Accounts: ${accounts.length} (${monitored} monitored)`, `Provider checks: ${checks.toLocaleString('en-GB')}`, `Alerts sent: ${alerts.toLocaleString('en-GB')}`, `Failures: ${failures.toLocaleString('en-GB')}`, `Queue size: ${config.queue.length}`, `History entries: ${config.history.length}`, `Last successful scan: ${ts(lastSuccess?.createdAt)}`, `Last failure: ${ts(lastFailure?.createdAt)}`, '', '**Tools**', '📨 **Send Test:** preview a test alert privately.', '📄 **Last Response:** view latest account check.', '🩺 **Provider Details:** show provider support.', '📤 **Export:** download history data.', '🧹 **Clear History:** remove saved history.', '', '**Recent Activity**', recent].join('\n');
    return { embeds: [embed(config, '🧪 Diagnostics', d, who(i))], components: [row(btn(`${P}test`, '📨 Send Test', ButtonStyle.Primary, !config.alertsChannelId), btn(`${P}testing:last`, '📄 Last Response'), btn(`${P}testing:diagnostics`, '🩺 Provider Details'), btn(`${P}data:refresh`, '🔄 Refresh')), row(btn(`${P}data:export`, '📤 Export', ButtonStyle.Primary), btn(`${P}data:clear`, '🧹 Clear History', ButtonStyle.Danger, !config.history.length)), row(btn(`${P}settings`, '⬅️ Back'), btn(`${P}main`, '🏠 Social Studio'))] };
  }
  return { embeds: [embed(config, name[0].toUpperCase() + name.slice(1), 'Social Studio settings.', who(i))], components: [navigation(name)] };
}

async function respond(i, payload) {
  if (i.deferred || i.replied) {
    await i.editReply(payload);
    return true;
  }
  try {
    await i.update(payload);
  } catch (error) {
    if (!/already been (sent|deferred)|already replied|Unknown interaction/i.test(String(error?.message || error))) throw error;
    await i.editReply(payload);
  }
  return true;
}
async function afterModal(i, section, message) { const payload = buildSectionPanel(i, section); if (i.isFromMessage?.() && !i.deferred && !i.replied) { await i.update(payload); await i.followUp({ content: message, flags: 64 }).catch(() => null); } else if (!i.deferred && !i.replied) await i.reply({ content: message, flags: 64 }); else await i.followUp({ content: message, flags: 64 }); return true; }
function opensModal(id) { return id === `${P}creator:new` || id === `${P}creator:change` || id === `${P}account:continue` || id === `${P}account:change` || id === `${P}automation:quiet` || (id.startsWith(`${P}template:`) && !id.startsWith(`${P}template:save:`)); }
async function handleInteraction(i) {
  const id = String(i?.customId || ''); if (id !== 'admin:social' && !id.startsWith(P)) return false; if (!i.guild?.id) throw new Error('Social Studio requires a guild interaction.'); if (i.isMessageComponent?.() && !opensModal(id) && !i.deferred && !i.replied) await i.deferUpdate();
  const config = getConfig(i.guildId), actorId = i.user?.id || null, interaction = i;
  if (id === 'admin:social' || id === `${P}main`) return respond(i, buildMainPanel(i.guild, who(i)));
  if (id === `${P}creator:new`) { await i.showModal(creatorModal()); return true; }
  if (id === `${P}creator:select`) { setCreatorSession(i, { creatorId: i.values?.[0] || null }); return respond(i, buildSectionPanel(i, 'creators')); }
  if (id === `${P}creator:page:prev` || id === `${P}creator:page:next`) { const v = getCreatorSession(i); setCreatorSession(i, { page: Math.max(0, v.page + (id.endsWith('next') ? 1 : -1)), creatorId: null }); return respond(i, buildSectionPanel(i, 'creators')); }
  if (id === `${P}creator:edit`) { const c = config.creators[getCreatorSession(i).creatorId]; if (!c) throw new Error('Select a creator profile first.'); return respond(i, buildCreatorEditPanel(i, config, c)); }
  if (id === `${P}creator:accounts`) { const cid = getCreatorSession(i).creatorId; if (!cid || !config.creators[cid]) throw new Error('Select a creator profile first.'); setAccountSession(i, { creatorId: cid, accountId: null, platforms: [], routeType: 'default' }); return respond(i, buildSectionPanel(i, 'accounts')); }
  if (id === `${P}creator:post`) { const cid = getCreatorSession(i).creatorId; if (!cid || !config.creators[cid]) throw new Error('Select a creator profile first.'); const result = await forcePostCreatorLive(i.client, i.guildId, cid, { actorId, guild: i.guild, bypassCooldown: true }); const sent = Array.isArray(result.sent) ? result.sent : []; const failed = Array.isArray(result.failed) ? result.failed : []; const channels = [...new Set(sent.map((item) => item.channelId).filter(Boolean))]; const channelText = channels.length === 1 ? ` in <#${channels[0]}>` : channels.length > 1 ? ` across ${channels.length} channels` : ''; const failedText = failed.length ? ` ${failed.length} failed.` : ''; await i.followUp({ content: `📣 Sent ${sent.length} LIVE post${sent.length === 1 ? '' : 's'}${channelText}.${failedText}`, flags: 64 }).catch(() => null); return respond(i, buildSectionPanel(i, 'creators')); }
  if (id === `${P}accounts`) { const cid = getCreatorSession(i).creatorId; if (cid && config.creators[cid]) setAccountSession(i, { creatorId: cid, accountId: null, platforms: [], routeType: 'default' }); return respond(i, buildSectionPanel(i, 'accounts')); }
  if (id === `${P}creator:change`) { const c = config.creators[getCreatorSession(i).creatorId]; if (!c) throw new Error('The selected creator profile no longer exists.'); await i.showModal(creatorModal(c)); return true; }
  if (id.startsWith(`${P}creator:check:`) || id === `${P}account:check` || id.startsWith(`${P}account:check:`)) return true;
  if (id === `${P}creator:toggle`) { const creator = config.creators[getCreatorSession(i).creatorId]; if (!creator) throw new Error('The selected creator profile no longer exists.'); creator.enabled = creator.enabled === false; creator.updatedAt = now(); saveConfig(i.guildId, config, i.guild, actorId); return respond(i, buildCreatorEditPanel(i, getConfig(i.guildId), creator)); }
  if (id === `${P}creator:delete`) { const c = config.creators[getCreatorSession(i).creatorId]; if (!c) throw new Error('The selected creator profile no longer exists.'); return respond(i, { embeds: [embed(config, '⚠️ Delete Creator Profile', `Delete **${c.displayName}**? Linked accounts remain stored but unassigned.`, who(i))], components: [row(btn(`${P}creator:delete:cancel`, '⬅️ Cancel'), btn(`${P}creator:delete:confirm`, '🗑️ Delete Profile', ButtonStyle.Danger))] }); }
  if (id === `${P}creator:delete:cancel`) return respond(i, buildSectionPanel(i, 'creators'));
  if (id === `${P}creator:delete:confirm`) { const cid = getCreatorSession(i).creatorId; if (!config.creators[cid]) throw new Error('The selected creator profile no longer exists.'); delete config.creators[cid]; saveConfig(i.guildId, config, i.guild, actorId); setCreatorSession(i, { creatorId: null }); return respond(i, buildSectionPanel(i, 'creators')); }
  if (id.startsWith(`${P}creator:update:`)) { const cid = id.slice(`${P}creator:update:`.length), c = config.creators[cid]; if (!c) throw new Error('The creator profile no longer exists.'); c.displayName = i.fields.getTextInputValue('displayName').trim(); c.group = i.fields.getTextInputValue('group').trim(); c.tags = i.fields.getTextInputValue('tags').split(',').map((v) => v.trim()).filter(Boolean); c.notes = i.fields.getTextInputValue('notes').trim(); c.updatedAt = now(); saveConfig(i.guildId, config, i.guild, actorId); setCreatorSession(i, { creatorId: cid }); return afterModal(i, 'creators', '✅ Creator profile updated.'); }
  if (id === `${P}account:creator`) { setAccountSession(i, { creatorId: i.values?.[0] || null, accountId: null, platforms: [], routeType: 'default' }); return respond(i, buildSectionPanel(i, 'accounts')); }
  if (id === `${P}account:select`) { setAccountSession(i, { accountId: i.values?.[0] || null, routeType: 'default' }); return respond(i, buildSectionPanel(i, 'accounts')); }
  if (id === `${P}account:platforms`) { setAccountSession(i, { platforms: (i.values || []).filter((p) => PLATFORMS.includes(p)).slice(0, 5) }); return respond(i, buildSectionPanel(i, 'accounts')); }
  if (id === `${P}account:reset`) { accountSessions.delete(sessionKey(i)); return respond(i, buildSectionPanel(i, 'accounts')); }
  if (id === `${P}account:continue`) { const s = getAccountSession(i); if (!s.creatorId || !config.creators[s.creatorId]) throw new Error('Select a creator profile first.'); if (!s.platforms.length) throw new Error('Select at least one platform first.'); await i.showModal(accountModal(s.platforms)); return true; }
  if (id === `${P}account:edit`) { const s = getAccountSession(i), c = config.creators[s.creatorId], a = config.accounts[s.accountId]; if (!c || !a) throw new Error('Select an account first.'); return respond(i, buildAccountEditPanel(i, config, c, a)); }
  if (id === `${P}account:change`) { const a = config.accounts[getAccountSession(i).accountId]; if (!a) throw new Error('The selected account no longer exists.'); await i.showModal(accountEditModal(a)); return true; }
  if (id === `${P}account:alerts`) { const s = getAccountSession(i), c = config.creators[s.creatorId], a = config.accounts[s.accountId]; if (!c || !a) throw new Error('Select an account first.'); a.alertTypes = (i.values || []).filter((t) => supportedAlerts(a.platform).includes(t)); a.updatedAt = now(); saveConfig(i.guildId, config, i.guild, actorId); return respond(i, buildAccountEditPanel(i, getConfig(i.guildId), c, getConfig(i.guildId).accounts[a.accountId])); }
  if (id === `${P}account:route:type`) { setAccountSession(i, { routeType: i.values?.[0] || 'default' }); const s = getAccountSession(i), c = config.creators[s.creatorId], a = config.accounts[s.accountId]; if (!c || !a) throw new Error('Select an account first.'); return respond(i, buildAccountEditPanel(i, config, c, a)); }
  if (id === `${P}account:route:channel`) { const s = getAccountSession(i), c = config.creators[s.creatorId], a = config.accounts[s.accountId]; if (!c || !a) throw new Error('Select an account first.'); const channelId = i.values?.[0] || null; if (s.routeType === 'default') a.alertChannelId = channelId; else { a.alertChannels = a.alertChannels && typeof a.alertChannels === 'object' ? a.alertChannels : {}; a.alertChannels[s.routeType] = channelId; } a.updatedAt = now(); saveConfig(i.guildId, config, i.guild, actorId); return respond(i, buildAccountEditPanel(i, getConfig(i.guildId), c, getConfig(i.guildId).accounts[a.accountId])); }
  if (id === `${P}account:toggle`) { const s = getAccountSession(i), c = config.creators[s.creatorId], account = config.accounts[s.accountId]; if (!c || !account) throw new Error('The selected account no longer exists.'); account.enabled = account.enabled === false; account.updatedAt = now(); saveConfig(i.guildId, config, i.guild, actorId); return respond(i, buildAccountEditPanel(i, getConfig(i.guildId), c, getConfig(i.guildId).accounts[account.accountId])); }
  if (id === `${P}account:delete`) { const a = config.accounts[getAccountSession(i).accountId]; if (!a) throw new Error('The selected account no longer exists.'); return respond(i, { embeds: [embed(config, '⚠️ Delete Social Account', `Delete **${LABEL[a.platform]} · ${a.username || a.externalId}**?`, who(i))], components: [row(btn(`${P}account:delete:cancel`, '⬅️ Cancel'), btn(`${P}account:delete:confirm`, '🗑️ Delete Account', ButtonStyle.Danger))] }); }
  if (id === `${P}account:delete:cancel`) { const s = getAccountSession(i), c = config.creators[s.creatorId], a = config.accounts[s.accountId]; return c && a ? respond(i, buildAccountEditPanel(i, config, c, a)) : respond(i, buildSectionPanel(i, 'accounts')); }
  if (id === `${P}account:delete:confirm`) { const s = getAccountSession(i), a = config.accounts[s.accountId]; if (!a) throw new Error('The selected account no longer exists.'); removeAccountReferences(config, [a.accountId]); delete config.accounts[a.accountId]; saveConfig(i.guildId, config, i.guild, actorId); setAccountSession(i, { accountId: null }); return respond(i, buildSectionPanel(i, 'accounts')); }
  if (id.startsWith(`${P}account:update:`)) { const aid = id.slice(`${P}account:update:`.length), old = config.accounts[aid], s = getAccountSession(i), c = config.creators[s.creatorId]; if (!old || !c) throw new Error('The selected account no longer exists.'); const raw = i.fields.getTextInputValue('accountValue').trim(); removeAccountReferences(config, [old.accountId]); delete config.accounts[old.accountId]; const r = upsertAccount(config, c, old.platform, raw), a = config.accounts[r.accountId]; a.enabled = old.enabled !== false; a.alertTypes = Array.isArray(old.alertTypes) ? old.alertTypes : supportedAlerts(old.platform); a.alertChannelId = old.alertChannelId || null; a.alertChannels = old.alertChannels && typeof old.alertChannels === 'object' ? old.alertChannels : {}; a.mentionMode = old.mentionMode || config.notificationMentionMode || 'none'; a.mentionRoleId = old.mentionRoleId || (config.notificationMentionMode === 'role' ? config.notificationRoleId || null : null); saveConfig(i.guildId, config, i.guild, actorId); setAccountSession(i, { accountId: r.accountId, platforms: [], routeType: 'default' }); return afterModal(i, 'accounts', `✅ ${LABEL[old.platform]} account updated.`); }
  if (id === `${P}creator:create`) { const name = i.fields.getTextInputValue('displayName').trim(); if (!name) throw new Error('Creator display name is required.'); const cid = makeId('creator'); config.creators[cid] = { creatorId: cid, displayName: name, group: i.fields.getTextInputValue('group').trim(), tags: i.fields.getTextInputValue('tags').split(',').map((v) => v.trim()).filter(Boolean), notes: i.fields.getTextInputValue('notes').trim(), enabled: true, accountIds: [], createdAt: now(), updatedAt: now() }; saveConfig(i.guildId, config, i.guild, actorId); setCreatorSession(i, { creatorId: cid }); return afterModal(i, 'creators', '✅ Creator profile created.'); }
  if (id === `${P}account:create-multi`) { const s = getAccountSession(i), c = config.creators[s.creatorId]; if (!c) throw new Error('The selected creator profile no longer exists.'); let created = 0, updated = 0, dupes = 0, selected = null; for (const p of s.platforms.slice(0, 5)) { const raw = i.fields.getTextInputValue(`account_${p}`).trim(); if (!raw) continue; const r = upsertAccount(config, c, p, raw); selected = r.accountId; r.created ? created++ : updated++; dupes += r.removedDuplicates; } saveConfig(i.guildId, config, i.guild, actorId); setAccountSession(i, { creatorId: c.creatorId, platforms: [], accountId: selected, routeType: 'default' }); return afterModal(i, 'accounts', `✅ ${created} added, ${updated} updated${dupes ? `, ${dupes} duplicates merged` : ''}.`); }
  if (id.startsWith(`${P}template:`) && !id.startsWith(`${P}template:save:`)) { const type = id.split(':')[2]; if (!ALERT_TYPES.includes(type)) throw new Error('Unknown notification template.'); await i.showModal(templateModal(type, config)); return true; }
  if (id.startsWith(`${P}template:save:`)) { const type = id.split(':')[3]; config.templates[type] = { title: i.fields.getTextInputValue('title'), description: i.fields.getTextInputValue('description'), buttonLabel: i.fields.getTextInputValue('buttonLabel'), color: i.fields.getTextInputValue('color'), footer: i.fields.getTextInputValue('footer') }; saveConfig(i.guildId, config, i.guild, actorId); return afterModal(i, 'templates', `✅ ${ALERT_LABEL[type] || type} template saved.`); }
  if (id === `${P}feed:type` || id === `${P}channel:type`) { setFeedSession(i, { routeType: i.values?.[0] || 'default' }); return respond(i, buildSectionPanel(i, 'channels')); }
  if (id === `${P}feed:route` || id === `${P}channel:route`) { const type = getFeedSession(i).routeType || 'default', channelId = i.values?.[0] || null; if (type === 'default') config.alertsChannelId = channelId; else { config.alertChannels = config.alertChannels && typeof config.alertChannels === 'object' ? config.alertChannels : {}; config.alertChannels[type] = channelId; } saveConfig(i.guildId, config, i.guild, actorId); return respond(i, buildSectionPanel(i, 'channels')); }
  if (id === `${P}channel:default`) { const type = getFeedSession(i).routeType || 'default'; if (type !== 'default') { config.alertChannels = config.alertChannels && typeof config.alertChannels === 'object' ? config.alertChannels : {}; delete config.alertChannels[type]; saveConfig(i.guildId, config, i.guild, actorId); } return respond(i, buildSectionPanel(i, 'channels')); }
  if (id === `${P}feed:channel` || id === `${P}channel:alerts`) { config.alertsChannelId = i.values?.[0] || null; saveConfig(i.guildId, config, i.guild, actorId); return respond(i, buildSectionPanel(i, 'channels')); }
  if (id === `${P}roles:select`) { config.managerRoleIds = i.values || []; saveConfig(i.guildId, config, i.guild, actorId); return respond(i, buildSectionPanel(i, 'permissions')); }
  if (id === `${P}userroles:select`) { config.userRoleIds = i.values || []; saveConfig(i.guildId, config, i.guild, actorId); return respond(i, buildSectionPanel(i, 'permissions')); }
  if (id === `${P}notification:mode`) { const value = i.values?.[0] || 'none'; const roleId = value.startsWith('role:') ? value.slice(5) : null; config.notificationMentionMode = roleId ? 'role' : ['none', 'everyone', 'here'].includes(value) ? value : 'none'; config.notificationRoleId = roleId || null; applyNotificationDefaults(config); saveConfig(i.guildId, config, i.guild, actorId); return respond(i, buildSectionPanel(i, 'permissions')); }
  if (id === `${P}notification:role`) { config.notificationRoleId = i.values?.[0] || null; config.notificationMentionMode = config.notificationRoleId ? 'role' : 'none'; applyNotificationDefaults(config); saveConfig(i.guildId, config, i.guild, actorId); return respond(i, buildSectionPanel(i, 'permissions')); }
  if (id === `${P}toggle`) { guildManager.setModuleEnabled(interaction.guildId, 'social', !config.enabled, { actorId }); return respond(i, buildSectionPanel(i, 'monitoring')); }
  if (id === `${P}automation:quiet` && i.fields?.getTextInputValue) { const enabledRaw = i.fields.getTextInputValue('enabled').trim().toLowerCase(); const start = i.fields.getTextInputValue('start').trim(); const end = i.fields.getTextInputValue('end').trim(); const timezone = i.fields.getTextInputValue('timezone').trim() || 'Europe/London'; if (!['yes', 'no'].includes(enabledRaw)) throw new Error('Quiet hours enabled must be yes or no.'); if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) throw new Error('Quiet hours must use HH:MM time format.'); config.settings = { ...(config.settings || {}), quietHours: { enabled: enabledRaw === 'yes', start, end, timezone } }; saveConfig(i.guildId, config, i.guild, actorId); return afterModal(i, 'monitoring', 'Quiet hours updated.'); }
  if (id === `${P}automation:interval`) { const value = Number(i.values?.[0] || 300000); const allowed = MONITORING_INTERVALS.some((option) => Number(option.value) === value); config.settings = { ...(config.settings || {}), checkIntervalMs: allowed ? value : 300000 }; saveConfig(i.guildId, config, i.guild, actorId); return respond(i, buildSectionPanel(i, 'monitoring')); }
  if (id === `${P}automation:dupes`) { config.settings = { ...(config.settings || {}), suppressDuplicates: i.values?.[0] !== 'false' }; saveConfig(i.guildId, config, i.guild, actorId); return respond(i, buildSectionPanel(i, 'monitoring')); }
  if (id === `${P}automation:retry`) { config.settings = { ...(config.settings || {}), retryDeliveries: i.values?.[0] !== 'false' }; saveConfig(i.guildId, config, i.guild, actorId); return respond(i, buildSectionPanel(i, 'monitoring')); }
  if (id === `${P}automation:quiet`) { await i.showModal(quietHoursModal(config)); return true; }
  if (id === `${P}automation:editlive` || id === `${P}automation:deleteended` || id === `${P}automation:viewers` || id === `${P}automation:duration`) { const key = id.endsWith('editlive') ? 'editLiveNotifications' : id.endsWith('deleteended') ? 'deleteEndedNotifications' : id.endsWith('viewers') ? 'includeViewerCount' : 'includeLiveDuration'; const current = config.settings?.[key] !== false; config.settings = { ...(config.settings || {}), [key]: !current }; saveConfig(i.guildId, config, i.guild, actorId); return respond(i, buildSectionPanel(i, 'liveMessages')); }
  if (id === `${P}testing:last`) { const as = getAccountSession(i), a = config.accounts[as.accountId] || Object.values(config.accounts).sort((x, y) => new Date(y.state?.lastCheckedAt || 0) - new Date(x.state?.lastCheckedAt || 0))[0]; const s = a?.state || {}; const d = a ? [`**Account:** ${LABEL[a.platform] || a.platform} — ${a.username || a.externalId}`, `**Status:** ${accountState(a)}`, `**Last Checked:** ${ts(s.lastCheckedAt)}`, `**Provider Source:** ${s.providerSource || 'Not recorded'}`, `**Confidence:** ${s.confidence || 'Not recorded'}`, `**External ID:** ${a.externalId || 'Not resolved'}`, `**Last Error:** ${s.lastError || 'None'}`].join('\n') : 'No provider response has been recorded yet.'; return respond(i, { embeds: [embed(config, '📄 Last Provider Response', d, who(i), a ? platformColor(a.platform) : null)], components: [row(btn(`${P}diagnostics`, '⬅️ Diagnostics'), btn(`${P}settings`, '⚙️ Settings'))] }); }
  if (id === `${P}testing:diagnostics`) { const providerLines = PLATFORMS.map((p) => { const info = providerInfo(p); return `${ICON[p]} **${LABEL[p]}:** ${info.status || 'unknown'}${info.supportedAlertTypes?.length ? ` • ${info.supportedAlertTypes.join(', ')}` : ''}`; }); const errors = Object.values(config.accounts).filter((a) => a.state?.lastError).length; return respond(i, { embeds: [embed(config, '🩺 Social Studio Diagnostics', [`**Module:** ${config.enabled ? 'Enabled' : 'Disabled'}`, `**Default channel:** ${config.alertsChannelId ? `<#${config.alertsChannelId}>` : 'Missing'}`, `**Accounts with provider errors:** ${errors}`, '', '**Providers**', ...providerLines].join('\n'), who(i))], components: [row(btn(`${P}diagnostics`, '⬅️ Diagnostics'), btn(`${P}settings`, '⚙️ Settings'))] }); }
  if (id === `${P}testing:none`) return respond(i, buildSectionPanel(i, 'diagnostics'));
  if (id === `${P}data:refresh`) return respond(i, buildSectionPanel(i, 'diagnostics'));
  if (id === `${P}data:clear`) return respond(i, { embeds: [embed(config, '⚠️ Clear Social Studio History', `This will remove **${config.history.length}** stored history entries. Account configuration and monitoring state will not be deleted.`, who(i))], components: [row(btn(`${P}data:clear:cancel`, '⬅️ Cancel'), btn(`${P}data:clear:confirm`, '🧹 Clear History', ButtonStyle.Danger))] });
  if (id === `${P}data:clear:cancel`) return respond(i, buildSectionPanel(i, 'diagnostics'));
  if (id === `${P}data:clear:confirm`) { config.history = []; saveConfig(i.guildId, config, i.guild, actorId); return respond(i, buildSectionPanel(i, 'diagnostics')); }
  if (id === `${P}data:export`) { const payload = JSON.stringify({ exportedAt: now(), guildId: i.guildId, analytics: config.analytics, history: config.history }, null, 2); await i.followUp({ content: `📤 Social Studio history export • ${config.history.length} entries`, files: [new AttachmentBuilder(Buffer.from(payload, 'utf8'), { name: `social-studio-history-${i.guildId}.json` })], flags: 64 }); return respond(i, buildSectionPanel(i, 'diagnostics')); }
  if (id === `${P}creator:rebuild`) { const linked = new Set(Object.values(config.creators).flatMap((c) => c.accountIds || [])); for (const a of Object.values(config.accounts)) if (!linked.has(a.accountId)) { const cid = makeId('creator'); config.creators[cid] = { creatorId: cid, displayName: a.displayName || a.username || a.externalId, group: '', tags: [a.platform], notes: '', enabled: true, accountIds: [a.accountId], createdAt: now(), updatedAt: now() }; } saveConfig(i.guildId, config, i.guild, actorId); return respond(i, buildSectionPanel(i, 'creators')); }
  if (id === `${P}test`) { if (!config.alertsChannelId) throw new Error('Choose an alert channel first.'); await i.followUp({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🧪 Social Studio Test').setDescription(`✅ Notification routing is working.\n\nThis private preview was opened from ${i.channelId ? `<#${i.channelId}>` : 'this setup channel'}.\n\nThumbnails, platform metadata and template variables will be applied to real provider events.`).setFooter({ text: 'Social Studio • Test' }).setTimestamp()], flags: 64 }).catch(() => null); return respond(i, buildSectionPanel(i, 'diagnostics')); }
  const section = id.slice(P.length); if (NAV.has(section)) return respond(i, buildSectionPanel(i, section)); throw new Error(`Unknown Social Studio interaction: ${id}`);
}
module.exports = { buildPanel: buildMainPanel, handleInteraction, buildSocialAdminPanel: buildMainPanel, buildSectionPanel, handleSocialAdminInteraction: handleInteraction, canManageSocialStudio };
