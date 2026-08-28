'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { safeReply, ephemeralError } = require('../../../core/ui/interactionResponse');
const { COLORS, createEmbed } = require('../../../core/ui/embeds');
const { canUseModAction } = require('./permissions');
const { searchCases } = require('./storage');

const ACTIONS = new Set(['warn', 'timeout', 'kick', 'ban', 'unwarn', 'remove-timeout']);
const STATUSES = new Set(['active', 'reversed', 'expired']);

function buildCaseSearchModal() {
  return new ModalBuilder()
    .setCustomId('mod_submit_case_search')
    .setTitle('Search Moderation Cases')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('case_id').setLabel('Case ID').setStyle(TextInputStyle.Short).setPlaceholder('Optional — e.g. 123').setRequired(false).setMaxLength(12)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('user_id').setLabel('User ID').setStyle(TextInputStyle.Short).setPlaceholder('Optional Discord user ID').setRequired(false).setMaxLength(30)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('moderator_id').setLabel('Moderator ID').setStyle(TextInputStyle.Short).setPlaceholder('Optional Discord moderator ID').setRequired(false).setMaxLength(30)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('action').setLabel('Action').setStyle(TextInputStyle.Short).setPlaceholder('warn, timeout, kick, ban...').setRequired(false).setMaxLength(30)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('status').setLabel('Status').setStyle(TextInputStyle.Short).setPlaceholder('active, reversed, expired').setRequired(false).setMaxLength(20)
      )
    );
}

function readSearchInput(interaction, field) {
  return String(interaction.fields.getTextInputValue(field) || '').trim();
}

function normalizeSearchFilters(interaction) {
  const caseId = readSearchInput(interaction, 'case_id');
  const userId = readSearchInput(interaction, 'user_id');
  const moderatorId = readSearchInput(interaction, 'moderator_id');
  const action = readSearchInput(interaction, 'action').toLowerCase();
  const status = readSearchInput(interaction, 'status').toLowerCase();

  if (caseId && !/^\d+$/.test(caseId)) return { error: 'Case ID must be a number.' };
  if (action && !ACTIONS.has(action)) return { error: `Unknown action. Use: ${[...ACTIONS].join(', ')}.` };
  if (status && !STATUSES.has(status)) return { error: `Unknown status. Use: ${[...STATUSES].join(', ')}.` };

  return { caseId: caseId || undefined, userId: userId || undefined, moderatorId: moderatorId || undefined, action: action || undefined, status: status || undefined, page: 0, pageSize: 10 };
}

function formatSearchCase(entry) {
  return [`**#${entry.caseId}** • ${entry.action} • ${entry.status || 'active'}`, `User: <@${entry.userId}> • Moderator: <@${entry.moderatorId}>`, `Reason: ${entry.reason || 'No reason provided'}`].join('\n');
}

function buildSearchResultsEmbed(result) {
  const description = result.results.length ? result.results.map(formatSearchCase).join('\n\n') : 'No moderation cases matched those filters.';
  return createEmbed({
    title: 'Moderation Case Search',
    description: description.slice(0, 3900),
    color: COLORS.PRIMARY,
    footer: `Showing ${result.total ? `${result.page * result.pageSize + 1}-${Math.min((result.page + 1) * result.pageSize, result.total)} of ${result.total}` : '0'} result${result.total === 1 ? '' : 's'}`,
  });
}

function buildSearchButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mod_case_search').setLabel('New Search').setStyle(ButtonStyle.Primary)
    ),
  ];
}

function buildSearchPayload(result) {
  return { embeds: [buildSearchResultsEmbed(result)], components: buildSearchButtons() };
}

async function openCaseSearch(interaction) {
  if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) return safeReply(interaction, ephemeralError('No permission to search moderation cases.'));
  await interaction.showModal(buildCaseSearchModal());
  return true;
}

async function submitCaseSearch(interaction) {
  if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) return safeReply(interaction, ephemeralError('No permission to search moderation cases.'));
  const filters = normalizeSearchFilters(interaction);
  if (filters.error) return safeReply(interaction, ephemeralError(filters.error));
  const result = searchCases(interaction.guild.id, filters);
  return safeReply(interaction, { ...buildSearchPayload(result), flags: 64 });
}

async function handleCaseSearchAction(interaction) {
  if (String(interaction.customId || '') !== 'mod_case_search') return false;
  return openCaseSearch(interaction);
}

async function handleCaseSearchModal(interaction) {
  if (interaction.customId !== 'mod_submit_case_search') return false;
  return submitCaseSearch(interaction);
}

module.exports = { openCaseSearch, submitCaseSearch, handleCaseSearchAction, handleCaseSearchModal };
