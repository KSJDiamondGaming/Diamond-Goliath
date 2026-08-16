'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
} = require('discord.js');
const suggestions = require('./suggestions');
const tracking = require('./suggestionsTracking');
const { isModuleEnabled } = require('../../../core/guild/guildManager');

const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (customId, label, style = ButtonStyle.Primary) => new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
const formatChannel = (id) => id ? `<#${id}>` : '`Not set`';
const formatRoles = (ids = []) => Array.isArray(ids) && ids.filter(Boolean).length ? ids.filter(Boolean).map((id) => `<@&${id}>`).join(', ') : '`None`';

function buildSuggestionEmbed(guild, suggestion, section) {
  const author = section.anonymous ? 'Anonymous' : `<@${suggestion.authorId}>`;
  const statusEmoji = suggestion.status === 'approved' ? '✅' : suggestion.status === 'denied' ? '❌' : '💡';
  const fields = [
    { name: 'Author', value: author, inline: true },
    { name: 'Status', value: suggestion.status, inline: true },
    { name: 'Votes', value: `👍 ${suggestion.upVotes.length}  👎 ${suggestion.downVotes.length}`, inline: true },
  ];
  if (suggestion.status !== 'pending' && suggestion.reviewReason) {
    fields.push({ name: 'Decision Note', value: suggestion.reviewReason, inline: false });
  }
  return new EmbedBuilder()
    .setColor(suggestion.status === 'approved' ? 0x57f287 : suggestion.status === 'denied' ? 0xed4245 : 0x5865f2)
    .setTitle(`${statusEmoji} Suggestion`)
    .setDescription(suggestion.content || '_No content_')
    .addFields(fields)
    .setFooter({ text: `Suggestion ID: ${suggestion.suggestionId}` })
    .setTimestamp(new Date(suggestion.createdAt || Date.now()));
}

function buildSuggestionRows(suggestion, section) {
  const rows = [];
  if (section.voting !== false && suggestion.status === 'pending') rows.push(row(
    button(`suggestions:vote:${suggestion.suggestionId}:up`, `👍 ${suggestion.upVotes.length}`, ButtonStyle.Secondary),
    button(`suggestions:vote:${suggestion.suggestionId}:down`, `👎 ${suggestion.downVotes.length}`, ButtonStyle.Secondary)
  ));
  if (section.requireReview !== false && suggestion.status === 'pending') rows.push(row(
    button(`suggestions:review:${suggestion.suggestionId}:approve`, 'Approve', ButtonStyle.Success),
    button(`suggestions:review:${suggestion.suggestionId}:deny`, 'Deny', ButtonStyle.Danger)
  ));
  return rows;
}

function buildSubmitPanelPayload(guildId) {
  const section = tracking.assertEnabled(guildId);
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('💡 Submit a Suggestion')
      .setDescription('Click the button below to send a suggestion to the server team.')
      .setFooter({ text: 'Goliath Suggestions' })
      .setTimestamp()],
    components: [row(button('suggestions:submit', section.anonymous ? 'Submit Anonymous Suggestion' : 'Submit Suggestion'))],
  };
}

function buildSubmitModal() {
  return new ModalBuilder()
    .setCustomId('suggestions:modal:submit')
    .setTitle('Submit Suggestion')
    .addComponents(row(
      new TextInputBuilder()
        .setCustomId('content')
        .setLabel('Your suggestion')
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(5)
        .setMaxLength(1800)
        .setRequired(true)
    ));
}

function buildReviewModal(suggestionId, action) {
  const approve = action === 'approve';
  return new ModalBuilder()
    .setCustomId(`suggestions:reviewModal:${suggestionId}:${approve ? 'approve' : 'deny'}`)
    .setTitle(approve ? 'Approve Suggestion' : 'Deny Suggestion')
    .addComponents(row(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Decision note (optional)')
        .setPlaceholder(approve ? 'Why is this being approved?' : 'Why is this being denied?')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(false)
    ));
}

function overviewDescription(section, enabled) {
  return [
    'Configure suggestion intake, review and voting.', '',
    `**Status:** ${enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
    `**Submit Channel:** ${formatChannel(section.submitChannelId)}`,
    `**Review Channel:** ${formatChannel(section.reviewChannelId)}`,
    `**Approved Channel:** ${formatChannel(section.approvedChannelId)}`,
    `**Denied Channel:** ${formatChannel(section.deniedChannelId)}`,
    `**Reviewer Roles:** ${formatRoles(section.reviewerRoleIds)}`,
    `**Voting:** ${section.voting !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
    `**Require Review:** ${section.requireReview !== false ? 'Yes ✅' : 'No ❌'}`,
    `**Anonymous:** ${section.anonymous === true ? 'Yes ✅' : 'No ❌'}`, '',
    `Submitted: \`${section.analytics.submitted}\` | Approved: \`${section.analytics.approved}\` | Denied: \`${section.analytics.denied}\``,
  ].join('\n');
}

function buildSuggestionsAdminPanel(guild, memberDisplayName = 'Unknown User', page = 'overview') {
  const section = suggestions.getSection(guild.id);
  const enabled = isModuleEnabled(guild.id, 'suggestions');
  if (page === 'destinations') {
    const embed = new EmbedBuilder()
      .setColor(enabled ? 0x57f287 : 0x5865f2)
      .setTitle('💡 Suggestions · Destinations')
      .setDescription([
        'Choose where reviewed suggestions are published.', '',
        `**Approved:** ${formatChannel(section.approvedChannelId)}`,
        `**Denied:** ${formatChannel(section.deniedChannelId)}`,
        '',
        'These are optional. If left unset, the original suggestion message is still updated with its final status.',
      ].join('\n'))
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp();
    return { embeds: [embed], components: [
      row(new ChannelSelectMenuBuilder().setCustomId('admin:suggestions:approvedChannel').setPlaceholder('Approved suggestions channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)),
      row(new ChannelSelectMenuBuilder().setCustomId('admin:suggestions:deniedChannel').setPlaceholder('Denied suggestions channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)),
      row(button('admin:suggestions:overview', '⬅️ Overview', ButtonStyle.Secondary), button('admin:modules', 'Modules', ButtonStyle.Secondary)),
    ] };
  }

  const embed = new EmbedBuilder()
    .setColor(enabled ? 0x57f287 : 0x5865f2)
    .setTitle('💡 Suggestions')
    .setDescription(overviewDescription(section, enabled))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();
  return { embeds: [embed], components: [
    row(new ChannelSelectMenuBuilder().setCustomId('admin:suggestions:submitChannel').setPlaceholder('Submit channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)),
    row(new ChannelSelectMenuBuilder().setCustomId('admin:suggestions:reviewChannel').setPlaceholder('Review channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)),
    row(new RoleSelectMenuBuilder().setCustomId('admin:suggestions:reviewerRoles').setPlaceholder('Reviewer roles').setMinValues(0).setMaxValues(10)),
    row(
      button('admin:suggestions:deploy', '🚀 Deploy', ButtonStyle.Success),
      button(enabled ? 'admin:suggestions:disable' : 'admin:suggestions:enable', enabled ? '⏸️ Disable' : '▶️ Enable', ButtonStyle.Secondary),
      button('admin:suggestions:toggleVoting', '🗳️ Voting', ButtonStyle.Secondary),
      button('admin:suggestions:toggleReview', '🔎 Review', ButtonStyle.Secondary),
      button('admin:suggestions:toggleAnonymous', '👤 Anonymous', ButtonStyle.Secondary)
    ),
    row(button('admin:suggestions:destinations', '📬 Destinations', ButtonStyle.Primary), button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary)),
  ] };
}

async function deploySubmitPanel(guild) {
  const section = tracking.assertEnabled(guild?.id);
  if (!section.submitChannelId) throw new Error('Choose a submit channel first.');
  const channel = await tracking.resolveSendableChannel(guild, section.submitChannelId, 'Submit channel');
  return channel.send(buildSubmitPanelPayload(guild.id));
}

module.exports = {
  buildSuggestionEmbed,
  buildSuggestionRows,
  buildSubmitPanelPayload,
  buildSubmitModal,
  buildReviewModal,
  buildSuggestionsAdminPanel,
  deploySubmitPanel,
};
