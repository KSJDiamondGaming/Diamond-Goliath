'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const crypto = require('crypto');
const guildManager = require('../../core/guild/guildManager');

const PLATFORMS = ['twitch', 'youtube', 'tiktok', 'kick', 'facebook', 'instagram', 'x'];
const ALERT_TYPES = ['live', 'upload', 'short', 'post'];
const NAV_SECTIONS = new Set(['creators', 'accounts', 'notifications', 'templates', 'feeds', 'channels', 'settings', 'permissions', 'roles', 'automation', 'testing', 'data']);
const P = 'social:';

const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const makeId = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const who = (interaction) => interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';

function getConfig(guildId) {
  const section = guildManager.getGuildSection(guildId, 'social', {}) || {};
  return {
    ...section,
    enabled: guildManager.isModuleEnabled(guildId, 'social'),
    alertsChannelId: section.alertsChannelId || null,
    managerRoleIds: Array.isArray(section.managerRoleIds) ? section.managerRoleIds : [],
    accounts: section.accounts && typeof section.accounts === 'object' ? section.accounts : {},
    creators: section.creators && typeof section.creators === 'object' ? section.creators : {},
    templates: section.templates && typeof section.templates === 'object' ? section.templates : {},
    settings: section.settings && typeof section.settings === 'object' ? section.settings : {},
    history: Array.isArray(section.history) ? section.history : [],
    queue: Array.isArray(section.queue) ? section.queue : [],
    analytics: section.analytics && typeof section.analytics === 'object' ? section.analytics : {},
  };
}

function saveConfig(guildId, config, guild, actorId = null) {
  const { enabled, ...storedConfig } = config;
  const nextStored = { ...storedConfig, updatedAt: new Date().toISOString(), lastActorId: actorId };
  guildManager.saveGuildSection(guildId, 'social', nextStored, guild);
  guildManager.setModuleEnabled(guildId, 'social', enabled === true, guild);
  return { ...nextStored, enabled: enabled === true };
}

function embed(config, title, description, requestedBy) {
  return new EmbedBuilder().setColor(config.enabled ? 0x5865F2 : 0x747F8D).setTitle(title).setDescription(description).setFooter({ text: `Requested by ${requestedBy}` }).setTimestamp();
}

function navigation(active = 'main') {
  return row(
    button(active === 'main' ? 'admin:studio:socialStudio' : `${P}main`, '⬅️ Back'),
    button(`${P}settings`, '⚙️ Settings', ButtonStyle.Secondary, active === 'settings'),
    button(`${P}next`, 'Next ➡️', ButtonStyle.Secondary, true),
  );
}

function buildSocialAdminPanel(guild, requestedBy = 'Unknown User') {
  const config = getConfig(guild.id);
  const creatorCount = Object.keys(config.creators).length;
  const accountCount = Object.keys(config.accounts).length;
  const ready = creatorCount > 0 && accountCount > 0 && Boolean(config.alertsChannelId);
  const description = ready
    ? [
      '✅ **Social Studio is ready.**',
      '',
      'Use the buttons below to manage creators, linked accounts, notifications and how alerts are delivered.',
      '',
      '**Main sections**',
      '• **Creator Profiles** — manage the people or brands being monitored.',
      '• **Accounts** — add and link social-platform accounts.',
      '• **Notifications** — enable or disable creator alerts.',
      '• **Templates** — change how alerts look.',
      '• **Feeds** — choose where notifications are routed.',
      '• **Channels** — set the Discord alert channel.',
    ].join('\n')
    : [
      '⚠️ **Setup required**',
      '',
      'Complete these steps in order to start sending creator notifications:',
      '',
      '1️⃣ **Creator Profiles** — create the streamer, creator or organisation you want to monitor.',
      '2️⃣ **Accounts** — add their Twitch, YouTube, Kick, TikTok or other supported account.',
      '3️⃣ **Channels** — choose the Discord channel where alerts should be posted.',
      '4️⃣ **Notifications** — enable Social Studio alerts for this server.',
      '',
      '**Optional:** Use **Templates** to change how alerts look and **Feeds** to control routing.',
    ].join('\n');

  return {
    embeds: [embed(config, '📣 Social Studio', description, requestedBy)],
    components: [
      row(button(`${P}creators`, '👥 Creator Profiles', ButtonStyle.Primary), button(`${P}accounts`, '🔗 Accounts', ButtonStyle.Primary), button(`${P}notifications`, '📢 Notifications', ButtonStyle.Primary)),
      row(button(`${P}templates`, '🎨 Templates'), button(`${P}feeds`, '📡 Feeds'), button(`${P}channels`, '📂 Channels')),
      navigation('main'),
    ],
  };
}

function channelSelector(id, selectedId, placeholder) {
  const menu = new ChannelSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1);
  if (selectedId) menu.setDefaultChannels([selectedId]);
  return row(menu);
}

function roleSelector(roleIds) {
  const menu = new RoleSelectMenuBuilder().setCustomId(`${P}roles:select`).setPlaceholder('Select Social Studio manager roles').setMinValues(0).setMaxValues(10);
  if (roleIds?.length) menu.setDefaultRoles(roleIds.slice(0, 10));
  return row(menu);
}

function buildSectionPanel(interaction, section) {
  const config = getConfig(interaction.guildId);
  const accounts = Object.values(config.accounts);
  const creators = Object.values(config.creators);
  const requestedBy = who(interaction);

  if (section === 'creators') {
    const list = creators.slice(0, 10).map((creator) => `• **${creator.displayName}** · ${(creator.accountIds || []).length} account(s)`).join('\n') || 'No creator profiles have been created.';
    return { embeds: [embed(config, '👥 Creator Profiles', 'Create and manage unified creator profiles.', requestedBy).addFields({ name: `Profiles (${creators.length})`, value: list })], components: [row(button(`${P}creator:new`, '➕ New Profile', ButtonStyle.Success), button(`${P}creator:rebuild`, '🔄 Rebuild Profiles')), navigation('creators')] };
  }
  if (section === 'accounts') {
    const list = accounts.slice(0, 10).map((account) => `• **${account.displayName || account.username}** · ${account.platform} · ${account.enabled === false ? 'disabled' : 'enabled'}`).join('\n') || 'No platform accounts have been added.';
    return { embeds: [embed(config, '🔗 Accounts', 'Connect social platform accounts to Social Studio.', requestedBy).addFields({ name: `Accounts (${accounts.length})`, value: list })], components: [row(button(`${P}account:new`, '➕ Add Account', ButtonStyle.Success), button(`${P}account:check`, '🔎 Check All', ButtonStyle.Primary, !accounts.length)), navigation('accounts')] };
  }
  if (section === 'notifications') {
    return { embeds: [embed(config, '📢 Notifications', 'Control whether Social Studio sends creator notifications for this server.', requestedBy).addFields({ name: 'Module status', value: config.enabled ? 'Enabled ✅' : 'Disabled ❌', inline: true }, { name: 'Default channel', value: config.alertsChannelId ? `<#${config.alertsChannelId}>` : 'Not configured', inline: true }, { name: 'Supported alerts', value: ALERT_TYPES.map((type) => `\`${type}\``).join(' ') })], components: [row(button(`${P}toggle`, config.enabled ? '⏸️ Disable Notifications' : '▶️ Enable Notifications', config.enabled ? ButtonStyle.Danger : ButtonStyle.Success)), navigation('notifications')] };
  }
  if (section === 'templates') return { embeds: [embed(config, '🎨 Templates', 'Edit the message used for each notification type.', requestedBy)], components: [row(...ALERT_TYPES.map((type) => button(`${P}template:${type}`, type.charAt(0).toUpperCase() + type.slice(1), ButtonStyle.Primary))), navigation('templates')] };
  if (section === 'feeds') return { embeds: [embed(config, '📡 Feeds', 'Choose the default destination used by creator notifications.', requestedBy)], components: [channelSelector(`${P}feed:channel`, config.alertsChannelId, 'Select the default notification feed'), navigation('feeds')] };
  if (section === 'channels') return { embeds: [embed(config, '📂 Channels', 'Configure the Discord channel used by Social Studio.', requestedBy)], components: [channelSelector(`${P}channel:alerts`, config.alertsChannelId, 'Select the Social Studio alert channel'), navigation('channels')] };
  if (section === 'settings') return { embeds: [embed(config, '⚙️ Social Studio Settings', 'Guild-level Social Studio configuration.', requestedBy)], components: [row(button(`${P}permissions`, '🔐 Permissions', ButtonStyle.Primary), button(`${P}roles`, '👥 Roles', ButtonStyle.Primary), button(`${P}automation`, '⚡ Automation', ButtonStyle.Primary)), row(button(`${P}testing`, '🧪 Testing'), button(`${P}data`, '🗄️ Data')), navigation('settings')] };

  const descriptions = { permissions: 'Control which server roles may manage Social Studio.', roles: 'Assign the Discord roles used by Social Studio managers and notifications.', automation: 'Configure automatic monitoring and notification behaviour.', testing: 'Send a safe test notification.', data: 'Refresh or rebuild Social Studio guild data.' };
  const components = [];
  if (section === 'permissions' || section === 'roles') components.push(roleSelector(config.managerRoleIds));
  if (section === 'automation') components.push(row(button(`${P}toggle`, config.enabled ? 'Disable Module' : 'Enable Module', config.enabled ? ButtonStyle.Danger : ButtonStyle.Success), button(`${P}account:check`, 'Run Check Now', ButtonStyle.Primary, !accounts.length)));
  if (section === 'testing') components.push(row(button(`${P}test`, 'Send Test Notification', ButtonStyle.Primary, !config.alertsChannelId)));
  if (section === 'data') components.push(row(button(`${P}data:refresh`, '🔄 Refresh'), button(`${P}creator:rebuild`, 'Rebuild Profiles')));
  components.push(navigation(section));
  return { embeds: [embed(config, `${section.charAt(0).toUpperCase() + section.slice(1)}`, descriptions[section] || 'Social Studio settings.', requestedBy)], components };
}

function creatorModal() {
  return new ModalBuilder().setCustomId(`${P}creator:create`).setTitle('Create Creator Profile').addComponents(
    row(new TextInputBuilder().setCustomId('displayName').setLabel('Creator display name').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(true)),
    row(new TextInputBuilder().setCustomId('group').setLabel('Group or team').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(false)),
    row(new TextInputBuilder().setCustomId('tags').setLabel('Tags (comma separated)').setStyle(TextInputStyle.Short).setMaxLength(300).setRequired(false)),
    row(new TextInputBuilder().setCustomId('notes').setLabel('Notes').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(false)),
  );
}

function accountModal() {
  return new ModalBuilder().setCustomId(`${P}account:create`).setTitle('Add Social Account').addComponents(
    row(new TextInputBuilder().setCustomId('platform').setLabel('Platform').setPlaceholder(PLATFORMS.join(', ')).setStyle(TextInputStyle.Short).setMaxLength(20).setRequired(true)),
    row(new TextInputBuilder().setCustomId('username').setLabel('Username, channel ID or URL').setStyle(TextInputStyle.Short).setMaxLength(500).setRequired(true)),
    row(new TextInputBuilder().setCustomId('displayName').setLabel('Display name').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(false)),
  );
}

function templateModal(type, config) {
  const template = config.templates?.[type] || {};
  return new ModalBuilder().setCustomId(`${P}template:save:${type}`).setTitle(`${type.charAt(0).toUpperCase() + type.slice(1)} Template`).addComponents(
    row(new TextInputBuilder().setCustomId('title').setLabel('Embed title').setStyle(TextInputStyle.Short).setMaxLength(256).setValue(String(template.title || '{creator} alert')).setRequired(true)),
    row(new TextInputBuilder().setCustomId('description').setLabel('Embed description').setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setValue(String(template.description || '{title}')).setRequired(true)),
    row(new TextInputBuilder().setCustomId('buttonLabel').setLabel('Link button label').setStyle(TextInputStyle.Short).setMaxLength(80).setValue(String(template.buttonLabel || 'Watch now')).setRequired(true)),
  );
}

async function respond(interaction, payload) { if (interaction.deferred || interaction.replied) await interaction.editReply(payload); else await interaction.update(payload); return true; }
async function replyEphemeral(interaction, content) { if (interaction.deferred || interaction.replied) await interaction.followUp({ content, flags: 64 }); else await interaction.reply({ content, flags: 64 }); return true; }
async function refreshAfterModal(interaction, section, fallbackMessage) {
  if (interaction.isFromMessage?.() && !interaction.deferred && !interaction.replied) {
    await interaction.update(buildSectionPanel(interaction, section));
    return true;
  }
  return replyEphemeral(interaction, fallbackMessage);
}

async function handleSocialAdminInteraction(interaction) {
  const id = String(interaction?.customId || '');
  if (id !== 'admin:social' && !id.startsWith(P)) return false;
  if (!interaction.guild?.id) throw new Error('Social Studio requires a guild interaction.');
  const config = getConfig(interaction.guildId);
  const actorId = interaction.user?.id || null;

  if (id === 'admin:social' || id === `${P}main`) return respond(interaction, buildSocialAdminPanel(interaction.guild, who(interaction)));
  if (id === `${P}next`) return true;
  if (id === `${P}data:refresh`) return respond(interaction, buildSectionPanel(interaction, 'data'));
  if (id === `${P}creator:new`) { await interaction.showModal(creatorModal()); return true; }
  if (id === `${P}account:new`) { await interaction.showModal(accountModal()); return true; }
  if (id.startsWith(`${P}template:`) && !id.startsWith(`${P}template:save:`)) { const type = id.split(':')[2]; if (!ALERT_TYPES.includes(type)) throw new Error('Unknown notification template.'); await interaction.showModal(templateModal(type, config)); return true; }

  if (id === `${P}creator:create`) {
    const displayName = interaction.fields.getTextInputValue('displayName').trim();
    if (!displayName) throw new Error('Creator display name is required.');
    const creatorId = makeId('creator');
    config.creators[creatorId] = { creatorId, displayName, group: interaction.fields.getTextInputValue('group').trim(), tags: interaction.fields.getTextInputValue('tags').split(',').map((v) => v.trim()).filter(Boolean), notes: interaction.fields.getTextInputValue('notes').trim(), enabled: true, accountIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    saveConfig(interaction.guildId, config, interaction.guild, actorId);
    return refreshAfterModal(interaction, 'creators', '✅ Creator profile created.');
  }
  if (id === `${P}account:create`) {
    const platform = interaction.fields.getTextInputValue('platform').trim().toLowerCase();
    if (!PLATFORMS.includes(platform)) throw new Error(`Platform must be one of: ${PLATFORMS.join(', ')}.`);
    const username = interaction.fields.getTextInputValue('username').trim();
    if (!username) throw new Error('Username, channel ID or URL is required.');
    const accountId = makeId('account');
    config.accounts[accountId] = { accountId, platform, username, displayName: interaction.fields.getTextInputValue('displayName').trim() || username, enabled: true, alertTypes: ['live'], alertChannelId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    saveConfig(interaction.guildId, config, interaction.guild, actorId);
    return refreshAfterModal(interaction, 'accounts', '✅ Social account added.');
  }
  if (id.startsWith(`${P}template:save:`)) {
    const type = id.split(':')[3];
    if (!ALERT_TYPES.includes(type)) throw new Error('Unknown notification template.');
    config.templates[type] = { title: interaction.fields.getTextInputValue('title'), description: interaction.fields.getTextInputValue('description'), buttonLabel: interaction.fields.getTextInputValue('buttonLabel') };
    saveConfig(interaction.guildId, config, interaction.guild, actorId);
    return refreshAfterModal(interaction, 'templates', `✅ ${type} template saved.`);
  }
  if (id === `${P}feed:channel` || id === `${P}channel:alerts`) { config.alertsChannelId = interaction.values?.[0] || null; saveConfig(interaction.guildId, config, interaction.guild, actorId); return respond(interaction, buildSectionPanel(interaction, id.includes('feed') ? 'feeds' : 'channels')); }
  if (id === `${P}roles:select`) { config.managerRoleIds = interaction.values || []; saveConfig(interaction.guildId, config, interaction.guild, actorId); return respond(interaction, buildSectionPanel(interaction, 'roles')); }
  if (id === `${P}toggle`) { config.enabled = !config.enabled; saveConfig(interaction.guildId, config, interaction.guild, actorId); return respond(interaction, buildSectionPanel(interaction, 'notifications')); }
  if (id === `${P}account:check`) { await interaction.deferUpdate(); const count = Object.values(config.accounts).filter((a) => a.enabled !== false).length; config.analytics.checks = Number(config.analytics.checks || 0) + count; saveConfig(interaction.guildId, config, interaction.guild, actorId); await interaction.editReply(buildSectionPanel(interaction, 'accounts')); return true; }
  if (id === `${P}creator:rebuild`) { const linked = new Set(Object.values(config.creators).flatMap((c) => c.accountIds || [])); for (const account of Object.values(config.accounts)) { if (linked.has(account.accountId)) continue; const creatorId = makeId('creator'); config.creators[creatorId] = { creatorId, displayName: account.displayName || account.username, group: '', tags: [account.platform], notes: '', enabled: true, accountIds: [account.accountId], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; } saveConfig(interaction.guildId, config, interaction.guild, actorId); return respond(interaction, buildSectionPanel(interaction, 'creators')); }
  if (id === `${P}test`) { if (!config.alertsChannelId) throw new Error('Choose an alert channel first.'); const channel = interaction.guild.channels.cache.get(config.alertsChannelId) || await interaction.guild.channels.fetch(config.alertsChannelId).catch(() => null); if (!channel?.isTextBased?.() || typeof channel.send !== 'function') throw new Error('The configured alert channel is unavailable.'); await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📣 Social Studio Test').setDescription('Your Social Studio notification channel is working.').setTimestamp()] }); return replyEphemeral(interaction, `✅ Test notification sent to <#${config.alertsChannelId}>.`); }

  const section = id.slice(P.length);
  if (NAV_SECTIONS.has(section)) return respond(interaction, buildSectionPanel(interaction, section));
  throw new Error(`Unknown Social Studio interaction: ${id}`);
}

module.exports = { buildPanel: buildSocialAdminPanel, handleInteraction: handleSocialAdminInteraction, buildSocialAdminPanel, buildSectionPanel, handleSocialAdminInteraction };