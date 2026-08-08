'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const store = require('./socialStudioStore');
const { ALERT_TYPES } = require('./socialStudioTemplates');

const P = 'social:';
const PAGE_SIZE = 25;
const ALERT_LABEL = { live: 'LIVE', ended: 'Stream Ended', vod: 'VOD', clip: 'Clip', upload: 'Upload', short: 'Short', post: 'Social Post' };
const ALERT_EMOJI = { live: '🔴', ended: '⚫', vod: '🎞️', clip: '🎬', upload: '📺', short: '📱', post: '📝' };
const sessions = new Map();

function sessionKey(interaction) {
  return `${interaction.guildId}:${interaction.user?.id || 'unknown'}`;
}

function getSession(interaction) {
  return sessions.get(sessionKey(interaction)) || {
    routeType: 'default',
    creatorId: null,
    creatorPage: 0,
    view: 'server',
  };
}

function setSession(interaction, patch) {
  const next = { ...getSession(interaction), ...patch };
  sessions.set(sessionKey(interaction), next);
  return next;
}

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(id, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
}

function who(interaction) {
  return interaction.member?.displayName
    || interaction.user?.displayName
    || interaction.user?.username
    || 'Unknown User';
}

function embed(config, title, description, interaction) {
  return new EmbedBuilder()
    .setColor(config.enabled ? 0x5865F2 : 0x747F8D)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `Requested by ${who(interaction)}` })
    .setTimestamp();
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

function routeTypeSelect(selected) {
  const copy = {
    default: ['🏠 Default Channel', 'Fallback when no dedicated or creator route applies.'],
    live: ['🔴 LIVE Alerts', 'When a creator starts streaming.'],
    ended: ['⚫ Stream Ended', 'When a live stream finishes.'],
    vod: ['🎥 VOD Posts', 'When a stream replay is available.'],
    clip: ['🎬 Clip Posts', 'When a new clip is found.'],
    upload: ['📺 Video Uploads', 'When a new video is uploaded.'],
    short: ['📱 Shorts', 'When a short-form video is found.'],
    post: ['📝 Social Posts', 'When a normal social post is found.'],
  };
  const options = ['default', ...ALERT_TYPES].map((type) => ({
    label: copy[type]?.[0] || type,
    value: type,
    description: copy[type]?.[1] || 'Choose the destination channel.',
    default: type === selected,
  }));
  return row(new StringSelectMenuBuilder()
    .setCustomId(`${P}channel:type`)
    .setPlaceholder('Choose what you want to configure')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options));
}

function sortedCreators(config) {
  return Object.values(config.creators || {})
    .filter((creator) => creator?.creatorId)
    .sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''), 'en-GB', { sensitivity: 'base' }));
}

function clampPage(page, pages) {
  return Math.max(0, Math.min(Number(page) || 0, Math.max(0, pages - 1)));
}

function creatorSelect(config, state) {
  const creators = sortedCreators(config);
  const pages = Math.max(1, Math.ceil(creators.length / PAGE_SIZE));
  const page = clampPage(state.creatorPage, pages);
  const items = creators.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (!items.length) return { row: null, pages, page, creators };
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${P}channel:creator:select`)
    .setPlaceholder(`Choose creator • page ${page + 1}/${pages}`)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(items.map((creator) => ({
      label: String(creator.displayName || 'Unnamed creator').slice(0, 100),
      value: creator.creatorId,
      description: creator.alertChannelId
        ? `Override: channel ${creator.alertChannelId}`.slice(0, 100)
        : 'Uses server routing',
      default: creator.creatorId === state.creatorId,
    })));
  return { row: row(menu), pages, page, creators };
}

function save(interaction, config) {
  return store.saveConfig(interaction.guildId, config, {
    actorId: interaction.user?.id || null,
    guild: interaction.guild,
  });
}

function cloneObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function applyCreatorOverrideToAccount(account, channelId) {
  if (!account || typeof account !== 'object') return account;
  if (!account.creatorRouteInherited) {
    account.creatorRoutePreviousChannelId = account.alertChannelId || null;
    account.creatorRoutePreviousChannels = cloneObject(account.alertChannels);
  }
  account.creatorRouteInherited = true;
  account.creatorRouteChannelId = channelId;
  account.alertChannelId = channelId;
  account.alertChannels = Object.fromEntries(ALERT_TYPES.map((type) => [type, channelId]));
  account.updatedAt = new Date().toISOString();
  return account;
}

function clearCreatorOverrideFromAccount(account) {
  if (!account || typeof account !== 'object' || !account.creatorRouteInherited) return account;
  account.alertChannelId = account.creatorRoutePreviousChannelId || null;
  account.alertChannels = cloneObject(account.creatorRoutePreviousChannels);
  delete account.creatorRouteInherited;
  delete account.creatorRouteChannelId;
  delete account.creatorRoutePreviousChannelId;
  delete account.creatorRoutePreviousChannels;
  account.updatedAt = new Date().toISOString();
  return account;
}

function syncCreatorOverride(config, creator) {
  if (!creator) return config;
  for (const accountId of creator.accountIds || []) {
    const account = config.accounts?.[accountId];
    if (!account) continue;
    if (creator.alertChannelId) applyCreatorOverrideToAccount(account, creator.alertChannelId);
    else clearCreatorOverrideFromAccount(account);
  }
  return config;
}

function syncAllCreatorOverrides(config) {
  for (const creator of Object.values(config.creators || {})) syncCreatorOverride(config, creator);
  return config;
}

function serverChannelsPayload(interaction) {
  const config = store.getConfig(interaction.guildId);
  const state = getSession(interaction);
  const routeType = ALERT_TYPES.includes(state.routeType) ? state.routeType : 'default';
  const selected = routeType === 'default' ? config.alertsChannelId : config.alertChannels?.[routeType];
  const overrides = sortedCreators(config).filter((creator) => creator.alertChannelId);
  const routeSummary = ALERT_TYPES.map((type) => `${ALERT_EMOJI[type] || '🔔'} **${ALERT_LABEL[type]}:** ${config.alertChannels?.[type] ? `<#${config.alertChannels[type]}>` : 'Default channel'}`).join('\n');
  const description = [
    'Choose where Social Studio automatic posts are sent.',
    '',
    `**🏠 Default Channel:** ${config.alertsChannelId ? `<#${config.alertsChannelId}>` : 'Not set'}`,
    'Used when no creator override or dedicated content channel applies.',
    '',
    '**Dedicated Channels**',
    routeSummary,
    '',
    '**👤 Creator Overrides**',
    overrides.length
      ? `${overrides.length} creator${overrides.length === 1 ? '' : 's'} currently use a private automatic-post destination.`
      : 'None configured. All creators currently follow the server routing above.',
    '',
    '**Routing Priority**',
    '1. Creator override → all linked platform content goes to that creator channel',
    '2. Dedicated content-type channel',
    '3. Default channel',
    '',
    'This lets a host streamer keep their content in a dedicated channel while community creators fall back to self-promo or other server-wide destinations.',
  ].join('\n');
  const components = [
    routeTypeSelect(routeType),
    channelSelect(`${P}channel:route`, selected, routeType === 'default' ? 'Choose the default channel' : `Choose where ${ALERT_LABEL[routeType]} posts go`),
  ];
  if (routeType !== 'default' && selected) components.push(row(button(`${P}channel:default`, '🏠 Use Default Channel')));
  components.push(row(button(`${P}channel:creator:open`, '👤 Creator Overrides', ButtonStyle.Primary)));
  components.push(row(button(`${P}main`, '⬅️ Back'), button(`${P}settings`, '⚙️ Settings')));
  return { embeds: [embed(config, '📂 Channels', description, interaction)], components };
}

function creatorChannelsPayload(interaction) {
  const config = store.getConfig(interaction.guildId);
  const state = getSession(interaction);
  const creatorMenu = creatorSelect(config, state);
  setSession(interaction, { creatorPage: creatorMenu.page });
  const selected = config.creators?.[state.creatorId] || null;
  const overridden = sortedCreators(config).filter((creator) => creator.alertChannelId);
  const summary = overridden.length
    ? overridden.slice(0, 12).map((creator) => `• **${creator.displayName || creator.creatorId}** → <#${creator.alertChannelId}>`).join('\n')
      + (overridden.length > 12 ? `\n• …and ${overridden.length - 12} more` : '')
    : 'No creator-specific channels are configured.';
  const description = [
    'Send every automatic Social Studio post for a selected creator to one Discord channel.',
    '',
    '**How it works**',
    'The override applies to all social accounts linked to that Creator Profile: Twitch, YouTube, TikTok, Kick, Facebook, Instagram and X.',
    'If a creator has no override, their posts use the server Dedicated Channels, then the Default Channel.',
    '',
    '**Current Overrides**',
    summary,
    '',
    selected ? `**Selected Creator:** ${selected.displayName || selected.creatorId}` : '**Selected Creator:** None',
    selected ? `**Automatic Post Channel:** ${selected.alertChannelId ? `<#${selected.alertChannelId}>` : 'Uses server routing'}` : 'Choose a creator below.',
  ].join('\n');
  const components = [];
  if (creatorMenu.row) components.push(creatorMenu.row);
  if (selected) {
    components.push(channelSelect(`${P}channel:creator:route`, selected.alertChannelId || null, `Choose ${String(selected.displayName || 'creator').slice(0, 70)}'s automatic post channel`));
    components.push(row(button(`${P}channel:creator:clear`, '↩️ Use Server Routing', ButtonStyle.Secondary, !selected.alertChannelId)));
  }
  if (creatorMenu.pages > 1) {
    components.push(row(
      button(`${P}channel:creator:prev`, '⬅️ Previous', ButtonStyle.Secondary, creatorMenu.page <= 0),
      button(`${P}channel:creator:next`, 'Next ➡️', ButtonStyle.Secondary, creatorMenu.page >= creatorMenu.pages - 1),
    ));
  }
  components.push(row(button(`${P}channels`, '⬅️ Channels'), button(`${P}main`, '🏠 Social Studio')));
  return { embeds: [embed(config, '👤 Creator Channel Overrides', description, interaction)], components };
}

async function update(interaction, payload) {
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.update(payload);
  return true;
}

async function handle(interaction) {
  const id = String(interaction?.customId || '');
  if (!interaction.guildId) return false;

  if (id === `${P}channels`) {
    setSession(interaction, { view: 'server' });
    return update(interaction, serverChannelsPayload(interaction));
  }

  if (id === `${P}channel:type`) {
    setSession(interaction, { routeType: interaction.values?.[0] || 'default', view: 'server' });
    return update(interaction, serverChannelsPayload(interaction));
  }

  if (id === `${P}channel:route`) {
    const config = store.getConfig(interaction.guildId);
    const type = getSession(interaction).routeType || 'default';
    const channelId = interaction.values?.[0] || null;
    if (type === 'default') config.alertsChannelId = channelId;
    else {
      config.alertChannels = cloneObject(config.alertChannels);
      config.alertChannels[type] = channelId;
    }
    save(interaction, config);
    return update(interaction, serverChannelsPayload(interaction));
  }

  if (id === `${P}channel:default`) {
    const config = store.getConfig(interaction.guildId);
    const type = getSession(interaction).routeType || 'default';
    if (type !== 'default') {
      config.alertChannels = cloneObject(config.alertChannels);
      delete config.alertChannels[type];
      save(interaction, config);
    }
    return update(interaction, serverChannelsPayload(interaction));
  }

  if (id === `${P}channel:creator:open`) {
    setSession(interaction, { view: 'creator', creatorId: null, creatorPage: 0 });
    return update(interaction, creatorChannelsPayload(interaction));
  }

  if (id === `${P}channel:creator:select`) {
    setSession(interaction, { view: 'creator', creatorId: interaction.values?.[0] || null });
    return update(interaction, creatorChannelsPayload(interaction));
  }

  if (id === `${P}channel:creator:prev` || id === `${P}channel:creator:next`) {
    const state = getSession(interaction);
    setSession(interaction, {
      creatorPage: Math.max(0, state.creatorPage + (id.endsWith('next') ? 1 : -1)),
      creatorId: null,
      view: 'creator',
    });
    return update(interaction, creatorChannelsPayload(interaction));
  }

  if (id === `${P}channel:creator:route`) {
    const config = store.getConfig(interaction.guildId);
    const creatorId = getSession(interaction).creatorId;
    const creator = config.creators?.[creatorId];
    if (!creator) throw new Error('Choose a creator profile first.');
    const channelId = interaction.values?.[0] || null;
    creator.alertChannelId = channelId;
    creator.updatedAt = new Date().toISOString();
    syncCreatorOverride(config, creator);
    save(interaction, config);
    return update(interaction, creatorChannelsPayload(interaction));
  }

  if (id === `${P}channel:creator:clear`) {
    const config = store.getConfig(interaction.guildId);
    const creatorId = getSession(interaction).creatorId;
    const creator = config.creators?.[creatorId];
    if (!creator) throw new Error('Choose a creator profile first.');
    creator.alertChannelId = null;
    creator.updatedAt = new Date().toISOString();
    syncCreatorOverride(config, creator);
    save(interaction, config);
    return update(interaction, creatorChannelsPayload(interaction));
  }

  return false;
}

function installStoreCompatibility() {
  if (store.__creatorRoutingCompatPatched) return;

  const originalSaveConfig = store.saveConfig.bind(store);
  store.saveConfig = function saveConfigWithCreatorRoutes(guildId, config, meta = {}) {
    return originalSaveConfig(guildId, syncAllCreatorOverrides(config), meta);
  };

  const originalUpsertCreatorAccount = store.upsertCreatorAccount.bind(store);
  store.upsertCreatorAccount = function upsertCreatorAccountWithRoute(guildId, creatorId, account, duplicateIds = [], meta = {}) {
    const creator = store.getCreator(guildId, creatorId);
    let nextAccount = account;
    if (creator?.alertChannelId) {
      nextAccount = applyCreatorOverrideToAccount({ ...account, alertChannels: cloneObject(account?.alertChannels) }, creator.alertChannelId);
    }
    return originalUpsertCreatorAccount(guildId, creatorId, nextAccount, duplicateIds, meta);
  };

  store.__creatorRoutingCompatPatched = true;
}

module.exports = {
  handle,
  installStoreCompatibility,
  syncAllCreatorOverrides,
};
