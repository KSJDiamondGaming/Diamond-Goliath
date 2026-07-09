'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');

const suggestionsStore = require('./suggestionsStore');

function isReviewer(member, section) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.ManageGuild) || member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  return (section.reviewerRoleIds || []).some((roleId) => member.roles?.cache?.has(roleId));
}

function buildSuggestionEmbed(guild, suggestion, section) {
  const author = section.anonymous ? 'Anonymous' : `<@${suggestion.authorId}>`;
  const statusEmoji = suggestion.status === 'approved' ? '✅' : suggestion.status === 'denied' ? '❌' : '💡';
  return new EmbedBuilder()
    .setColor(suggestion.status === 'approved' ? 0x57f287 : suggestion.status === 'denied' ? 0xed4245 : 0x5865f2)
    .setTitle(`${statusEmoji} Suggestion`)
    .setDescription(suggestion.content || '_No content_')
    .addFields(
      { name: 'Author', value: author, inline: true },
      { name: 'Status', value: suggestion.status, inline: true },
      { name: 'Votes', value: `👍 ${suggestion.upVotes.length}  👎 ${suggestion.downVotes.length}`, inline: true }
    )
    .setFooter({ text: `Suggestion ID: ${suggestion.suggestionId}` })
    .setTimestamp(new Date(suggestion.createdAt || Date.now()));
}

function buildSuggestionRows(suggestion, section) {
  const rows = [];
  if (section.voting !== false) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`suggestions:vote:${suggestion.suggestionId}:up`).setLabel(`👍 ${suggestion.upVotes.length}`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`suggestions:vote:${suggestion.suggestionId}:down`).setLabel(`👎 ${suggestion.downVotes.length}`).setStyle(ButtonStyle.Secondary)
    ));
  }
  if (section.requireReview !== false && suggestion.status === 'pending') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`suggestions:review:${suggestion.suggestionId}:approve`).setLabel('Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`suggestions:review:${suggestion.suggestionId}:deny`).setLabel('Deny').setStyle(ButtonStyle.Danger)
    ));
  }
  return rows;
}

function buildSubmitPanelPayload(guildId) {
  const section = suggestionsStore.getSection(guildId);
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('💡 Submit a Suggestion')
        .setDescription('Click the button below to send a suggestion to the server team.')
        .setFooter({ text: 'Goliath Suggestions' })
        .setTimestamp(),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('suggestions:submit')
          .setLabel(section.anonymous ? 'Submit Anonymous Suggestion' : 'Submit Suggestion')
          .setStyle(ButtonStyle.Primary)
      ),
    ],
  };
}

function buildSubmitModal() {
  return new ModalBuilder()
    .setCustomId('suggestions:modal:submit')
    .setTitle('Submit Suggestion')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Your suggestion')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(5)
          .setMaxLength(1800)
          .setRequired(true)
      )
    );
}

async function sendSuggestionMessages(interaction, suggestion) {
  const guild = interaction.guild;
  const section = suggestionsStore.getSection(guild.id);
  const embed = buildSuggestionEmbed(guild, suggestion, section);
  const components = buildSuggestionRows(suggestion, section);
  const targetChannelId = section.requireReview !== false ? section.reviewChannelId || section.submitChannelId : section.submitChannelId;
  const targetChannel = targetChannelId ? guild.channels.cache.get(targetChannelId) || await guild.channels.fetch(targetChannelId).catch(() => null) : null;

  let message = null;
  if (targetChannel?.send) {
    message = await targetChannel.send({ embeds: [embed], components }).catch(() => null);
  }

  return suggestionsStore.saveSuggestion(guild.id, {
    ...suggestion,
    channelId: message?.channelId || targetChannelId,
    messageId: message?.id || null,
    reviewMessageId: section.requireReview !== false ? message?.id || null : null,
  }, guild);
}

async function submitSuggestion(interaction) {
  const section = suggestionsStore.getSection(interaction.guildId);
  if (section.enabled === false) throw new Error('Suggestions are disabled.');
  const content = interaction.fields.getTextInputValue('content');
  const suggestion = suggestionsStore.saveSuggestion(interaction.guildId, {
    content,
    authorId: interaction.user.id,
  }, interaction.guild);
  const saved = await sendSuggestionMessages(interaction, suggestion);
  suggestionsStore.incrementAnalytics(interaction.guildId, { submitted: 1 }, interaction.guild);
  return saved;
}

async function refreshSuggestionMessage(guild, suggestionId) {
  const section = suggestionsStore.getSection(guild.id);
  const suggestion = suggestionsStore.getSuggestion(guild.id, suggestionId);
  if (!suggestion?.channelId || !suggestion.messageId) return null;
  const channel = guild.channels.cache.get(suggestion.channelId) || await guild.channels.fetch(suggestion.channelId).catch(() => null);
  const message = await channel?.messages?.fetch(suggestion.messageId).catch(() => null);
  if (!message?.editable) return null;
  await message.edit({ embeds: [buildSuggestionEmbed(guild, suggestion, section)], components: buildSuggestionRows(suggestion, section) }).catch(() => null);
  return suggestion;
}

async function vote(interaction, suggestionId, direction) {
  const userId = interaction.user.id;
  const updated = suggestionsStore.updateSuggestion(interaction.guildId, suggestionId, (suggestion) => {
    const upVotes = new Set(suggestion.upVotes || []);
    const downVotes = new Set(suggestion.downVotes || []);
    if (direction === 'up') {
      downVotes.delete(userId);
      upVotes.has(userId) ? upVotes.delete(userId) : upVotes.add(userId);
    } else {
      upVotes.delete(userId);
      downVotes.has(userId) ? downVotes.delete(userId) : downVotes.add(userId);
    }
    return { ...suggestion, upVotes: [...upVotes], downVotes: [...downVotes] };
  }, interaction.guild);
  suggestionsStore.incrementAnalytics(interaction.guildId, direction === 'up' ? { votesUp: 1 } : { votesDown: 1 }, interaction.guild);
  await refreshSuggestionMessage(interaction.guild, suggestionId);
  return updated;
}

async function review(interaction, suggestionId, action) {
  const section = suggestionsStore.getSection(interaction.guildId);
  if (!isReviewer(interaction.member, section)) throw new Error('You do not have permission to review suggestions.');
  const status = action === 'approve' ? 'approved' : 'denied';
  const updated = suggestionsStore.updateSuggestion(interaction.guildId, suggestionId, {
    status,
    reviewedBy: interaction.user.id,
    reviewedAt: new Date().toISOString(),
  }, interaction.guild);
  suggestionsStore.incrementAnalytics(interaction.guildId, status === 'approved' ? { approved: 1 } : { denied: 1 }, interaction.guild);
  await refreshSuggestionMessage(interaction.guild, suggestionId);

  const targetId = status === 'approved' ? section.approvedChannelId : section.deniedChannelId;
  const target = targetId ? interaction.guild.channels.cache.get(targetId) || await interaction.guild.channels.fetch(targetId).catch(() => null) : null;
  if (target?.send) await target.send({ embeds: [buildSuggestionEmbed(interaction.guild, updated, section)] }).catch(() => null);
  return updated;
}

async function deploySubmitPanel(guild) {
  const section = suggestionsStore.getSection(guild.id);
  if (section.enabled === false) throw new Error('Suggestions are disabled.');
  if (!section.submitChannelId) throw new Error('Choose a submit channel first.');
  const channel = guild.channels.cache.get(section.submitChannelId) || await guild.channels.fetch(section.submitChannelId).catch(() => null);
  if (!channel?.send) throw new Error('Submit channel is not sendable.');
  return channel.send(buildSubmitPanelPayload(guild.id));
}

module.exports = {
  isReviewer,
  buildSuggestionEmbed,
  buildSuggestionRows,
  buildSubmitPanelPayload,
  buildSubmitModal,
  submitSuggestion,
  vote,
  review,
  deploySubmitPanel,
};
