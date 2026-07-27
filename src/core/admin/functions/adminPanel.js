const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');

const guildManager = require('../../guild/guildManager');
const panelNav = require('../../ui/panelNavigation');
const restoreRequestManager = require('../../security/restoreRequestManager');
const {
  createServerBackup,
  listServerBackups,
  readServerBackup,
  validateServerBackup,
} = require('../../security/serverBackup');

const PANEL_COLOR = '#5865F2';
const ENABLED_COLOR = '#57F287';
const DISABLED_COLOR = '#ED4245';
const OWNER_IDS = (process.env.OWNER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);

const LOG_TYPES = {
  automodlog: { key: 'automod', customId: 'admin:setautomodlog', selectId: 'admin:selectautomodlog', title: '🤖 Set AutoMod Log Channel', label: '🤖 AutoMod Log' },
  adminlog: { key: 'admin', customId: 'admin:setadminlog', selectId: 'admin:selectadminlog', title: '👑 Set Admin Log Channel', label: '👑 Admin Log' },
  modlog: { key: 'moderation', customId: 'admin:setmodlog', selectId: 'admin:selectmodlog', title: '📌 Set Mod Log Channel', label: '📌 Mod Log' },
  logs: { key: 'general', customId: 'admin:setlogs', selectId: 'admin:selectlogs', title: '📋 Set General Logs Channel', label: '📋 General Logs' },
  memberlog: { key: 'member', customId: 'admin:setmemberlog', selectId: 'admin:selectmemberlog', title: '👥 Set Member Log Channel', label: '👥 Member Log' },
};
const LOG_SELECT_TO_TYPE = Object.fromEntries(Object.entries(LOG_TYPES).map(([type, value]) => [value.selectId, type]));
const LOG_BUTTON_TO_TYPE = Object.fromEntries(Object.entries(LOG_TYPES).map(([type, value]) => [value.customId, type]));

const AUTOMOD_RULES = {
  antiSpam: { label: '🚫 Spam', title: '🚫 Spam Protection', editLabel: '⏱️ Limits', defaults: { enabled: false, maxMessages: 5, intervalSeconds: 10, actions: ['delete'] } },
  antiLinks: { label: '🔗 Links', title: '🔗 Link Protection', editLabel: '🌐 Domains', defaults: { enabled: false, allowStaff: true, allowedDomains: [], actions: ['delete'] } },
  badWords: { label: '🤬 Bad Words', title: '🤬 Bad Word Filter', editLabel: '📝 Word List', defaults: { enabled: false, words: [], actions: ['delete'] } },
  caps: { label: '🔠 Caps', title: '🔠 Caps Protection', editLabel: '📏 Thresholds', defaults: { enabled: false, percent: 70, minLength: 12, actions: ['warn'] } },
  mentions: { label: '📣 Mentions', title: '📣 Mention Protection', editLabel: '📣 Limit', defaults: { enabled: false, maxMentions: 5, actions: ['warn'] } },
};
const AUTOMOD_RULE_KEYS = Object.keys(AUTOMOD_RULES);
const AUTOMOD_ACTIONS = ['dm', 'delete', 'warn', 'timeout', 'kick', 'ban'];
const ACTION_LABELS = { dm: 'DM User', delete: 'Delete Message', warn: 'Warn User', timeout: 'Timeout User', kick: 'Kick User', ban: 'Ban User' };

const MODULES = [
  ['admin:embed', '🎨 Embed', '🎨 Embed Studio', 'Create and send custom embeds'],
  ['admin:autoRoles', '🎭 Join Roles', '🎭 Join Roles', 'Auto roles when members join'],
  ['admin:stats', '📊 Stats', '📊 Stats', 'Server stats counters'],
  ['admin:sticky', '📌 Sticky Notes', '📌 Sticky Notes', 'Persistent channel notes'],
  ['admin:suggestions', '💡 Suggestions', '💡 Suggestions', 'Suggestion system'],
  ['admin:tickets', '🎟️ Tickets', '🎟️ Tickets', 'Support ticket system'],
  ['admin:giveaways', '🎉 Giveaways', '🎉 Giveaways', 'Giveaway tools'],
  ['admin:fun', '🎮 Fun', '🎮 Fun', 'Fun commands and extras'],
  ['admin:polls', '📊 Polls', '📊 Polls', 'Poll system'],
];
const COMING_SOON = {
  'admin:stats': ['📊 Stats', 'Server stats counters are coming soon.'],
  'admin:sticky': ['📌 Sticky Notes', 'Sticky notes module is coming soon.'],
  'admin:suggestions': ['💡 Suggestions', 'Suggestion system is coming soon.'],
  'admin:giveaways': ['🎉 Giveaways', 'Giveaway tools are coming soon.'],
  'admin:fun': ['🎮 Fun', 'Fun commands and extras are coming soon.'],
  'admin:polls': ['📊 Polls', 'Poll system is coming soon.'],
};

function row(...components) { return new ActionRowBuilder().addComponents(...components); }
function button(customId, label, style = ButtonStyle.Primary, disabled = false) { return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled); }
function createEmbed(title, description, memberDisplayName, color = PANEL_COLOR) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();
  if (description) embed.setDescription(description);
  if (memberDisplayName) embed.setFooter({ text: `Requested by ${memberDisplayName}` });
  return embed;
}
function chunkArray(items, size) { const output = []; for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size)); return output; }
function buttonRows(items, size = 3) { return chunkArray(items, size).map((group) => row(...group.map(([id, label, style, disabled]) => button(id, label, style, disabled)))); }
function getMemberDisplayName(interaction) { return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User'; }
function getGuildSection(guildId, section, defaults) { return guildManager.getGuildSection(guildId, section, defaults); }
function replaceGuildSection(guildId, section, data) { return guildManager.replaceGuildSection(guildId, section, data); }
function getRoleConfig(guildId, section) { return getGuildSection(guildId, section, { roleIds: [] }); }
function getAutoRolesConfig(guildId) { return getGuildSection(guildId, 'autoRoles', { enabled: false, roleIds: [] }); }
function formatRoleList(ids = []) { const clean = [...new Set((ids || []).filter(Boolean))]; return clean.length ? clean.map((id) => `<@&${id}>`).join(', ') : 'None'; }
function normalizeBackupId(backup) { return typeof backup === 'string' ? backup : backup?.backupId; }
function isBotOwner(interaction) { return OWNER_IDS.includes(String(interaction.user.id)); }
function isGuildOwner(interaction) { return interaction.guild?.ownerId === interaction.user.id; }
function canUseAdminPanel(interaction) { return isBotOwner(interaction) || isGuildOwner(interaction) || interaction.member?.permissions?.has(PermissionFlagsBits.Administrator); }
function normalizeActions(value, fallback = ['delete']) {
  const source = Array.isArray(value) ? value : value ? [value] : fallback;
  const clean = [...new Set(source.map((item) => String(item).toLowerCase()).filter((item) => AUTOMOD_ACTIONS.includes(item)))];
  if (clean.includes('ban')) return clean.filter((item) => item !== 'kick');
  return clean.length ? clean : [...fallback];
}
function getDefaultAutomodConfig() {
  return {
    enabled: false,
    dmUser: true,
    antiSpam: { ...AUTOMOD_RULES.antiSpam.defaults },
    antiLinks: { ...AUTOMOD_RULES.antiLinks.defaults },
    badWords: { ...AUTOMOD_RULES.badWords.defaults },
    caps: { ...AUTOMOD_RULES.caps.defaults },
    mentions: { ...AUTOMOD_RULES.mentions.defaults },
    ignoredRoles: [],
    ignoredChannels: [],
  };
}
function getAutomodConfig(guildId) {
  const current = getGuildSection(guildId, 'automod', {});
  const defaults = getDefaultAutomodConfig();
  const output = { ...defaults, ...current };
  for (const key of AUTOMOD_RULE_KEYS) {
    const existing = current[key] || {};
    output[key] = {
      ...defaults[key],
      ...existing,
      actions: normalizeActions(existing.actions || existing.action, defaults[key].actions),
    };
    delete output[key].action;
  }
  output.ignoredRoles = Array.isArray(current.ignoredRoles) ? current.ignoredRoles : [];
  output.ignoredChannels = Array.isArray(current.ignoredChannels) ? current.ignoredChannels : [];
  return output;
}
function saveAutomodConfig(guildId, config) { return replaceGuildSection(guildId, 'automod', config); }
function getLogChannelId(guildId, type) { if (typeof guildManager.getLogChannelId === 'function') return guildManager.getLogChannelId(guildId, type); return getGuildSection(guildId, 'logs', { channels: {} })?.channels?.[type] || null; }
function setLogChannelId(guildId, type = 'general', channelId = null) { if (typeof guildManager.setLogChannelId === 'function') return guildManager.setLogChannelId(guildId, type, channelId); const logs = getGuildSection(guildId, 'logs', { enabled: true, channels: {}, events: {} }); return replaceGuildSection(guildId, 'logs', { ...logs, channels: { ...(logs.channels || {}), [type]: channelId } }); }
function formatLogsSummary(guildId) { return `${['automod', 'admin', 'moderation', 'general', 'member'].filter((key) => getLogChannelId(guildId, key)).length}/5 configured`; }
function status(value) { return value ? 'Enabled ✅' : 'Disabled ❌'; }
function formatActions(actions) { return normalizeActions(actions).map((item) => ACTION_LABELS[item]).join(', '); }
function getRouteLabel(route) {
  const labels = { 'admin:home': 'Admin Hub', 'admin:automod': 'AutoMod', 'admin:automod:configure': 'Configure', 'admin:embed': 'Embed Studio', 'admin:modules': 'Modules', 'admin:logs': 'Logs', 'admin:backups': 'Backups', 'admin:adminpanel': 'Admin Panel', 'admin:modpanel': 'Mod Panel', 'admin:staffroles': 'Staff Roles', 'admin:modroles': 'Mod Roles', 'admin:autoRoles': 'Join Roles' };
  if (route?.startsWith('admin:automod:rule:')) return AUTOMOD_RULES[route.split(':').pop()]?.title || 'AutoMod Rule';
  return labels[route] || String(route || 'admin:home').replace('admin:', '').replaceAll(':', ' › ');
}
function getBreadcrumbFromState(navState) { return (Array.isArray(navState?.history) ? navState.history : ['admin:home']).filter(Boolean).slice(-4).map(getRouteLabel).join(' › '); }
function applyNavigationUI(interaction, panel, navState = panelNav.createState('admin:home')) { if (!interaction || !panel?.embeds?.[0]) return panel; const embed = EmbedBuilder.from(panel.embeds[0]).setFooter({ text: `Navigation: ${getBreadcrumbFromState(navState)}` }); return { ...panel, embeds: [embed] }; }
async function openExternalAdminPanel(interaction, panel, navState = panelNav.createState('admin:home')) { await interaction.update(applyNavigationUI(interaction, panel, navState)); return true; }
function backButton(navState = panelNav.createState('admin:home')) { return button(panelNav.buildCustomId(navState, 'back'), '⬅️ Back', ButtonStyle.Secondary); }
function nextButton(customId) { return button(customId, 'Next ➡️', ButtonStyle.Secondary); }
function navRow(navState, nextId) { return row(backButton(navState), nextButton(nextId)); }

function buildAdminPanel(guild, memberDisplayName = 'Unknown User') {
  return { embeds: [createEmbed('🛠️ Admin Hub', 'Control your server systems from one place.', memberDisplayName).addFields(
    { name: '🤖 AutoMod', value: 'Auto Protection', inline: true }, { name: '🔏 Admin', value: 'Admin tools', inline: true }, { name: '🔐 Mod Panel', value: 'Moderation tools', inline: true },
    { name: '🧩 Modules', value: 'Embeds, tickets, fun, etc.', inline: true }, { name: '📋 Logs', value: formatLogsSummary(guild.id), inline: true }, { name: '🧱 Backups', value: 'Disaster recovery', inline: true }, { name: '🧹 Purge', value: 'Bulk delete messages', inline: true }
  )], components: buttonRows([
    ['admin:automod', '⚙️ AutoMod', ButtonStyle.Primary], ['admin:adminpanel', '🔏 Admin', ButtonStyle.Primary], ['admin:modpanel', '🔐 Mod Panel', ButtonStyle.Primary],
    ['admin:modules', '🧩 Modules', ButtonStyle.Primary], ['admin:logs', '📋 Logs', ButtonStyle.Primary], ['admin:backups', '🧱 Backups', ButtonStyle.Secondary], ['admin:purge', '🧹 Purge', ButtonStyle.Danger],
  ]) };
}
function buildAutomodPanel(guild, memberDisplayName = 'Unknown User', navState = panelNav.createState('admin:home')) {
  const config = getAutomodConfig(guild.id);
  const enabledCount = AUTOMOD_RULE_KEYS.filter((key) => config[key]?.enabled).length;
  const description = [`**System:** ${status(config.enabled)}`, `**Protection rules:** ${enabledCount}/${AUTOMOD_RULE_KEYS.length} enabled`, '', ...AUTOMOD_RULE_KEYS.map((key) => `**${AUTOMOD_RULES[key].label}:** ${status(config[key]?.enabled)}`), '', 'Select a protection rule, or open system configuration.'].join('\n');
  const ruleButtons = AUTOMOD_RULE_KEYS.map((key) => [`admin:automod:rule:${key}`, AUTOMOD_RULES[key].label, config[key]?.enabled ? ButtonStyle.Success : ButtonStyle.Secondary]);
  return { embeds: [createEmbed('🤖 AutoMod Protection', description, memberDisplayName, config.enabled ? ENABLED_COLOR : DISABLED_COLOR)], components: [
    row(...ruleButtons.slice(0, 3).map(([id, label, style]) => button(id, label, style))),
    row(...ruleButtons.slice(3).map(([id, label, style]) => button(id, label, style)), button('admin:automod:configure', '⚙️ Configure', ButtonStyle.Primary)),
    navRow(navState, 'admin:automod:configure'),
  ] };
}
function buildAutomodConfigurePanel(guild, memberDisplayName, navState) {
  const config = getAutomodConfig(guild.id); const logChannelId = getLogChannelId(guild.id, 'automod');
  const healthy = AUTOMOD_RULE_KEYS.every((key) => config[key] && typeof config[key].enabled === 'boolean' && Array.isArray(config[key].actions));
  return { embeds: [createEmbed('⚙️ AutoMod Configuration', [`**AutoMod:** ${status(config.enabled)}`, `**DM users:** ${status(config.dmUser !== false)}`, `**Log channel:** ${logChannelId ? `<#${logChannelId}>` : 'Not set'}`, `**Health:** ${healthy ? 'Healthy ✅' : 'Needs repair ⚠️'}`, '', 'Manage global AutoMod controls and maintenance tools.'].join('\n'), memberDisplayName, config.enabled ? ENABLED_COLOR : DISABLED_COLOR)], components: [
    row(button('admin:automod:toggle', config.enabled ? 'Disable AutoMod' : 'Enable AutoMod', config.enabled ? ButtonStyle.Danger : ButtonStyle.Success), button('admin:automod:dm', config.dmUser !== false ? 'Disable DMs' : 'Enable DMs', config.dmUser !== false ? ButtonStyle.Danger : ButtonStyle.Success), button('admin:setautomodlog', 'Set Log Channel', ButtonStyle.Primary)),
    row(button('admin:automod:health', '🩺 Health', ButtonStyle.Secondary), button('admin:automod:repair', '🛠️ Repair', ButtonStyle.Primary), button('admin:automod:reset', '♻️ Reset', ButtonStyle.Danger)),
    navRow(navState, 'admin:automod:rule:antiSpam'),
  ] };
}
function ruleSummary(key, rule) {
  if (key === 'antiSpam') return `**Maximum messages:** ${rule.maxMessages}\n**Window:** ${rule.intervalSeconds} seconds\n**Actions:** ${formatActions(rule.actions)}`;
  if (key === 'antiLinks') return `**Staff bypass:** ${rule.allowStaff ? 'Yes' : 'No'}\n**Allowed domains:** ${rule.allowedDomains?.length || 0}\n**Actions:** ${formatActions(rule.actions)}`;
  if (key === 'badWords') return `**Blocked words:** ${rule.words?.length || 0}\n**Actions:** ${formatActions(rule.actions)}`;
  if (key === 'caps') return `**Caps threshold:** ${rule.percent}%\n**Minimum length:** ${rule.minLength}\n**Actions:** ${formatActions(rule.actions)}`;
  return `**Maximum mentions:** ${rule.maxMentions}\n**Actions:** ${formatActions(rule.actions)}`;
}
function nextRuleId(key) { const index = AUTOMOD_RULE_KEYS.indexOf(key); return index === AUTOMOD_RULE_KEYS.length - 1 ? 'admin:automod' : `admin:automod:rule:${AUTOMOD_RULE_KEYS[index + 1]}`; }
function buildActionSelect(key, rule) {
  return new StringSelectMenuBuilder()
    .setCustomId(`admin:automod:rule:${key}:actions`)
    .setPlaceholder('Select one or more actions')
    .setMinValues(1)
    .setMaxValues(AUTOMOD_ACTIONS.length)
    .addOptions(AUTOMOD_ACTIONS.map((value) => ({ label: ACTION_LABELS[value], value, default: normalizeActions(rule.actions).includes(value) })));
}
function buildAutomodRulePanel(guild, key, memberDisplayName, navState) {
  const config = getAutomodConfig(guild.id); const meta = AUTOMOD_RULES[key]; const rule = config[key];
  return { embeds: [createEmbed(meta.title, [`**Status:** ${status(rule.enabled)}`, '', ruleSummary(key, rule), '', 'Choose the exact settings and select every action that should run when this rule triggers.'].join('\n'), memberDisplayName, rule.enabled ? ENABLED_COLOR : DISABLED_COLOR)], components: [
    row(button(`admin:automod:rule:${key}:toggle`, rule.enabled ? 'Disable' : 'Enable', rule.enabled ? ButtonStyle.Danger : ButtonStyle.Success), button(`admin:automod:rule:${key}:edit`, meta.editLabel, ButtonStyle.Primary)),
    row(buildActionSelect(key, rule)),
    navRow(navState, nextRuleId(key)),
  ] };
}
function buildRuleModal(key, rule) {
  const modal = new ModalBuilder().setCustomId(`admin:automod:rule:${key}:modal`).setTitle(`${AUTOMOD_RULES[key].title} Settings`);
  const add = (id, label, value, placeholder = '') => modal.addComponents(row(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(value ?? '')).setPlaceholder(placeholder)));
  if (key === 'antiSpam') { add('maxMessages', 'Maximum messages', rule.maxMessages); add('intervalSeconds', 'Time window in seconds', rule.intervalSeconds); }
  if (key === 'antiLinks') { add('allowStaff', 'Allow staff? true or false', rule.allowStaff); add('allowedDomains', 'Allowed domains, comma separated', (rule.allowedDomains || []).join(', '), 'example.com, discord.com'); }
  if (key === 'badWords') add('words', 'Blocked words, comma separated', (rule.words || []).join(', '), 'word1, word2');
  if (key === 'caps') { add('percent', 'Capital letter percentage', rule.percent); add('minLength', 'Minimum message length', rule.minLength); }
  if (key === 'mentions') add('maxMentions', 'Maximum mentions', rule.maxMentions);
  return modal;
}
function parsePositive(value, fallback, min = 1, max = 1000) { const parsed = Number.parseInt(String(value), 10); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }
function parseList(value) { return [...new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean))].slice(0, 100); }

function buildAdminToolsPanel(guild, memberDisplayName = 'Unknown User', navState = panelNav.createState('admin:home')) { const staff = getRoleConfig(guild.id, 'staffRoles'); const mods = getRoleConfig(guild.id, 'modRoles'); return { embeds: [createEmbed('👑 Admin Panel', `**Staff Roles**\n${formatRoleList(staff.roleIds)}\n\n**Mod Roles**\n${formatRoleList(mods.roleIds)}`, memberDisplayName)], components: [...buttonRows([['admin:setadminlog', '🔏 Set Admin Log', ButtonStyle.Primary], ['admin:staffroles', '👥 Staff Roles', ButtonStyle.Primary], ['admin:modroles', '🔐 Mod Roles', ButtonStyle.Primary], ['admin:adminsettings', '⚙️ Settings', ButtonStyle.Primary]]), row(backButton(navState))] }; }
function buildModulesPanel(guild, memberDisplayName = 'Unknown User', navState = panelNav.createState('admin:home')) { return { embeds: [createEmbed('🧩 Modules', MODULES.map(([, , title, description]) => `**${title}**\n${description}`).join('\n\n'), memberDisplayName)], components: [...buttonRows(MODULES.map(([id, label]) => [id, label, ButtonStyle.Primary])), row(backButton(navState))] }; }
function buildLogsPanel(guild, memberDisplayName = 'Unknown User', navState = panelNav.createState('admin:home')) { return { embeds: [createEmbed('📋 Log Channels', Object.values(LOG_TYPES).map((item) => `**${item.label}:** ${getLogChannelId(guild.id, item.key) ? `<#${getLogChannelId(guild.id, item.key)}>` : 'Not set'}`).join('\n'), memberDisplayName)], components: [...buttonRows(Object.values(LOG_TYPES).map((item) => [item.customId, item.label, ButtonStyle.Primary])), row(backButton(navState))] }; }
function buildBackupsPanel(guild, memberDisplayName = 'Unknown User', navState = panelNav.createState('admin:home')) { const backups = listServerBackups(guild.id); const latest = normalizeBackupId(backups[0]); return { embeds: [createEmbed('🧱 Server Backups', `**Backups found:** ${backups.length}\n**Latest:** \`${latest || 'None'}\``, memberDisplayName)], components: [...buttonRows([['admin:backup:create', '⚡ Create Backup', ButtonStyle.Success], ['admin:backup:list', '📦 View Backups', ButtonStyle.Primary], ['admin:backup:preview', '🔍 Preview Latest', ButtonStyle.Secondary], ['admin:backup:download', '💾 Download Backup', ButtonStyle.Secondary], ['admin:backup:requestrestore', '🚨 Request Restore', ButtonStyle.Danger]], 2), row(backButton(navState))] }; }
function buildRolePanel(guild, section, title, selectId, clearId, memberDisplayName, navState) { const config = getRoleConfig(guild.id, section); return { embeds: [createEmbed(title, `**Selected roles:**\n${formatRoleList(config.roleIds)}`, memberDisplayName)], components: [row(new RoleSelectMenuBuilder().setCustomId(selectId).setPlaceholder('Select roles').setMinValues(0).setMaxValues(10)), row(button(clearId, 'Clear Roles', ButtonStyle.Danger), backButton(navState))] }; }
function buildStaffRolesPanel(guild, memberDisplayName = 'Unknown User', navState = panelNav.createState('admin:home')) { return buildRolePanel(guild, 'staffRoles', '👥 Staff Roles', 'admin:staffroles:select', 'admin:staffroles:clear', memberDisplayName, navState); }
function buildModRolesPanel(guild, memberDisplayName = 'Unknown User', navState = panelNav.createState('admin:home')) { return buildRolePanel(guild, 'modRoles', '🔐 Mod Roles', 'admin:modroles:select', 'admin:modroles:clear', memberDisplayName, navState); }
function buildAutoRolesPanel(guild, memberDisplayName = 'Unknown User', navState = panelNav.createState('admin:home')) { const config = getAutoRolesConfig(guild.id); return { embeds: [createEmbed('🎭 Join Roles', `**Status:** ${status(config.enabled)}\n**Roles:** ${formatRoleList(config.roleIds)}\n\n⚠️ The bot role must be above selected roles.`, memberDisplayName)], components: [row(new RoleSelectMenuBuilder().setCustomId('admin:autoRoles:select').setPlaceholder('Select join roles').setMinValues(0).setMaxValues(10)), row(button('admin:autoRoles:toggle', config.enabled ? 'Disable' : 'Enable', config.enabled ? ButtonStyle.Danger : ButtonStyle.Success), backButton(navState))] }; }
function buildChannelPanel(type = 'logs', navState = panelNav.createState('admin:home')) { const selected = LOG_TYPES[type] || LOG_TYPES.logs; return { embeds: [createEmbed(selected.title, 'Select the text channel where these logs should be sent.')], components: [row(new ChannelSelectMenuBuilder().setCustomId(selected.selectId).setPlaceholder('Choose a text channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)), row(backButton(navState))] }; }
function buildComingSoonPanel(title, description, navState = panelNav.createState('admin:home')) { return { embeds: [createEmbed(title, description)], components: [row(backButton(navState))] }; }
function buildPurgeModal() { return new ModalBuilder().setCustomId('admin:purgeModal').setTitle('Purge Messages').addComponents(row(new TextInputBuilder().setCustomId('amount').setLabel('Amount (1-100)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('25').setMaxLength(3))); }

async function updatePanel(interaction, panel, navState = panelNav.createState('admin:home')) { const finalPanel = applyNavigationUI(interaction, panel, navState); if (interaction.deferred || interaction.replied) await interaction.editReply(finalPanel); else await interaction.update(finalPanel); return true; }
function nextState(navState, route) { return panelNav.push(navState || panelNav.createState('admin:home'), route); }
function panelForRoute(route, interaction, memberDisplayName, state) {
  if (route === 'admin:home') return buildAdminPanel(interaction.guild, memberDisplayName);
  if (route === 'admin:automod') return buildAutomodPanel(interaction.guild, memberDisplayName, state);
  if (route === 'admin:automod:configure') return buildAutomodConfigurePanel(interaction.guild, memberDisplayName, state);
  if (route?.startsWith('admin:automod:rule:')) return buildAutomodRulePanel(interaction.guild, route.split(':').pop(), memberDisplayName, state);
  if (route === 'admin:adminpanel') return buildAdminToolsPanel(interaction.guild, memberDisplayName, state);
  if (route === 'admin:modules') return buildModulesPanel(interaction.guild, memberDisplayName, state);
  if (route === 'admin:logs') return buildLogsPanel(interaction.guild, memberDisplayName, state);
  if (route === 'admin:backups') return buildBackupsPanel(interaction.guild, memberDisplayName, state);
  if (route === 'admin:staffroles') return buildStaffRolesPanel(interaction.guild, memberDisplayName, state);
  if (route === 'admin:modroles') return buildModRolesPanel(interaction.guild, memberDisplayName, state);
  if (route === 'admin:autoRoles') return buildAutoRolesPanel(interaction.guild, memberDisplayName, state);
  if (route === 'admin:modpanel') return buildComingSoonPanel('🔐 Mod Panel', 'Moderation tools will live here.', state);
  if (route === 'admin:adminsettings') return buildComingSoonPanel('⚙️ Admin Settings', 'Admin settings will live here.', state);
  if (COMING_SOON[route]) return buildComingSoonPanel(...COMING_SOON[route], state);
  return buildAdminPanel(interaction.guild, memberDisplayName);
}
async function openRoute(interaction, route, memberDisplayName, navState) { const state = route === 'admin:home' ? panelNav.createState('admin:home') : nextState(navState, route); return updatePanel(interaction, panelForRoute(route, interaction, memberDisplayName, state), state); }
async function replyNoAccess(interaction, content) { if (interaction.deferred || interaction.replied) await interaction.editReply({ content }); else await interaction.reply({ content, flags: 64 }); return true; }
async function handleAutomodModal(interaction) {
  const match = interaction.customId.match(/^admin:automod:rule:([^:]+):modal$/); if (!match) return false;
  const key = match[1]; if (!AUTOMOD_RULES[key]) return false;
  const config = getAutomodConfig(interaction.guild.id); const rule = { ...config[key] };
  if (key === 'antiSpam') { rule.maxMessages = parsePositive(interaction.fields.getTextInputValue('maxMessages'), rule.maxMessages, 2, 100); rule.intervalSeconds = parsePositive(interaction.fields.getTextInputValue('intervalSeconds'), rule.intervalSeconds, 1, 3600); }
  if (key === 'antiLinks') { rule.allowStaff = interaction.fields.getTextInputValue('allowStaff').trim().toLowerCase() !== 'false'; rule.allowedDomains = parseList(interaction.fields.getTextInputValue('allowedDomains')); }
  if (key === 'badWords') rule.words = parseList(interaction.fields.getTextInputValue('words'));
  if (key === 'caps') { rule.percent = parsePositive(interaction.fields.getTextInputValue('percent'), rule.percent, 1, 100); rule.minLength = parsePositive(interaction.fields.getTextInputValue('minLength'), rule.minLength, 1, 500); }
  if (key === 'mentions') rule.maxMentions = parsePositive(interaction.fields.getTextInputValue('maxMentions'), rule.maxMentions, 1, 100);
  saveAutomodConfig(interaction.guild.id, { ...config, [key]: rule });
  await interaction.reply({ content: `✅ ${AUTOMOD_RULES[key].title} settings saved.`, flags: 64 });
  return true;
}
async function handleAdminNavigation(interaction, navState = panelNav.createState('admin:home')) {
  if (!interaction.guild) return false;
  const parsedNav = panelNav.parseCustomId(interaction.customId);
  if (!String(interaction.customId || '').startsWith('admin:') && !parsedNav) return false;
  if (!canUseAdminPanel(interaction)) return replyNoAccess(interaction, '❌ Only the Goliath Owner, Guild Owner, or Administrators can use the Admin Panel.');
  const memberDisplayName = getMemberDisplayName(interaction);
  if (interaction.isModalSubmit()) return handleAutomodModal(interaction);
  if (parsedNav?.action === 'back') { const state = panelNav.back(parsedNav.state); const route = panelNav.current(state); return updatePanel(interaction, panelForRoute(route, interaction, memberDisplayName, state), state); }
  if (interaction.isRoleSelectMenu()) {
    const map = { 'admin:staffroles:select': 'staffRoles', 'admin:modroles:select': 'modRoles', 'admin:autoRoles:select': 'autoRoles' }; const section = map[interaction.customId]; if (!section) return false;
    const current = section === 'autoRoles' ? getAutoRolesConfig(interaction.guild.id) : getRoleConfig(interaction.guild.id, section); replaceGuildSection(interaction.guild.id, section, { ...current, roleIds: [...new Set(interaction.values || [])] });
    const panel = section === 'staffRoles' ? buildStaffRolesPanel(interaction.guild, memberDisplayName, navState) : section === 'modRoles' ? buildModRolesPanel(interaction.guild, memberDisplayName, navState) : buildAutoRolesPanel(interaction.guild, memberDisplayName, navState); return updatePanel(interaction, panel, navState);
  }
  if (interaction.isStringSelectMenu()) {
    const match = interaction.customId.match(/^admin:automod:rule:([^:]+):actions$/); if (!match || !AUTOMOD_RULES[match[1]]) return false;
    const key = match[1]; const config = getAutomodConfig(interaction.guild.id); const rule = { ...config[key], actions: normalizeActions(interaction.values, config[key].actions) };
    saveAutomodConfig(interaction.guild.id, { ...config, [key]: rule });
    return updatePanel(interaction, buildAutomodRulePanel(interaction.guild, key, memberDisplayName, navState), navState);
  }
  if (interaction.isChannelSelectMenu()) { const type = LOG_SELECT_TO_TYPE[interaction.customId]; if (!type) return false; setLogChannelId(interaction.guild.id, LOG_TYPES[type].key, interaction.values?.[0] || null); const panel = type === 'automodlog' ? buildAutomodConfigurePanel(interaction.guild, memberDisplayName, navState) : buildLogsPanel(interaction.guild, memberDisplayName, navState); return updatePanel(interaction, panel, navState); }
  if (!interaction.isButton()) return false;
  const { customId } = interaction;
  if (customId === 'admin:purge') { await interaction.showModal(buildPurgeModal()); return true; }
  if (customId === 'admin:automod:toggle' || customId === 'admin:automod:dm') { const config = getAutomodConfig(interaction.guild.id); saveAutomodConfig(interaction.guild.id, { ...config, ...(customId.endsWith(':toggle') ? { enabled: !config.enabled } : { dmUser: config.dmUser === false }) }); return updatePanel(interaction, buildAutomodConfigurePanel(interaction.guild, memberDisplayName, navState), navState); }
  if (customId === 'admin:automod:health') { const config = getAutomodConfig(interaction.guild.id); const missing = AUTOMOD_RULE_KEYS.filter((key) => !config[key] || typeof config[key].enabled !== 'boolean' || !Array.isArray(config[key].actions)); await interaction.reply({ content: missing.length ? `⚠️ Missing or invalid rules: ${missing.join(', ')}` : '✅ AutoMod configuration is healthy.', flags: 64 }); return true; }
  if (customId === 'admin:automod:repair') { const config = getAutomodConfig(interaction.guild.id); saveAutomodConfig(interaction.guild.id, config); return updatePanel(interaction, buildAutomodConfigurePanel(interaction.guild, memberDisplayName, navState), navState); }
  if (customId === 'admin:automod:reset') { saveAutomodConfig(interaction.guild.id, getDefaultAutomodConfig()); return updatePanel(interaction, buildAutomodConfigurePanel(interaction.guild, memberDisplayName, navState), navState); }
  const ruleMatch = customId.match(/^admin:automod:rule:([^:]+)(?::(toggle|edit))?$/);
  if (ruleMatch && AUTOMOD_RULES[ruleMatch[1]]) { const key = ruleMatch[1]; const action = ruleMatch[2]; if (!action) return openRoute(interaction, `admin:automod:rule:${key}`, memberDisplayName, navState); const config = getAutomodConfig(interaction.guild.id); const rule = { ...config[key] }; if (action === 'edit') { await interaction.showModal(buildRuleModal(key, rule)); return true; } rule.enabled = !rule.enabled; saveAutomodConfig(interaction.guild.id, { ...config, [key]: rule }); return updatePanel(interaction, buildAutomodRulePanel(interaction.guild, key, memberDisplayName, navState), navState); }
  if (LOG_BUTTON_TO_TYPE[customId]) { const state = nextState(navState, `admin:channel:${LOG_BUTTON_TO_TYPE[customId]}`); return updatePanel(interaction, buildChannelPanel(LOG_BUTTON_TO_TYPE[customId], state), state); }
  if (customId === 'admin:embed') { const { buildEmbedPanel } = require('../../../modules/messageStudio/embed/embedPanel'); return updatePanel(interaction, buildEmbedPanel(interaction, memberDisplayName), nextState(navState, 'admin:embed')); }
  if (customId === 'admin:tickets') { const { sendSetupPanel } = require('../../../modules/feedbackStudio/tickets/ticketsPanel'); return sendSetupPanel(interaction); }
  if (customId === 'admin:autoRoles:toggle') { const current = getAutoRolesConfig(interaction.guild.id); replaceGuildSection(interaction.guild.id, 'autoRoles', { ...current, enabled: !current.enabled, roleIds: current.roleIds || [] }); return updatePanel(interaction, buildAutoRolesPanel(interaction.guild, memberDisplayName, navState), navState); }
  if (customId === 'admin:staffroles:clear' || customId === 'admin:modroles:clear') { const section = customId.includes('staffroles') ? 'staffRoles' : 'modRoles'; replaceGuildSection(interaction.guild.id, section, { roleIds: [] }); return updatePanel(interaction, section === 'staffRoles' ? buildStaffRolesPanel(interaction.guild, memberDisplayName, navState) : buildModRolesPanel(interaction.guild, memberDisplayName, navState), navState); }
  if (customId === 'admin:backup:create') { if (!isBotOwner(interaction) && !isGuildOwner(interaction)) return replyNoAccess(interaction, '❌ Only the Goliath Owner or Guild Owner can create backups.'); await interaction.deferUpdate(); await createServerBackup(interaction.guild, { createdBy: interaction.user.id, reason: 'Manual backup from admin panel' }); await interaction.editReply(applyNavigationUI(interaction, buildBackupsPanel(interaction.guild, memberDisplayName, navState), navState)); return true; }
  if (customId === 'admin:backup:list') { const backups = listServerBackups(interaction.guild.id).map(normalizeBackupId).filter(Boolean); await interaction.reply({ content: backups.length ? `📦 **Backups:**\n${backups.slice(0, 10).map((id) => `\`${id}\``).join('\n')}` : '📦 No backups found.', flags: 64 }); return true; }
  if (customId === 'admin:backup:preview') { const latest = normalizeBackupId(listServerBackups(interaction.guild.id)[0]); const backup = latest ? readServerBackup(interaction.guild.id, latest) : null; const validation = backup ? validateServerBackup(backup, { guildId: interaction.guild.id }) : null; await interaction.reply({ content: backup ? `🔍 **Latest Backup**\nID: \`${latest}\`\nValid: ${validation?.valid ? 'YES ✅' : 'NO ❌'}` : '🔍 No backups found.', flags: 64 }); return true; }
  if (customId === 'admin:backup:download') { const latest = normalizeBackupId(listServerBackups(interaction.guild.id)[0]); const backup = latest ? readServerBackup(interaction.guild.id, latest) : null; if (!backup) return replyNoAccess(interaction, '❌ No backups found.'); await interaction.reply({ content: `💾 Backup: ${latest}`, files: [{ attachment: Buffer.from(JSON.stringify(backup, null, 2)), name: `${latest}.json` }], flags: 64 }); return true; }
  if (customId === 'admin:backup:requestrestore') return restoreRequestManager.createRestoreRequest(interaction, { cooldownMs: 1000 * 60 * 30 });
  if (customId === 'admin:backup:restore' || customId === 'admin:backup:restore:real') return replyNoAccess(interaction, '❌ Direct restores are disabled. Use the centralized restore approval system.');
  const routes = ['admin:home', 'admin:automod', 'admin:automod:configure', 'admin:adminpanel', 'admin:modules', 'admin:logs', 'admin:backups', 'admin:modpanel', 'admin:staffroles', 'admin:modroles', 'admin:autoRoles', 'admin:adminsettings'];
  if (routes.includes(customId) || COMING_SOON[customId]) return openRoute(interaction, customId, memberDisplayName, navState);
  return false;
}

function getCurrentRoute() { return 'admin:home'; }
function setCurrentRoute() { return true; }
function pushHistory() { return true; }
function popHistory() { return 'admin:home'; }
function getBreadcrumb() { return 'Admin Hub'; }

module.exports = {
  LOG_TYPES,
  buildAdminPanel,
  buildAutomodPanel,
  buildAutomodConfigurePanel,
  buildAutomodRulePanel,
  buildAdminToolsPanel,
  buildBackupsPanel,
  buildStaffRolesPanel,
  buildModRolesPanel,
  buildModulesPanel,
  buildLogsPanel,
  buildAutoRolesPanel,
  buildChannelPanel,
  buildComingSoonPanel,
  buildPurgeModal,
  getLogChannelId,
  setLogChannelId,
  handleAdminNavigation,
  updatePanel,
  openExternalAdminPanel,
  applyNavigationUI,
  getCurrentRoute,
  setCurrentRoute,
  pushHistory,
  popHistory,
  getBreadcrumb,
};