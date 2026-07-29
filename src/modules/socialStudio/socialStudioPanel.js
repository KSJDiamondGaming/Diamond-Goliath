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
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const crypto = require('crypto');
const guildManager = require('../../core/guild/guildManager');

const PLATFORMS = ['twitch', 'youtube', 'tiktok', 'kick', 'facebook', 'instagram', 'x'];
const PLATFORM_LABELS = { twitch: 'Twitch', youtube: 'YouTube', tiktok: 'TikTok', kick: 'Kick', facebook: 'Facebook', instagram: 'Instagram', x: 'X' };
const PLATFORM_ICONS = { twitch: '🟣', youtube: '🔴', tiktok: '⚫', kick: '🟢', facebook: '🔵', instagram: '🟠', x: '⚪' };
const ALERT_TYPES = ['live', 'upload', 'short', 'post'];
const NAV_SECTIONS = new Set(['creators', 'accounts', 'notifications', 'templates', 'feeds', 'channels', 'settings', 'permissions', 'roles', 'automation', 'testing', 'data']);
const P = 'social:';
const PAGE_SIZE = 25;
const accountSetupSessions = new Map();
const creatorViewSessions = new Map();

const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const makeId = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const who = (interaction) => interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';
const sessionKey = (interaction) => `${interaction.guildId}:${interaction.user?.id || 'unknown'}`;

function getConfig(guildId) {
  const guildData = guildManager.reloadGuild(guildId);
  const section = guildData?.modules?.social && typeof guildData.modules.social === 'object' ? guildData.modules.social : {};
  return {
    ...section,
    enabled: section.enabled !== false,
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
  const next = { ...config, enabled: config.enabled !== false, updatedAt: new Date().toISOString(), lastActorId: actorId };
  guildManager.replaceGuildSection(guildId, 'social', next, guild);
  const persisted = guildManager.reloadGuild(guildId)?.modules?.social;
  if (!persisted || typeof persisted !== 'object') throw new Error('Social Studio could not verify its saved guild data.');
  for (const id of Object.keys(next.creators || {})) if (!persisted.creators?.[id]) throw new Error(`Creator profile ${id} was not persisted.`);
  for (const id of Object.keys(next.accounts || {})) if (!persisted.accounts?.[id]) throw new Error(`Social account ${id} was not persisted.`);
  return { ...persisted, enabled: persisted.enabled !== false };
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

function getAccountSetup(interaction) { return accountSetupSessions.get(sessionKey(interaction)) || { creatorId: null, platforms: [] }; }
function setAccountSetup(interaction, patch) { const next = { ...getAccountSetup(interaction), ...patch }; accountSetupSessions.set(sessionKey(interaction), next); return next; }
function getCreatorView(interaction) { return creatorViewSessions.get(sessionKey(interaction)) || { creatorId: null, page: 0 }; }
function setCreatorView(interaction, patch) { const next = { ...getCreatorView(interaction), ...patch }; creatorViewSessions.set(sessionKey(interaction), next); return next; }

function buildSocialAdminPanel(guild, requestedBy = 'Unknown User') {
  const config = getConfig(guild.id);
  const creatorCount = Object.keys(config.creators).length;
  const accountCount = Object.keys(config.accounts).length;
  const ready = creatorCount > 0 && accountCount > 0 && Boolean(config.alertsChannelId);
  const description = ready
    ? ['✅ **Social Studio is ready.**', '', 'Use the buttons below to manage creators, linked accounts, notifications and how alerts are delivered.'].join('\n')
    : ['⚠️ **Setup required**', '', 'Complete these steps in order:', '', '1️⃣ **Creator Profiles**', '2️⃣ **Accounts**', '3️⃣ **Channels**', '4️⃣ **Notifications**', '', '**Optional:** Templates and Feeds.'].join('\n');
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

function creatorAccountSelect(creators, selectedCreatorId) {
  return row(new StringSelectMenuBuilder().setCustomId(`${P}account:creator`).setPlaceholder('1. Select the creator profile').setMinValues(1).setMaxValues(1).addOptions(creators.slice(0, 25).map((creator) => ({ label: String(creator.displayName || 'Unnamed creator').slice(0, 100), value: creator.creatorId, description: `${(creator.accountIds || []).length} linked account(s)`.slice(0, 100), default: creator.creatorId === selectedCreatorId }))));
}

function creatorProfileSelect(creators, view) {
  const pageCount = Math.max(1, Math.ceil(creators.length / PAGE_SIZE));
  const page = Math.min(Math.max(0, Number(view.page || 0)), pageCount - 1);
  const items = creators.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (!items.length) return null;
  return row(new StringSelectMenuBuilder().setCustomId(`${P}creator:select`).setPlaceholder(`Select a creator profile · Page ${page + 1}/${pageCount}`).setMinValues(1).setMaxValues(1).addOptions(items.map((creator) => ({ label: String(creator.displayName || 'Unnamed creator').slice(0, 100), value: creator.creatorId, description: `${(creator.accountIds || []).length} linked account(s)`.slice(0, 100), default: creator.creatorId === view.creatorId }))));
}

function platformSelect(selected = []) {
  return row(new StringSelectMenuBuilder().setCustomId(`${P}account:platforms`).setPlaceholder('2. Select one or more platforms').setMinValues(1).setMaxValues(5).addOptions(PLATFORMS.map((platform) => ({ label: PLATFORM_LABELS[platform], value: platform, default: selected.includes(platform) }))));
}

function accountDetailsModal(platforms) {
  const modal = new ModalBuilder().setCustomId(`${P}account:create-multi`).setTitle('Add Social Accounts');
  for (const platform of platforms.slice(0, 5)) modal.addComponents(row(new TextInputBuilder().setCustomId(`account_${platform}`).setLabel(`${PLATFORM_LABELS[platform]} username, channel ID or URL`).setStyle(TextInputStyle.Short).setMaxLength(500).setRequired(true)));
  return modal;
}

function creatorModal(creator = null) {
  const editing = Boolean(creator);
  return new ModalBuilder().setCustomId(editing ? `${P}creator:update:${creator.creatorId}` : `${P}creator:create`).setTitle(editing ? 'Edit Creator Profile' : 'Create Creator Profile').addComponents(
    row(new TextInputBuilder().setCustomId('displayName').setLabel('Creator display name').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(true).setValue(String(creator?.displayName || ''))),
    row(new TextInputBuilder().setCustomId('group').setLabel('Group or team').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(false).setValue(String(creator?.group || ''))),
    row(new TextInputBuilder().setCustomId('tags').setLabel('Tags (comma separated)').setStyle(TextInputStyle.Short).setMaxLength(300).setRequired(false).setValue(Array.isArray(creator?.tags) ? creator.tags.join(', ') : '')),
    row(new TextInputBuilder().setCustomId('notes').setLabel('Notes').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(false).setValue(String(creator?.notes || ''))),
  );
}

function templateModal(type, config) {
  const current = config.templates?.[type] || {};
  return new ModalBuilder().setCustomId(`${P}template:save:${type}`).setTitle(`${type.charAt(0).toUpperCase() + type.slice(1)} Template`).addComponents(
    row(new TextInputBuilder().setCustomId('title').setLabel('Embed title').setStyle(TextInputStyle.Short).setMaxLength(256).setValue(String(current.title || '{creator} alert')).setRequired(true)),
    row(new TextInputBuilder().setCustomId('description').setLabel('Embed description').setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setValue(String(current.description || '{title}')).setRequired(true)),
    row(new TextInputBuilder().setCustomId('buttonLabel').setLabel('Link button label').setStyle(TextInputStyle.Short).setMaxLength(80).setValue(String(current.buttonLabel || 'Watch now')).setRequired(true)),
  );
}

function buildCreatorPanel(interaction, config, creators, requestedBy) {
  const view = getCreatorView(interaction);
  const pageCount = Math.max(1, Math.ceil(creators.length / PAGE_SIZE));
  if (view.page >= pageCount) setCreatorView(interaction, { page: pageCount - 1 });
  const active = config.creators[getCreatorView(interaction).creatorId] || null;
  if (getCreatorView(interaction).creatorId && !active) setCreatorView(interaction, { creatorId: null });
  const linked = active ? (active.accountIds || []).map((id) => config.accounts[id]).filter(Boolean) : [];
  const description = active
    ? [`👤 **${active.displayName}**`, '', '**Platforms**', ...(linked.length ? linked.map((account) => `${PLATFORM_ICONS[account.platform] || '🔗'} **${PLATFORM_LABELS[account.platform] || account.platform}** — ${account.username}`) : ['No linked social accounts.']), '', `**Status:** ${active.enabled === false ? '🔴 Disabled' : linked.length ? '🟢 Monitoring' : '🟡 Waiting for accounts'}`, `**Accounts:** ${linked.length}`].join('\n')
    : `Select a creator profile below to view and manage it.\n\n**Profiles:** ${creators.length}\n**Selected:** None`;
  const components = [];
  const selector = creatorProfileSelect(creators, getCreatorView(interaction));
  if (selector) components.push(selector);
  components.push(row(button(`${P}creator:new`, '➕ New Profile', ButtonStyle.Success), button(`${P}creator:edit`, '✏️ Edit Profile', ButtonStyle.Primary, !active), button(`${P}creator:rebuild`, '🔄 Rebuild Profiles')));
  if (pageCount > 1) components.push(row(button(`${P}creator:page:prev`, '◀ Previous', ButtonStyle.Secondary, getCreatorView(interaction).page <= 0), button(`${P}creator:page:next`, 'Next ▶', ButtonStyle.Secondary, getCreatorView(interaction).page >= pageCount - 1)));
  components.push(navigation('creators'));
  return { embeds: [embed(config, '👥 Creator Profiles', description, requestedBy)], components };
}

function buildCreatorEditPanel(interaction, config, creator, requestedBy) {
  return {
    embeds: [embed(config, '✏️ Edit Creator Profile', [`👤 **${creator.displayName}**`, '', `**Group / Team:** ${creator.group || 'Not set'}`, `**Tags:** ${creator.tags?.length ? creator.tags.join(', ') : 'None'}`, `**Notes:** ${creator.notes || 'None'}`, `**Status:** ${creator.enabled === false ? '🔴 Disabled' : '🟢 Enabled'}`].join('\n'), requestedBy)],
    components: [
      row(button(`${P}creator:change`, '📝 Change Details', ButtonStyle.Primary), button(`${P}creator:toggle`, creator.enabled === false ? '▶️ Enable' : '⏸️ Disable', creator.enabled === false ? ButtonStyle.Success : ButtonStyle.Secondary), button(`${P}accounts`, '🔗 Manage Accounts')),
      row(button(`${P}creator:delete`, '🗑️ Delete Profile', ButtonStyle.Danger), button(`${P}creators`, '⬅️ Back to Profile')),
      navigation('creators'),
    ],
  };
}

function buildSectionPanel(interaction, section) {
  const config = getConfig(interaction.guildId);
  const accounts = Object.values(config.accounts);
  const creators = Object.values(config.creators).sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')));
  const requestedBy = who(interaction);
  if (section === 'creators') return buildCreatorPanel(interaction, config, creators, requestedBy);
  if (section === 'accounts') {
    const setup = getAccountSetup(interaction);
    const ownerByAccount = new Map();
    for (const creator of creators) for (const accountId of creator.accountIds || []) ownerByAccount.set(accountId, creator.displayName);
    const list = accounts.slice(0, 10).map((account) => `• **${PLATFORM_LABELS[account.platform] || account.platform}** · ${account.username} · ${ownerByAccount.get(account.accountId) ? `linked to **${ownerByAccount.get(account.accountId)}**` : '⚠️ unlinked'}`).join('\n') || 'No platform accounts have been added.';
    const components = [];
    if (creators.length) {
      components.push(creatorAccountSelect(creators, setup.creatorId));
      components.push(platformSelect(setup.platforms));
      components.push(row(button(`${P}account:continue`, 'Continue ➡️', ButtonStyle.Success, !setup.creatorId || !setup.platforms.length), button(`${P}account:reset`, '↻ Reset', ButtonStyle.Secondary, !setup.creatorId && !setup.platforms.length), button(`${P}account:check`, '🔎 Check All', ButtonStyle.Primary, !accounts.length)));
    } else components.push(row(button(`${P}creators`, '👥 Create Creator Profile', ButtonStyle.Primary)));
    components.push(navigation('accounts'));
    return { embeds: [embed(config, '🔗 Accounts', 'Link one or more social platforms directly to a creator profile.\n\n**Order:** select the creator → select up to 5 platforms → continue → enter each account handle/URL.', requestedBy).addFields({ name: `Accounts (${accounts.length})`, value: list })], components };
  }
  if (section === 'notifications') return { embeds: [embed(config, '📢 Notifications', 'Control whether Social Studio sends creator notifications for this server.', requestedBy)], components: [row(button(`${P}toggle`, config.enabled ? '⏸️ Disable Notifications' : '▶️ Enable Notifications', config.enabled ? ButtonStyle.Danger : ButtonStyle.Success)), navigation('notifications')] };
  if (section === 'templates') return { embeds: [embed(config, '🎨 Templates', 'Edit the message used for each notification type.', requestedBy)], components: [row(...ALERT_TYPES.map((type) => button(`${P}template:${type}`, type.charAt(0).toUpperCase() + type.slice(1), ButtonStyle.Primary))), navigation('templates')] };
  if (section === 'feeds') return { embeds: [embed(config, '📡 Feeds', 'Choose the default destination used by creator notifications.', requestedBy)], components: [channelSelector(`${P}feed:channel`, config.alertsChannelId, 'Select the default notification feed'), navigation('feeds')] };
  if (section === 'channels') return { embeds: [embed(config, '📂 Channels', 'Configure the Discord channel used by Social Studio.', requestedBy)], components: [channelSelector(`${P}channel:alerts`, config.alertsChannelId, 'Select the Social Studio alert channel'), navigation('channels')] };
  if (section === 'settings') return { embeds: [embed(config, '⚙️ Social Studio Settings', 'Guild-level Social Studio configuration.', requestedBy)], components: [row(button(`${P}permissions`, '🔐 Permissions', ButtonStyle.Primary), button(`${P}roles`, '👥 Roles', ButtonStyle.Primary), button(`${P}automation`, '⚡ Automation', ButtonStyle.Primary)), row(button(`${P}testing`, '🧪 Testing'), button(`${P}data`, '🗄️ Data')), navigation('settings')] };
  const components = [];
  if (section === 'permissions' || section === 'roles') components.push(roleSelector(config.managerRoleIds));
  if (section === 'automation') components.push(row(button(`${P}toggle`, config.enabled ? 'Disable Module' : 'Enable Module', config.enabled ? ButtonStyle.Danger : ButtonStyle.Success), button(`${P}account:check`, 'Run Check Now', ButtonStyle.Primary, !accounts.length)));
  if (section === 'testing') components.push(row(button(`${P}test`, 'Send Test Notification', ButtonStyle.Primary, !config.alertsChannelId)));
  if (section === 'data') components.push(row(button(`${P}data:refresh`, '🔄 Refresh'), button(`${P}creator:rebuild`, 'Rebuild Profiles')));
  components.push(navigation(section));
  return { embeds: [embed(config, section.charAt(0).toUpperCase() + section.slice(1), 'Social Studio settings.', requestedBy)], components };
}

async function respond(interaction, payload) {
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.update(payload);
  return true;
}

async function refreshAfterModal(interaction, section, message) {
  const payload = buildSectionPanel(interaction, section);
  if (interaction.isFromMessage?.() && !interaction.deferred && !interaction.replied) {
    await interaction.update(payload);
    await interaction.followUp({ content: message, flags: 64 }).catch(() => null);
    return true;
  }
  if (!interaction.deferred && !interaction.replied) await interaction.reply({ content: message, flags: 64 });
  else await interaction.followUp({ content: message, flags: 64 });
  return true;
}

function opensModal(id) {
  return id === `${P}creator:new` || id === `${P}creator:change` || id === `${P}account:continue` || (id.startsWith(`${P}template:`) && !id.startsWith(`${P}template:save:`));
}

async function handleSocialAdminInteraction(interaction) {
  const id = String(interaction?.customId || '');
  if (id !== 'admin:social' && !id.startsWith(P)) return false;
  if (!interaction.guild?.id) throw new Error('Social Studio requires a guild interaction.');
  if (interaction.isMessageComponent?.() && !opensModal(id) && !interaction.deferred && !interaction.replied) await interaction.deferUpdate();

  const config = getConfig(interaction.guildId);
  const actorId = interaction.user?.id || null;

  if (id === 'admin:social' || id === `${P}main`) return respond(interaction, buildSocialAdminPanel(interaction.guild, who(interaction)));
  if (id === `${P}next`) return true;
  if (id === `${P}creator:new`) { await interaction.showModal(creatorModal()); return true; }
  if (id === `${P}creator:select`) { setCreatorView(interaction, { creatorId: interaction.values?.[0] || null }); return respond(interaction, buildSectionPanel(interaction, 'creators')); }
  if (id === `${P}creator:page:prev` || id === `${P}creator:page:next`) { const view = getCreatorView(interaction); setCreatorView(interaction, { page: Math.max(0, view.page + (id.endsWith('next') ? 1 : -1)), creatorId: null }); return respond(interaction, buildSectionPanel(interaction, 'creators')); }
  if (id === `${P}creator:edit`) { const creator = config.creators[getCreatorView(interaction).creatorId]; if (!creator) throw new Error('Select a creator profile first.'); return respond(interaction, buildCreatorEditPanel(interaction, config, creator, who(interaction))); }
  if (id === `${P}creator:change`) { const creator = config.creators[getCreatorView(interaction).creatorId]; if (!creator) throw new Error('The selected creator profile no longer exists.'); await interaction.showModal(creatorModal(creator)); return true; }
  if (id === `${P}creator:toggle`) { const creator = config.creators[getCreatorView(interaction).creatorId]; if (!creator) throw new Error('The selected creator profile no longer exists.'); creator.enabled = creator.enabled === false; creator.updatedAt = new Date().toISOString(); saveConfig(interaction.guildId, config, interaction.guild, actorId); return respond(interaction, buildCreatorEditPanel(interaction, getConfig(interaction.guildId), creator, who(interaction))); }
  if (id === `${P}creator:delete`) { const creator = config.creators[getCreatorView(interaction).creatorId]; if (!creator) throw new Error('The selected creator profile no longer exists.'); return respond(interaction, { embeds: [embed(config, '⚠️ Delete Creator Profile', `Delete **${creator.displayName}**? Linked accounts will remain stored but become unassigned.`, who(interaction))], components: [row(button(`${P}creator:delete:cancel`, 'Cancel'), button(`${P}creator:delete:confirm`, 'Delete Profile', ButtonStyle.Danger))] }); }
  if (id === `${P}creator:delete:cancel`) return respond(interaction, buildSectionPanel(interaction, 'creators'));
  if (id === `${P}creator:delete:confirm`) { const creatorId = getCreatorView(interaction).creatorId; if (!config.creators[creatorId]) throw new Error('The selected creator profile no longer exists.'); delete config.creators[creatorId]; saveConfig(interaction.guildId, config, interaction.guild, actorId); setCreatorView(interaction, { creatorId: null }); return respond(interaction, buildSectionPanel(interaction, 'creators')); }
  if (id.startsWith(`${P}creator:update:`)) { const creatorId = id.slice(`${P}creator:update:`.length); const creator = config.creators[creatorId]; if (!creator) throw new Error('The creator profile no longer exists.'); creator.displayName = interaction.fields.getTextInputValue('displayName').trim(); creator.group = interaction.fields.getTextInputValue('group').trim(); creator.tags = interaction.fields.getTextInputValue('tags').split(',').map((value) => value.trim()).filter(Boolean); creator.notes = interaction.fields.getTextInputValue('notes').trim(); creator.updatedAt = new Date().toISOString(); saveConfig(interaction.guildId, config, interaction.guild, actorId); setCreatorView(interaction, { creatorId }); return refreshAfterModal(interaction, 'creators', '✅ Creator profile updated and verified.'); }

  if (id === `${P}account:creator`) { setAccountSetup(interaction, { creatorId: interaction.values?.[0] || null }); return respond(interaction, buildSectionPanel(interaction, 'accounts')); }
  if (id === `${P}account:platforms`) { setAccountSetup(interaction, { platforms: (interaction.values || []).filter((platform) => PLATFORMS.includes(platform)).slice(0, 5) }); return respond(interaction, buildSectionPanel(interaction, 'accounts')); }
  if (id === `${P}account:reset`) { accountSetupSessions.delete(sessionKey(interaction)); return respond(interaction, buildSectionPanel(interaction, 'accounts')); }
  if (id === `${P}account:continue`) { const setup = getAccountSetup(interaction); if (!setup.creatorId || !config.creators[setup.creatorId]) throw new Error('Select a creator profile first.'); if (!setup.platforms.length) throw new Error('Select at least one platform first.'); await interaction.showModal(accountDetailsModal(setup.platforms)); return true; }

  if (id === `${P}creator:create`) {
    const displayName = interaction.fields.getTextInputValue('displayName').trim();
    if (!displayName) throw new Error('Creator display name is required.');
    const creatorId = makeId('creator');
    config.creators[creatorId] = { creatorId, displayName, group: interaction.fields.getTextInputValue('group').trim(), tags: interaction.fields.getTextInputValue('tags').split(',').map((value) => value.trim()).filter(Boolean), notes: interaction.fields.getTextInputValue('notes').trim(), enabled: true, accountIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    saveConfig(interaction.guildId, config, interaction.guild, actorId);
    setCreatorView(interaction, { creatorId });
    return refreshAfterModal(interaction, 'creators', '✅ Creator profile created and verified.');
  }

  if (id === `${P}account:create-multi`) {
    const setup = getAccountSetup(interaction);
    const creator = config.creators[setup.creatorId];
    if (!creator) throw new Error('The selected creator profile no longer exists.');
    if (!setup.platforms.length) throw new Error('No platforms were selected.');
    const createdIds = [];
    for (const platform of setup.platforms.slice(0, 5)) {
      const username = interaction.fields.getTextInputValue(`account_${platform}`).trim();
      if (!username) continue;
      const duplicate = Object.values(config.accounts).find((account) => account.platform === platform && String(account.username || '').toLowerCase() === username.toLowerCase());
      const accountId = duplicate?.accountId || makeId('account');
      if (!duplicate) config.accounts[accountId] = { accountId, platform, username, displayName: creator.displayName, enabled: true, alertTypes: ['live'], alertChannelId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      createdIds.push(accountId);
    }
    creator.accountIds = [...new Set([...(creator.accountIds || []), ...createdIds])];
    creator.updatedAt = new Date().toISOString();
    saveConfig(interaction.guildId, config, interaction.guild, actorId);
    setAccountSetup(interaction, { creatorId: creator.creatorId, platforms: [] });
    return refreshAfterModal(interaction, 'accounts', `✅ Added and verified ${createdIds.length} social account(s) for ${creator.displayName}.`);
  }

  if (id.startsWith(`${P}template:`) && !id.startsWith(`${P}template:save:`)) { const type = id.split(':')[2]; if (!ALERT_TYPES.includes(type)) throw new Error('Unknown notification template.'); await interaction.showModal(templateModal(type, config)); return true; }
  if (id.startsWith(`${P}template:save:`)) { const type = id.split(':')[3]; config.templates[type] = { title: interaction.fields.getTextInputValue('title'), description: interaction.fields.getTextInputValue('description'), buttonLabel: interaction.fields.getTextInputValue('buttonLabel') }; saveConfig(interaction.guildId, config, interaction.guild, actorId); return refreshAfterModal(interaction, 'templates', `✅ ${type} template saved.`); }
  if (id === `${P}feed:channel` || id === `${P}channel:alerts`) { config.alertsChannelId = interaction.values?.[0] || null; saveConfig(interaction.guildId, config, interaction.guild, actorId); return respond(interaction, buildSectionPanel(interaction, id.includes('feed') ? 'feeds' : 'channels')); }
  if (id === `${P}roles:select`) { config.managerRoleIds = interaction.values || []; saveConfig(interaction.guildId, config, interaction.guild, actorId); return respond(interaction, buildSectionPanel(interaction, 'roles')); }
  if (id === `${P}toggle`) { config.enabled = !config.enabled; saveConfig(interaction.guildId, config, interaction.guild, actorId); return respond(interaction, buildSectionPanel(interaction, 'notifications')); }
  if (id === `${P}account:check`) { const count = Object.values(config.accounts).filter((account) => account.enabled !== false).length; config.analytics.checks = Number(config.analytics.checks || 0) + count; saveConfig(interaction.guildId, config, interaction.guild, actorId); return respond(interaction, buildSectionPanel(interaction, 'accounts')); }
  if (id === `${P}creator:rebuild`) { const linked = new Set(Object.values(config.creators).flatMap((creator) => creator.accountIds || [])); for (const account of Object.values(config.accounts)) { if (linked.has(account.accountId)) continue; const creatorId = makeId('creator'); config.creators[creatorId] = { creatorId, displayName: account.displayName || account.username, group: '', tags: [account.platform], notes: '', enabled: true, accountIds: [account.accountId], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; } saveConfig(interaction.guildId, config, interaction.guild, actorId); return respond(interaction, buildSectionPanel(interaction, 'creators')); }
  if (id === `${P}test`) { if (!config.alertsChannelId) throw new Error('Choose an alert channel first.'); const channel = interaction.guild.channels.cache.get(config.alertsChannelId) || await interaction.guild.channels.fetch(config.alertsChannelId).catch(() => null); if (!channel?.isTextBased?.() || typeof channel.send !== 'function') throw new Error('The configured alert channel is unavailable.'); await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📣 Social Studio Test').setDescription('Your Social Studio notification channel is working.').setTimestamp()] }); if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: `✅ Test notification sent to <#${config.alertsChannelId}>.`, flags: 64 }); return true; }

  const section = id.slice(P.length);
  if (NAV_SECTIONS.has(section)) return respond(interaction, buildSectionPanel(interaction, section));
  throw new Error(`Unknown Social Studio interaction: ${id}`);
}

module.exports = { buildPanel: buildSocialAdminPanel, handleInteraction: handleSocialAdminInteraction, buildSocialAdminPanel, buildSectionPanel, handleSocialAdminInteraction };
