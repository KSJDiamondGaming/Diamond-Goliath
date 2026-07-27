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

function makeId(prefix) { return `${prefix}_${crypto.randomBytes(8).toString('hex')}`; }
function name(interaction) { return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User'; }
function row(...components) { return new ActionRowBuilder().addComponents(...components); }
function button(customId, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
}

function getConfig(guildId) {
  const section = guildManager.getGuildSection(guildId, 'social', {}) || {};
  return {
    ...section,
    enabled: section.enabled === true,
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
  const next = { ...config, updatedAt: new Date().toISOString(), lastActorId: actorId };
  guildManager.saveGuildSection(guildId, 'social', next, guild);
  guildManager.setModuleEnabled(guildId, 'social', next.enabled === true, guild);
  return next;
}

function baseEmbed(config, title, description, who) {
  return new EmbedBuilder()
    .setColor(config.enabled ? 0x5865F2 : 0x747F8D)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `Requested by ${who}` })
    .setTimestamp();
}

function navigation(active = 'main') {
  return row(
    button(active === 'main' ? 'admin:studio:socialStudio' : 'admin:social:main', '⬅️ Back'),
    button('admin:social:settings', '⚙️ Settings', ButtonStyle.Secondary, active === 'settings'),
    button('admin:social:next', 'Next ➡️', ButtonStyle.Secondary, true),
  );
}

function buildSocialAdminPanel(guild, who = 'Unknown User') {
  const config = getConfig(guild.id);
  return {
    embeds: [baseEmbed(config, '📣 Social Studio', 'Manage creator profiles, linked accounts, notifications, templates, feeds and Discord channels.', who)],
    components: [
      row(
        button('admin:social:creators', '👥 Creator Profiles', ButtonStyle.Primary),
        button('admin:social:accounts', '🔗 Accounts', ButtonStyle.Primary),
        button('admin:social:notifications', '📢 Notifications', ButtonStyle.Primary),
      ),
      row(
        button('admin:social:templates', '🎨 Templates'),
        button('admin:social:feeds', '📡 Feeds'),
        button('admin:social:channels', '📂 Channels'),
      ),
      navigation('main'),
    ],
  };
}

function channelSelector(customId, selectedId, placeholder) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  if (selectedId) select.setDefaultChannels([selectedId]);
  return row(select);
}

function roleSelector(customId, roleIds) {
  const select = new RoleSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Select Social Studio manager roles')
    .setMinValues(0)
    .setMaxValues(10);
  if (roleIds?.length) select.setDefaultRoles(roleIds.slice(0, 10));
  return row(select);
}

function buildSectionPanel(interaction, section) {
  const config = getConfig(interaction.guildId);
  const accounts = Object.values(config.accounts);
  const creators = Object.values(config.creators);
  const who = name(interaction);

  if (section === 'creators') {
    const list = creators.slice(0, 10).map((creator) => `• **${creator.displayName}** · ${(creator.accountIds || []).length} account(s)`).join('\n') || 'No creator profiles have been created.';
    return {
      embeds: [baseEmbed(config, '👥 Creator Profiles', 'Create and manage unified creator profiles.', who).addFields({ name: `Profiles (${creators.length})`, value: list })],
      components: [row(button('admin:social:creator:new', '➕ New Profile', ButtonStyle.Success), button('admin:social:creator:rebuild', '🔄 Rebuild Profiles')), navigation('creators')],
    };
  }

  if (section === 'accounts') {
    const list = accounts.slice(0, 10).map((account) => `• **${account.displayName || account.username}** · ${account.platform} · ${account.enabled === false ? 'disabled' : 'enabled'}`).join('\n') || 'No platform accounts have been added.';
    return {
      embeds: [baseEmbed(config, '🔗 Accounts', 'Connect social platform accounts to Social Studio.', who).addFields({ name: `Accounts (${accounts.length})`, value: list })],
      components: [row(button('admin:social:account:new', '➕ Add Account', ButtonStyle.Success), button('admin:social:account:check', '🔎 Check All', ButtonStyle.Primary, !accounts.length)), navigation('accounts')],
    };
  }

  if (section === 'notifications') {
    return {
      embeds: [baseEmbed(config, '📢 Notifications', 'Control whether Social Studio sends creator notifications for this server.', who).addFields(
        { name: 'Module status', value: config.enabled ? 'Enabled ✅' : 'Disabled ❌', inline: true },
        { name: 'Default channel', value: config.alertsChannelId ? `<#${config.alertsChannelId}>` : 'Not configured', inline: true },
        { name: 'Supported alerts', value: ALERT_TYPES.map((type) => `\`${type}\``).join(' '), inline: false },
      )],
      components: [row(button('admin:social:toggle', config.enabled ? '⏸️ Disable Notifications' : '▶️ Enable Notifications', config.enabled ? ButtonStyle.Danger : ButtonStyle.Success)), navigation('notifications')],
    };
  }

  if (section === 'templates') {
    return {
      embeds: [baseEmbed(config, '🎨 Templates', 'Edit the message used for each notification type.', who)],
      components: [row(...ALERT_TYPES.map((type) => button(`admin:social:template:${type}`, type.charAt(0).toUpperCase() + type.slice(1), ButtonStyle.Primary))), navigation('templates')],
    };
  }

  if (section === 'feeds') {
    return {
      embeds: [baseEmbed(config, '📡 Feeds', 'Choose the default destination used by creator notifications.', who).addFields({ name: 'Current feed', value: config.alertsChannelId ? `<#${config.alertsChannelId}>` : 'Not configured' })],
      components: [channelSelector('admin:social:feed:channel', config.alertsChannelId, 'Select the default notification feed'), navigation('feeds')],
    };
  }

  if (section === 'channels') {
    return {
      embeds: [baseEmbed(config, '📂 Channels', 'Configure the Discord channel used by Social Studio.', who).addFields({ name: 'Alert channel', value: config.alertsChannelId ? `<#${config.alertsChannelId}>` : 'Not configured' })],
      components: [channelSelector('admin:social:channel:alerts', config.alertsChannelId, 'Select the Social Studio alert channel'), navigation('channels')],
    };
  }

  if (section === 'settings') {
    return {
      embeds: [baseEmbed(config, '⚙️ Social Studio Settings', 'Guild-level Social Studio configuration.', who)],
      components: [
        row(button('admin:social:permissions', '🔐 Permissions', ButtonStyle.Primary), button('admin:social:roles', '👥 Roles', ButtonStyle.Primary), button('admin:social:automation', '⚡ Automation', ButtonStyle.Primary)),
        row(button('admin:social:testing', '🧪 Testing'), button('admin:social:data', '🗄️ Data')),
        navigation('settings'),
      ],
    };
  }

  const descriptions = {
    permissions: 'Control which server roles may manage Social Studio.',
    roles: 'Assign the Discord roles used by Social Studio managers and notifications.',
    automation: 'Configure automatic monitoring and notification behaviour.',
    testing: 'Send a safe test notification.',
    data: 'Refresh or rebuild Social Studio guild data.',
  };
  const components = [];
  if (section === 'permissions' || section === 'roles') components.push(roleSelector('admin:social:roles:select', config.managerRoleIds));
  if (section === 'automation') components.push(row(button('admin:social:toggle', config.enabled ? 'Disable Module' : 'Enable Module', config.enabled ? ButtonStyle.Danger : ButtonStyle.Success), button('admin:social:account:check', 'Run Check Now', ButtonStyle.Primary, !accounts.length)));
  if (section === 'testing') components.push(row(button('admin:social:test', 'Send Test Notification', ButtonStyle.Primary, !config.alertsChannelId)));
  if (section === 'data') components.push(row(button('admin:social:data:refresh', '🔄 Refresh'), button('admin:social:creator:rebuild', 'Rebuild Profiles')));
  components.push(navigation(section));
  const icon = section === 'data' ? '🗄️' : section === 'testing' ? '🧪' : section === 'automation' ? '⚡' : section === 'roles' ? '👥' : '🔐';
  return { embeds: [baseEmbed(config, `${icon} ${section.charAt(0).toUpperCase() + section.slice(1)}`, descriptions[section] || 'Social Studio settings.', who)], components };
}

function creatorModal() {
  return new ModalBuilder().setCustomId('admin:social:creator:create').setTitle('Create Creator Profile').addComponents(
    row(new TextInputBuilder().setCustomId('displayName').setLabel('Creator display name').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(true)),
    row(new TextInputBuilder().setCustomId('group').setLabel('Group or team').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(false)),
    row(new TextInputBuilder().setCustomId('tags').setLabel('Tags (comma separated)').setStyle(TextInputStyle.Short).setMaxLength(300).setRequired(false)),
    row(new TextInputBuilder().setCustomId('notes').setLabel('Notes').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(false)),
  );
}

function accountModal() {
  return new ModalBuilder().setCustomId('admin:social:account:create').setTitle('Add Social Account').addComponents(
    row(new TextInputBuilder().setCustomId('platform').setLabel('Platform').setPlaceholder(PLATFORMS.join(', ')).setStyle(TextInputStyle.Short).setMaxLength(20).setRequired(true)),
    row(new TextInputBuilder().setCustomId('username').setLabel('Username, channel ID or URL').setStyle(TextInputStyle.Short).setMaxLength(500).setRequired(true)),
    row(new TextInputBuilder().setCustomId('displayName').setLabel('Display name').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(false)),
  );
}

function templateModal(type, config) {
  const template = config.templates?.[type] || {};
  return new ModalBuilder().setCustomId(`admin:social:template:save:${type}`).setTitle(`${type.charAt(0).toUpperCase() + type.slice(1)} Template`).addComponents(
    row(new TextInputBuilder().setCustomId('title').setLabel('Embed title').setStyle(TextInputStyle.Short).setMaxLength(256).setValue(String(template.title || '{creator} alert')).setRequired(true)),
    row(new TextInputBuilder().setCustomId('description').setLabel('Embed description').setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setValue(String(template.description || '{title}')).setRequired(true)),
    row(new TextInputBuilder().setCustomId('buttonLabel').setLabel('Link button label').setStyle(TextInputStyle.Short).setMaxLength(80).setValue(String(template.buttonLabel || 'Watch now')).setRequired(true)),
  );
}

async function respond(interaction, payload) {
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.update(payload);
  return true;
}

async function replyEphemeral(interaction, content) {
  if (interaction.deferred || interaction.replied) await interaction.followUp({ content, flags: 64 });
  else await interaction.reply({ content, flags: 64 });
  return true;
}

async function handleSocialAdminInteraction(interaction) {
  const customId = String(interaction?.customId || '');
  if (!customId.startsWith('admin:social')) return false;
  if (!interaction.guild?.id) throw new Error('Social Studio requires a guild interaction.');

  const config = getConfig(interaction.guildId);
  const actorId = interaction.user?.id || null;

  if (customId === 'admin:social' || customId === 'admin:social:main' || customId === 'admin:social:refresh') return respond(interaction, buildSocialAdminPanel(interaction.guild, name(interaction)));
  if (customId === 'admin:social:next') return true;
  if (customId === 'admin:social:data:refresh') return respond(interaction, buildSectionPanel(interaction, 'data'));

  if (customId === 'admin:social:creator:new') { await interaction.showModal(creatorModal()); return true; }
  if (customId === 'admin:social:account:new') { await interaction.showModal(accountModal()); return true; }
  if (customId.startsWith('admin:social:template:') && !customId.startsWith('admin:social:template:save:')) {
    const type = customId.split(':')[3];
    if (!ALERT_TYPES.includes(type)) throw new Error('Unknown notification template.');
    await interaction.showModal(templateModal(type, config));
    return true;
  }

  if (customId === 'admin:social:creator:create') {
    const displayName = interaction.fields.getTextInputValue('displayName').trim();
    if (!displayName) throw new Error('Creator display name is required.');
    const creatorId = makeId('creator');
    config.creators[creatorId] = {
      creatorId,
      displayName,
      group: interaction.fields.getTextInputValue('group').trim(),
      tags: interaction.fields.getTextInputValue('tags').split(',').map((value) => value.trim()).filter(Boolean),
      notes: interaction.fields.getTextInputValue('notes').trim(),
      enabled: true,
      accountIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveConfig(interaction.guildId, config, interaction.guild, actorId);
    return replyEphemeral(interaction, '✅ Creator profile created.');
  }

  if (customId === 'admin:social:account:create') {
    const platform = interaction.fields.getTextInputValue('platform').trim().toLowerCase();
    if (!PLATFORMS.includes(platform)) throw new Error(`Platform must be one of: ${PLATFORMS.join(', ')}.`);
    const username = interaction.fields.getTextInputValue('username').trim();
    if (!username) throw new Error('Username, channel ID or URL is required.');
    const accountId = makeId('account');
    config.accounts[accountId] = {
      accountId,
      platform,
      username,
      displayName: interaction.fields.getTextInputValue('displayName').trim() || username,
      enabled: true,
      alertTypes: ['live'],
      alertChannelId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveConfig(interaction.guildId, config, interaction.guild, actorId);
    return replyEphemeral(interaction, '✅ Social account added.');
  }

  if (customId.startsWith('admin:social:template:save:')) {
    const type = customId.split(':')[4];
    if (!ALERT_TYPES.includes(type)) throw new Error('Unknown notification template.');
    config.templates[type] = {
      title: interaction.fields.getTextInputValue('title'),
      description: interaction.fields.getTextInputValue('description'),
      buttonLabel: interaction.fields.getTextInputValue('buttonLabel'),
    };
    saveConfig(interaction.guildId, config, interaction.guild, actorId);
    return replyEphemeral(interaction, `✅ ${type} template saved.`);
  }

  if (customId === 'admin:social:feed:channel' || customId === 'admin:social:channel:alerts') {
    config.alertsChannelId = interaction.values?.[0] || null;
    saveConfig(interaction.guildId, config, interaction.guild, actorId);
    return respond(interaction, buildSectionPanel(interaction, customId.includes('feed') ? 'feeds' : 'channels'));
  }

  if (customId === 'admin:social:roles:select') {
    config.managerRoleIds = interaction.values || [];
    saveConfig(interaction.guildId, config, interaction.guild, actorId);
    return respond(interaction, buildSectionPanel(interaction, 'roles'));
  }

  if (customId === 'admin:social:toggle') {
    config.enabled = !config.enabled;
    saveConfig(interaction.guildId, config, interaction.guild, actorId);
    return respond(interaction, buildSectionPanel(interaction, 'notifications'));
  }

  if (customId === 'admin:social:account:check') {
    await interaction.deferUpdate();
    const count = Object.values(config.accounts).filter((account) => account.enabled !== false).length;
    config.analytics.checks = Number(config.analytics.checks || 0) + count;
    config.history.push({ id: makeId('history'), createdAt: new Date().toISOString(), status: 'checked', creator: 'All creators', checked: count, actorId });
    config.history = config.history.slice(-1000);
    saveConfig(interaction.guildId, config, interaction.guild, actorId);
    await interaction.editReply(buildSectionPanel(interaction, 'accounts'));
    return true;
  }

  if (customId === 'admin:social:creator:rebuild') {
    const linked = new Set(Object.values(config.creators).flatMap((creator) => creator.accountIds || []));
    for (const account of Object.values(config.accounts)) {
      if (linked.has(account.accountId)) continue;
      const creatorId = makeId('creator');
      config.creators[creatorId] = { creatorId, displayName: account.displayName || account.username, group: '', tags: [account.platform], notes: '', enabled: true, accountIds: [account.accountId], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    }
    saveConfig(interaction.guildId, config, interaction.guild, actorId);
    return respond(interaction, buildSectionPanel(interaction, 'creators'));
  }

  if (customId === 'admin:social:test') {
    if (!config.alertsChannelId) throw new Error('Choose an alert channel first.');
    const channel = interaction.guild.channels.cache.get(config.alertsChannelId) || await interaction.guild.channels.fetch(config.alertsChannelId).catch(() => null);
    if (!channel?.isTextBased?.() || typeof channel.send !== 'function') throw new Error('The configured alert channel is unavailable.');
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📣 Social Studio Test').setDescription('Your Social Studio notification channel is working.').setTimestamp()] });
    return replyEphemeral(interaction, `✅ Test notification sent to <#${config.alertsChannelId}>.`);
  }

  const section = customId.split(':')[2];
  if (NAV_SECTIONS.has(section) && customId === `admin:social:${section}`) return respond(interaction, buildSectionPanel(interaction, section));

  throw new Error(`Unknown Social Studio interaction: ${customId}`);
}

module.exports = {
  buildPanel: buildSocialAdminPanel,
  handleInteraction: handleSocialAdminInteraction,
  buildSocialAdminPanel,
  buildSectionPanel,
  handleSocialAdminInteraction,
};
