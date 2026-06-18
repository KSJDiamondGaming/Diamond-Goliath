const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const suggestionStore = require('./suggestionStore');
const { isModuleEnabled } = require('../../guild/guildManager');

const STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DENIED: 'denied',
  IMPLEMENTED: 'implemented',
  ARCHIVED: 'archived',
};

function canManageSuggestions(member) {
  return Boolean(
    member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
    member?.permissions?.has(PermissionFlagsBits.ManageMessages)
  );
}

function getUserTag(user) {
  return user?.tag || user?.username || user?.displayName || null;
}

function buildSuggestionEmbed(suggestion) {
  const upvotes = suggestion.upvotes?.length || 0;
  const downvotes = suggestion.downvotes?.length || 0;

  return new EmbedBuilder()
    .setColor(getStatusColor(suggestion.status))
    .setTitle(`Suggestion #${suggestion.id}`)
    .setDescription(suggestion.content || 'No suggestion content provided.')
    .addFields(
      { name: 'Status', value: suggestion.status || STATUS.PENDING, inline: true },
      { name: 'Votes', value: `👍 ${upvotes}  👎 ${downvotes}`, inline: true },
      { name: 'Author', value: suggestion.authorTag || suggestion.authorId || 'Unknown', inline: false }
    )
    .setTimestamp(new Date(suggestion.updatedAt || suggestion.createdAt || Date.now()));
}

function getStatusColor(status) {
  switch (status) {
    case STATUS.ACCEPTED:
      return '#22c55e';
    case STATUS.DENIED:
      return '#ef4444';
    case STATUS.IMPLEMENTED:
      return '#a855f7';
    case STATUS.ARCHIVED:
      return '#64748b';
    default:
      return '#2b7cff';
  }
}

async function postSuggestion(channel, input, client) {
  if (!channel?.guild) return null;
  if (!isModuleEnabled(channel.guild.id, 'suggestions')) return null;

  const suggestion = suggestionStore.createSuggestion(
    channel.guild.id,
    {
      content: input.content,
      authorId: input.author?.id || input.authorId || null,
      authorTag: getUserTag(input.author) || input.authorTag || null,
      channelId: channel.id,
    },
    client
  );

  if (!suggestion) return null;

  const message = await channel.send({
    embeds: [buildSuggestionEmbed(suggestion)],
  });

  return suggestionStore.updateSuggestion(
    channel.guild.id,
    suggestion.id,
    {
      messageId: message.id,
      channelId: channel.id,
    },
    client
  );
}

function setSuggestionStatus(guildId, suggestionId, status, actor, client) {
  if (!isModuleEnabled(guildId, 'suggestions')) return null;
  if (!Object.values(STATUS).includes(status)) return null;

  return suggestionStore.updateSuggestion(
    guildId,
    suggestionId,
    {
      status,
      reviewedBy: actor?.id || null,
      reviewedByTag: getUserTag(actor),
      reviewedAt: new Date().toISOString(),
    },
    client
  );
}

function toggleVote(guildId, suggestionId, userId, voteType, client) {
  if (!isModuleEnabled(guildId, 'suggestions')) return null;

  const suggestion = suggestionStore.getSuggestion(guildId, suggestionId, client);
  if (!suggestion || !userId) return null;

  const upvotes = new Set(suggestion.upvotes || []);
  const downvotes = new Set(suggestion.downvotes || []);

  if (voteType === 'up') {
    downvotes.delete(userId);
    upvotes.has(userId) ? upvotes.delete(userId) : upvotes.add(userId);
  }

  if (voteType === 'down') {
    upvotes.delete(userId);
    downvotes.has(userId) ? downvotes.delete(userId) : downvotes.add(userId);
  }

  return suggestionStore.updateSuggestion(
    guildId,
    suggestionId,
    {
      upvotes: [...upvotes],
      downvotes: [...downvotes],
    },
    client
  );
}

function getRecentSuggestions(guildId, options = {}, client) {
  return suggestionStore.listSuggestions(guildId, options, client);
}

module.exports = {
  STATUS,
  canManageSuggestions,
  buildSuggestionEmbed,
  postSuggestion,
  setSuggestionStatus,
  toggleVote,
  getRecentSuggestions,
};
