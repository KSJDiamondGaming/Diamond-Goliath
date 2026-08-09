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

const P = 'social:';
const PAGE_SIZE = 25;
const sessions = new Map();

function key(i) { return `${i.guildId}:${i.user?.id || 'unknown'}`; }
function getState(i) { return sessions.get(key(i)) || { creatorId: null, page: 0 }; }
function setState(i, patch) { const next = { ...getState(i), ...patch }; sessions.set(key(i), next); return next; }
function row(...components) { return new ActionRowBuilder().addComponents(...components); }
function button(id, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
}
function who(i) { return i.member?.displayName || i.user?.displayName || i.user?.username || 'Unknown User'; }
function save(i, config) { return store.saveConfig(i.guildId, config, { actorId: i.user?.id || null, guild: i.guild }); }

function creatorEntries(config) {
  return Object.entries(config.creators || {})
    .filter(([, creator]) => creator && typeof creator === 'object')
    .map(([storageId, creator]) => ({ storageId, creator }))
    .sort((a, b) => String(a.creator.displayName || a.storageId).localeCompare(String(b.creator.displayName || b.storageId), 'en-GB', { sensitivity: 'base' }));
}

function payload(i) {
  const config = store.getConfig(i.guildId);
  const state = getState(i);
  const entries = creatorEntries(config);
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const page = Math.max(0, Math.min(state.page, pages - 1));
  if (page !== state.page) setState(i, { page });
  const selectedEntry = entries.find((entry) => entry.storageId === state.creatorId) || null;
  const selected = selectedEntry?.creator || null;
  const overrides = entries.filter(({ creator }) => creator.alertChannelId);

  const summary = overrides.length
    ? overrides.slice(0, 12).map(({ storageId, creator }) => `• **${creator.displayName || storageId}** → <#${creator.alertChannelId}>`).join('\n')
      + (overrides.length > 12 ? `\n• …and ${overrides.length - 12} more` : '')
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
    selected ? `**Selected Creator:** ${selected.displayName || selectedEntry.storageId}` : '**Selected Creator:** None',
    selected ? `**Automatic Post Channel:** ${selected.alertChannelId ? `<#${selected.alertChannelId}>` : 'Uses server routing'}` : entries.length ? 'Choose a creator below.' : 'No Creator Profiles were found.',
  ].join('\n');

  const components = [];
  const items = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (items.length) {
    components.push(row(new StringSelectMenuBuilder()
      .setCustomId(`${P}channel:creator:select`)
      .setPlaceholder(`Choose creator • page ${page + 1}/${pages}`)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(items.map(({ storageId, creator }) => ({
        label: String(creator.displayName || storageId).slice(0, 100),
        value: storageId,
        description: creator.alertChannelId ? 'Creator-specific automatic-post channel set' : 'Uses server routing',
        default: storageId === state.creatorId,
      })))));
  }

  if (selected) {
    const channelMenu = new ChannelSelectMenuBuilder()
      .setCustomId(`${P}channel:creator:route`)
      .setPlaceholder(`Choose ${String(selected.displayName || 'creator').slice(0, 70)}'s automatic post channel`)
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(1);
    if (selected.alertChannelId) channelMenu.setDefaultChannels([selected.alertChannelId]);
    components.push(row(channelMenu));
    components.push(row(button(`${P}channel:creator:clear`, '↩️ Use Server Routing', ButtonStyle.Secondary, !selected.alertChannelId)));
  }

  if (pages > 1) {
    components.push(row(
      button(`${P}channel:creator:prev`, '⬅️ Previous', ButtonStyle.Secondary, page <= 0),
      button(`${P}channel:creator:next`, 'Next ➡️', ButtonStyle.Secondary, page >= pages - 1),
    ));
  }
  components.push(row(button(`${P}channels`, '⬅️ Channels'), button(`${P}main`, '🏠 Social Studio')));

  return {
    embeds: [new EmbedBuilder()
      .setColor(config.enabled ? 0x5865F2 : 0x747F8D)
      .setTitle('👤 Creator Channel Overrides')
      .setDescription(description)
      .setFooter({ text: `Requested by ${who(i)}` })
      .setTimestamp()],
    components,
  };
}

async function update(i) {
  const next = payload(i);
  if (i.deferred || i.replied) await i.editReply(next);
  else await i.update(next);
  return true;
}

async function handle(i) {
  const id = String(i?.customId || '');
  if (!i.guildId || !id.startsWith(`${P}channel:creator:`)) return false;

  if (id === `${P}channel:creator:open`) {
    setState(i, { creatorId: null, page: 0 });
    return update(i);
  }
  if (id === `${P}channel:creator:select`) {
    setState(i, { creatorId: i.values?.[0] || null });
    return update(i);
  }
  if (id === `${P}channel:creator:prev` || id === `${P}channel:creator:next`) {
    const state = getState(i);
    setState(i, { creatorId: null, page: Math.max(0, state.page + (id.endsWith('next') ? 1 : -1)) });
    return update(i);
  }
  if (id === `${P}channel:creator:route` || id === `${P}channel:creator:clear`) {
    const config = store.getConfig(i.guildId);
    const creatorId = getState(i).creatorId;
    const creator = config.creators?.[creatorId];
    if (!creator) throw new Error('Choose a creator profile first.');
    creator.alertChannelId = id.endsWith(':clear') ? null : (i.values?.[0] || null);
    creator.updatedAt = new Date().toISOString();
    save(i, config);
    return update(i);
  }
  return false;
}

module.exports = { handle };
