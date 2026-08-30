'use strict';

const { Events } = require('discord.js');
const { handleStickyMessage } = require('../../modules/messageStudio/sticky/stickyManager');
const translationThreadManager = require('../../modules/utilityStudio/translation/translationThreadManager');
const statsManager = require('../../modules/utilityStudio/stats/statsManager');
const levelingTracking = require('../../modules/communityStudio/leveling/levelingTracking');
const emojis = require('../../modules/utilityStudio/emojis/emojis');
const guildManager = require('../../core/guild/guildManager');
const { handleAutoMod } = require('../../core/administration/automod/events');

async function runHandler(label, handler, ...args) {
  try {
    return await handler(...args);
  } catch (error) {
    console.error(`[MessageCreate] ${label} handler failed:`, error?.stack || error?.message || error);
    return null;
  }
}

async function handleTypedEmojiMessage(message, client) {
  const source = String(message.content || '');
  const match = source.match(/^\/e\s+message\s+([\s\S]+)$/i);
  if (!match) return false;

  const text = String(match[1] || '').trim();
  if (!text) return false;

  const resolved = await emojis.resolveText(
    client,
    message.guild.id,
    text,
    'member_typed_emoji_message',
  );

  if (resolved === text) {
    await message.reply({
      content: 'No available Emoji Studio shortcodes were found. Try `:discord:`, `:youtube:` or `:twitch:`.',
      allowedMentions: { parse: [], repliedUser: false },
    });
    return true;
  }

  await message.channel.send({
    content: resolved,
    allowedMentions: { parse: [] },
  });

  // Keep the fallback feeling like a message composer helper when Goliath has
  // permission to clean up the typed command. If it cannot delete the source,
  // the converted bot message still succeeds and the original remains visible.
  await message.delete().catch(() => null);
  return true;
}

module.exports = {
  name: Events.MessageCreate,

  async execute(message, client) {
    if (!message.guild || !message.member || message.author?.bot) return;

    const autoModHandled = await runHandler('AutoMod', handleAutoMod, message);
    if (autoModHandled) return;

    const emojiMessageHandled = await runHandler('EmojiMessage', handleTypedEmojiMessage, message, client);
    if (emojiMessageHandled) return;

    await runHandler('Stats', statsManager.handleMessageCreate, message);
    await runHandler('Leveling', levelingTracking.handleMessageCreate, message);

    if (message.content && guildManager.isModuleEnabled(message.guild.id, 'translation')) {
      await runHandler('Translation', translationThreadManager.handleMessageCreate, message, client);
    }

    await runHandler('Sticky', handleStickyMessage, message, client);
  },
};
