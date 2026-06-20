'use strict';

// src/modules/starboard/starboardManager.js

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const starboardStore = require('./starboardStore');
const { isModuleEnabled } = require('../../guild/guildManager');

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp)(\?.*)?$/i;

function canManageStarboard(member) {
  return Boolean(
    member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
    member?.permissions?.has(PermissionFlagsBits.ManageMessages)
  );
}

function normalizeEmojiToken(value) {
  return String(value || '').trim();
}

function emojiMatches(expected, reactionEmoji) {
  const wanted = normalizeEmojiToken(expected || '⭐');
  const emojiId = reactionEmoji?.id || null;
  const emojiName = reactionEmoji?.name || null;

  if (!wanted || !emojiName) return false;

  const customEmojiForms = emojiId && emojiName
    ? new Set([
        emojiId,
        emojiName,
        `<:${emojiName}:${emojiId}>`,
        `<a:${emojiName}:${emojiId}>`,
      ])
    : new Set([emojiName]);

  if (customEmojiForms.has(wanted)) return true;

  return Boolean(emojiId && wanted.includes(`:${emojiId}>`));
}

function buildMessageUrl(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function isImageAttachment(attachment) {
  return Boolean(
    attachment?.url &&
    (
      attachment.contentType?.startsWith?.('image/') ||
      IMAGE_EXTENSION_PATTERN.test(attachment.url)
    )
  );
}

function buildStarboardEmbed(message, starCount, section = {}) {
  const content = message.content || '*No text content*';
  const firstAttachment = message.attachments?.find?.(isImageAttachment) || message.attachments?.first?.();
  const emoji = section.emoji || '⭐';

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
    .setFooter({ text: `${emoji} ${starCount} star${starCount === 1 ? '' : 's'}` })
    .setTimestamp(message.createdAt || new Date());

  if (isImageAttachment(firstAttachment)) {
    embed.setImage(firstAttachment.url);
  }

  return embed;
}

async function fetchMessageFromReaction(reaction) {
  if (reaction?.partial) await reaction.fetch().catch(() => null);
  if (reaction?.message?.partial) await reaction.message.fetch().catch(() => null);
  return reaction?.message || null;
}

async function getStarUsers(reaction) {
  const users = await reaction.users.fetch().catch(() => null);
  if (!users) return [];
  return [...users.values()].filter((user) => !user.bot).map((user) => user.id);
}

async function resolveStarboardChannel(message, section) {
  const channelId = section?.channelId;
  if (!message?.guild?.channels || !channelId) return null;

  const channel =
    message.guild.channels.cache.get(channelId) ||
    await message.guild.channels.fetch(channelId).catch(() => null);

  if (!channel?.send) return null;

  const me = message.guild.members.me;
  const permissions = me && channel.permissionsFor?.(me);

  if (permissions) {
    const requiredPermissions = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ];

    const hasRequiredPermissions = requiredPermissions.every((permission) => permissions.has(permission));
    if (!hasRequiredPermissions) return null;
  }

  return channel;
}

function buildStarboardMessageContent(message, section, starCount) {
  const emoji = section.emoji || '⭐';
  return `${emoji} **${starCount}** <#${message.channel.id}>`;
}

function buildPostPayload(message, starboardMessage, starUserIds) {
  return {
    messageId: message.id,
    channelId: message.channel.id,
    authorId: message.author?.id,
    starboardMessageId: starboardMessage?.id,
    starUserIds,
  };
}

async function upsertStarboardPost(client, message, section, starUserIds) {
  const starboardChannel = await resolveStarboardChannel(message, section);
  if (!starboardChannel) return null;

  const existing = starboardStore.getPost(message.guild.id, message.id);
  const embed = buildStarboardEmbed(message, starUserIds.length, section);
  const content = buildStarboardMessageContent(message, section, starUserIds.length);

  if (existing?.starboardMessageId) {
    const starboardMessage = await starboardChannel.messages
      .fetch(existing.starboardMessageId)
      .catch(() => null);

    if (starboardMessage?.editable) {
      await starboardMessage.edit({ content, embeds: [embed] }).catch(() => null);

      return starboardStore.savePost(
        message.guild.id,
        {
          ...existing,
          starUserIds,
          channelId: message.channel.id,
          authorId: message.author?.id,
        }
      );
    }
  }

  const sent = await starboardChannel
    .send({ content, embeds: [embed] })
    .catch(() => null);

  if (!sent) return null;

  return starboardStore.savePost(
    message.guild.id,
    buildPostPayload(message, sent, starUserIds)
  );
}

async function removeStarboardPost(client, message, section) {
  const existing = starboardStore.getPost(message.guild.id, message.id);
  if (!existing?.starboardMessageId) return null;

  const starboardChannel = await resolveStarboardChannel(message, section);
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
  if (!isModuleEnabled(guild.id, 'starboard')) return null;

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
  if (!isModuleEnabled(guild.id, 'starboard')) return null;

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
  if (!isModuleEnabled(guildId, 'starboard')) {
    throw new Error('Starboard module is disabled for this server.');
  }

  return starboardStore.updateStarboardSection(
    guildId,
    (section) => ({
      ...section,
      enabled: input.enabled ?? section.enabled,
      channelId: input.channelId ?? section.channelId,
      threshold: input.threshold ?? section.threshold,
      emoji: input.emoji ?? section.emoji,
      allowBotMessages: input.allowBotMessages ?? section.allowBotMessages,
      allowSelfStar: input.allowSelfStar ?? section.allowSelfStar,
      updatedAt: starboardStore.now(),
    })
  );
}

module.exports = {
  canManageStarboard,
  buildStarboardEmbed,
  configureStarboard,
  handleStarReactionAdd,
  handleStarReactionRemove,
};
