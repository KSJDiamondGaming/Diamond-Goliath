'use strict';

// src/modules/starboard/starboardManager.js

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const starboardStore = require('./starboardStore');

function canManageStarboard(member) {
  return Boolean(
    member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
    member?.permissions?.has(PermissionFlagsBits.ManageMessages)
  );
}

function emojiMatches(expected, reactionEmoji) {
  const wanted = String(expected || '⭐').trim();
  const emojiId = reactionEmoji?.id || null;
  const emojiName = reactionEmoji?.name || null;
  const fullCustom = emojiId && emojiName ? `<:${emojiName}:${emojiId}>` : null;

  return (
    wanted === emojiName ||
    wanted === emojiId ||
    wanted === fullCustom ||
    wanted.includes(`:${emojiId}>`)
  );
}

function buildMessageUrl(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function buildStarboardEmbed(message, starCount) {
  const content = message.content || '*No text content*';
  const firstAttachment = message.attachments?.first?.();

  const embed = new EmbedBuilder()
    .setColor('#facc15')
    .setAuthor({
      name: message.author?.tag || message.author?.username || 'Unknown User',
      iconURL: message.author?.displayAvatarURL?.() || undefined,
    })
    .setDescription(content.slice(0, 3500))
    .addFields({
      name: 'Original Message',
      value: `[Jump to message](${buildMessageUrl(message.guild.id, message.channel.id, message.id)})`,
    })
    .setFooter({ text: `⭐ ${starCount} star${starCount === 1 ? '' : 's'}` })
    .setTimestamp(message.createdAt || new Date());

  if (firstAttachment?.url && firstAttachment.contentType?.startsWith?.('image/')) {
    embed.setImage(firstAttachment.url);
  }

  return embed;
}

async function fetchMessageFromReaction(reaction) {
  if (reaction?.partial) {
    await reaction.fetch().catch(() => null);
  }

  if (reaction?.message?.partial) {
    await reaction.message.fetch().catch(() => null);
  }

  return reaction?.message || null;
}

async function getStarUsers(reaction) {
  const users = await reaction.users.fetch().catch(() => null);
  if (!users) return [];

  return [...users.values()]
    .filter((user) => !user.bot)
    .map((user) => user.id);
}

async function upsertStarboardPost(client, message, section, starUserIds) {
  const starboardChannel =
    message.guild.channels.cache.get(section.channelId) ||
    await message.guild.channels.fetch(section.channelId).catch(() => null);

  if (!starboardChannel?.send) return null;

  const existing = starboardStore.getPost(message.guild.id, message.id);
  const embed = buildStarboardEmbed(message, starUserIds.length);

  if (existing?.starboardMessageId) {
    const starboardMessage = await starboardChannel.messages
      .fetch(existing.starboardMessageId)
      .catch(() => null);

    if (starboardMessage?.editable) {
      await starboardMessage.edit({ embeds: [embed] });

      return starboardStore.savePost(message.guild.id, {
        ...existing,
        starUserIds,
      });
    }
  }

  const sent = await starboardChannel.send({
    content: `⭐ **${starUserIds.length}** <#${message.channel.id}>`,
    embeds: [embed],
  });

  return starboardStore.savePost(message.guild.id, {
    messageId: message.id,
    channelId: message.channel.id,
    authorId: message.author?.id,
    starboardMessageId: sent.id,
    starUserIds,
  });
}

async function removeStarboardPost(client, message, section) {
  const existing = starboardStore.getPost(message.guild.id, message.id);
  if (!existing?.starboardMessageId) return null;

  const starboardChannel =
    message.guild.channels.cache.get(section.channelId) ||
    await message.guild.channels.fetch(section.channelId).catch(() => null);

  const starboardMessage = await starboardChannel?.messages
    ?.fetch(existing.starboardMessageId)
    .catch(() => null);

  if (starboardMessage?.deletable) {
    await starboardMessage.delete().catch(() => null);
  }

  starboardStore.deletePost(message.guild.id, message.id);
  return existing;
}

async function handleStarReactionAdd(reaction, user, client) {
  if (user?.bot) return null;

  const message = await fetchMessageFromReaction(reaction);
  const guild = message?.guild;

  if (!guild?.id || !message?.id) return null;

  const section = starboardStore.getStarboardSection(guild.id);

  if (section.enabled === false || !section.channelId) return null;
  if (!emojiMatches(section.emoji, reaction.emoji)) return null;
  if (!section.allowBotMessages && message.author?.bot) return null;
  if (!section.allowSelfStar && message.author?.id === user.id) return null;
  if (message.channel?.id === section.channelId) return null;

  const starUserIds = await getStarUsers(reaction);

  if (starUserIds.length < section.threshold) return null;

  return upsertStarboardPost(client, message, section, starUserIds);
}

async function handleStarReactionRemove(reaction, user, client) {
  if (user?.bot) return null;

  const message = await fetchMessageFromReaction(reaction);
  const guild = message?.guild;

  if (!guild?.id || !message?.id) return null;

  const section = starboardStore.getStarboardSection(guild.id);

  if (section.enabled === false || !section.channelId) return null;
  if (!emojiMatches(section.emoji, reaction.emoji)) return null;

  const existing = starboardStore.getPost(guild.id, message.id);
  if (!existing) return null;

  const starUserIds = await getStarUsers(reaction);

  if (starUserIds.length < section.threshold) {
    return removeStarboardPost(client, message, section);
  }

  return upsertStarboardPost(client, message, section, starUserIds);
}

function configureStarboard(guildId, input = {}) {
  return starboardStore.updateStarboardSection(guildId, (section) => ({
    ...section,
    enabled: input.enabled ?? section.enabled,
    channelId: input.channelId ?? section.channelId,
    threshold: input.threshold ?? section.threshold,
    emoji: input.emoji ?? section.emoji,
    allowBotMessages: input.allowBotMessages ?? section.allowBotMessages,
    allowSelfStar: input.allowSelfStar ?? section.allowSelfStar,
    updatedAt: starboardStore.now(),
  }));
}

module.exports = {
  canManageStarboard,
  buildStarboardEmbed,
  configureStarboard,
  handleStarReactionAdd,
  handleStarReactionRemove,
};
