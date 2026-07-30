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
const { normalizeAccountInput, migrateAccount } = require('./accountNormalizer');

const P = 'social:';
const PAGE_SIZE = 25;
const PLATFORMS = ['twitch', 'youtube', 'tiktok', 'kick', 'facebook', 'instagram', 'x'];
const ALERT_TYPES = ['live', 'upload', 'short', 'post'];
const LABEL = { twitch: 'Twitch', youtube: 'YouTube', tiktok: 'TikTok', kick: 'Kick', facebook: 'Facebook', instagram: 'Instagram', x: 'X' };
const ICON = { twitch: '🟣', youtube: '🔴', tiktok: '⚫', kick: '🟢', facebook: '🔵', instagram: '🟠', x: '⚪' };
const NAV = new Set(['creators', 'accounts', 'notifications', 'templates', 'feeds', 'channels', 'settings', 'permissions', 'roles', 'automation', 'testing', 'data']);
const accountSessions = new Map();
const creatorSessions = new Map();

const row = (...components) => new ActionRowBuilder().addComponents(...components);
const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const sessionKey = (interaction) => `${interaction.guildId}:${interaction.user?.id || 'unknown'}`;
const who = (interaction) => interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';
const makeId = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const now = () => new Date().toISOString();

function getConfig(guildId) {
  const guild = guildManager.reloadGuild(guildId);
  const section = guild?.modules?.social && typeof guild.modules.social === 'object' ? guild.modules.social : {};
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
  const { enabled: _enabled, ...storedConfig } = config;
  const next = { ...storedConfig, updatedAt: now(), lastActorId: actorId };
  guildManager.replaceGuildSection(guildId, 'social', next, guild);
  const saved = guildManager.reloadGuild(guildId)?.modules?.social;
  if (!saved || typeof saved !== 'object') throw new Error('Social Studio could not verify its saved guild data.');
  for (const id of Object.keys(next.creators || {})) if (!saved.creators?.[id]) throw new Error(`Creator profile ${id} was not persisted.`);
  for (const id of Object.keys(next.accounts || {})) if (!saved.accounts?.[id]) throw new Error(`Social account ${id} was not persisted.`);
  return { ...saved, enabled: guildManager.isModuleEnabled(guildId, 'social') };
}

function getAccountSession(interaction) {
  return accountSessions.get(sessionKey(interaction)) || { creatorId: null, platforms: [], accountId: null };
}

function setAccountSession(interaction, patch) {
  const next = { ...getAccountSession(interaction), ...patch };
  accountSessions.set(sessionKey(interaction), next);
  return next;
}

function getCreatorSession(interaction) {
  return creatorSessions.get(sessionKey(interaction)) || { creatorId: null, page: 0 };
}

function setCreatorSession(interaction, patch) {
  const next = { ...getCreatorSession(interaction), ...patch };
  creatorSessions.set(sessionKey(interaction), next);
  return next;
}

function embed(config, title, description, requestedBy) {
  return new EmbedBuilder()
    .setColor(config.enabled ? 0x5865F2 : 0x747F8D)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `Requested by ${requestedBy}` })
    .setTimestamp();
}

function navigation(active = 'main') {
  return row(
    btn(active === 'main' ? 'admin:studio:socialStudio' : `${P}main`, '⬅️ Back'),
    btn(`${P}settings`, '⚙️ Settings', ButtonStyle.Secondary, active === 'settings'),
    btn(`${P}next`, 'Next ➡️', ButtonStyle.Secondary, true),
  );
}

function creatorSelect(creators, selected, id = `${P}account:creator`, placeholder = '1. Select the creator profile') {
  return row(new StringSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(creators.slice(0, 25).map((creator) => ({
      label: String(creator.displayName || 'Unnamed creator').slice(0, 100),
      value: creator.creatorId,
      description: `${(creator.accountIds || []).length} linked account(s)`.slice(0, 100),
      default: creator.creatorId === selected,
    }))));
}

function accountSelect(accounts, selected) {
  return row(new StringSelectMenuBuilder()
    .setCustomId(`${P}account:select`)
    .setPlaceholder('2. Select an account to view or edit')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(accounts.slice(0, 25).map((account) => ({
      label: `${LABEL[account.platform] || account.platform} · ${account.username}`.slice(0, 100),
      value: account.accountId,
      description: String(account.profileUrl || account.username || '').slice(0, 100),
      default: account.accountId === selected,
    }))));
}

function platformSelect(selected = []) {
  return row(new StringSelectMenuBuilder()
    .setCustomId(`${P}account:platforms`)
    .setPlaceholder('3. Select one or more platforms to add')
    .setMinValues(1)
    .setMaxValues(5)
    .addOptions(PLATFORMS.map((platform) => ({ label: LABEL[platform], value: platform, default: selected.includes(platform) }))));
}

function channelSelect(id, selected, placeholder) {
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder(placeholder)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  if (selected) menu.setDefaultChannels([selected]);
  return row(menu);
}

function roleSelect(ids) {
  const menu = new RoleSelectMenuBuilder()
    .setCustomId(`${P}roles:select`)
    .setPlaceholder('Select Social Studio manager roles')
    .setMinValues(0)
    .setMaxValues(10);
  if (ids?.length) menu.setDefaultRoles(ids.slice(0, 10));
  return row(menu);
}

function creatorModal(creator = null) {
  return new ModalBuilder()
    .setCustomId(creator ? `${P}creator:update:${creator.creatorId}` : `${P}creator:create`)
    .setTitle(creator ? 'Edit Creator Profile' : 'Create Creator Profile')
    .addComponents(
      row(new TextInputBuilder()
        .setCustomId('displayName')
        .setLabel('Creator display name')
        .setPlaceholder('e.g. Johnny, KSJ Diamond Gaming, Acme Esports')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(120)
        .setRequired(true)
        .setValue(String(creator?.displayName || ''))),
      row(new TextInputBuilder()
        .setCustomId('group')
        .setLabel('Group or team')
        .setPlaceholder('Optional — team, organisation or brand they belong to')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(120)
        .setRequired(false)
        .setValue(String(creator?.group || ''))),
      row(new TextInputBuilder()
        .setCustomId('tags')
        .setLabel('Tags (comma separated)')
        .setPlaceholder('Optional — e.g. streamer, FPS, UK')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(300)
        .setRequired(false)
        .setValue(Array.isArray(creator?.tags) ? creator.tags.join(', ') : '')),
      row(new TextInputBuilder()
        .setCustomId('notes')
        .setLabel('Notes')
        .setPlaceholder('Optional — internal notes about this creator profile')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(false)
        .setValue(String(creator?.notes || ''))),
    );
}

function accountModal(platforms) {
  const modal = new ModalBuilder().setCustomId(`${P}account:create-multi`).setTitle('Add Social Accounts');
  for (const platform of platforms.slice(0, 5)) {
    modal.addComponents(row(new TextInputBuilder()
      .setCustomId(`account_${platform}`)
      .setLabel(`${LABEL[platform]} username, channel ID or URL`)
      .setPlaceholder('e.g. username, @handle or full profile URL')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(500)
      .setRequired(true)));
  }
  return modal;
}

function accountEditModal(account) {
  return new ModalBuilder()
    .setCustomId(`${P}account:update:${account.accountId}`)
    .setTitle(`Edit ${LABEL[account.platform] || account.platform} Account`)
    .addComponents(row(new TextInputBuilder()
      .setCustomId('accountValue')
      .setLabel('Username, channel ID or URL')
      .setPlaceholder('e.g. username, @handle or full profile URL')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(500)
      .setRequired(true)
      .setValue(String(account.profileUrl || account.username || ''))));
}

function templateModal(type, config) {
  const current = config.templates?.[type] || {};
  return new ModalBuilder()
    .setCustomId(`${P}template:save:${type}`)
    .setTitle(`${type[0].toUpperCase() + type.slice(1)} Template`)
    .addComponents(
      row(new TextInputBuilder().setCustomId('title').setLabel('Embed title').setStyle(TextInputStyle.Short).setMaxLength(256).setValue(String(current.title || '{creator} alert')).setRequired(true)),
      row(new TextInputBuilder().setCustomId('description').setLabel('Embed description').setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setValue(String(current.description || '{title}')).setRequired(true)),
      row(new TextInputBuilder().setCustomId('buttonLabel').setLabel('Link button label').setStyle(TextInputStyle.Short).setMaxLength(80).setValue(String(current.buttonLabel || 'Watch now')).setRequired(true)),
    );
}

function removeAccountReferences(config, accountIds) {
  const ids = new Set(accountIds);
  for (const creator of Object.values(config.creators)) {
    creator.accountIds = (creator.accountIds || []).filter((id) => !ids.has(id));
  }
}

function canonicalKey(account) {
  return `${String(account.platform || '').toLowerCase()}:${String(account.normalizedUsername || account.username || '').toLowerCase()}`;
}

function upsertAccount(config, creator, platform, rawValue) {
  const normalized = normalizeAccountInput(platform, rawValue);
  const targetKey = `${platform}:${normalized.normalizedUsername}`;
  const matches = Object.values(config.accounts).filter((account) => {
    try {
      const migrated = migrateAccount(account);
      return canonicalKey(migrated) === targetKey;
    } catch {
      return false;
    }
  });

  const primary = matches[0] || null;
  const accountId = primary?.accountId || makeId('account');
  const duplicateIds = matches.slice(1).map((account) => account.accountId);
  if (duplicateIds.length) {
    removeAccountReferences(config, duplicateIds);
    for (const id of duplicateIds) delete config.accounts[id];
  }

  config.accounts[accountId] = {
    ...(primary || {}),
    accountId,
    platform,
    username: normalized.username,
    normalizedUsername: normalized.normalizedUsername,
    profileUrl: normalized.profileUrl,
    sourceInput: normalized.sourceInput,
    displayName: creator.displayName,
    enabled: primary?.enabled !== false,
    alertTypes: Array.isArray(primary?.alertTypes) ? primary.alertTypes : ['live'],
    alertChannelId: primary?.alertChannelId || null,
    createdAt: primary?.createdAt || now(),
    updatedAt: now(),
  };

  creator.accountIds = [...new Set([...(creator.accountIds || []), accountId])];
  creator.updatedAt = now();
  return { accountId, created: !primary, removedDuplicates: duplicateIds.length };
}

function buildMainPanel(guild, requestedBy = 'Unknown User') {
  const config = getConfig(guild.id);
  const ready = Object.keys(config.creators).length > 0 && Object.keys(config.accounts).length > 0 && Boolean(config.alertsChannelId);
  const description = ready
    ? '✅ **Social Studio is ready.**\n\nUse the buttons below to manage creators, linked accounts, notifications and delivery.'
    : '⚠️ **Setup required**\n\n1️⃣ **Creator Profiles**\n2️⃣ **Accounts**\n3️⃣ **Channels**\n4️⃣ **Notifications**\n\n**Optional:** Templates and Feeds.';
  return {
    embeds: [embed(config, '📣 Social Studio', description, requestedBy)],
    components: [
      row(btn(`${P}creators`, '👥 Creator Profiles', ButtonStyle.Primary), btn(`${P}accounts`, '🔗 Accounts', ButtonStyle.Primary), btn(`${P}notifications`, '📢 Notifications', ButtonStyle.Primary)),
      row(btn(`${P}templates`, '🎨 Templates'), btn(`${P}feeds`, '📡 Feeds'), btn(`${P}channels`, '📂 Channels')),
      navigation('main'),
    ],
  };
}

function buildCreatorPanel(interaction, config, creators) {
  const view = getCreatorSession(interaction);
  const pages = Math.max(1, Math.ceil(creators.length / PAGE_SIZE));
  if (view.page >= pages) setCreatorSession(interaction, { page: pages - 1 });
  const current = getCreatorSession(interaction);
  const active = config.creators[current.creatorId] || null;
  if (current.creatorId && !active) setCreatorSession(interaction, { creatorId: null });
  const selected = config.creators[getCreatorSession(interaction).creatorId] || null;
  const linked = selected ? (selected.accountIds || []).map((id) => config.accounts[id]).filter(Boolean) : [];
  const description = selected
    ? [
      `👤 **${selected.displayName}**`,
      '',
      '**Platforms**',
      ...(linked.length ? linked.map((account) => `${ICON[account.platform] || '🔗'} **${LABEL[account.platform] || account.platform}** — ${account.profileUrl ? `[${account.username}](${account.profileUrl})` : account.username}`) : ['No linked social accounts.']),
      '',
      `**Status:** ${selected.enabled === false ? '🔴 Disabled' : linked.length ? '🟢 Monitoring' : '🟡 Waiting for accounts'}`,
      `**Accounts:** ${linked.length}`,
    ].join('\n')
    : `Select a creator profile below to view and manage it.\n\n**Profiles:** ${creators.length}\n**Selected:** None`;

  const components = [];
  const page = getCreatorSession(interaction).page;
  const items = creators.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (items.length) components.push(creatorSelect(items, getCreatorSession(interaction).creatorId, `${P}creator:select`, `Select a creator profile · Page ${page + 1}/${pages}`));
  components.push(row(btn(`${P}creator:new`, '➕ New Profile', ButtonStyle.Success), btn(`${P}creator:edit`, '✏️ Edit Profile', ButtonStyle.Primary, !selected), btn(`${P}creator:rebuild`, '🔄 Rebuild Profiles')));
  if (pages > 1) components.push(row(btn(`${P}creator:page:prev`, '◀ Previous', ButtonStyle.Secondary, page <= 0), btn(`${P}creator:page:next`, 'Next ▶', ButtonStyle.Secondary, page >= pages - 1)));
  components.push(navigation('creators'));
  return { embeds: [embed(config, '👥 Creator Profiles', description, who(interaction))], components };
}

function buildCreatorEditPanel(interaction, config, creator) {
  return {
    embeds: [embed(config, '✏️ Edit Creator Profile', [
      `👤 **${creator.displayName}**`,
      '',
      `**Group / Team:** ${creator.group || 'Not set'}`,
      `**Tags:** ${creator.tags?.length ? creator.tags.join(', ') : 'None'}`,
      `**Notes:** ${creator.notes || 'None'}`,
      `**Status:** ${creator.enabled === false ? '🔴 Disabled' : '🟢 Enabled'}`,
    ].join('\n'), who(interaction))],
    components: [
      row(btn(`${P}creator:change`, '📝 Change Details', ButtonStyle.Primary), btn(`${P}creator:toggle`, creator.enabled === false ? '▶️ Enable' : '⏸️ Disable', creator.enabled === false ? ButtonStyle.Success : ButtonStyle.Secondary), btn(`${P}accounts`, '🔗 Manage Accounts')),
      row(btn(`${P}creator:delete`, '🗑️ Delete Profile', ButtonStyle.Danger), btn(`${P}creators`, '⬅️ Back to Profile')),
      navigation('creators'),
    ],
  };
}

function buildAccountEditPanel(interaction, config, creator, account) {
  return {
    embeds: [embed(config, '✏️ Edit Social Account', [
      `${ICON[account.platform] || '🔗'} **${LABEL[account.platform] || account.platform}**`,
      '',
      `**Creator:** ${creator.displayName}`,
      `**Username:** ${account.username}`,
      `**Profile URL:** ${account.profileUrl || 'Not set'}`,
      `**Status:** ${account.enabled === false ? '🔴 Disabled' : '🟢 Enabled'}`,
      '',
      'Use **Change Details** to update the username, channel ID or URL. Delete is kept inside this edit screen.',
    ].join('\n'), who(interaction))],
    components: [
      row(btn(`${P}account:change`, '📝 Change Details', ButtonStyle.Primary), btn(`${P}account:toggle`, account.enabled === false ? '▶️ Enable' : '⏸️ Disable', account.enabled === false ? ButtonStyle.Success : ButtonStyle.Secondary)),
      row(btn(`${P}account:delete`, '🗑️ Delete Account', ButtonStyle.Danger), btn(`${P}accounts`, '⬅️ Back to Accounts')),
      navigation('accounts'),
    ],
  };
}

function buildSectionPanel(interaction, name) {
  const config = getConfig(interaction.guildId);
  const accounts = Object.values(config.accounts);
  const creators = Object.values(config.creators).sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')));
  if (name === 'creators') return buildCreatorPanel(interaction, config, creators);

  if (name === 'accounts') {
    const session = getAccountSession(interaction);
    const creator = session.creatorId ? config.creators[session.creatorId] || null : null;
    if (session.creatorId && !creator) {
      accountSessions.delete(sessionKey(interaction));
      return buildSectionPanel(interaction, 'accounts');
    }
    const linked = creator ? (creator.accountIds || []).map((id) => config.accounts[id]).filter(Boolean) : [];
    const selectedAccount = creator && session.accountId ? config.accounts[session.accountId] || null : null;
    if (session.accountId && (!selectedAccount || !linked.some((account) => account.accountId === session.accountId))) setAccountSession(interaction, { accountId: null });
    const activeAccount = creator ? config.accounts[getAccountSession(interaction).accountId] || null : null;
    const accountList = linked.map((account) => `• ${ICON[account.platform] || '🔗'} **${LABEL[account.platform] || account.platform}** — ${account.profileUrl ? `[${account.username}](${account.profileUrl})` : account.username}`).join('\n');
    const description = creator
      ? [
        `Viewing and managing accounts for **${creator.displayName}**.`,
        '',
        `**Profiles:** ${creators.length}`,
        `**Creator:** ${creator.displayName}`,
        `**Accounts:** ${linked.length}`,
        `**Selected:** ${activeAccount ? `${LABEL[activeAccount.platform] || activeAccount.platform} — ${activeAccount.username}` : 'None'}`,
        ...(accountList ? ['', '**Linked Accounts**', accountList] : ['', 'No platform accounts are linked to this creator.']),
      ].join('\n')
      : `Select a creator profile below to view and manage its linked accounts.\n\n**Profiles:** ${creators.length}\n**Selected:** None`;
    const components = [];
    if (creators.length) {
      components.push(creatorSelect(creators, session.creatorId));
      if (linked.length) components.push(accountSelect(linked, getAccountSession(interaction).accountId));
      components.push(platformSelect(getAccountSession(interaction).platforms));
      components.push(row(
        btn(`${P}account:continue`, '➕ Add Account', ButtonStyle.Success, !session.creatorId || !getAccountSession(interaction).platforms.length),
        btn(`${P}account:edit`, '✏️ Edit Account', ButtonStyle.Primary, !activeAccount),
        btn(`${P}account:reset`, '↻ Reset', ButtonStyle.Secondary, !session.creatorId && !session.platforms.length && !session.accountId),
      ));
    } else {
      components.push(row(btn(`${P}creators`, '👥 Create Creator Profile', ButtonStyle.Primary)));
    }
    components.push(navigation('accounts'));
    return {
      embeds: [embed(config, '🔗 Accounts', description, who(interaction))],
      components,
    };
  }

  if (name === 'notifications') return { embeds: [embed(config, '📢 Notifications', 'Control whether Social Studio sends creator notifications for this server.', who(interaction))], components: [row(btn(`${P}toggle`, config.enabled ? '⏸️ Disable Notifications' : '▶️ Enable Notifications', config.enabled ? ButtonStyle.Danger : ButtonStyle.Success)), navigation('notifications')] };
  if (name === 'templates') return { embeds: [embed(config, '🎨 Templates', 'Edit the message used for each notification type.', who(interaction))], components: [row(...ALERT_TYPES.map((type) => btn(`${P}template:${type}`, type[0].toUpperCase() + type.slice(1), ButtonStyle.Primary))), navigation('templates')] };
  if (name === 'feeds') return { embeds: [embed(config, '📡 Feeds', 'Choose the default destination used by creator notifications.', who(interaction))], components: [channelSelect(`${P}feed:channel`, config.alertsChannelId, 'Select the default notification feed'), navigation('feeds')] };
  if (name === 'channels') return { embeds: [embed(config, '📂 Channels', 'Configure the Discord channel used by Social Studio.', who(interaction))], components: [channelSelect(`${P}channel:alerts`, config.alertsChannelId, 'Select the Social Studio alert channel'), navigation('channels')] };
  if (name === 'settings') return { embeds: [embed(config, '⚙️ Social Studio Settings', 'Guild-level Social Studio configuration.', who(interaction))], components: [row(btn(`${P}permissions`, '🔐 Permissions', ButtonStyle.Primary), btn(`${P}roles`, '👥 Roles', ButtonStyle.Primary), btn(`${P}automation`, '⚡ Automation', ButtonStyle.Primary)), row(btn(`${P}testing`, '🧪 Testing'), btn(`${P}data`, '🗄️ Data')), navigation('settings')] };

  const components = [];
  if (name === 'permissions' || name === 'roles') components.push(roleSelect(config.managerRoleIds));
  if (name === 'automation') components.push(row(btn(`${P}toggle`, config.enabled ? 'Disable Module' : 'Enable Module', config.enabled ? ButtonStyle.Danger : ButtonStyle.Success), btn(`${P}account:check`, 'Run Check Now', ButtonStyle.Primary, !accounts.length)));
  if (name === 'testing') components.push(row(btn(`${P}test`, 'Send Test Notification', ButtonStyle.Primary, !config.alertsChannelId)));
  if (name === 'data') components.push(row(btn(`${P}data:refresh`, '🔄 Refresh'), btn(`${P}creator:rebuild`, 'Rebuild Profiles')));
  components.push(navigation(name));
  return { embeds: [embed(config, name[0].toUpperCase() + name.slice(1), 'Social Studio settings.', who(interaction))], components };
}

async function respond(interaction, payload) {
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.update(payload);
  return true;
}

async function afterModal(interaction, section, message) {
  const payload = buildSectionPanel(interaction, section);
  if (interaction.isFromMessage?.() && !interaction.deferred && !interaction.replied) {
    await interaction.update(payload);
    await interaction.followUp({ content: message, flags: 64 }).catch(() => null);
  } else if (!interaction.deferred && !interaction.replied) {
    await interaction.reply({ content: message, flags: 64 });
  } else {
    await interaction.followUp({ content: message, flags: 64 });
  }
  return true;
}

function opensModal(id) {
  return id === `${P}creator:new`
    || id === `${P}creator:change`
    || id === `${P}account:continue`
    || id === `${P}account:change`
    || (id.startsWith(`${P}template:`) && !id.startsWith(`${P}template:save:`));
}

async function handleInteraction(interaction) {
  const id = String(interaction?.customId || '');
  if (id !== 'admin:social' && !id.startsWith(P)) return false;
  if (!interaction.guild?.id) throw new Error('Social Studio requires a guild interaction.');
  if (interaction.isMessageComponent?.() && !opensModal(id) && !interaction.deferred && !interaction.replied) await interaction.deferUpdate();

  const config = getConfig(interaction.guildId);
  const actorId = interaction.user?.id || null;

  if (id === 'admin:social' || id === `${P}main`) return respond(interaction, buildMainPanel(interaction.guild, who(interaction)));
  if (id === `${P}next`) return true;
  if (id === `${P}creator:new`) { await interaction.showModal(creatorModal()); return true; }
  if (id === `${P}creator:select`) { setCreatorSession(interaction, { creatorId: interaction.values?.[0] || null }); return respond(interaction, buildSectionPanel(interaction, 'creators')); }
  if (id === `${P}creator:page:prev` || id === `${P}creator:page:next`) { const view = getCreatorSession(interaction); setCreatorSession(interaction, { page: Math.max(0, view.page + (id.endsWith('next') ? 1 : -1)), creatorId: null }); return respond(interaction, buildSectionPanel(interaction, 'creators')); }
  if (id === `${P}creator:edit`) { const creator = config.creators[getCreatorSession(interaction).creatorId]; if (!creator) throw new Error('Select a creator profile first.'); return respond(interaction, buildCreatorEditPanel(interaction, config, creator)); }
  if (id === `${P}creator:change`) { const creator = config.creators[getCreatorSession(interaction).creatorId]; if (!creator) throw new Error('The selected creator profile no longer exists.'); await interaction.showModal(creatorModal(creator)); return true; }
  if (id === `${P}creator:toggle`) { const creator = config.creators[getCreatorSession(interaction).creatorId]; if (!creator) throw new Error('The selected creator profile no longer exists.'); creator.enabled = creator.enabled === false; creator.updatedAt = now(); saveConfig(interaction.guildId, config, interaction.guild, actorId); return respond(interaction, buildCreatorEditPanel(interaction, getConfig(interaction.guildId), creator)); }
  if (id === `${P}creator:delete`) { const creator = config.creators[getCreatorSession(interaction).creatorId]; if (!creator) throw new Error('The selected creator profile no longer exists.'); return respond(interaction, { embeds: [embed(config, '⚠️ Delete Creator Profile', `Delete **${creator.displayName}**? Linked accounts will remain stored but become unassigned.`, who(interaction))], components: [row(btn(`${P}creator:delete:cancel`, 'Cancel'), btn(`${P}creator:delete:confirm`, 'Delete Profile', ButtonStyle.Danger))] }); }
  if (id === `${P}creator:delete:cancel`) return respond(interaction, buildSectionPanel(interaction, 'creators'));
  if (id === `${P}creator:delete:confirm`) { const creatorId = getCreatorSession(interaction).creatorId; if (!config.creators[creatorId]) throw new Error('The selected creator profile no longer exists.'); delete config.creators[creatorId]; saveConfig(interaction.guildId, config, interaction.guild, actorId); setCreatorSession(interaction, { creatorId: null }); return respond(interaction, buildSectionPanel(interaction, 'creators')); }
  if (id.startsWith(`${P}creator:update:`)) { const creatorId = id.slice(`${P}creator:update:`.length); const creator = config.creators[creatorId]; if (!creator) throw new Error('The creator profile no longer exists.'); creator.displayName = interaction.fields.getTextInputValue('displayName').trim(); creator.group = interaction.fields.getTextInputValue('group').trim(); creator.tags = interaction.fields.getTextInputValue('tags').split(',').map((value) => value.trim()).filter(Boolean); creator.notes = interaction.fields.getTextInputValue('notes').trim(); creator.updatedAt = now(); saveConfig(interaction.guildId, config, interaction.guild, actorId); setCreatorSession(interaction, { creatorId }); return afterModal(interaction, 'creators', '✅ Creator profile updated and verified.'); }

  if (id === `${P}account:creator`) { setAccountSession(interaction, { creatorId: interaction.values?.[0] || null, accountId: null, platforms: [] }); return respond(interaction, buildSectionPanel(interaction, 'accounts')); }
  if (id === `${P}account:select`) { setAccountSession(interaction, { accountId: interaction.values?.[0] || null }); return respond(interaction, buildSectionPanel(interaction, 'accounts')); }
  if (id === `${P}account:platforms`) { setAccountSession(interaction, { platforms: (interaction.values || []).filter((platform) => PLATFORMS.includes(platform)).slice(0, 5) }); return respond(interaction, buildSectionPanel(interaction, 'accounts')); }
  if (id === `${P}account:reset`) { accountSessions.delete(sessionKey(interaction)); return respond(interaction, buildSectionPanel(interaction, 'accounts')); }
  if (id === `${P}account:continue`) { const session = getAccountSession(interaction); if (!session.creatorId || !config.creators[session.creatorId]) throw new Error('Select a creator profile first.'); if (!session.platforms.length) throw new Error('Select at least one platform first.'); await interaction.showModal(accountModal(session.platforms)); return true; }
  if (id === `${P}account:edit`) { const session = getAccountSession(interaction); const creator = config.creators[session.creatorId]; const account = config.accounts[session.accountId]; if (!creator) throw new Error('Select a creator profile first.'); if (!account || !(creator.accountIds || []).includes(account.accountId)) throw new Error('Select an account first.'); return respond(interaction, buildAccountEditPanel(interaction, config, creator, account)); }
  if (id === `${P}account:change`) { const session = getAccountSession(interaction); const account = config.accounts[session.accountId]; if (!account) throw new Error('The selected account no longer exists.'); await interaction.showModal(accountEditModal(account)); return true; }
  if (id === `${P}account:toggle`) { const session = getAccountSession(interaction); const creator = config.creators[session.creatorId]; const account = config.accounts[session.accountId]; if (!creator || !account) throw new Error('The selected account no longer exists.'); account.enabled = account.enabled === false; account.updatedAt = now(); saveConfig(interaction.guildId, config, interaction.guild, actorId); return respond(interaction, buildAccountEditPanel(interaction, getConfig(interaction.guildId), creator, getConfig(interaction.guildId).accounts[account.accountId])); }
  if (id === `${P}account:delete`) { const session = getAccountSession(interaction); const account = config.accounts[session.accountId]; if (!account) throw new Error('The selected account no longer exists.'); return respond(interaction, { embeds: [embed(config, '⚠️ Delete Social Account', `Delete **${LABEL[account.platform] || account.platform} · ${account.username}**?\n\nThis removes the account from Social Studio and unlinks it from every creator.`, who(interaction))], components: [row(btn(`${P}account:delete:cancel`, 'Cancel'), btn(`${P}account:delete:confirm`, 'Delete Account', ButtonStyle.Danger))] }); }
  if (id === `${P}account:delete:cancel`) { const session = getAccountSession(interaction); const creator = config.creators[session.creatorId]; const account = config.accounts[session.accountId]; if (!creator || !account) return respond(interaction, buildSectionPanel(interaction, 'accounts')); return respond(interaction, buildAccountEditPanel(interaction, config, creator, account)); }
  if (id === `${P}account:delete:confirm`) { const session = getAccountSession(interaction); const account = config.accounts[session.accountId]; if (!account) throw new Error('The selected account no longer exists.'); removeAccountReferences(config, [account.accountId]); delete config.accounts[account.accountId]; saveConfig(interaction.guildId, config, interaction.guild, actorId); setAccountSession(interaction, { accountId: null }); return respond(interaction, buildSectionPanel(interaction, 'accounts')); }
  if (id.startsWith(`${P}account:update:`)) { const accountId = id.slice(`${P}account:update:`.length); const account = config.accounts[accountId]; const session = getAccountSession(interaction); const creator = config.creators[session.creatorId]; if (!account || !creator) throw new Error('The selected account no longer exists.'); const rawValue = interaction.fields.getTextInputValue('accountValue').trim(); const originalId = account.accountId; removeAccountReferences(config, [originalId]); delete config.accounts[originalId]; const result = upsertAccount(config, creator, account.platform, rawValue); const updated = config.accounts[result.accountId]; updated.enabled = account.enabled !== false; updated.alertTypes = Array.isArray(account.alertTypes) ? account.alertTypes : ['live']; updated.alertChannelId = account.alertChannelId || null; saveConfig(interaction.guildId, config, interaction.guild, actorId); setAccountSession(interaction, { accountId: result.accountId, platforms: [] }); return afterModal(interaction, 'accounts', `✅ ${LABEL[account.platform] || account.platform} account updated and verified.`); }

  if (id === `${P}creator:create`) { const displayName = interaction.fields.getTextInputValue('displayName').trim(); if (!displayName) throw new Error('Creator display name is required.'); const creatorId = makeId('creator'); config.creators[creatorId] = { creatorId, displayName, group: interaction.fields.getTextInputValue('group').trim(), tags: interaction.fields.getTextInputValue('tags').split(',').map((value) => value.trim()).filter(Boolean), notes: interaction.fields.getTextInputValue('notes').trim(), enabled: true, accountIds: [], createdAt: now(), updatedAt: now() }; saveConfig(interaction.guildId, config, interaction.guild, actorId); setCreatorSession(interaction, { creatorId }); return afterModal(interaction, 'creators', '✅ Creator profile created and verified.'); }
  if (id === `${P}account:create-multi`) { const session = getAccountSession(interaction); const creator = config.creators[session.creatorId]; if (!creator) throw new Error('The selected creator profile no longer exists.'); if (!session.platforms.length) throw new Error('No platforms were selected.'); let created = 0; let updated = 0; let removedDuplicates = 0; let selectedAccountId = null; for (const platform of session.platforms.slice(0, 5)) { const rawValue = interaction.fields.getTextInputValue(`account_${platform}`).trim(); if (!rawValue) continue; const result = upsertAccount(config, creator, platform, rawValue); selectedAccountId = result.accountId; if (result.created) created += 1; else updated += 1; removedDuplicates += result.removedDuplicates; } saveConfig(interaction.guildId, config, interaction.guild, actorId); setAccountSession(interaction, { creatorId: creator.creatorId, platforms: [], accountId: selectedAccountId }); const parts = []; if (created) parts.push(`${created} added`); if (updated) parts.push(`${updated} updated`); if (removedDuplicates) parts.push(`${removedDuplicates} duplicate${removedDuplicates === 1 ? '' : 's'} merged`); return afterModal(interaction, 'accounts', `✅ ${parts.join(', ') || 'Account saved'} and verified for ${creator.displayName}.`); }

  if (id.startsWith(`${P}template:`) && !id.startsWith(`${P}template:save:`)) { const type = id.split(':')[2]; if (!ALERT_TYPES.includes(type)) throw new Error('Unknown notification template.'); await interaction.showModal(templateModal(type, config)); return true; }
  if (id.startsWith(`${P}template:save:`)) { const type = id.split(':')[3]; config.templates[type] = { title: interaction.fields.getTextInputValue('title'), description: interaction.fields.getTextInputValue('description'), buttonLabel: interaction.fields.getTextInputValue('buttonLabel') }; saveConfig(interaction.guildId, config, interaction.guild, actorId); return afterModal(interaction, 'templates', `✅ ${type} template saved.`); }
  if (id === `${P}feed:channel` || id === `${P}channel:alerts`) { config.alertsChannelId = interaction.values?.[0] || null; saveConfig(interaction.guildId, config, interaction.guild, actorId); return respond(interaction, buildSectionPanel(interaction, id.includes('feed') ? 'feeds' : 'channels')); }
  if (id === `${P}roles:select`) { config.managerRoleIds = interaction.values || []; saveConfig(interaction.guildId, config, interaction.guild, actorId); return respond(interaction, buildSectionPanel(interaction, 'roles')); }
  if (id === `${P}toggle`) { guildManager.setModuleEnabled(interaction.guildId, 'social', !config.enabled, { actorId }); return respond(interaction, buildSectionPanel(interaction, 'notifications')); }
  if (id === `${P}account:check`) { const count = Object.values(config.accounts).filter((account) => account.enabled !== false).length; config.analytics.checks = Number(config.analytics.checks || 0) + count; saveConfig(interaction.guildId, config, interaction.guild, actorId); return respond(interaction, buildSectionPanel(interaction, 'accounts')); }
  if (id === `${P}creator:rebuild`) { const linked = new Set(Object.values(config.creators).flatMap((creator) => creator.accountIds || [])); for (const account of Object.values(config.accounts)) { if (linked.has(account.accountId)) continue; const creatorId = makeId('creator'); config.creators[creatorId] = { creatorId, displayName: account.displayName || account.username, group: '', tags: [account.platform], notes: '', enabled: true, accountIds: [account.accountId], createdAt: now(), updatedAt: now() }; } saveConfig(interaction.guildId, config, interaction.guild, actorId); return respond(interaction, buildSectionPanel(interaction, 'creators')); }
  if (id === `${P}test`) { if (!config.alertsChannelId) throw new Error('Choose an alert channel first.'); const channel = interaction.guild.channels.cache.get(config.alertsChannelId) || await interaction.guild.channels.fetch(config.alertsChannelId).catch(() => null); if (!channel?.isTextBased?.() || typeof channel.send !== 'function') throw new Error('The configured alert channel is unavailable.'); await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📣 Social Studio Test').setDescription('Your Social Studio notification channel is working.').setTimestamp()] }); return true; }

  const sectionName = id.slice(P.length);
  if (NAV.has(sectionName)) return respond(interaction, buildSectionPanel(interaction, sectionName));
  throw new Error(`Unknown Social Studio interaction: ${id}`);
}

module.exports = {
  buildPanel: buildMainPanel,
  handleInteraction,
  buildSocialAdminPanel: buildMainPanel,
  buildSectionPanel,
  handleSocialAdminInteraction: handleInteraction,
};