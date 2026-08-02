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
  return Boolean(security.isBotOwner?.(i.user?.id) || i.guild?.ownerId === i.user?.id || i.member?.permissions?.has?.(PermissionFlagsBits.Administrator) || hasAnyRole(i.member, config.managerRoleIds));
}
async function denySocialAccess(i) {
  const payload = { content: 'You do not have permission to manage Social Studio.', flags: 64 };
  if (i.deferred || i.replied) await i.followUp(payload).catch(() => null); else await i.reply(payload);
  return true;
}
function getConfig(guildId) {
  const guild = guildManager.reloadGuild(guildId);
  const s = guild?.modules?.social && typeof guild.modules.social === 'object' ? guild.modules.social : {};
  return { ...s, enabled: guildManager.isModuleEnabled(guildId, 'social'), alertsChannelId: s.alertsChannelId || null, alertChannels: s.alertChannels && typeof s.alertChannels === 'object' ? s.alertChannels : {}, managerRoleIds: Array.isArray(s.managerRoleIds) ? s.managerRoleIds : [], userRoleIds: Array.isArray(s.userRoleIds) ? s.userRoleIds : [], accounts: s.accounts && typeof s.accounts === 'object' ? s.accounts : {}, creators: s.creators && typeof s.creators === 'object' ? s.creators : {}, templates: s.templates && typeof s.templates === 'object' ? s.templates : {}, settings: s.settings && typeof s.settings === 'object' ? s.settings : {}, history: Array.isArray(s.history) ? s.history : [], queue: Array.isArray(s.queue) ? s.queue : [], analytics: s.analytics && typeof s.analytics === 'object' ? s.analytics : {} };
}
function saveConfig(guildId, config, guild, actorId = null) {
  const { enabled: _enabled, ...storedConfig } = config;
  const next = { ...storedConfig, updatedAt: now(), lastActorId: actorId };
  guildManager.replaceGuildSection(guildId, 'social', next, guild);
  const saved = guildManager.reloadGuild(guildId)?.modules?.social;
  if (!saved || typeof saved !== 'object') throw new Error('Social Studio could not verify its saved guild data.');
  return { ...saved, enabled: guildManager.isModuleEnabled(guildId, 'social') };
}
function getAccountSession(i) { return accountSessions.get(sessionKey(i)) || { creatorId: null, platforms: [], accountId: null, routeType: 'default' }; }
function setAccountSession(i, patch) { const next = { ...getAccountSession(i), ...patch }; accountSessions.set(sessionKey(i), next); return next; }
function getCreatorSession(i) { return creatorSessions.get(sessionKey(i)) || { creatorId: null, page: 0 }; }
function setCreatorSession(i, patch) { const next = { ...getCreatorSession(i), ...patch }; creatorSessions.set(sessionKey(i), next); return next; }
function getFeedSession(i) { return feedSessions.get(sessionKey(i)) || { routeType: 'default' }; }
function setFeedSession(i, patch) { const next = { ...getFeedSession(i), ...patch }; feedSessions.set(sessionKey(i), next); return next; }
function embed(config, title, description, requestedBy, color = null) { return new EmbedBuilder().setColor(color || (config.enabled ? 0x5865F2 : 0x747F8D)).setTitle(title).setDescription(description).setFooter({ text: `Requested by ${requestedBy}` }).setTimestamp(); }
function navigation(active = 'main') {
  let backId = 'admin:studio:socialStudio';
  let secondaryId = `${P}settings`;
  let secondaryLabel = '⚙️ Settings';
  let secondaryDisabled = active === 'settings';
  if (active === 'settings') backId = `${P}main`; else if (SETTINGS_CHILDREN.has(active)) { backId = `${P}settings`; secondaryId = `${P}main`; secondaryLabel = '🏠 Social Studio'; secondaryDisabled = false; } else if (active !== 'main') backId = `${P}main`;
  return row(btn(backId, '⬅️ Back'), btn(secondaryId, secondaryLabel, ButtonStyle.Secondary, secondaryDisabled));
}
function creatorSelect(creators, selected, id = `${P}creator:select`, placeholder = 'Select a creator') {
  return row(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).setMinValues(1).setMaxValues(1).addOptions(creators.slice(0, 25).map((c) => ({ label: String(c.displayName || 'Unnamed creator').slice(0, 100), value: c.creatorId, description: `${(c.accountIds || []).length} linked account(s)`.slice(0, 100), default: c.creatorId === selected }))));
}
function creatorModal(c = null) {
  return new ModalBuilder().setCustomId(c ? `${P}creator:update:${c.creatorId}` : `${P}creator:create`).setTitle(c ? 'Edit Creator Profile' : 'Create Creator Profile').addComponents(
    row(new TextInputBuilder().setCustomId('displayName').setLabel('Creator display name').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(true).setValue(String(c?.displayName || ''))),
    row(new TextInputBuilder().setCustomId('group').setLabel('Group or team').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(false).setValue(String(c?.group || ''))),
    row(new TextInputBuilder().setCustomId('tags').setLabel('Tags (comma separated)').setStyle(TextInputStyle.Short).setMaxLength(300).setRequired(false).setValue(Array.isArray(c?.tags) ? c.tags.join(', ') : '')),
    row(new TextInputBuilder().setCustomId('notes').setLabel('Notes').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(false).setValue(String(c?.notes || ''))),
  );
}
function dashboardStats(config) {
  const accounts = Object.values(config.accounts);
  return { live: accounts.filter((a) => a.enabled !== false && a.state?.isLive === true).length, offline: accounts.filter((a) => a.enabled !== false && a.state?.isLive === false).length, unavailable: accounts.filter((a) => a.enabled !== false && a.state?.lastError).length, monitored: accounts.filter((a) => a.enabled !== false).length };
}
function buildMainPanel(guild, requestedBy = 'Unknown User') {
  const c = getConfig(guild.id), creators = Object.keys(c.creators).length, accounts = Object.keys(c.accounts).length, ready = creators && accounts && c.alertsChannelId, stats = dashboardStats(c);
  const d = [`${ready ? '✅' : '⚠️'} **${ready ? 'Social Studio is ready.' : 'Setup required'}**`, '', `**Creators:** ${creators}  •  **Accounts:** ${accounts}`, `🔴 **LIVE:** ${stats.live}  •  ⚫ **Offline:** ${stats.offline}  •  🟡 **Issues:** ${stats.unavailable}`, `📡 **Monitoring:** ${stats.monitored}/${accounts}`, `📂 **Default Channel:** ${c.alertsChannelId ? `<#${c.alertsChannelId}>` : 'Not configured'}`, `🔔 **Notifications:** ${c.enabled ? '🟢 Enabled' : '🔴 Disabled'}`].join('\n');
  return { embeds: [embed(c, '📣 Social Studio', d, requestedBy)], components: [row(btn(`${P}creators`, '👥 Creator Profiles', ButtonStyle.Primary), btn(`${P}channels`, '📂 Channels')), row(btn(`${P}templates`, '🎨 Templates')), navigation('main')] };
}
function buildCreatorPanel(i, config, creators) {
  const view = getCreatorSession(i), pages = Math.max(1, Math.ceil(creators.length / PAGE_SIZE));
  if (view.page >= pages) setCreatorSession(i, { page: pages - 1 });
  const current = getCreatorSession(i), selected = config.creators[current.creatorId] || null;
  const linked = selected ? (selected.accountIds || []).map((id) => config.accounts[id]).filter(Boolean) : [];
  const d = selected ? [`👤 **${selected.displayName}**`, '', ...(linked.length ? linked.map((a) => `**${LABEL[a.platform] || a.platform}** — ${a.username || a.externalId || 'Unknown'}`) : ['No linked social accounts.']), '', `**Status:** ${selected.enabled === false ? '⏸️ Paused' : '🟢 Monitoring'}`, `**Accounts:** ${linked.length}`].join('\n') : `Select a creator profile below.\n\n**Profiles:** ${creators.length}`;
  const components = [], page = getCreatorSession(i).page, items = creators.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (items.length) components.push(creatorSelect(items, current.creatorId, `${P}creator:select`, `Select a creator - Page ${page + 1}/${pages}`));
  components.push(row(btn(`${P}creator:new`, '➕ New Profile', ButtonStyle.Success), btn(`${P}creator:accounts`, '🔗 Accounts', ButtonStyle.Primary, !selected), btn(`${P}creator:post`, '📣 Post LIVE', ButtonStyle.Primary, !selected)));
  components.push(row(btn(`${P}creator:edit`, '✏️ Manage Profile', ButtonStyle.Primary, !selected)));
  components.push(navigation('creators'));
  return { embeds: [embed(config, '👥 Creator Profiles', d, who(i))], components };
}
function buildSectionPanel(i, name) {
  const config = getConfig(i.guildId), creators = Object.values(config.creators).sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')));
  if (name === 'creators') return buildCreatorPanel(i, config, creators);
  if (name === 'channels') return { embeds: [embed(config, '📂 Channels', `Default channel: ${config.alertsChannelId ? `<#${config.alertsChannelId}>` : 'Not configured'}`, who(i))], components: [navigation('channels')] };
  if (name === 'templates') return { embeds: [embed(config, '🎨 Alert Templates', 'Manage Social Studio alert templates.', who(i))], components: [navigation('templates')] };
  if (name === 'settings') return {
    embeds: [embed(config, '⚙️ Social Studio Settings', 'Manage access, monitoring, live message behaviour and diagnostics.', who(i))],
    components: [
      row(
        btn(`${P}permissions`, '🔐 Permissions', ButtonStyle.Primary),
        btn(`${P}monitoring`, '📡 Monitoring', ButtonStyle.Primary),
        btn(`${P}liveMessages`, '🔴 Live Messages', ButtonStyle.Primary),
        btn(`${P}diagnostics`, '🧪 Diagnostics', ButtonStyle.Primary),
      ),
      navigation('settings'),
    ],
  };
  if (name === 'permissions') {
    const managerRoles = config.managerRoleIds.length ? config.managerRoleIds.map((id) => `<@&${id}>`).join(', ') : 'None';
    const userRoles = config.userRoleIds.length ? config.userRoleIds.map((id) => `<@&${id}>`).join(', ') : 'Everyone';
    return {
      embeds: [embed(config, '🔐 Permissions', [`**Manager Roles:** ${managerRoles}`, `**User Access Roles:** ${userRoles}`, '', 'Manager roles can administer Social Studio. User access roles can use the Social Studio section from `/user`.'].join('\n'), who(i))],
      components: [navigation('permissions')],
    };
  }
  if (name === 'monitoring') {
    const interval = Math.max(60000, Number(config.settings?.checkIntervalMs || 300000));
    const minutes = Math.round(interval / 60000);
    return {
      embeds: [embed(config, '📡 Monitoring', [`**Module:** ${config.enabled ? 'Enabled' : 'Disabled'}`, `**Check Interval:** ${minutes} minute${minutes === 1 ? '' : 's'}`, `**Accounts:** ${Object.keys(config.accounts).length}`].join('\n'), who(i))],
      components: [navigation('monitoring')],
    };
  }
  if (name === 'liveMessages') {
    const settings = config.settings || {};
    return {
      embeds: [embed(config, '🔴 Live Messages', [`**Edit LIVE posts:** ${settings.editLiveNotifications !== false ? 'On' : 'Off'}`, `**Delete ended posts:** ${settings.deleteEndedNotifications !== false ? 'On' : 'Off'}`, `**Viewer count:** ${settings.includeViewerCount === false ? 'Off' : 'On'}`, `**Live duration:** ${settings.includeLiveDuration === false ? 'Off' : 'On'}`].join('\n'), who(i))],
      components: [navigation('liveMessages')],
    };
  }
  if (name === 'diagnostics') {
    return {
      embeds: [embed(config, '🧪 Diagnostics', [`**Provider Checks:** ${Number(config.analytics?.checks || 0).toLocaleString('en-GB')}`, `**Alerts Sent:** ${Number(config.analytics?.alertsSent || 0).toLocaleString('en-GB')}`, `**Failures:** ${Number(config.analytics?.failures || 0).toLocaleString('en-GB')}`, `**History Entries:** ${config.history.length}`, `**Queue Size:** ${config.queue.length}`].join('\n'), who(i))],
      components: [navigation('diagnostics')],
    };
  }
  return buildMainPanel(i.guild, who(i));
}
async function respond(i, payload) { if (i.deferred || i.replied) await i.editReply(payload); else await i.update(payload); return true; }
async function handleInteraction(i) {
  const id = String(i?.customId || '');
  if (id !== 'admin:social' && !id.startsWith(P)) return false;
  if (!i.guild?.id) throw new Error('Social Studio requires a guild interaction.');
  if (i.isMessageComponent?.() && id !== `${P}creator:new` && !i.deferred && !i.replied) await i.deferUpdate();
  const config = getConfig(i.guildId);
  if (id === 'admin:social' || id === `${P}main`) return respond(i, buildMainPanel(i.guild, who(i)));
  if (id === `${P}creators`) return respond(i, buildSectionPanel(i, 'creators'));
  if (id === `${P}channels`) return respond(i, buildSectionPanel(i, 'channels'));
  if (id === `${P}templates`) return respond(i, buildSectionPanel(i, 'templates'));
  if (id === `${P}settings`) return respond(i, buildSectionPanel(i, 'settings'));
  if (id === `${P}creator:new`) { await i.showModal(creatorModal()); return true; }
  if (id === `${P}creator:select`) { setCreatorSession(i, { creatorId: i.values?.[0] || null }); return respond(i, buildSectionPanel(i, 'creators')); }
  if (id === `${P}creator:create`) {
    const name = i.fields.getTextInputValue('displayName').trim();
    if (!name) throw new Error('Creator display name is required.');
    const cid = makeId('creator');
    config.creators[cid] = { creatorId: cid, displayName: name, group: i.fields.getTextInputValue('group').trim(), tags: i.fields.getTextInputValue('tags').split(',').map((v) => v.trim()).filter(Boolean), notes: i.fields.getTextInputValue('notes').trim(), enabled: true, accountIds: [], createdAt: now(), updatedAt: now() };
    saveConfig(i.guildId, config, i.guild, i.user?.id || null);
    setCreatorSession(i, { creatorId: cid });
    await i.reply({ content: '✅ Creator profile created.', flags: 64 });
    return true;
  }
  const section = id.slice(P.length);
  if (NAV.has(section)) return respond(i, buildSectionPanel(i, section));
  throw new Error(`Unknown Social Studio interaction: ${id}`);
}
module.exports = { buildPanel: buildMainPanel, handleInteraction, buildSocialAdminPanel: buildMainPanel, buildSectionPanel, handleSocialAdminInteraction: handleInteraction, canManageSocialStudio };
