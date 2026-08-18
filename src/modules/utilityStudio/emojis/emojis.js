'use strict';

const emojiApi = require('./emojisApi');
const emojiStore = require('./emojisStore');

const MAX_APPLICATION_EMOJIS = 2000;

function requireEmojiManager(client) {
  const manager = client?.application?.emojis;
  if (!manager) throw new Error('Discord application emoji manager is unavailable.');
  return manager;
}

function serialise(emoji) {
  return {
    id: emoji.id,
    name: emoji.name,
    animated: Boolean(emoji.animated),
    url: emoji.imageURL?.({ extension: 'webp', size: 128 }) || emoji.url || null,
    mention: emoji.toString(),
  };
}

async function listBank(client) {
  const emojis = await requireEmojiManager(client).fetch();
  return [...emojis.values()].map(serialise).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function overview(client, guildId) {
  const bank = await listBank(client);
  const section = emojiStore.getSection(guildId);
  const validIds = new Set(bank.map((emoji) => emoji.id));
  const favourites = section.favourites.filter((id) => validIds.has(id));
  if (favourites.length !== section.favourites.length) emojiStore.saveSection(guildId, { favourites });
  return {
    enabled: section.enabled,
    capacity: { used: bank.length, max: MAX_APPLICATION_EMOJIS, remaining: Math.max(0, MAX_APPLICATION_EMOJIS - bank.length) },
    guildCapacity: { used: favourites.length, max: emojiStore.MAX_GUILD_EMOJIS, remaining: Math.max(0, emojiStore.MAX_GUILD_EMOJIS - favourites.length) },
    bank,
    favourites,
  };
}

async function importFromEmojiGG(client, emojiGgId, requestedName = null) {
  const manager = requireEmojiManager(client);
  const bank = await manager.fetch();
  if (bank.size >= MAX_APPLICATION_EMOJIS) throw new Error('Goliath application emoji bank is full (2,000/2,000).');

  const source = await emojiApi.findById(emojiGgId);
  if (!source) throw new Error('Emoji.gg emoji was not found.');
  const url = emojiApi.assetUrl(source);
  if (!url) throw new Error('Emoji.gg did not provide an image URL for this emoji.');
  const attachment = await emojiApi.downloadAsset(url);
  const rawName = requestedName || source.title || source.slug || `emoji_${source.id}`;
  const name = String(rawName).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || `emoji_${String(source.id).slice(-8)}`;

  const duplicate = [...bank.values()].find((emoji) => emoji.name === name);
  if (duplicate) return { emoji: serialise(duplicate), created: false, sourceId: String(source.id) };

  const created = await manager.create({ attachment, name });
  return { emoji: serialise(created), created: true, sourceId: String(source.id) };
}

async function removeFromBank(client, emojiId) {
  const manager = requireEmojiManager(client);
  const emoji = await manager.fetch(String(emojiId));
  if (!emoji) throw new Error('Application emoji was not found.');
  await manager.delete(emoji.id);
  return true;
}

async function renameInBank(client, emojiId, name) {
  const clean = String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  if (!clean) throw new Error('Emoji name is required.');
  const edited = await requireEmojiManager(client).edit(String(emojiId), { name: clean });
  return serialise(edited);
}

function render(emoji, fallback = '') {
  if (!emoji?.id || !emoji?.name) return fallback;
  return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
}

async function resolveGuildEmoji(client, guildId, reference) {
  const section = emojiStore.getSection(guildId);
  if (!section.enabled) return null;

  const wanted = String(reference || '').trim();
  if (!wanted) return null;

  const favourites = new Set(section.favourites);
  if (!favourites.size) return null;

  const bank = await requireEmojiManager(client).fetch();
  let emoji = null;

  if (/^\d{16,20}$/.test(wanted)) {
    emoji = bank.get(wanted) || null;
  } else {
    const name = wanted.replace(/^:+|:+$/g, '').toLowerCase();
    emoji = [...bank.values()].find((entry) => String(entry.name || '').toLowerCase() === name) || null;
  }

  if (!emoji || !favourites.has(String(emoji.id))) return null;
  return serialise(emoji);
}

async function renderForGuild(client, guildId, reference, fallback = '') {
  const emoji = await resolveGuildEmoji(client, guildId, reference);
  return render(emoji, fallback);
}

async function componentEmojiForGuild(client, guildId, reference) {
  const emoji = await resolveGuildEmoji(client, guildId, reference);
  if (!emoji) return null;
  return {
    id: emoji.id,
    name: emoji.name,
    animated: emoji.animated,
  };
}

module.exports = {
  MAX_APPLICATION_EMOJIS,
  listBank,
  overview,
  importFromEmojiGG,
  removeFromBank,
  renameInBank,
  render,
  resolveGuildEmoji,
  renderForGuild,
  componentEmojiForGuild,
  serialise,
};
