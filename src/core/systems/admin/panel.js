'use strict';

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
const restoreRequestManager = require('../security/restoreBackup/requests');
const security = require('../security/protection/core');
const {
  createServerBackup,
  listServerBackups,
  readServerBackup,
  validateServerBackup,
} = require('../security/restoreBackup/backup');
const automodPanel = require('../automod/panel');

const PANEL_COLOR = '#5865F2';

const LOG_TYPES = {
  automodlog: { key: 'automod', customId: 'admin:setautomodlog', selectId: 'admin:selectautomodlog', title: '🤖 Set AutoMod Log Channel', label: '🤖 AutoMod Log' },
  adminlog: { key: 'admin', customId: 'admin:setadminlog', selectId: 'admin:selectadminlog', title: '👑 Set Admin Log Channel', label: '👑 Admin Log' },
  modlog: { key: 'moderation', customId: 'admin:setmodlog', selectId: 'admin:selectmodlog', title: '📌 Set Mod Log Channel', label: '📌 Mod Log' },
  logs: { key: 'general', customId: 'admin:setlogs', selectId: 'admin:selectlogs', title: '📋 Set General Logs Channel', label: '📋 General Logs' },
  memberlog: { key: 'member', customId: 'admin:setmemberlog', selectId: 'admin:selectmemberlog', title: '👥 Set Member Log Channel', label: '👥 Member Log' },
};

const LOG_SELECT_TO_TYPE = Object.fromEntries(Object.entries(LOG_TYPES).map(([key, value]) => [value.selectId, key]));
const LOG_BUTTON_TO_TYPE = Object.fromEntries(Object.entries(LOG_TYPES).map(([key, value]) => [value.customId, key]));

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
const COMING_SOON = Object.fromEntries(MODULES.slice(2).filter(([id]) => id !== 'admin:tickets').map(([id, , title, description]) => [id, [title, `${description} are coming soon.`]]));

const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (id, label, style = ButtonStyle.Primary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const getMemberDisplayName = (interaction) => interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';
const getGuildSection = (guildId, section, fallback) => guildManager.getGuildSection(guildId, section, fallback);
const replaceGuildSection = (guildId, section, data) => guildManager.replaceGuildSection(guildId, section, data);
const getRoleConfig = (guildId, section) => getGuildSection(guildId, section, { roleIds: [] });
const getAutoRolesConfig = (guildId) => getGuildSection(guildId, 'autoRoles', { enabled: false, roleIds: [] });
const isBotOwner = (interaction) => security.isBotOwner(interaction.user.id);
const isGuildOwner = (interaction) => interaction.guild?.ownerId === interaction.user.id;
const canUseAdminPanel = (interaction) => isBotOwner(interaction) || isGuildOwner(interaction) || interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
const normalizeBackupId = (backup) => typeof backup === 'string' ? backup : backup?.backupId;
const formatRoleList = (ids) => {
  const values = [...new Set((ids || []).filter(Boolean))];
  return values.length ? values.map((id) => `<@&${id}>`).join(', ') : 'None';
};

function createEmbed(title, description, memberDisplayName, color = PANEL_COLOR) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();
  if (description) embed.setDescription(description);
  if (memberDisplayName) embed.setFooter({ text: `Requested by ${memberDisplayName}` });
  return embed;
}

function buttonRows(items, size = 3) {
  const rows = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(row(...items.slice(index, index + size).map(([id, label, style, disabled]) => button(id, label, style, disabled))));
  }
  return rows;
}

function getLogChannelId(guildId, type) {
  return typeof guildManager.getLogChannelId === 'function'
    ? guildManager.getLogChannelId(guildId, type)
    : getGuildSection(guildId, 'logs', { channels: {} })?.channels?.[type] || null;
}

function setLogChannelId(guildId, type = 'general', channelId = null) {
  if (typeof guildManager.setLogChannelId === 'function') return guildManager.setLogChannelId(guildId, type, channelId);
  const logs = getGuildSection(guildId, 'logs', { enabled: true, channels: {}, events: {} });
  return replaceGuildSection(guildId, 'logs', { ...logs, channels: { ...(logs.channels || {}), [type]: channelId } });
}

function canonicalState(route = 'admin:home') {
  const home = ['admin:home'];
  if (route === 'admin:home') return { history: home };
  if (route === 'admin:automod') return { history: [...home, route] };
  if (route === 'admin:automod:configure' || route.startsWith('admin:automod:rule:')) return { history: [...home, 'admin:automod', route] };
  if (route === 'admin:channel:automodlog') return { history: [...home, 'admin:automod', 'admin:automod:configure', route] };
  if (['admin:staffroles', 'admin:modroles', 'admin:adminsettings'].includes(route)) return { history: [...home, 'admin:adminpanel', route] };
  if (route === 'admin:autoRoles' || MODULES.some(([id]) => id === route)) return { history: [...home, 'admin:modules', route] };
  return { history: [...home, route] };
}

function routeLabel(route) {
  const labels = {
    'admin:home': 'Admin Hub',
    'admin:automod': 'AutoMod',
    'admin:automod:configure': 'Settings',
    'admin:modules': 'Modules',
    'admin:logs': 'Logs',
    'admin:backups': 'Backups',
    'admin:adminpanel': 'Admin Panel',
    'admin:modpanel': 'Mod Panel',
    'admin:staffroles': 'Staff Roles',
    'admin:modroles': 'Mod Roles',
    'admin:autoRoles': 'Join Roles',
  };
  if (route?.startsWith('admin:automod:rule:')) return automodPanel.AUTOMOD_RULES?.[route.split(':').pop()]?.title || 'AutoMod Rule';
  return labels[route] || String(route || 'admin:home').replace('admin:', '').replaceAll(':', ' › ');
}

function applyNavigationUI(interaction, panel, state = canonicalState()) {
  if (!panel?.embeds?.[0]) return panel;
  return {
    ...panel,
    embeds: [EmbedBuilder.from(panel.embeds[0]).setFooter({ text: `Navigation: ${(state.history || ['admin:home']).slice(-4).map(routeLabel).join(' › ')}` })],
  };
}

const backButton = (route) => button(panelNav.buildCustomId(canonicalState(route), 'back'), '⬅️ Back', ButtonStyle.Secondary);

function buildAdminPanel(guild, name = 'Unknown User') {
  return {
    embeds: [createEmbed('🛠️ Admin Hub', 'Control your server systems from one place.', name).addFields(
      { name: '🤖 AutoMod', value: 'Auto Protection', inline: true },
      { name: '🔏 Admin', value: 'Admin tools', inline: true },
      { name: '🔐 Mod Panel', value: 'Moderation tools', inline: true },
      { name: '🧩 Modules', value: 'Embeds, tickets, fun, etc.', inline: true },
      { name: '📋 Logs', value: `${Object.values(LOG_TYPES).filter((value) => getLogChannelId(guild.id, value.key)).length}/5 configured`, inline: true },
      { name: '🧱 Backups', value: 'Disaster recovery', inline: true },
      { name: '🧹 Purge', value: 'Bulk delete messages', inline: true },
    )],
    components: buttonRows([
      ['admin:automod', '⚙️ AutoMod', ButtonStyle.Primary],
      ['admin:adminpanel', '🔏 Admin', ButtonStyle.Primary],
      ['admin:modpanel', '🔐 Mod Panel', ButtonStyle.Primary],
      ['admin:modules', '🧩 Modules', ButtonStyle.Primary],
      ['admin:logs', '📋 Logs', ButtonStyle.Primary],
      ['admin:backups', '🧱 Backups', ButtonStyle.Secondary],
      ['admin:purge', '🧹 Purge', ButtonStyle.Danger],
    ]),
  };
}

function buildAdminToolsPanel(guild, name = 'Unknown User') {
  return {
    embeds: [createEmbed('👑 Admin Panel', `**Staff Roles**\n${formatRoleList(getRoleConfig(guild.id, 'staffRoles').roleIds)}\n\n**Mod Roles**\n${formatRoleList(getRoleConfig(guild.id, 'modRoles').roleIds)}`, name)],
    components: [...buttonRows([
      ['admin:setadminlog', '🔏 Set Admin Log'],
      ['admin:staffroles', '👥 Staff Roles'],
      ['admin:modroles', '🔐 Mod Roles'],
      ['admin:adminsettings', '⚙️ Settings'],
    ]), row(backButton('admin:adminpanel'))],
  };
}

function buildModulesPanel(guild, name = 'Unknown User') {
  return {
    embeds: [createEmbed('🧩 Modules', MODULES.map(([, , title, description]) => `**${title}**\n${description}`).join('\n\n'), name)],
    components: [...buttonRows(MODULES.map(([id, label]) => [id, label, ButtonStyle.Primary])), row(backButton('admin:modules'))],
  };
}

function buildLogsPanel(guild, name = 'Unknown User') {
  return {
    embeds: [createEmbed('📋 Log Channels', Object.values(LOG_TYPES).map((value) => `**${value.label}:** ${getLogChannelId(guild.id, value.key) ? `<#${getLogChannelId(guild.id, value.key)}>` : 'Not set'}`).join('\n'), name)],
    components: [...buttonRows(Object.values(LOG_TYPES).map((value) => [value.customId, value.label, ButtonStyle.Primary])), row(backButton('admin:logs'))],
  };
}

function buildBackupsPanel(guild, name = 'Unknown User') {
  const backups = listServerBackups(guild.id);
  const latest = normalizeBackupId(backups[0]);
  return {
    embeds: [createEmbed('🧱 Server Backups', `**Backups found:** ${backups.length}\n**Latest:** \`${latest || 'None'}\``, name)],
    components: [...buttonRows([
      ['admin:backup:create', '⚡ Create Backup', ButtonStyle.Success],
      ['admin:backup:list', '📦 View Backups'],
      ['admin:backup:preview', '🔍 Preview Latest', ButtonStyle.Secondary],
      ['admin:backup:download', '💾 Download Backup', ButtonStyle.Secondary],
      ['admin:backup:requestrestore', '🚨 Request Restore', ButtonStyle.Danger],
    ], 2), row(backButton('admin:backups'))],
  };
}

function buildRolePanel(guild, section, title, selectId, clearId, name, route) {
  const config = getRoleConfig(guild.id, section);
  return {
    embeds: [createEmbed(title, `**Selected roles:**\n${formatRoleList(config.roleIds)}`, name)],
    components: [
      row(new RoleSelectMenuBuilder().setCustomId(selectId).setPlaceholder('Select roles').setMinValues(0).setMaxValues(10)),
      row(button(clearId, 'Clear Roles', ButtonStyle.Danger), backButton(route)),
    ],
  };
}

const buildStaffRolesPanel = (guild, name = 'Unknown User') => buildRolePanel(guild, 'staffRoles', '👥 Staff Roles', 'admin:staffroles:select', 'admin:staffroles:clear', name, 'admin:staffroles');
const buildModRolesPanel = (guild, name = 'Unknown User') => buildRolePanel(guild, 'modRoles', '🔐 Mod Roles', 'admin:modroles:select', 'admin:modroles:clear', name, 'admin:modroles');

function buildAutoRolesPanel(guild, name = 'Unknown User') {
  const config = getAutoRolesConfig(guild.id);
  return {
    embeds: [createEmbed('🎭 Join Roles', `**Status:** ${config.enabled ? 'Enabled ✅' : 'Disabled ❌'}\n**Roles:** ${formatRoleList(config.roleIds)}\n\n⚠️ The bot role must be above selected roles.`, name)],
    components: [
      row(new RoleSelectMenuBuilder().setCustomId('admin:autoRoles:select').setPlaceholder('Select join roles').setMinValues(0).setMaxValues(10)),
      row(button('admin:autoRoles:toggle', config.enabled ? 'Disable' : 'Enable', config.enabled ? ButtonStyle.Danger : ButtonStyle.Success), backButton('admin:autoRoles')),
    ],
  };
}

function buildChannelPanel(type = 'logs') {
  const settings = LOG_TYPES[type] || LOG_TYPES.logs;
  const route = type === 'automodlog' ? 'admin:channel:automodlog' : `admin:channel:${type}`;
  return {
    embeds: [createEmbed(settings.title, 'Select the text channel where these logs should be sent.')],
    components: [
      row(new ChannelSelectMenuBuilder().setCustomId(settings.selectId).setPlaceholder('Choose a text channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
      row(backButton(route)),
    ],
  };
}

const buildComingSoonPanel = (title, description, route) => ({ embeds: [createEmbed(title, description)], components: [row(backButton(route))] });
const buildPurgeModal = () => new ModalBuilder().setCustomId('admin:purgeModal').setTitle('Purge Messages').addComponents(row(new TextInputBuilder().setCustomId('amount').setLabel('Amount (1-100)').setStyle(TextInputStyle.Short).setPlaceholder('25').setRequired(true)));

async function updatePanel(interaction, panel, route = 'admin:home') {
  const payload = applyNavigationUI(interaction, panel, canonicalState(route));
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.update(payload);
  return true;
}

function panelForRoute(route, interaction, name) {
  if (route === 'admin:home') return buildAdminPanel(interaction.guild, name);
  if (route === 'admin:automod') return automodPanel.buildAutomodPanel(interaction.guild, name);
  if (route === 'admin:automod:configure') return automodPanel.buildAutomodConfigurePanel(interaction.guild, name);
  if (route?.startsWith('admin:automod:rule:')) return automodPanel.buildAutomodRulePanel(interaction.guild, route.split(':').pop(), name);
  if (route === 'admin:adminpanel') return buildAdminToolsPanel(interaction.guild, name);
  if (route === 'admin:modules') return buildModulesPanel(interaction.guild, name);
  if (route === 'admin:logs') return buildLogsPanel(interaction.guild, name);
  if (route === 'admin:backups') return buildBackupsPanel(interaction.guild, name);
  if (route === 'admin:staffroles') return buildStaffRolesPanel(interaction.guild, name);
  if (route === 'admin:modroles') return buildModRolesPanel(interaction.guild, name);
  if (route === 'admin:autoRoles') return buildAutoRolesPanel(interaction.guild, name);
  if (route === 'admin:modpanel') return buildComingSoonPanel('🔐 Mod Panel', 'Moderation tools will live here.', route);
  if (route === 'admin:adminsettings') return buildComingSoonPanel('⚙️ Admin Settings', 'Admin settings will live here.', route);
  if (COMING_SOON[route]) return buildComingSoonPanel(...COMING_SOON[route], route);
  return buildAdminPanel(interaction.guild, name);
}

const openRoute = (interaction, route, name) => updatePanel(interaction, panelForRoute(route, interaction, name), route);

async function handleAdminNavigation(interaction) {
  if (!interaction.guild) return false;
  const nav = panelNav.parseCustomId(interaction.customId);
  if (!String(interaction.customId || '').startsWith('admin:') && !nav) return false;
  if (!canUseAdminPanel(interaction)) {
    await interaction.reply({ content: '❌ Only the Goliath Owner, Guild Owner, or Administrators can use the Admin Panel.', flags: 64 });
    return true;
  }

  if (await automodPanel.handleAutomodInteraction(interaction)) return true;

  const name = getMemberDisplayName(interaction);
  if (nav?.action === 'back') {
    const state = panelNav.back(nav.state);
    return openRoute(interaction, panelNav.current(state), name);
  }

  if (interaction.isRoleSelectMenu?.()) {
    const map = { 'admin:staffroles:select': 'staffRoles', 'admin:modroles:select': 'modRoles', 'admin:autoRoles:select': 'autoRoles' };
    const section = map[interaction.customId];
    if (!section) return false;
    const current = section === 'autoRoles' ? getAutoRolesConfig(interaction.guild.id) : getRoleConfig(interaction.guild.id, section);
    replaceGuildSection(interaction.guild.id, section, { ...current, roleIds: [...new Set(interaction.values || [])] });
    return openRoute(interaction, section === 'staffRoles' ? 'admin:staffroles' : section === 'modRoles' ? 'admin:modroles' : 'admin:autoRoles', name);
  }

  if (interaction.isChannelSelectMenu?.()) {
    const type = LOG_SELECT_TO_TYPE[interaction.customId];
    if (!type) return false;
    setLogChannelId(interaction.guild.id, LOG_TYPES[type].key, interaction.values?.[0] || null);
    return openRoute(interaction, 'admin:logs', name);
  }

  if (!interaction.isButton?.()) return false;
  const id = interaction.customId;

  if (id === 'admin:purge') { await interaction.showModal(buildPurgeModal()); return true; }
  if (LOG_BUTTON_TO_TYPE[id]) return updatePanel(interaction, buildChannelPanel(LOG_BUTTON_TO_TYPE[id]), `admin:channel:${LOG_BUTTON_TO_TYPE[id]}`);
  if (id === 'admin:embed') { const { buildEmbedPanel } = require('../../../modules/messageStudio/embed/embedPanel'); return updatePanel(interaction, buildEmbedPanel(interaction, name), 'admin:embed'); }
  if (id === 'admin:tickets') { const { sendSetupPanel } = require('../../../modules/feedbackStudio/tickets/ticketsPanel'); return sendSetupPanel(interaction); }
  if (id === 'admin:autoRoles:toggle') {
    const current = getAutoRolesConfig(interaction.guild.id);
    replaceGuildSection(interaction.guild.id, 'autoRoles', { ...current, enabled: !current.enabled, roleIds: current.roleIds || [] });
    return openRoute(interaction, 'admin:autoRoles', name);
  }
  if (id === 'admin:staffroles:clear' || id === 'admin:modroles:clear') {
    const route = id.includes('staffroles') ? 'admin:staffroles' : 'admin:modroles';
    replaceGuildSection(interaction.guild.id, route === 'admin:staffroles' ? 'staffRoles' : 'modRoles', { roleIds: [] });
    return openRoute(interaction, route, name);
  }
  if (id === 'admin:backup:create') {
    await interaction.deferUpdate();
    await createServerBackup(interaction.guild, { createdBy: interaction.user.id, reason: 'Manual backup from admin panel' });
    return interaction.editReply(applyNavigationUI(interaction, buildBackupsPanel(interaction.guild, name), canonicalState('admin:backups')));
  }
  if (id === 'admin:backup:list') {
    const backups = listServerBackups(interaction.guild.id).map(normalizeBackupId).filter(Boolean);
    await interaction.reply({ content: backups.length ? `📦 **Backups:**\n${backups.slice(0, 10).map((value) => `\`${value}\``).join('\n')}` : '📦 No backups found.', flags: 64 });
    return true;
  }
  if (id === 'admin:backup:preview') {
    const latest = normalizeBackupId(listServerBackups(interaction.guild.id)[0]);
    const backup = latest ? readServerBackup(interaction.guild.id, latest) : null;
    const validation = backup ? validateServerBackup(backup, { guildId: interaction.guild.id }) : null;
    await interaction.reply({ content: backup ? `🔍 **Latest Backup**\nID: \`${latest}\`\nValid: ${validation?.valid ? 'YES ✅' : 'NO ❌'}` : '🔍 No backups found.', flags: 64 });
    return true;
  }
  if (id === 'admin:backup:download') {
    const latest = normalizeBackupId(listServerBackups(interaction.guild.id)[0]);
    const backup = latest ? readServerBackup(interaction.guild.id, latest) : null;
    if (!backup) { await interaction.reply({ content: '❌ No backups found.', flags: 64 }); return true; }
    await interaction.reply({ content: `💾 Backup: ${latest}`, files: [{ attachment: Buffer.from(JSON.stringify(backup, null, 2)), name: `${latest}.json` }], flags: 64 });
    return true;
  }
  if (id === 'admin:backup:requestrestore') return restoreRequestManager.createRestoreRequest(interaction, { cooldownMs: 1800000 });
  if (['admin:backup:restore', 'admin:backup:restore:real'].includes(id)) { await interaction.reply({ content: '❌ Direct restores are disabled. Use the centralized restore approval system.', flags: 64 }); return true; }

  const routes = ['admin:home', 'admin:adminpanel', 'admin:modules', 'admin:logs', 'admin:backups', 'admin:modpanel', 'admin:staffroles', 'admin:modroles', 'admin:autoRoles', 'admin:adminsettings'];
  if (routes.includes(id) || COMING_SOON[id]) return openRoute(interaction, id, name);
  return false;
}

module.exports = {
  LOG_TYPES,
  buildAdminPanel,
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
  openExternalAdminPanel: async (interaction, panel) => {
    await interaction.update(applyNavigationUI(interaction, panel, canonicalState('admin:home')));
    return true;
  },
  applyNavigationUI,
  getCurrentRoute: () => 'admin:home',
  setCurrentRoute: () => true,
  pushHistory: () => true,
  popHistory: () => 'admin:home',
  getBreadcrumb: () => 'Admin Hub',
};
