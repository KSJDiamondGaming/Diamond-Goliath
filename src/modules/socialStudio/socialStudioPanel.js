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
const key = (interaction) => `${interaction.guildId}:${interaction.user?.id || 'unknown'}`;
const who = (interaction) => interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';
const makeId = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

function config(guildId) {
  const guild = guildManager.reloadGuild(guildId);
  const section = guild?.modules?.social && typeof guild.modules.social === 'object' ? guild.modules.social : {};
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

function save(guildId, cfg, guild, actorId = null) {
  const next = { ...cfg, enabled: cfg.enabled !== false, updatedAt: new Date().toISOString(), lastActorId: actorId };
  guildManager.replaceGuildSection(guildId, 'social', next, guild);
  const persisted = guildManager.reloadGuild(guildId)?.modules?.social;
  if (!persisted) throw new Error('Social Studio could not verify its saved guild data.');
  for (const id of Object.keys(next.creators || {})) if (!persisted.creators?.[id]) throw new Error(`Creator profile ${id} was not persisted.`);
  for (const id of Object.keys(next.accounts || {})) if (!persisted.accounts?.[id]) throw new Error(`Social account ${id} was not persisted.`);
  return persisted;
}

const emb = (cfg, title, description, requestedBy) => new EmbedBuilder()
  .setColor(cfg.enabled ? 0x5865F2 : 0x747F8D)
  .setTitle(title)
  .setDescription(description)
  .setFooter({ text: `Requested by ${requestedBy}` })
  .setTimestamp();

const nav = (active = 'main') => row(
  btn(active === 'main' ? 'admin:studio:socialStudio' : `${P}main`, '⬅️ Back'),
  btn(`${P}settings`, '⚙️ Settings', ButtonStyle.Secondary, active === 'settings'),
  btn(`${P}next`, 'Next ➡️', ButtonStyle.Secondary, true),
);

const getAccount = (interaction) => accountSessions.get(key(interaction)) || { creatorId: null, platforms: [] };
const setAccount = (interaction, patch) => {
  const next = { ...getAccount(interaction), ...patch };
  accountSessions.set(key(interaction), next);
  return next;
};
const getCreator = (interaction) => creatorSessions.get(key(interaction)) || { creatorId: null, page: 0 };
const setCreator = (interaction, patch) => {
  const next = { ...getCreator(interaction), ...patch };
  creatorSessions.set(key(interaction), next);
  return next;
};

function main(guild, requestedBy = 'Unknown User') {
  const cfg = config(guild.id);
  const ready = Object.keys(cfg.creators).length && Object.keys(cfg.accounts).length && cfg.alertsChannelId;
  const description = ready
    ? '✅ **Social Studio is ready.**\n\nUse the buttons below to manage creators, linked accounts, notifications and delivery.'
    : '⚠️ **Setup required**\n\n1️⃣ **Creator Profiles**\n2️⃣ **Accounts**\n3️⃣ **Channels**\n4️⃣ **Notifications**\n\n**Optional:** Templates and Feeds.';
  return {
    embeds: [emb(cfg, '📣 Social Studio', description, requestedBy)],
    components: [
      row(btn(`${P}creators`, '👥 Creator Profiles', ButtonStyle.Primary), btn(`${P}accounts`, '🔗 Accounts', ButtonStyle.Primary), btn(`${P}notifications`, '📢 Notifications', ButtonStyle.Primary)),
      row(btn(`${P}templates`, '🎨 Templates'), btn(`${P}feeds`, '📡 Feeds'), btn(`${P}channels`, '📂 Channels')),
      nav('main'),
    ],
  };
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

function platformSelect(selected = []) {
  return row(new StringSelectMenuBuilder()
    .setCustomId(`${P}account:platforms`)
    .setPlaceholder('2. Select one or more platforms')
    .setMinValues(1)
    .setMaxValues(5)
    .addOptions(PLATFORMS.map((platform) => ({ label: LABEL[platform], value: platform, default: selected.includes(platform) }))));
}

function channelSelect(id, selected, placeholder) {
  const menu = new ChannelSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1);
  if (selected) menu.setDefaultChannels([selected]);
  return row(menu);
}

function roleSelect(ids) {
  const menu = new RoleSelectMenuBuilder().setCustomId(`${P}roles:select`).setPlaceholder('Select Social Studio manager roles').setMinValues(0).setMaxValues(10);
  if (ids?.length) menu.setDefaultRoles(ids.slice(0, 10));
  return row(menu);
}

function creatorModal(creator = null) {
  return new ModalBuilder()
    .setCustomId(creator ? `${P}creator:update:${creator.creatorId}` : `${P}creator:create`)
    .setTitle(creator ? 'Edit Creator Profile' : 'Create Creator Profile')
    .addComponents(
      row(new TextInputBuilder().setCustomId('displayName').setLabel('Creator display name').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(true).setValue(String(creator?.displayName || ''))),
      row(new TextInputBuilder().setCustomId('group').setLabel('Group or team').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(false).setValue(String(creator?.group || ''))),
      row(new TextInputBuilder().setCustomId('tags').setLabel('Tags (comma separated)').setStyle(TextInputStyle.Short).setMaxLength(300).setRequired(false).setValue(Array.isArray(creator?.tags) ? creator.tags.join(', ') : '')),
      row(new TextInputBuilder().setCustomId('notes').setLabel('Notes').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(false).setValue(String(creator?.notes || ''))),
    );
}

function accountModal(platforms) {
  const modal = new ModalBuilder().setCustomId(`${P}account:create-multi`).setTitle('Add Social Accounts');
  for (const platform of platforms.slice(0, 5)) {
    modal.addComponents(row(new TextInputBuilder()
      .setCustomId(`account_${platform}`)
      .setLabel(`${LABEL[platform]} username, channel ID or URL`)
      .setStyle(TextInputStyle.Short)
      .setMaxLength(500)
      .setRequired(true)));
  }
  return modal;
}

function templateModal(type, cfg) {
  const template = cfg.templates?.[type] || {};
  return new ModalBuilder().setCustomId(`${P}template:save:${type}`).setTitle(`${type[0].toUpperCase() + type.slice(1)} Template`).addComponents(
    row(new TextInputBuilder().setCustomId('title').setLabel('Embed title').setStyle(TextInputStyle.Short).setMaxLength(256).setValue(String(template.title || '{creator} alert')).setRequired(true)),
    row(new TextInputBuilder().setCustomId('description').setLabel('Embed description').setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setValue(String(template.description || '{title}')).setRequired(true)),
    row(new TextInputBuilder().setCustomId('buttonLabel').setLabel('Link button label').setStyle(TextInputStyle.Short).setMaxLength(80).setValue(String(template.buttonLabel || 'Watch now')).setRequired(true)),
  );
}

function accountDisplay(account) {
  const migrated = migrateAccount(account);
  const target = migrated.profileUrl ? `[${migrated.username}](${migrated.profileUrl})` : migrated.username;
  return `${ICON[migrated.platform] || '🔗'} **${LABEL[migrated.platform] || migrated.platform}** — ${target}`;
}

function creatorPanel(interaction, cfg, creators) {
  const view = getCreator(interaction);
  const pages = Math.max(1, Math.ceil(creators.length / PAGE_SIZE));
  if (view.page >= pages) setCreator(interaction, { page: pages - 1 });
  const current = getCreator(interaction);
  const active = cfg.creators[current.creatorId] || null;
  if (current.creatorId && !active) setCreator(interaction, { creatorId: null });
  const creator = cfg.creators[getCreator(interaction).creatorId] || null;
  const linked = creator ? (creator.accountIds || []).map((id) => cfg.accounts[id]).filter(Boolean) : [];
  const description = creator
    ? [`👤 **${creator.displayName}**`, '', '**Platforms**', ...(linked.length ? linked.map(accountDisplay) : ['No linked social accounts.']), '', `**Status:** ${creator.enabled === false ? '🔴 Disabled' : linked.length ? '🟢 Monitoring' : '🟡 Waiting for accounts'}`, `**Accounts:** ${linked.length}`].join('\n')
    : `Select a creator profile below to view and manage it.\n\n**Profiles:** ${creators.length}\n**Selected:** None`;
  const components = [];
  const page = getCreator(interaction).page;
  const items = creators.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (items.length) components.push(creatorSelect(items, getCreator(interaction).creatorId, `${P}creator:select`, `Select a creator profile · Page ${page + 1}/${pages}`));
  components.push(row(btn(`${P}creator:new`, '➕ New Profile', ButtonStyle.Success), btn(`${P}creator:edit`, '✏️ Edit Profile', ButtonStyle.Primary, !creator), btn(`${P}creator:rebuild`, '🔄 Rebuild Profiles')));
  if (pages > 1) components.push(row(btn(`${P}creator:page:prev`, '◀ Previous', ButtonStyle.Secondary, page <= 0), btn(`${P}creator:page:next`, 'Next ▶', ButtonStyle.Secondary, page >= pages - 1)));
  components.push(nav('creators'));
  return { embeds: [emb(cfg, '👥 Creator Profiles', description, who(interaction))], components };
}

function editPanel(interaction, cfg, creator) {
  return {
    embeds: [emb(cfg, '✏️ Edit Creator Profile', [`👤 **${creator.displayName}**`, '', `**Group / Team:** ${creator.group || 'Not set'}`, `**Tags:** ${creator.tags?.length ? creator.tags.join(', ') : 'None'}`, `**Notes:** ${creator.notes || 'None'}`, `**Status:** ${creator.enabled === false ? '🔴 Disabled' : '🟢 Enabled'}`].join('\n'), who(interaction))],
    components: [
      row(btn(`${P}creator:change`, '📝 Change Details', ButtonStyle.Primary), btn(`${P}creator:toggle`, creator.enabled === false ? '▶️ Enable' : '⏸️ Disable', creator.enabled === false ? ButtonStyle.Success : ButtonStyle.Secondary), btn(`${P}accounts`, '🔗 Manage Accounts')),
      row(btn(`${P}creator:delete`, '🗑️ Delete Profile', ButtonStyle.Danger), btn(`${P}creators`, '⬅️ Back to Profile')),
      nav('creators'),
    ],
  };
}

function section(interaction, name) {
  const cfg = config(interaction.guildId);
  const accounts = Object.values(cfg.accounts);
  const creators = Object.values(cfg.creators).sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')));
  if (name === 'creators') return creatorPanel(interaction, cfg, creators);
  if (name === 'accounts') {
    const session = getAccount(interaction);
    const creator = session.creatorId ? cfg.creators[session.creatorId] || null : null;
    if (session.creatorId && !creator) {
      accountSessions.delete(key(interaction));
      return section(interaction, 'accounts');
    }
    const linked = creator ? (creator.accountIds || []).map((id) => cfg.accounts[id]).filter(Boolean) : [];
    const list = creator ? (linked.map(accountDisplay).join('\n') || 'No platform accounts are linked to this creator.') : 'Select a creator profile to view its linked accounts.';
    const description = creator ? `Viewing and managing accounts for **${creator.displayName}**.\n\nSelect one or more platforms below to add another account.` : 'Select a creator profile below to view its linked accounts or add new ones.';
    const components = [];
    if (creators.length) {
      components.push(
        creatorSelect(creators, session.creatorId),
        platformSelect(session.platforms),
        row(btn(`${P}account:continue`, 'Continue ➡️', ButtonStyle.Success, !session.creatorId || !session.platforms.length), btn(`${P}account:reset`, '↻ Reset', ButtonStyle.Secondary, !session.creatorId && !session.platforms.length), btn(`${P}account:check`, '🔎 Check All', ButtonStyle.Primary, !accounts.length)),
      );
    } else components.push(row(btn(`${P}creators`, '👥 Create Creator Profile', ButtonStyle.Primary)));
    components.push(nav('accounts'));
    return { embeds: [emb(cfg, '🔗 Accounts', description, who(interaction)).addFields({ name: creator ? `${creator.displayName} Accounts (${linked.length})` : 'Selected Accounts (0)', value: list })], components };
  }
  if (name === 'notifications') return { embeds: [emb(cfg, '📢 Notifications', 'Control whether Social Studio sends creator notifications for this server.', who(interaction))], components: [row(btn(`${P}toggle`, cfg.enabled ? '⏸️ Disable Notifications' : '▶️ Enable Notifications', cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success)), nav('notifications')] };
  if (name === 'templates') return { embeds: [emb(cfg, '🎨 Templates', 'Edit the message used for each notification type.', who(interaction))], components: [row(...ALERT_TYPES.map((type) => btn(`${P}template:${type}`, type[0].toUpperCase() + type.slice(1), ButtonStyle.Primary))), nav('templates')] };
  if (name === 'feeds') return { embeds: [emb(cfg, '📡 Feeds', 'Choose the default destination used by creator notifications.', who(interaction))], components: [channelSelect(`${P}feed:channel`, cfg.alertsChannelId, 'Select the default notification feed'), nav('feeds')] };
  if (name === 'channels') return { embeds: [emb(cfg, '📂 Channels', 'Configure the Discord channel used by Social Studio.', who(interaction))], components: [channelSelect(`${P}channel:alerts`, cfg.alertsChannelId, 'Select the Social Studio alert channel'), nav('channels')] };
  if (name === 'settings') return { embeds: [emb(cfg, '⚙️ Social Studio Settings', 'Guild-level Social Studio configuration.', who(interaction))], components: [row(btn(`${P}permissions`, '🔐 Permissions', ButtonStyle.Primary), btn(`${P}roles`, '👥 Roles', ButtonStyle.Primary), btn(`${P}automation`, '⚡ Automation', ButtonStyle.Primary)), row(btn(`${P}testing`, '🧪 Testing'), btn(`${P}data`, '🗄️ Data')), nav('settings')] };
  const components = [];
  if (name === 'permissions' || name === 'roles') components.push(roleSelect(cfg.managerRoleIds));
  if (name === 'automation') components.push(row(btn(`${P}toggle`, cfg.enabled ? 'Disable Module' : 'Enable Module', cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success), btn(`${P}account:check`, 'Run Check Now', ButtonStyle.Primary, !accounts.length)));
  if (name === 'testing') components.push(row(btn(`${P}test`, 'Send Test Notification', ButtonStyle.Primary, !cfg.alertsChannelId)));
  if (name === 'data') components.push(row(btn(`${P}data:refresh`, '🔄 Refresh'), btn(`${P}creator:rebuild`, 'Rebuild Profiles')));
  components.push(nav(name));
  return { embeds: [emb(cfg, name[0].toUpperCase() + name.slice(1), 'Social Studio settings.', who(interaction))], components };
}

async function respond(interaction, payload) {
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.update(payload);
  return true;
}

async function afterModal(interaction, name, message) {
  const payload = section(interaction, name);
  if (interaction.isFromMessage?.() && !interaction.deferred && !interaction.replied) {
    await interaction.update(payload);
    await interaction.followUp({ content: message, flags: 64 }).catch(() => null);
  } else if (!interaction.deferred && !interaction.replied) await interaction.reply({ content: message, flags: 64 });
  else await interaction.followUp({ content: message, flags: 64 });
  return true;
}

const opens = (id) => id === `${P}creator:new` || id === `${P}creator:change` || id === `${P}account:continue` || (id.startsWith(`${P}template:`) && !id.startsWith(`${P}template:save:`));

async function handle(interaction) {
  const id = String(interaction?.customId || '');
  if (id !== 'admin:social' && !id.startsWith(P)) return false;
  if (!interaction.guild?.id) throw new Error('Social Studio requires a guild interaction.');
  if (interaction.isMessageComponent?.() && !opens(id) && !interaction.deferred && !interaction.replied) await interaction.deferUpdate();
  const cfg = config(interaction.guildId);
  const actor = interaction.user?.id || null;

  if (id === 'admin:social' || id === `${P}main`) return respond(interaction, main(interaction.guild, who(interaction)));
  if (id === `${P}next`) return true;
  if (id === `${P}creator:new`) { await interaction.showModal(creatorModal()); return true; }
  if (id === `${P}creator:select`) { setCreator(interaction, { creatorId: interaction.values?.[0] || null }); return respond(interaction, section(interaction, 'creators')); }
  if (id === `${P}creator:page:prev` || id === `${P}creator:page:next`) { const view = getCreator(interaction); setCreator(interaction, { page: Math.max(0, view.page + (id.endsWith('next') ? 1 : -1)), creatorId: null }); return respond(interaction, section(interaction, 'creators')); }
  if (id === `${P}creator:edit`) { const creator = cfg.creators[getCreator(interaction).creatorId]; if (!creator) throw new Error('Select a creator profile first.'); return respond(interaction, editPanel(interaction, cfg, creator)); }
  if (id === `${P}creator:change`) { const creator = cfg.creators[getCreator(interaction).creatorId]; if (!creator) throw new Error('The selected creator profile no longer exists.'); await interaction.showModal(creatorModal(creator)); return true; }
  if (id === `${P}creator:toggle`) { const creator = cfg.creators[getCreator(interaction).creatorId]; if (!creator) throw new Error('The selected creator profile no longer exists.'); creator.enabled = creator.enabled === false; creator.updatedAt = new Date().toISOString(); save(interaction.guildId, cfg, interaction.guild, actor); return respond(interaction, editPanel(interaction, config(interaction.guildId), creator)); }
  if (id === `${P}creator:delete`) { const creator = cfg.creators[getCreator(interaction).creatorId]; if (!creator) throw new Error('The selected creator profile no longer exists.'); return respond(interaction, { embeds: [emb(cfg, '⚠️ Delete Creator Profile', `Delete **${creator.displayName}**? Linked accounts will remain stored but become unassigned.`, who(interaction))], components: [row(btn(`${P}creator:delete:cancel`, 'Cancel'), btn(`${P}creator:delete:confirm`, 'Delete Profile', ButtonStyle.Danger))] }); }
  if (id === `${P}creator:delete:cancel`) return respond(interaction, section(interaction, 'creators'));
  if (id === `${P}creator:delete:confirm`) { const creatorId = getCreator(interaction).creatorId; if (!cfg.creators[creatorId]) throw new Error('The selected creator profile no longer exists.'); delete cfg.creators[creatorId]; save(interaction.guildId, cfg, interaction.guild, actor); setCreator(interaction, { creatorId: null }); return respond(interaction, section(interaction, 'creators')); }
  if (id.startsWith(`${P}creator:update:`)) { const creatorId = id.slice(`${P}creator:update:`.length); const creator = cfg.creators[creatorId]; if (!creator) throw new Error('The creator profile no longer exists.'); creator.displayName = interaction.fields.getTextInputValue('displayName').trim(); creator.group = interaction.fields.getTextInputValue('group').trim(); creator.tags = interaction.fields.getTextInputValue('tags').split(',').map((value) => value.trim()).filter(Boolean); creator.notes = interaction.fields.getTextInputValue('notes').trim(); creator.updatedAt = new Date().toISOString(); save(interaction.guildId, cfg, interaction.guild, actor); setCreator(interaction, { creatorId }); return afterModal(interaction, 'creators', '✅ Creator profile updated and verified.'); }

  if (id === `${P}account:creator`) { setAccount(interaction, { creatorId: interaction.values?.[0] || null, platforms: [] }); return respond(interaction, section(interaction, 'accounts')); }
  if (id === `${P}account:platforms`) { setAccount(interaction, { platforms: (interaction.values || []).filter((platform) => PLATFORMS.includes(platform)).slice(0, 5) }); return respond(interaction, section(interaction, 'accounts')); }
  if (id === `${P}account:reset`) { accountSessions.delete(key(interaction)); return respond(interaction, section(interaction, 'accounts')); }
  if (id === `${P}account:continue`) { const session = getAccount(interaction); if (!session.creatorId || !cfg.creators[session.creatorId]) throw new Error('Select a creator profile first.'); if (!session.platforms.length) throw new Error('Select at least one platform first.'); await interaction.showModal(accountModal(session.platforms)); return true; }

  if (id === `${P}creator:create`) {
    const displayName = interaction.fields.getTextInputValue('displayName').trim();
    if (!displayName) throw new Error('Creator display name is required.');
    const creatorId = makeId('creator');
    cfg.creators[creatorId] = { creatorId, displayName, group: interaction.fields.getTextInputValue('group').trim(), tags: interaction.fields.getTextInputValue('tags').split(',').map((value) => value.trim()).filter(Boolean), notes: interaction.fields.getTextInputValue('notes').trim(), enabled: true, accountIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    save(interaction.guildId, cfg, interaction.guild, actor);
    setCreator(interaction, { creatorId });
    return afterModal(interaction, 'creators', '✅ Creator profile created and verified.');
  }

  if (id === `${P}account:create-multi`) {
    const session = getAccount(interaction);
    const creator = cfg.creators[session.creatorId];
    if (!creator) throw new Error('The selected creator profile no longer exists.');
    if (!session.platforms.length) throw new Error('No platforms were selected.');
    const accountIds = [];
    let created = 0;
    let updated = 0;

    for (const platform of session.platforms.slice(0, 5)) {
      const input = interaction.fields.getTextInputValue(`account_${platform}`).trim();
      if (!input) continue;
      const normalized = normalizeAccountInput(platform, input);
      const duplicate = Object.values(cfg.accounts).find((account) => {
        if (account.platform !== platform) return false;
        try {
          return migrateAccount(account).normalizedUsername === normalized.normalizedUsername;
        } catch {
          return String(account.username || '').toLowerCase() === normalized.normalizedUsername;
        }
      });
      const accountId = duplicate?.accountId || makeId('account');
      const now = new Date().toISOString();
      cfg.accounts[accountId] = {
        ...(duplicate || {}),
        accountId,
        platform,
        username: normalized.username,
        normalizedUsername: normalized.normalizedUsername,
        profileUrl: normalized.profileUrl,
        sourceInput: normalized.sourceInput,
        displayName: creator.displayName,
        enabled: duplicate?.enabled !== false,
        alertTypes: Array.isArray(duplicate?.alertTypes) ? duplicate.alertTypes : ['live'],
        alertChannelId: duplicate?.alertChannelId || null,
        createdAt: duplicate?.createdAt || now,
        updatedAt: now,
      };
      duplicate ? updated += 1 : created += 1;
      accountIds.push(accountId);
    }

    creator.accountIds = [...new Set([...(creator.accountIds || []), ...accountIds])];
    creator.updatedAt = new Date().toISOString();
    save(interaction.guildId, cfg, interaction.guild, actor);
    setAccount(interaction, { creatorId: creator.creatorId, platforms: [] });
    const summary = [created ? `${created} added` : null, updated ? `${updated} updated` : null].filter(Boolean).join(', ') || 'No changes';
    return afterModal(interaction, 'accounts', `✅ ${summary} and verified for ${creator.displayName}.`);
  }

  if (id.startsWith(`${P}template:`) && !id.startsWith(`${P}template:save:`)) { const type = id.split(':')[2]; if (!ALERT_TYPES.includes(type)) throw new Error('Unknown notification template.'); await interaction.showModal(templateModal(type, cfg)); return true; }
  if (id.startsWith(`${P}template:save:`)) { const type = id.split(':')[3]; cfg.templates[type] = { title: interaction.fields.getTextInputValue('title'), description: interaction.fields.getTextInputValue('description'), buttonLabel: interaction.fields.getTextInputValue('buttonLabel') }; save(interaction.guildId, cfg, interaction.guild, actor); return afterModal(interaction, 'templates', `✅ ${type} template saved.`); }
  if (id === `${P}feed:channel` || id === `${P}channel:alerts`) { cfg.alertsChannelId = interaction.values?.[0] || null; save(interaction.guildId, cfg, interaction.guild, actor); return respond(interaction, section(interaction, id.includes('feed') ? 'feeds' : 'channels')); }
  if (id === `${P}roles:select`) { cfg.managerRoleIds = interaction.values || []; save(interaction.guildId, cfg, interaction.guild, actor); return respond(interaction, section(interaction, 'roles')); }
  if (id === `${P}toggle`) { cfg.enabled = !cfg.enabled; save(interaction.guildId, cfg, interaction.guild, actor); return respond(interaction, section(interaction, 'notifications')); }
  if (id === `${P}account:check`) { const count = Object.values(cfg.accounts).filter((account) => account.enabled !== false).length; cfg.analytics.checks = Number(cfg.analytics.checks || 0) + count; save(interaction.guildId, cfg, interaction.guild, actor); return respond(interaction, section(interaction, 'accounts')); }
  if (id === `${P}creator:rebuild`) { const linked = new Set(Object.values(cfg.creators).flatMap((creator) => creator.accountIds || [])); for (const account of Object.values(cfg.accounts)) { if (linked.has(account.accountId)) continue; const creatorId = makeId('creator'); cfg.creators[creatorId] = { creatorId, displayName: account.displayName || account.username, group: '', tags: [account.platform], notes: '', enabled: true, accountIds: [account.accountId], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; } save(interaction.guildId, cfg, interaction.guild, actor); return respond(interaction, section(interaction, 'creators')); }
  if (id === `${P}test`) { if (!cfg.alertsChannelId) throw new Error('Choose an alert channel first.'); const channel = interaction.guild.channels.cache.get(cfg.alertsChannelId) || await interaction.guild.channels.fetch(cfg.alertsChannelId).catch(() => null); if (!channel?.isTextBased?.() || typeof channel.send !== 'function') throw new Error('The configured alert channel is unavailable.'); await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📣 Social Studio Test').setDescription('Your Social Studio notification channel is working.').setTimestamp()] }); return true; }

  const name = id.slice(P.length);
  if (NAV.has(name)) return respond(interaction, section(interaction, name));
  throw new Error(`Unknown Social Studio interaction: ${id}`);
}

module.exports = {
  buildPanel: main,
  handleInteraction: handle,
  buildSocialAdminPanel: main,
  buildSectionPanel: section,
  handleSocialAdminInteraction: handle,
};
