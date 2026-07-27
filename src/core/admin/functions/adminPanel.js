const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
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
const OWNER_IDS = (process.env.OWNER_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const LOG_TYPES = {
  automodlog: { key: 'automod', customId: 'admin:setautomodlog', selectId: 'admin:selectautomodlog', title: '🤖 Set AutoMod Log Channel', label: '🤖 AutoMod Log' },
  adminlog: { key: 'admin', customId: 'admin:setadminlog', selectId: 'admin:selectadminlog', title: '👑 Set Admin Log Channel', label: '👑 Admin Log' },
  modlog: { key: 'moderation', customId: 'admin:setmodlog', selectId: 'admin:selectmodlog', title: '📌 Set Mod Log Channel', label: '📌 Mod Log' },
  logs: { key: 'general', customId: 'admin:setlogs', selectId: 'admin:selectlogs', title: '📋 Set General Logs Channel', label: '📋 General Logs' },
  memberlog: { key: 'member', customId: 'admin:setmemberlog', selectId: 'admin:selectmemberlog', title: '👥 Set Member Log Channel', label: '👥 Member Log' },
};

const LOG_SELECT_TO_TYPE = Object.fromEntries(Object.entries(LOG_TYPES).map(([type, value]) => [value.selectId, type]));
const LOG_BUTTON_TO_TYPE = Object.fromEntries(Object.entries(LOG_TYPES).map(([type, value]) => [value.customId, type]));

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
function button(customId, label, style = ButtonStyle.Primary) { return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style); }
function createEmbed(title, description, memberDisplayName) {
  const embed = new EmbedBuilder().setColor(PANEL_COLOR).setTitle(title).setTimestamp();
  if (description) embed.setDescription(description);
  if (memberDisplayName) embed.setFooter({ text: `Requested by ${memberDisplayName}` });
  return embed;
}
function chunkArray(items, size) { const output = []; for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size)); return output; }
function buttonRows(items, size = 3) { return chunkArray(items, size).map((group) => row(...group.map(([id, label, style]) => button(id, label, style)))); }
function getMemberDisplayName(interaction) { return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User'; }
function getGuildSection(guildId, section, defaults) { return guildManager.getGuildSection(guildId, section, defaults); }
function replaceGuildSection(guildId, section, data) { return guildManager.replaceGuildSection(guildId, section, data); }
function getRoleConfig(guildId, section) { return getGuildSection(guildId, section, { roleIds: [] }); }
function getAutoRolesConfig(guildId) { return getGuildSection(guildId, 'autoRoles', { enabled: false, roleIds: [] }); }
function getAutomodConfig(guildId) { return getGuildSection(guildId, 'automod', { enabled: false, dmUser: true }); }
function formatRoleList(ids = []) { const clean = [...new Set(ids.filter(Boolean))]; return clean.length ? clean.map((id) => `<@&${id}>`).join(', ') : 'None'; }
function normalizeBackupId(backup) { return typeof backup === 'string' ? backup : backup?.backupId; }
function isBotOwner(interaction) { return OWNER_IDS.includes(String(interaction.user.id)); }
function isGuildOwner(interaction) { return interaction.guild?.ownerId === interaction.user.id; }
function canUseAdminPanel(interaction) { return isBotOwner(interaction) || isGuildOwner(interaction) || interaction.member?.permissions?.has(PermissionFlagsBits.Administrator); }

function getLogChannelId(guildId, type) {
  if (typeof guildManager.getLogChannelId === 'function') return guildManager.getLogChannelId(guildId, type);
  return getGuildSection(guildId, 'logs', { channels: {} })?.channels?.[type] || null;
}
function setLogChannelId(guildId, type = 'general', channelId = null) {
  if (typeof guildManager.setLogChannelId === 'function') return guildManager.setLogChannelId(guildId, type, channelId);
  const logs = getGuildSection(guildId, 'logs', { enabled: true, channels: {}, events: {} });
  return replaceGuildSection(guildId, 'logs', { ...logs, channels: { ...(logs.channels || {}), [type]: channelId } });
}
function formatLogsSummary(guildId) { return `${['automod', 'admin', 'moderation', 'general', 'member'].filter((key) => getLogChannelId(guildId, key)).length}/5 configured`; }

function getRouteLabel(route) {
  const labels = { 'admin:home': 'Admin Hub', 'admin:automod': 'AutoMod', 'admin:embed': 'Embed Studio', 'admin:modules': 'Modules', 'admin:logs': 'Logs', 'admin:backups': 'Backups', 'admin:adminpanel': 'Admin Panel', 'admin:modpanel': 'Mod Panel', 'admin:staffroles': 'Staff Roles', 'admin:modroles': 'Mod Roles', 'admin:autoRoles': 'Join Roles' };
  return labels[route] || String(route || 'admin:home').replace('admin:', '').replaceAll(':', ' › ');
}
function getBreadcrumbFromState(navState) { return (Array.isArray(navState?.history) ? navState.history : ['admin:home']).filter(Boolean).slice(-4).map(getRouteLabel).join(' › '); }
function applyNavigationUI(interaction, panel, navState = panelNav.createState('admin:home')) {
  if (!interaction || !panel?.embeds?.[0]) return panel;
  const embed = EmbedBuilder.from(panel.embeds[0]).setFooter({ text: `Navigation: ${getBreadcrumbFromState(navState)}` });
  return { ...panel, embeds: [embed] };
}
async function openExternalAdminPanel(interaction, panel, navState = panelNav.createState('admin:home')) { await interaction.update(applyNavigationUI(interaction, panel, navState)); return true; }
function backButton(navState = panelNav.createState('admin:home')) { return button(panelNav.buildCustomId(navState, 'back'), '⬅️ Back', ButtonStyle.Secondary); }
function navRow(navState) { return row(backButton(navState)); }

function buildAdminPanel(guild, memberDisplayName = 'Unknown User') {
  return {
    embeds: [createEmbed('🛠️ Admin Hub', 'Control your server systems from one place.', memberDisplayName).addFields(
      { name: '🤖 AutoMod', value: 'Auto Protection', inline: true }, { name: '🔏 Admin', value: 'Admin tools', inline: true }, { name: '🔐 Mod Panel', value: 'Moderation tools', inline: true },
      { name: '🧩 Modules', value: 'Embeds, tickets, fun, etc.', inline: true }, { name: '📋 Logs', value: formatLogsSummary(guild.id), inline: true }, { name: '🧱 Backups', value: 'Disaster recovery', inline: true }, { name: '🧹 Purge', value: 'Bulk delete messages', inline: true }
    )],
    components: buttonRows([
      ['admin:automod', '⚙️ AutoMod', ButtonStyle.Primary], ['admin:adminpanel', '🔏 Admin', ButtonStyle.Primary], ['admin:modpanel', '🔐 Mod Panel', ButtonStyle.Primary],
      ['admin:modules', '🧩 Modules', ButtonStyle.Primary], ['admin:logs', '📋 Logs', ButtonStyle.Primary], ['admin:backups', '🧱 Backups', ButtonStyle.Secondary], ['admin:purge', '🧹 Purge', ButtonStyle.Danger],
    ]),
  };
}

function buildAutomodPanel(guild, memberDisplayName = 'Unknown User', navState = panelNav.createState('admin:home')) {
  const config = getAutomodConfig(guild.id);
  const logChannelId = getLogChannelId(guild.id, 'automod');
  return {
    embeds: [createEmbed('🤖 AutoMod', [
      `**Status:** ${config.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**DM users:** ${config.dmUser !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Log channel:** ${logChannelId ? `<#${logChannelId}>` : 'Not set'}`,
      '',
      'Use the controls below to manage automatic protection.',
    ].join('\n'), memberDisplayName)],
    components: [
      row(
        button('admin:automod:toggle', config.enabled ? 'Disable AutoMod' : 'Enable AutoMod', config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        button('admin:automod:dm', config.dmUser !== false ? 'Disable DMs' : 'Enable DMs', ButtonStyle.Secondary),
        button('admin:setautomodlog', 'Set Log Channel', ButtonStyle.Primary)
      ),
      navRow(navState),
    ],
  };
}

function buildAdminToolsPanel(guild, memberDisplayName = 'Unknown User', navState = panelNav.createState('admin:home')) {
  const staff = getRoleConfig(guild.id, 'staffRoles'); const mods = getRoleConfig(guild.id, 'modRoles');
  return { embeds: [createEmbed('👑 Admin Panel', `**Staff Roles**\n${formatRoleList(staff.roleIds)}\n\n**Mod Roles**\n${formatRoleList(mods.roleIds)}`, memberDisplayName)], components: [...buttonRows([
    ['admin:setadminlog', '🔏 Set Admin Log', ButtonStyle.Primary], ['admin:staffroles', '👥 Staff Roles', ButtonStyle.Primary], ['admin:modroles', '🔐 Mod Roles', ButtonStyle.Primary], ['admin:adminsettings', '⚙️ Settings', ButtonStyle.Primary],
  ]), navRow(navState)] };
}
function buildModulesPanel(guild, memberDisplayName = 'Unknown User', navState = panelNav.createState('admin:home')) {
  return { embeds: [createEmbed('🧩 Modules', MODULES.map(([, , title, description]) => `**${title}**\n${description}`).join('\n\n'), memberDisplayName)], components: [...buttonRows(MODULES.map(([id, label]) => [id, label, ButtonStyle.Primary])), navRow(navState)] };
}
function buildLogsPanel(guild, memberDisplayName = 'Unknown User', navState = panelNav.createState('admin:home')) {
  return { embeds: [createEmbed('📋 Log Channels', Object.values(LOG_TYPES).map((item) => `**${item.label}:** ${getLogChannelId(guild.id, item.key) ? `<#${getLogChannelId(guild.id, item.key)}>` : 'Not set'}`).join('\n'), memberDisplayName)], components: [...buttonRows(Object.values(LOG_TYPES).map((item) => [item.customId, item.label, ButtonStyle.Primary])), navRow(navState)] };
}
function buildBackupsPanel(guild, memberDisplayName = 'Unknown User', navState = panelNav.createState('admin:home')) {
  const backups = listServerBackups(guild.id); const latest = normalizeBackupId(backups[0]);
  return { embeds: [createEmbed('🧱 Server Backups', `**Backups found:** ${backups.length}\n**Latest:** \`${latest || 'None'}\``, memberDisplayName)], components: [...buttonRows([
    ['admin:backup:create', '⚡ Create Backup', ButtonStyle.Success], ['admin:backup:list', '📦 View Backups', ButtonStyle.Primary], ['admin:backup:preview', '🔍 Preview Latest', ButtonStyle.Secondary], ['admin:backup:download', '💾 Download Backup', ButtonStyle.Secondary], ['admin:backup:requestrestore', '🚨 Request Restore', ButtonStyle.Danger],
  ], 2), navRow(navState)] };
}
function buildRolePanel(guild, section, title, selectId, clearId, memberDisplayName, navState) {
  const config = getRoleConfig(guild.id, section);
  return { embeds: [createEmbed(title, `**Selected roles:**\n${formatRoleList(config.roleIds)}`, memberDisplayName)], components: [row(new RoleSelectMenuBuilder().setCustomId(selectId).setPlaceholder('Select roles').setMinValues(0).setMaxValues(10)), row(button(clearId, 'Clear Roles', ButtonStyle.Danger), backButton(navState))] };
}
function buildStaffRolesPanel(guild, memberDisplayName = 'Unknown User', navState = panelNav.createState('admin:home')) { return buildRolePanel(guild, 'staffRoles', '👥 Staff Roles', 'admin:staffroles:select', 'admin:staffroles:clear', memberDisplayName, navState); }
function buildModRolesPanel(guild, memberDisplayName = 'Unknown User', navState = panelNav.createState('admin:home')) { return buildRolePanel(guild, 'modRoles', '🔐 Mod Roles', 'admin:modroles:select', 'admin:modroles:clear', memberDisplayName, navState); }
function buildAutoRolesPanel(guild, memberDisplayName = 'Unknown User', navState = panelNav.createState('admin:home')) {
  const config = getAutoRolesConfig(guild.id);
  return { embeds: [createEmbed('🎭 Join Roles', `**Status:** ${config.enabled ? 'Enabled ✅' : 'Disabled ❌'}\n**Roles:** ${formatRoleList(config.roleIds)}\n\n⚠️ The bot role must be above selected roles.`, memberDisplayName)], components: [row(new RoleSelectMenuBuilder().setCustomId('admin:autoRoles:select').setPlaceholder('Select join roles').setMinValues(0).setMaxValues(10)), row(button('admin:autoRoles:toggle', config.enabled ? 'Disable' : 'Enable', config.enabled ? ButtonStyle.Danger : ButtonStyle.Success), backButton(navState))] };
}
function buildChannelPanel(type = 'logs', navState = panelNav.createState('admin:home')) {
  const selected = LOG_TYPES[type] || LOG_TYPES.logs;
  return { embeds: [createEmbed(selected.title, 'Select the text channel where these logs should be sent.')], components: [row(new ChannelSelectMenuBuilder().setCustomId(selected.selectId).setPlaceholder('Choose a text channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)), navRow(navState)] };
}
function buildComingSoonPanel(title, description, navState = panelNav.createState('admin:home')) { return { embeds: [createEmbed(title, description)], components: [navRow(navState)] }; }
function buildPurgeModal() { return new ModalBuilder().setCustomId('admin:purgeModal').setTitle('Purge Messages').addComponents(row(new TextInputBuilder().setCustomId('amount').setLabel('Amount (1-100)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('25').setMaxLength(3))); }

async function updatePanel(interaction, panel, navState = panelNav.createState('admin:home')) {
  const finalPanel = applyNavigationUI(interaction, panel, navState);
  if (interaction.deferred || interaction.replied) await interaction.editReply(finalPanel); else await interaction.update(finalPanel);
  return true;
}
function nextState(navState, route) { return panelNav.push(navState || panelNav.createState('admin:home'), route); }
async function openRoute(interaction, route, memberDisplayName, navState) {
  const state = route === 'admin:home' ? panelNav.createState('admin:home') : nextState(navState, route);
  let panel;
  if (route === 'admin:home') panel = buildAdminPanel(interaction.guild, memberDisplayName);
  else if (route === 'admin:automod') panel = buildAutomodPanel(interaction.guild, memberDisplayName, state);
  else if (route === 'admin:adminpanel') panel = buildAdminToolsPanel(interaction.guild, memberDisplayName, state);
  else if (route === 'admin:modules') panel = buildModulesPanel(interaction.guild, memberDisplayName, state);
  else if (route === 'admin:logs') panel = buildLogsPanel(interaction.guild, memberDisplayName, state);
  else if (route === 'admin:backups') panel = buildBackupsPanel(interaction.guild, memberDisplayName, state);
  else if (route === 'admin:staffroles') panel = buildStaffRolesPanel(interaction.guild, memberDisplayName, state);
  else if (route === 'admin:modroles') panel = buildModRolesPanel(interaction.guild, memberDisplayName, state);
  else if (route === 'admin:autoRoles') panel = buildAutoRolesPanel(interaction.guild, memberDisplayName, state);
  else if (route === 'admin:modpanel') panel = buildComingSoonPanel('🔐 Mod Panel', 'Moderation tools will live here.', state);
  else if (route === 'admin:adminsettings') panel = buildComingSoonPanel('⚙️ Admin Settings', 'Admin settings will live here.', state);
  else if (COMING_SOON[route]) panel = buildComingSoonPanel(...COMING_SOON[route], state);
  else panel = buildAdminPanel(interaction.guild, memberDisplayName);
  return updatePanel(interaction, panel, state);
}
async function replyNoAccess(interaction, content) { await interaction.reply({ content, flags: 64 }); return true; }

async function handleAdminNavigation(interaction, navState = panelNav.createState('admin:home')) {
  if (!interaction.guild || !interaction.customId?.startsWith('admin:')) return false;
  if (!canUseAdminPanel(interaction)) return replyNoAccess(interaction, '❌ Only the Goliath Owner, Guild Owner, or Administrators can use the Admin Panel.');
  const memberDisplayName = getMemberDisplayName(interaction);

  if (interaction.isRoleSelectMenu()) {
    const map = { 'admin:staffroles:select': 'staffRoles', 'admin:modroles:select': 'modRoles', 'admin:autoRoles:select': 'autoRoles' };
    const section = map[interaction.customId]; if (!section) return false;
    const current = section === 'autoRoles' ? getAutoRolesConfig(interaction.guild.id) : getRoleConfig(interaction.guild.id, section);
    replaceGuildSection(interaction.guild.id, section, { ...current, roleIds: [...new Set(interaction.values || [])] });
    const panel = section === 'staffRoles' ? buildStaffRolesPanel(interaction.guild, memberDisplayName, navState) : section === 'modRoles' ? buildModRolesPanel(interaction.guild, memberDisplayName, navState) : buildAutoRolesPanel(interaction.guild, memberDisplayName, navState);
    return updatePanel(interaction, panel, navState);
  }
  if (interaction.isChannelSelectMenu()) {
    const type = LOG_SELECT_TO_TYPE[interaction.customId]; if (!type) return false;
    setLogChannelId(interaction.guild.id, LOG_TYPES[type].key, interaction.values?.[0] || null);
    return updatePanel(interaction, buildLogsPanel(interaction.guild, memberDisplayName, navState), navState);
  }
  if (!interaction.isButton()) return false;
  const { customId } = interaction;

  if (customId === 'admin:purge') { await interaction.showModal(buildPurgeModal()); return true; }
  if (customId === 'admin:automod:toggle' || customId === 'admin:automod:dm') {
    const current = getAutomodConfig(interaction.guild.id);
    replaceGuildSection(interaction.guild.id, 'automod', { ...current, ...(customId.endsWith(':toggle') ? { enabled: !current.enabled } : { dmUser: current.dmUser === false }) });
    return updatePanel(interaction, buildAutomodPanel(interaction.guild, memberDisplayName, navState), navState);
  }
  if (LOG_BUTTON_TO_TYPE[customId]) return updatePanel(interaction, buildChannelPanel(LOG_BUTTON_TO_TYPE[customId], nextState(navState, `admin:channel:${LOG_BUTTON_TO_TYPE[customId]}`)), nextState(navState, `admin:channel:${LOG_BUTTON_TO_TYPE[customId]}`));
  if (customId === 'admin:embed') {
    const { buildEmbedPanel } = require('../../../modules/messageStudio/embed/embedPanel');
    return updatePanel(interaction, buildEmbedPanel(interaction, memberDisplayName), nextState(navState, 'admin:embed'));
  }
  if (customId === 'admin:tickets') {
    const { sendSetupPanel } = require('../../../modules/feedbackStudio/tickets/ticketsPanel');
    return sendSetupPanel(interaction);
  }
  if (customId === 'admin:autoRoles:toggle') {
    const current = getAutoRolesConfig(interaction.guild.id); replaceGuildSection(interaction.guild.id, 'autoRoles', { ...current, enabled: !current.enabled, roleIds: current.roleIds || [] });
    return updatePanel(interaction, buildAutoRolesPanel(interaction.guild, memberDisplayName, navState), navState);
  }
  if (customId === 'admin:staffroles:clear' || customId === 'admin:modroles:clear') {
    const section = customId.includes('staffroles') ? 'staffRoles' : 'modRoles'; replaceGuildSection(interaction.guild.id, section, { roleIds: [] });
    return updatePanel(interaction, section === 'staffRoles' ? buildStaffRolesPanel(interaction.guild, memberDisplayName, navState) : buildModRolesPanel(interaction.guild, memberDisplayName, navState), navState);
  }
  if (customId === 'admin:backup:create') { if (!isBotOwner(interaction) && !isGuildOwner(interaction)) return replyNoAccess(interaction, '❌ Only the Goliath Owner or Guild Owner can create backups.'); await interaction.deferUpdate(); await createServerBackup(interaction.guild, { createdBy: interaction.user.id, reason: 'Manual backup from admin panel' }); await interaction.editReply(applyNavigationUI(interaction, buildBackupsPanel(interaction.guild, memberDisplayName, navState), navState)); return true; }
  if (customId === 'admin:backup:list') { const backups = listServerBackups(interaction.guild.id).map(normalizeBackupId).filter(Boolean); await interaction.reply({ content: backups.length ? `📦 **Backups:**\n${backups.slice(0, 10).map((id) => `\`${id}\``).join('\n')}` : '📦 No backups found.', flags: 64 }); return true; }
  if (customId === 'admin:backup:preview') { const latest = normalizeBackupId(listServerBackups(interaction.guild.id)[0]); const backup = latest ? readServerBackup(interaction.guild.id, latest) : null; const validation = backup ? validateServerBackup(backup, { guildId: interaction.guild.id }) : null; await interaction.reply({ content: backup ? `🔍 **Latest Backup**\nID: \`${latest}\`\nValid: ${validation?.valid ? 'YES ✅' : 'NO ❌'}` : '🔍 No backups found.', flags: 64 }); return true; }
  if (customId === 'admin:backup:download') { const latest = normalizeBackupId(listServerBackups(interaction.guild.id)[0]); const backup = latest ? readServerBackup(interaction.guild.id, latest) : null; if (!backup) return replyNoAccess(interaction, '❌ No backups found.'); await interaction.reply({ content: `💾 Backup: ${latest}`, files: [{ attachment: Buffer.from(JSON.stringify(backup, null, 2)), name: `${latest}.json` }], flags: 64 }); return true; }
  if (customId === 'admin:backup:requestrestore') return restoreRequestManager.createRestoreRequest(interaction, { cooldownMs: 1000 * 60 * 30 });
  if (customId === 'admin:backup:restore' || customId === 'admin:backup:restore:real') return replyNoAccess(interaction, '❌ Direct restores are disabled. Use the centralized restore approval system.');

  const routes = ['admin:home', 'admin:automod', 'admin:adminpanel', 'admin:modules', 'admin:logs', 'admin:backups', 'admin:modpanel', 'admin:staffroles', 'admin:modroles', 'admin:autoRoles', 'admin:adminsettings'];
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
