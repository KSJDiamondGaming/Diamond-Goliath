'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const emojis = require('./emojis');

const PANEL_COLOR = 0x5865F2;
const MAX_USER_FAVOURITES = 25;
const MAX_USER_RECENT = 20;
const CATEGORY_ORDER = ['All', 'Gaming', 'Social', 'Reaction', 'Events', 'Seasonal', 'Moderation', 'General'];
const CORE_SEARCH_TERMS = Object.freeze({
  activision: ['activision', 'cod', 'callofduty', 'call of duty'],
  blizzard: ['blizzard', 'battle.net', 'battlenet'],
  discord: ['discord', 'chat', 'community', 'server'],
  epic: ['epic', 'epicgames', 'fortnite'],
  facebook: ['facebook', 'fb', 'meta'],
  instagram: ['instagram', 'insta', 'ig'],
  kick: ['kick', 'kickstreaming', 'stream'],
  nintendo: ['nintendo', 'switch'],
  pc: ['pc', 'computer', 'desktop'],
  playstation: ['playstation', 'ps', 'ps4', 'ps5'],
  snapchat: ['snapchat', 'snap'],
  steam: ['steam', 'valve'],
  tiktok: ['tiktok', 'tik tok', 'tt'],
  twitch: ['twitch', 'stream', 'streaming'],
  whatsapp: ['whatsapp', 'whats app', 'wa'],
  x: ['x', 'twitter', 'tweet'],
  xbox: ['xbox', 'xboxone', 'seriesx', 'seriess'],
  youtube: ['youtube', 'yt', 'video', 'videos', 'stream'],
});

const row = (...items) => new ActionRowBuilder().addComponents(...items);
const button = (id, label, style = ButtonStyle.Secondary, emoji = null) => {
  const item = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) item.setEmoji(emoji);
  return item;
};

function userId(interaction) { return String(interaction?.user?.id || '').trim(); }
function guildId(interaction) { return String(interaction?.guildId || interaction?.guild?.id || '').trim(); }
function displayName(interaction) { return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User'; }
function validEmojiIds(values, max) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter((id) => /^\d{16,20}$/.test(id)))].slice(0, max);
}

function getRawEmojiSection(id) {
  const modules = guildManager.getGuildSection(id, 'modules', {});
  return modules?.emojis && typeof modules.emojis === 'object' ? modules.emojis : {};
}

function getUserPreferences(id, memberId) {
  const source = getRawEmojiSection(id)?.userPreferences?.[String(memberId)] || {};
  return {
    favourites: validEmojiIds(source.favourites, MAX_USER_FAVOURITES),
    recent: validEmojiIds(source.recent, MAX_USER_RECENT),
  };
}

function saveUserPreferences(id, memberId, prefs, meta = {}) {
  const key = String(memberId);
  const nextPrefs = {
    favourites: validEmojiIds(prefs?.favourites, MAX_USER_FAVOURITES),
    recent: validEmojiIds(prefs?.recent, MAX_USER_RECENT),
  };
  guildManager.updateGuildSection(id, 'modules', (modules) => {
    const current = modules?.emojis && typeof modules.emojis === 'object' ? modules.emojis : {};
    return {
      ...modules,
      emojis: {
        ...current,
        userPreferences: {
          ...(current.userPreferences && typeof current.userPreferences === 'object' ? current.userPreferences : {}),
          [key]: nextPrefs,
        },
      },
    };
  }, {}, { actorId: meta.actorId || key, action: meta.action || 'emoji_user_preferences' });
  return nextPrefs;
}

function touchUserRecent(id, memberId, emojiId) {
  const prefs = getUserPreferences(id, memberId);
  const target = String(emojiId);
  return saveUserPreferences(id, memberId, {
    ...prefs,
    recent: [target, ...prefs.recent.filter((entry) => entry !== target)],
  }, { actorId: memberId, action: 'emoji_user_recent' });
}

function toggleUserFavourite(id, memberId, emojiId) {
  const prefs = getUserPreferences(id, memberId);
  const target = String(emojiId);
  const favourites = new Set(prefs.favourites);
  if (favourites.has(target)) favourites.delete(target);
  else {
    if (favourites.size >= MAX_USER_FAVOURITES) throw new Error(`You can save up to ${MAX_USER_FAVOURITES} favourite emojis.`);
    favourites.add(target);
  }
  return saveUserPreferences(id, memberId, { ...prefs, favourites: [...favourites] }, { actorId: memberId, action: 'emoji_user_favourite' });
}

async function availableCatalog(interaction) {
  const overview = await emojis.overview(interaction.client, guildId(interaction));
  return (overview.catalog || []).filter((emoji) => emoji.core || (overview.enabled && emoji.selected));
}

function emojiShortcode(emoji) {
  return emoji.core ? emoji.alias : (emoji.aliases?.[0] || emoji.name);
}

function searchTerms(emoji) {
  const shortcode = emojiShortcode(emoji);
  return [emoji.name, emoji.alias, emoji.category, shortcode, ...(emoji.aliases || []), ...(emoji.tags || []), ...(emoji.core ? (CORE_SEARCH_TERMS[shortcode] || []) : [])]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

function searchEmoji(catalog, query = '') {
  const clean = String(query || '').trim().toLowerCase();
  if (!clean) return catalog;
  return catalog.filter((emoji) => searchTerms(emoji).some((value) => value.includes(clean)));
}

function matchScore(emoji, query) {
  const clean = String(query || '').trim().toLowerCase();
  if (!clean) return 0;
  const shortcode = String(emojiShortcode(emoji) || '').toLowerCase();
  const terms = searchTerms(emoji);
  if (shortcode === clean) return 100;
  if (terms.some((term) => term === clean)) return 80;
  if (shortcode.startsWith(clean)) return 60;
  if (terms.some((term) => term.startsWith(clean))) return 40;
  return 10;
}

function byIds(catalog, ids) {
  const map = new Map(catalog.map((emoji) => [String(emoji.id), emoji]));
  return (ids || []).map((id) => map.get(String(id))).filter(Boolean);
}

function emojiOption(emoji, suffix = '') {
  const shortcode = emojiShortcode(emoji);
  return {
    label: `:${shortcode}:`.slice(0, 100),
    value: String(emoji.id),
    description: `${emoji.core ? 'Goliath Core' : emoji.category || 'Emoji Studio'}${suffix ? ` • ${suffix}` : ''}`.slice(0, 100),
    emoji: emoji.component || undefined,
  };
}

function pickerRow(items, placeholder = 'Choose an emoji') {
  if (!items.length) return null;
  return row(new StringSelectMenuBuilder()
    .setCustomId('user:emojis:pick')
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(items.slice(0, 25).map((emoji) => emojiOption(emoji))));
}

function navigationRows() {
  return [
    row(
      button('user:emojis:favourites', 'Favourites', ButtonStyle.Secondary, '⭐'),
      button('user:emojis:recent', 'Recent', ButtonStyle.Secondary, '🕘'),
      button('user:emojis:categories', 'Categories', ButtonStyle.Secondary, '📁'),
      button('user:emojis:search-open', 'Search', ButtonStyle.Primary, '🔎'),
    ),
    row(button('user:category:utility', 'Back', ButtonStyle.Secondary, '⬅️'), button('user:home', 'User Panel', ButtonStyle.Secondary, '🏠')),
  ];
}

async function buildPanel(interaction, notice = '') {
  const catalog = await availableCatalog(interaction);
  const prefs = getUserPreferences(guildId(interaction), userId(interaction));
  const favourites = byIds(catalog, prefs.favourites);
  const recent = byIds(catalog, prefs.recent);
  const quick = [...favourites, ...recent, ...catalog.filter((emoji) => emoji.core)]
    .filter((emoji, index, all) => all.findIndex((entry) => String(entry.id) === String(emoji.id)) === index)
    .slice(0, 25);
  const components = [];
  const picker = pickerRow(quick, favourites.length ? 'Choose from favourites, recent or Core' : 'Choose an emoji');
  if (picker) components.push(picker);
  components.push(...navigationRows());
  return {
    embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('😀 My Emojis').setDescription([
      'Use `/e` for quick everyday emoji search. Search by the real name or natural shortcuts such as `yt`, `ps5`, `insta`, `snap`, `twitter`, `stream`, or `video`.',
      '',
      `**Available:** ${catalog.length}`,
      `**Your favourites:** ${favourites.length}/${MAX_USER_FAVOURITES}`,
      `**Recent:** ${recent.length}/${MAX_USER_RECENT}`,
      '',
      'Favourites and recent choices are automatically prioritised in `/e` autocomplete.',
      notice ? `\n${notice}` : '',
    ].filter(Boolean).join('\n')).setFooter({ text: `Requested by ${displayName(interaction)}` }).setTimestamp()],
    components: components.slice(0, 5),
  };
}

async function buildListPanel(interaction, mode, query = '', category = '') {
  const catalog = await availableCatalog(interaction);
  const prefs = getUserPreferences(guildId(interaction), userId(interaction));
  let items = catalog;
  let title = '😀 Browse Emojis';
  let description = 'Choose an emoji below.';
  if (mode === 'favourites') {
    items = byIds(catalog, prefs.favourites);
    title = '⭐ My Favourite Emojis';
    description = items.length ? 'Your saved emojis, ready to use again.' : 'You have not saved any favourites yet.';
  } else if (mode === 'recent') {
    items = byIds(catalog, prefs.recent);
    title = '🕘 Recently Used Emojis';
    description = items.length ? 'The emojis you selected most recently.' : 'Your recent list is empty.';
  } else if (mode === 'search') {
    items = searchEmoji(catalog, query);
    title = '🔎 Emoji Search';
    description = items.length ? `Results for **${String(query).slice(0, 80)}**.` : `No emojis matched **${String(query).slice(0, 80)}**.`;
  } else if (mode === 'category') {
    const wanted = String(category || 'All');
    items = wanted === 'All' ? catalog : catalog.filter((emoji) => String(emoji.category || 'General').toLowerCase() === wanted.toLowerCase());
    title = `📁 ${wanted} Emojis`;
    description = `${items.length} matching emoji${items.length === 1 ? '' : 's'} available.`;
  }
  const components = [];
  const picker = pickerRow(items, 'Choose an emoji');
  if (picker) components.push(picker);
  components.push(...navigationRows());
  return { embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle(title).setDescription(description).setFooter({ text: `Requested by ${displayName(interaction)}` }).setTimestamp()], components: components.slice(0, 5) };
}

async function buildCategoriesPanel(interaction) {
  const catalog = await availableCatalog(interaction);
  const counts = new Map();
  for (const emoji of catalog) counts.set(String(emoji.category || 'General'), (counts.get(String(emoji.category || 'General')) || 0) + 1);
  const categories = CATEGORY_ORDER.filter((name) => name === 'All' || counts.has(name));
  const options = categories.slice(0, 25).map((name) => ({ label: name, value: name, description: name === 'All' ? `${catalog.length} emojis` : `${counts.get(name) || 0} emojis` }));
  return {
    embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('📁 Emoji Categories').setDescription('Pick a category to browse the emojis available in this server.')],
    components: [row(new StringSelectMenuBuilder().setCustomId('user:emojis:category-select').setPlaceholder('Choose a category').addOptions(options)), ...navigationRows()].slice(0, 5),
  };
}

function searchModal() {
  return new ModalBuilder().setCustomId('user:emojis:search-submit').setTitle('Search Emojis').addComponents(
    row(new TextInputBuilder().setCustomId('query').setLabel('Name, nickname, tag or category').setPlaceholder('youtube, yt, ps5, insta, dolphin, heart...').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)),
  );
}

async function buildSelectedPanel(interaction, emojiId) {
  const catalog = await availableCatalog(interaction);
  const emoji = catalog.find((entry) => String(entry.id) === String(emojiId));
  if (!emoji) throw new Error('That emoji is no longer available in this server.');
  const prefs = touchUserRecent(guildId(interaction), userId(interaction), emoji.id);
  const favourite = prefs.favourites.includes(String(emoji.id));
  const shortcode = emojiShortcode(emoji);
  return {
    embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle(`${emoji.mention} Emoji Ready`).setDescription([
      emoji.mention,
      '',
      `**Shortcode:** \`:${shortcode}:\``,
      `**Name:** ${emoji.name}`,
      `**Category:** ${emoji.category || 'General'}`,
      `**Tags:** ${(emoji.tags || []).join(', ') || 'none'}`,
      '',
      'For normal chat, use `/e` and choose this emoji from autocomplete.',
    ].join('\n')).setFooter({ text: `Requested by ${displayName(interaction)}` }).setTimestamp()],
    components: [
      row(button(`user:emojis:favourite-toggle:${emoji.id}`, favourite ? 'Remove Favourite' : 'Add Favourite', favourite ? ButtonStyle.Secondary : ButtonStyle.Primary, '⭐')),
      row(button('user:emojis:home', 'Back to My Emojis', ButtonStyle.Secondary, '⬅️'), button('user:emojis:search-open', 'Search Again', ButtonStyle.Primary, '🔎')),
    ],
  };
}

async function autocomplete(interaction) {
  if (!interaction?.guildId || !interaction?.client) return interaction.respond([]).catch(() => null);
  const focused = String(interaction.options.getFocused?.() || '').trim();
  const catalog = await availableCatalog(interaction);
  const prefs = getUserPreferences(guildId(interaction), userId(interaction));
  const favouriteIds = new Set(prefs.favourites);
  const recentIds = new Set(prefs.recent);
  const matches = searchEmoji(catalog, focused)
    .sort((a, b) => matchScore(b, focused) - matchScore(a, focused)
      || Number(favouriteIds.has(String(b.id))) - Number(favouriteIds.has(String(a.id)))
      || Number(recentIds.has(String(b.id))) - Number(recentIds.has(String(a.id)))
      || (b.usage?.count || 0) - (a.usage?.count || 0)
      || String(emojiShortcode(a)).localeCompare(String(emojiShortcode(b))))
    .slice(0, 25);
  return interaction.respond(matches.map((emoji) => {
    const prefix = favouriteIds.has(String(emoji.id)) ? '⭐ ' : recentIds.has(String(emoji.id)) ? '🕘 ' : '';
    const shortcode = emojiShortcode(emoji);
    const value = emoji.core ? `core:${shortcode}` : String(emoji.id);
    return { name: `${prefix}:${shortcode}: · ${emoji.category || 'General'}`.slice(0, 100), value };
  })).catch(() => null);
}

async function commandSelection(interaction, reference) {
  const raw = String(reference || '').trim();
  if (!raw) return null;

  const catalog = await availableCatalog(interaction);
  let emoji = null;

  if (raw.toLowerCase().startsWith('core:')) {
    const alias = raw.slice(5).trim().toLowerCase();
    if (!emojis.isApprovedCoreAlias(alias)) return null;
    emoji = catalog.find((entry) => (
      entry.core
      && String(entry.alias || '').toLowerCase() === alias
      && String(entry.name || '').toLowerCase() === `${emojis.CORE_EMOJI_PREFIX}${alias}`
    )) || null;
  } else if (/^\d{16,20}$/.test(raw)) {
    emoji = catalog.find((entry) => String(entry.id) === raw) || null;
  } else {
    const clean = raw.replace(/^:+|:+$/g, '').toLowerCase();
    const exact = catalog.find((entry) => String(emojiShortcode(entry) || '').toLowerCase() === clean)
      || catalog.find((entry) => searchTerms(entry).some((term) => term === clean));
    emoji = exact || searchEmoji(catalog, clean)
      .sort((a, b) => matchScore(b, clean) - matchScore(a, clean))[0] || null;
  }

  if (!emoji) return null;
  touchUserRecent(guildId(interaction), userId(interaction), emoji.id);
  return { content: emoji.mention, allowedMentions: { parse: [] } };
}

async function resolveMessageText(interaction, content) {
  const source = String(content || '');
  if (!source.trim()) return { source, resolved: source, changed: false };
  const resolved = await emojis.resolveText(interaction.client, guildId(interaction), source, 'member_message_convert');
  return { source, resolved, changed: resolved !== source };
}

async function buildMessageConversionPreview(interaction, message) {
  if (!message?.id || !message?.channelId) throw new Error('That message could not be read.');
  if (String(message.author?.id || '') !== userId(interaction)) {
    return { content: 'You can only convert emoji shortcodes in your own messages.', components: [] };
  }
  const result = await resolveMessageText(interaction, message.content);
  if (!result.changed) {
    return { content: 'No available Emoji Studio shortcodes were found in that message. Try something like `:youtube:` or `:twitch:`.', components: [] };
  }
  return {
    embeds: [new EmbedBuilder().setColor(PANEL_COLOR).setTitle('😀 Convert Emoji Shortcodes').setDescription([
      '**Preview**',
      result.resolved.slice(0, 3500),
      '',
      'Your original message will stay in place. Press **Post Converted** and Goliath will reply to it with the converted version.',
    ].join('\n'))],
    components: [row(button(`user:emojis:convert-post:${message.channelId}:${message.id}`, 'Post Converted', ButtonStyle.Primary, '😀'))],
  };
}

async function handleInteraction(interaction, updatePanel) {
  const id = String(interaction?.customId || '');
  if (!id.startsWith('user:emojis:')) return false;
  if (id === 'user:emojis:home') { await updatePanel(interaction, await buildPanel(interaction)); return true; }
  if (id === 'user:emojis:favourites') { await updatePanel(interaction, await buildListPanel(interaction, 'favourites')); return true; }
  if (id === 'user:emojis:recent') { await updatePanel(interaction, await buildListPanel(interaction, 'recent')); return true; }
  if (id === 'user:emojis:categories') { await updatePanel(interaction, await buildCategoriesPanel(interaction)); return true; }
  if (id === 'user:emojis:search-open') { await interaction.showModal(searchModal()); return true; }
  if (id === 'user:emojis:search-submit' && interaction.isModalSubmit?.()) { await updatePanel(interaction, await buildListPanel(interaction, 'search', interaction.fields.getTextInputValue('query'))); return true; }
  if (id === 'user:emojis:category-select' && interaction.isStringSelectMenu?.()) { await updatePanel(interaction, await buildListPanel(interaction, 'category', '', interaction.values?.[0] || 'All')); return true; }
  if (id === 'user:emojis:pick' && interaction.isStringSelectMenu?.()) { await updatePanel(interaction, await buildSelectedPanel(interaction, interaction.values?.[0])); return true; }

  const convertMatch = id.match(/^user:emojis:convert-post:(\d{16,20}):(\d{16,20})$/);
  if (convertMatch && interaction.isButton?.()) {
    const channel = await interaction.client.channels.fetch(convertMatch[1]).catch(() => null);
    const message = await channel?.messages?.fetch?.(convertMatch[2]).catch(() => null);
    if (!message || String(message.author?.id || '') !== userId(interaction)) throw new Error('The original message is no longer available to convert.');
    const result = await resolveMessageText(interaction, message.content);
    if (!result.changed) throw new Error('That message no longer contains available Emoji Studio shortcodes.');
    await channel.send({ content: result.resolved, reply: { messageReference: message.id, failIfNotExists: false }, allowedMentions: { parse: [] } });
    await updatePanel(interaction, { content: '✅ Converted message posted as a reply. Your original message was left untouched.', embeds: [], components: [] });
    return true;
  }

  const favouriteMatch = id.match(/^user:emojis:favourite-toggle:(\d{16,20})$/);
  if (favouriteMatch && interaction.isButton?.()) {
    toggleUserFavourite(guildId(interaction), userId(interaction), favouriteMatch[1]);
    await updatePanel(interaction, await buildSelectedPanel(interaction, favouriteMatch[1]));
    return true;
  }
  return false;
}

module.exports = {
  buildPanel,
  buildMessageConversionPreview,
  handleInteraction,
  autocomplete,
  commandSelection,
  resolveMessageText,
  getUserPreferences,
};