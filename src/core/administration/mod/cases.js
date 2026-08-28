'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const {
  db,
  getAllCases,
  getCaseById,
  searchCases,
  updateCaseReason,
  updateCaseNote,
  clearCaseNote,
  updateCaseStatus,
  deleteWarningByCaseId,
  recordCaseAudit,
  emitCaseUpdated,
} = require('./storage');
const { COLORS, EMOJIS } = require('../../ui/uiConfig');
const { createEmbed } = require('../../ui/embeds');
const { safeReply, ephemeralError } = require('../../../core/ui/interactionResponse');
const { canUseModAction } = require('./permissions');

const STATUS_LABELS = Object.freeze({
  active: '🟢 Active',
  reversed: '🔁 Reversed',
  expired: '⌛ Expired',
});

const TRACKED_ACTIONS = Object.freeze([
  'warn',
  'timeout',
  'kick',
  'ban',
  'unwarn',
  'remove-timeout',
]);
const APPEAL_PAGE_SIZE = 5;
const MAX_APPEALS_PER_CASE = 20;
const APPEAL_STATUSES = new Set(['pending', 'approved', 'denied']);

function getStatus(modCase = {}) { return modCase.status || 'active'; }
function getStatusLabel(modCase = {}) { return STATUS_LABELS[getStatus(modCase)] || STATUS_LABELS.active; }
function getCaseTimestamp(dateValue) {
  const timestamp = new Date(dateValue).getTime();
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : Math.floor(Date.now() / 1000);
}
function formatCaseSummary(modCase = {}) { return [`#${modCase.caseId || '?'}`, modCase.action || 'unknown', getStatusLabel(modCase), `<t:${getCaseTimestamp(modCase.createdAt)}:R>`].join(' • '); }
function countCasesByAction(cases = [], action) { return cases.filter((modCase) => modCase.action === action).length; }
function countCasesByStatus(cases = [], status) { return cases.filter((modCase) => getStatus(modCase) === status).length; }
function buildTopList(itemsMap = {}, limit = 5, formatter = (id, count) => `${id} — ${count}`) {
  return Object.entries(itemsMap).filter(([id]) => Boolean(id)).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id, count]) => formatter(id, count));
}
function incrementCount(map, key) { if (key) map[key] = (map[key] || 0) + 1; }
function getRecentCases(cases = [], limit = 5) { return cases.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit); }
function getActionCounts(cases = []) {
  return TRACKED_ACTIONS.reduce((counts, action) => { counts[`${action.replace(/-/g, '')}Count`] = countCasesByAction(cases, action); return counts; }, {});
}
function getModerationAnalytics(guildId) {
  const allCases = getAllCases(guildId) || [];
  const moderatorCounts = {};
  const userCounts = {};
  for (const modCase of allCases) { incrementCount(moderatorCounts, modCase.moderatorId); incrementCount(userCounts, modCase.userId); }
  return {
    totalCases: allCases.length,
    activeCases: countCasesByStatus(allCases, 'active'),
    reversedCases: countCasesByStatus(allCases, 'reversed'),
    expiredCases: countCasesByStatus(allCases, 'expired'),
    ...getActionCounts(allCases),
    topModerators: buildTopList(moderatorCounts, 5, (id, count) => `<@${id}> • ${count} case${count === 1 ? '' : 's'}`),
    topUsers: buildTopList(userCounts, 5, (id, count) => `<@${id}> • ${count} case${count === 1 ? '' : 's'}`),
    recentCases: getRecentCases(allCases, 5),
  };
}

function buildCaseFilterButtons(targetId, actionFilter = 'all', statusFilter = 'all', page = 0) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod_filter_cases:${targetId}:all:${statusFilter}:${page}`).setLabel('📂 All').setStyle(actionFilter === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod_filter_cases:${targetId}:warn:${statusFilter}:${page}`).setLabel(`${EMOJIS.WARNING} Warns`).setStyle(actionFilter === 'warn' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod_filter_cases:${targetId}:timeout:${statusFilter}:${page}`).setLabel(`${EMOJIS.TIMEOUT} Timeouts`).setStyle(actionFilter === 'timeout' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod_filter_cases:${targetId}:note:${statusFilter}:${page}`).setLabel(`${EMOJIS.NOTE} Notes`).setStyle(actionFilter === 'note' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod_filter_cases:${targetId}:${actionFilter}:active:${page}`).setLabel(`${EMOJIS.ACTIVE} Active`).setStyle(statusFilter === 'active' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod_filter_cases:${targetId}:${actionFilter}:reversed:${page}`).setLabel(`${EMOJIS.REVERSED} Reversed`).setStyle(statusFilter === 'reversed' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod_filter_cases:${targetId}:${actionFilter}:expired:${page}`).setLabel(`${EMOJIS.EXPIRED} Expired`).setStyle(statusFilter === 'expired' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
  return [row1, row2];
}
function buildCasesPageButtons(targetId, page, totalPages, actionFilter = 'all', statusFilter = 'all') {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod_case_page:${targetId}:${actionFilter}:${statusFilter}:${page - 1}`).setLabel(`${EMOJIS.BACK} Prev`).setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`mod_case_page:${targetId}:${actionFilter}:${statusFilter}:${page + 1}`).setLabel(`Next ${EMOJIS.NEXT}`).setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
  )];
}

function getCaseAppeals(modCase = {}) {
  return Array.isArray(modCase?.metadata?.appeals)
    ? modCase.metadata.appeals.filter((appeal) => appeal && typeof appeal === 'object' && appeal.id)
    : [];
}
function getPendingAppeal(modCase = {}) { return getCaseAppeals(modCase).find((appeal) => appeal.status === 'pending') || null; }
function getAppealById(modCase, appealId) { return getCaseAppeals(modCase).find((appeal) => String(appeal.id) === String(appealId)) || null; }
function getPendingAppeals(guildId) {
  const pending = [];
  for (const modCase of getAllCases(guildId) || []) {
    for (const appeal of getCaseAppeals(modCase)) {
      if (appeal.status === 'pending') pending.push({ case: modCase, appeal });
    }
  }
  return pending.sort((a, b) => String(a.appeal.submittedAt || '').localeCompare(String(b.appeal.submittedAt || '')));
}
function updateCaseMetadata(guildId, caseId, metadata) {
  const updatedAt = new Date().toISOString();
  const result = db.prepare('UPDATE cases SET metadata = ?, updated_at = ? WHERE guild_id = ? AND case_id = ?').run(JSON.stringify(metadata || {}), updatedAt, String(guildId), Number(caseId));
  if (!result.changes) return null;
  const updated = getCaseById(guildId, caseId);
  if (updated) emitCaseUpdated(guildId, updated);
  return updated;
}
function submitAppeal(guildId, caseId, { appellantId, grounds, requestedResolution }, actorId = null) {
  const modCase = getCaseById(guildId, caseId);
  if (!modCase) return { ok: false, error: 'Case not found.' };
  const appeals = getCaseAppeals(modCase);
  if (appeals.length >= MAX_APPEALS_PER_CASE) return { ok: false, error: `Case appeal history is limited to ${MAX_APPEALS_PER_CASE} appeals.` };
  if (appeals.some((appeal) => appeal.status === 'pending')) return { ok: false, error: 'This case already has a pending appeal.' };
  const normalizedAppellant = String(appellantId || modCase.userId || '').trim();
  if (!/^\d{16,20}$/.test(normalizedAppellant)) return { ok: false, error: 'Appellant ID must be a valid Discord user ID.' };
  const normalizedGrounds = String(grounds || '').trim().slice(0, 1500);
  if (!normalizedGrounds) return { ok: false, error: 'Appeal grounds are required.' };
  const appeal = {
    id: `ap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    status: 'pending',
    appellantId: normalizedAppellant,
    grounds: normalizedGrounds,
    requestedResolution: String(requestedResolution || '').trim().slice(0, 500) || null,
    submittedBy: actorId ? String(actorId) : null,
    submittedAt: new Date().toISOString(),
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    remedy: null,
  };
  const metadata = { ...(modCase.metadata || {}), appeals: [...appeals, appeal] };
  const updated = updateCaseMetadata(guildId, caseId, metadata);
  if (!updated) return { ok: false, error: 'Failed to persist appeal.' };
  recordCaseAudit({ guildId, caseId, actorId, event: 'case.appeal.submitted', before: null, after: { appealId: appeal.id, appellantId: appeal.appellantId, status: appeal.status, grounds: appeal.grounds, requestedResolution: appeal.requestedResolution }, metadata: { appealId: appeal.id } });
  return { ok: true, case: updated, appeal };
}
async function applyApprovedAppealRemedy(interaction, modCase, fetchTarget) {
  const reason = `Appeal approved for Case #${modCase.caseId}`;
  if (modCase.action === 'warn') {
    const removed = deleteWarningByCaseId(interaction.guild.id, modCase.caseId);
    updateCaseStatus(interaction.guild.id, modCase.caseId, 'reversed', interaction.user?.id || null);
    return { attempted: true, action: 'remove-warning', ok: Boolean(removed), detail: removed ? 'Warning removed.' : 'Warning record was already absent.' };
  }
  if (modCase.action === 'timeout') {
    const target = typeof fetchTarget === 'function' ? await fetchTarget(interaction.guild, modCase.userId) : null;
    if (!target) {
      updateCaseStatus(interaction.guild.id, modCase.caseId, 'reversed', interaction.user?.id || null);
      return { attempted: true, action: 'remove-timeout', ok: false, detail: 'Member not available to clear timeout; case status reversed.' };
    }
    try {
      await target.timeout(null, reason);
      updateCaseStatus(interaction.guild.id, modCase.caseId, 'reversed', interaction.user?.id || null);
      return { attempted: true, action: 'remove-timeout', ok: true, detail: 'Timeout cleared.' };
    } catch (error) {
      updateCaseStatus(interaction.guild.id, modCase.caseId, 'reversed', interaction.user?.id || null);
      return { attempted: true, action: 'remove-timeout', ok: false, detail: String(error?.message || 'Failed to clear timeout.').slice(0, 300) };
    }
  }
  if (modCase.action === 'ban') {
    try {
      await interaction.guild.bans.remove(modCase.userId, reason);
      updateCaseStatus(interaction.guild.id, modCase.caseId, 'reversed', interaction.user?.id || null);
      return { attempted: true, action: 'unban', ok: true, detail: 'Ban removed.' };
    } catch (error) {
      updateCaseStatus(interaction.guild.id, modCase.caseId, 'reversed', interaction.user?.id || null);
      return { attempted: true, action: 'unban', ok: false, detail: String(error?.message || 'Failed to remove ban.').slice(0, 300) };
    }
  }
  updateCaseStatus(interaction.guild.id, modCase.caseId, 'reversed', interaction.user?.id || null);
  return { attempted: false, action: modCase.action, ok: true, detail: modCase.action === 'kick' ? 'Kick cannot be automatically undone; case status reversed.' : 'Case status reversed.' };
}
async function resolveAppeal(interaction, caseId, appealId, decision, reviewNote, fetchTarget) {
  if (!APPEAL_STATUSES.has(decision) || decision === 'pending') return { ok: false, error: 'Appeal decision must be approved or denied.' };
  const modCase = getCaseById(interaction.guild.id, caseId);
  if (!modCase) return { ok: false, error: 'Case not found.' };
  const appeals = getCaseAppeals(modCase);
  const index = appeals.findIndex((appeal) => String(appeal.id) === String(appealId));
  if (index < 0) return { ok: false, error: 'Appeal not found.' };
  if (appeals[index].status !== 'pending') return { ok: false, error: `Appeal is already ${appeals[index].status}.` };
  const note = String(reviewNote || '').trim().slice(0, 1000);
  if (!note) return { ok: false, error: 'A review rationale is required.' };
  let remedy = null;
  if (decision === 'approved') remedy = await applyApprovedAppealRemedy(interaction, modCase, fetchTarget);
  const before = { ...appeals[index] };
  const reviewedAt = new Date().toISOString();
  const decided = {
    ...before,
    status: decision,
    reviewedBy: interaction.user?.id ? String(interaction.user.id) : null,
    reviewedAt,
    reviewNote: note,
    remedy,
  };
  const next = appeals.map((appeal, idx) => idx === index ? decided : appeal);
  const current = getCaseById(interaction.guild.id, caseId) || modCase;
  const metadata = { ...(current.metadata || {}), appeals: next };
  const updated = updateCaseMetadata(interaction.guild.id, caseId, metadata);
  if (!updated) return { ok: false, error: 'Failed to persist appeal decision.' };
  recordCaseAudit({ guildId: interaction.guild.id, caseId, actorId: interaction.user?.id || null, event: decision === 'approved' ? 'case.appeal.approved' : 'case.appeal.denied', before: { appealId: before.id, status: before.status }, after: { appealId: decided.id, status: decided.status, reviewNote: decided.reviewNote, remedy }, metadata: { appealId: decided.id, appellantId: decided.appellantId } });
  return { ok: true, case: updated, appeal: decided };
}

function buildCaseDetailButtons(modCase) {
  const isWarning = modCase.action === 'warn';
  const isTimeout = modCase.action === 'timeout';
  const reversedOrExpired = modCase.status === 'reversed' || modCase.status === 'expired';
  const hasNote = Boolean(modCase.note && String(modCase.note).trim());
  const appeals = getCaseAppeals(modCase);
  const pending = appeals.some((appeal) => appeal.status === 'pending');
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mod_case_reverse_warning:${modCase.caseId}`).setLabel(`${EMOJIS.REVERSED} Reverse Warning`).setStyle(ButtonStyle.Secondary).setDisabled(!isWarning || reversedOrExpired),
      new ButtonBuilder().setCustomId(`mod_case_reverse_timeout:${modCase.caseId}`).setLabel('⏪ Reverse Timeout').setStyle(ButtonStyle.Secondary).setDisabled(!isTimeout || reversedOrExpired),
      new ButtonBuilder().setCustomId(`mod_case_note:${modCase.caseId}`).setLabel(hasNote ? `${EMOJIS.EDIT} Edit Note` : `${EMOJIS.NOTE} Add Note`).setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mod_case_appeal_submit:${modCase.caseId}`).setLabel(pending ? '⏳ Appeal Pending' : '📨 Submit Appeal').setStyle(ButtonStyle.Primary).setDisabled(pending || appeals.length >= MAX_APPEALS_PER_CASE),
      new ButtonBuilder().setCustomId(`mod_case_appeal_history:${modCase.caseId}:0`).setLabel(`⚖️ Appeals (${appeals.length})`).setStyle(ButtonStyle.Secondary).setDisabled(!appeals.length),
      new ButtonBuilder().setCustomId('mod_case_appeal_queue:0').setLabel('📥 Appeal Queue').setStyle(ButtonStyle.Secondary)
    ),
  ];
}
function buildCaseIdModal(customId, title, label = 'Case ID') {
  return new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('case_id').setLabel(label).setStyle(TextInputStyle.Short).setPlaceholder('1').setRequired(true).setMaxLength(10)));
}
function buildEditCaseModal(customId) {
  return new ModalBuilder().setCustomId(customId).setTitle('Edit Case').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('case_id').setLabel('Case ID').setStyle(TextInputStyle.Short).setPlaceholder('1').setRequired(true).setMaxLength(10)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('New Reason').setStyle(TextInputStyle.Paragraph).setPlaceholder('Enter the updated moderation reason').setRequired(true).setMaxLength(500))
  );
}
function buildCaseNoteModal(customId, existingNote = '') {
  return new ModalBuilder().setCustomId(customId).setTitle(existingNote ? 'Edit Case Note' : 'Add Case Note').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Staff Note').setStyle(TextInputStyle.Paragraph).setPlaceholder('Add internal staff-only context for this case').setRequired(false).setMaxLength(1000).setValue(String(existingNote || '').slice(0, 1000))));
}
function buildAppealSubmitModal(modCase) {
  return new ModalBuilder().setCustomId(`mod_submit_case_appeal:${modCase.caseId}`).setTitle(`Submit Appeal • Case #${modCase.caseId}`).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('appellant_id').setLabel('Appellant User ID').setStyle(TextInputStyle.Short).setPlaceholder(modCase.userId).setRequired(false).setMaxLength(20)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('grounds').setLabel('Appeal Grounds').setStyle(TextInputStyle.Paragraph).setPlaceholder('Why this moderation action should be reviewed').setRequired(true).setMaxLength(1500)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('requested_resolution').setLabel('Requested Resolution').setStyle(TextInputStyle.Paragraph).setPlaceholder('Optional requested outcome').setRequired(false).setMaxLength(500))
  );
}
function buildAppealDecisionModal(modCase, appeal, decision) {
  return new ModalBuilder().setCustomId(`mod_submit_case_appeal_decision:${modCase.caseId}:${appeal.id}:${decision}`).setTitle(`${decision === 'approved' ? 'Approve' : 'Deny'} Appeal • Case #${modCase.caseId}`).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('review_note').setLabel('Review Rationale').setStyle(TextInputStyle.Paragraph).setPlaceholder('Record why this appeal is being approved or denied').setRequired(true).setMaxLength(1000))
  );
}
function buildCaseSearchModal(customId = 'mod_submit_case_search') {
  return new ModalBuilder().setCustomId(customId).setTitle('Search Moderation Cases').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('case_or_user').setLabel('Case ID or Member/User ID').setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678 or 42').setRequired(false).setMaxLength(20)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('filters').setLabel('Advanced filters').setStyle(TextInputStyle.Paragraph).setPlaceholder('moderator:123 action:warn status:active from:2026-08-01 to:2026-08-28 text:spam').setRequired(false).setMaxLength(1000))
  );
}
function parseCaseSearchInput(interaction) {
  const caseOrUser = String(interaction.fields.getTextInputValue('case_or_user') || '').trim();
  const rawFilters = String(interaction.fields.getTextInputValue('filters') || '').trim();
  const filters = { page: 0, pageSize: 5 };
  if (caseOrUser) {
    if (/^\d+$/.test(caseOrUser) && caseOrUser.length <= 10) filters.caseId = Number(caseOrUser);
    else if (/^\d{16,20}$/.test(caseOrUser)) filters.userId = caseOrUser;
    else return { error: 'Case ID or Member/User ID is invalid.' };
  }
  const tokenPattern = /(moderator|mod|action|status|from|to|text):("[^"]*"|'[^']*'|\S+)/gi;
  let match;
  while ((match = tokenPattern.exec(rawFilters))) {
    const key = match[1].toLowerCase();
    const value = String(match[2] || '').replace(/^("|')|("|')$/g, '').trim();
    if (!value) continue;
    if (key === 'moderator' || key === 'mod') filters.moderatorId = value;
    else if (key === 'action') filters.action = value.toLowerCase();
    else if (key === 'status') filters.status = value.toLowerCase();
    else if (key === 'from') filters.createdFrom = value;
    else if (key === 'to') filters.createdTo = value;
    else if (key === 'text') filters.text = value;
  }
  return { filters };
}
function buildCaseSearchResultsEmbed(result = {}, filters = {}) {
  const results = Array.isArray(result.results) ? result.results : [];
  const description = results.length
    ? results.map((modCase, index) => `${index + 1}. ${formatCaseSummary(modCase)}\n   <@${modCase.userId}> • ${String(modCase.reason || 'No reason provided').slice(0, 160)}`).join('\n\n')
    : 'No moderation cases matched the supplied filters.';
  const embed = new EmbedBuilder().setColor(COLORS.PRIMARY).setTitle('🔎 Case Search').setDescription(description.slice(0, 4096)).setFooter({ text: `${result.total || 0} result${result.total === 1 ? '' : 's'} • Page ${(Number(result.page) || 0) + 1}/${Math.max(1, Number(result.totalPages) || 1)}` }).setTimestamp();
  const activeFilters = Object.entries(filters).filter(([key, value]) => !['page', 'pageSize'].includes(key) && value !== undefined && value !== null && value !== '').map(([key, value]) => `${key}: ${value}`);
  if (activeFilters.length) embed.addFields({ name: 'Filters', value: activeFilters.join(' • ').slice(0, 1024), inline: false });
  return embed;
}
function buildCaseSearchResultButtons(result = {}) {
  const results = Array.isArray(result.results) ? result.results.slice(0, 5) : [];
  if (!results.length) return [];
  return [new ActionRowBuilder().addComponents(...results.map((modCase) => new ButtonBuilder().setCustomId(`mod_search_open:${modCase.caseId}`).setLabel(`#${modCase.caseId}`).setStyle(ButtonStyle.Secondary)))];
}
function buildCaseSearchPaginationButtons(page = 0, totalPages = 0) {
  const safePage = Math.max(0, Number(page) || 0);
  const pages = Math.max(0, Number(totalPages) || 0);
  if (pages <= 1) return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod_search_page:${Math.max(0, safePage - 1)}`).setLabel(`${EMOJIS.BACK} Prev`).setStyle(ButtonStyle.Secondary).setDisabled(safePage <= 0),
    new ButtonBuilder().setCustomId(`mod_search_page:${safePage + 1}`).setLabel(`Next ${EMOJIS.NEXT}`).setStyle(ButtonStyle.Secondary).setDisabled(safePage >= pages - 1)
  )];
}
function buildCaseDetailEmbed(modCase) {
  const embed = new EmbedBuilder().setColor('#5865F2').setTitle(`🧾 Case #${modCase.caseId}`).addFields(
    { name: 'Action', value: modCase.action, inline: true }, { name: 'Status', value: getStatusLabel(modCase), inline: true }, { name: 'User ID', value: modCase.userId, inline: true }, { name: 'Moderator ID', value: modCase.moderatorId, inline: true }, { name: 'Reason', value: modCase.reason || 'No reason provided', inline: false }, { name: 'Created', value: `<t:${getCaseTimestamp(modCase.createdAt)}:F>`, inline: true }, { name: 'Updated', value: modCase.updatedAt ? `<t:${getCaseTimestamp(modCase.updatedAt)}:F>` : 'Never', inline: true }
  ).setTimestamp();
  if (modCase.relatedCaseId) embed.addFields({ name: 'Related Case', value: `#${modCase.relatedCaseId}`, inline: true });
  const appeals = getCaseAppeals(modCase);
  if (appeals.length) {
    const pending = appeals.filter((appeal) => appeal.status === 'pending').length;
    const approved = appeals.filter((appeal) => appeal.status === 'approved').length;
    const denied = appeals.filter((appeal) => appeal.status === 'denied').length;
    embed.addFields({ name: '⚖️ Appeals', value: `Pending **${pending}** • Approved **${approved}** • Denied **${denied}** • History **${appeals.length}**`, inline: false });
  }
  if (modCase.note && String(modCase.note).trim()) embed.addFields({ name: 'Staff Note', value: String(modCase.note).slice(0, 1024), inline: false });
  if (modCase.metadata && Object.keys(modCase.metadata).length) embed.addFields({ name: 'Metadata', value: `\`\`\`json\n${JSON.stringify(modCase.metadata, null, 2).slice(0, 900)}\n\`\`\``, inline: false });
  return embed;
}
function buildAppealHistoryEmbed(modCase, requestedPage = 0) {
  const appeals = [...getCaseAppeals(modCase)].sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
  const totalPages = Math.max(1, Math.ceil(appeals.length / APPEAL_PAGE_SIZE));
  const page = Math.max(0, Math.min(Math.trunc(Number(requestedPage) || 0), totalPages - 1));
  const slice = appeals.slice(page * APPEAL_PAGE_SIZE, (page + 1) * APPEAL_PAGE_SIZE);
  const embed = new EmbedBuilder().setColor(COLORS.PRIMARY).setTitle(`⚖️ Case #${modCase.caseId} Appeals`).setFooter({ text: `Appeal history page ${page + 1}/${totalPages}` }).setTimestamp();
  if (!slice.length) embed.setDescription('No appeals recorded for this case.');
  for (const appeal of slice) {
    const submitted = appeal.submittedAt ? `<t:${getCaseTimestamp(appeal.submittedAt)}:R>` : 'unknown time';
    const reviewed = appeal.reviewedAt ? `<t:${getCaseTimestamp(appeal.reviewedAt)}:R>` : null;
    const lines = [
      `Status: **${String(appeal.status || 'pending').toUpperCase()}** • Appellant <@${appeal.appellantId}> • ${submitted}`,
      `Grounds: ${String(appeal.grounds || 'No grounds recorded').slice(0, 450)}`,
    ];
    if (appeal.requestedResolution) lines.push(`Requested: ${String(appeal.requestedResolution).slice(0, 250)}`);
    if (appeal.reviewedBy) lines.push(`Reviewed by <@${appeal.reviewedBy}>${reviewed ? ` • ${reviewed}` : ''}`);
    if (appeal.reviewNote) lines.push(`Decision note: ${String(appeal.reviewNote).slice(0, 300)}`);
    if (appeal.remedy) lines.push(`Remedy: ${appeal.remedy.ok ? '✅' : '⚠️'} ${String(appeal.remedy.detail || appeal.remedy.action || 'Recorded').slice(0, 250)}`);
    embed.addFields({ name: appeal.id, value: lines.join('\n').slice(0, 1024), inline: false });
  }
  const pending = getPendingAppeal(modCase);
  const components = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod_case_appeal_history:${modCase.caseId}:${Math.max(0, page - 1)}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`mod_case_appeal_history:${modCase.caseId}:${Math.min(totalPages - 1, page + 1)}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
    new ButtonBuilder().setCustomId(`mod_case_appeal_open:${modCase.caseId}:${pending?.id || 'none'}`).setLabel('Open Pending').setStyle(ButtonStyle.Primary).setDisabled(!pending),
    new ButtonBuilder().setCustomId(`mod_search_open:${modCase.caseId}`).setLabel('← Case Detail').setStyle(ButtonStyle.Secondary)
  )];
  return { embeds: [embed], components };
}
function buildAppealDetailPayload(modCase, appeal) {
  const embed = new EmbedBuilder().setColor(appeal.status === 'pending' ? COLORS.PRIMARY : appeal.status === 'approved' ? COLORS.SUCCESS : COLORS.ERROR).setTitle(`⚖️ Appeal ${appeal.id}`).setDescription(`Linked Case **#${modCase.caseId}** • ${String(modCase.action).toUpperCase()} • ${String(appeal.status).toUpperCase()}`).addFields(
    { name: 'Appellant', value: `<@${appeal.appellantId}>`, inline: true },
    { name: 'Submitted', value: appeal.submittedAt ? `<t:${getCaseTimestamp(appeal.submittedAt)}:F>` : 'Unknown', inline: true },
    { name: 'Appeal Grounds', value: String(appeal.grounds || 'No grounds recorded').slice(0, 1024), inline: false }
  ).setTimestamp();
  if (appeal.requestedResolution) embed.addFields({ name: 'Requested Resolution', value: String(appeal.requestedResolution).slice(0, 1024), inline: false });
  if (appeal.reviewNote) embed.addFields({ name: 'Review Decision', value: String(appeal.reviewNote).slice(0, 1024), inline: false });
  if (appeal.remedy) embed.addFields({ name: 'Remedy', value: `${appeal.remedy.ok ? '✅' : '⚠️'} ${String(appeal.remedy.detail || appeal.remedy.action || 'Recorded').slice(0, 1000)}`, inline: false });
  const components = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod_case_appeal_decide:${modCase.caseId}:${appeal.id}:approved`).setLabel('✅ Approve').setStyle(ButtonStyle.Success).setDisabled(appeal.status !== 'pending'),
    new ButtonBuilder().setCustomId(`mod_case_appeal_decide:${modCase.caseId}:${appeal.id}:denied`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger).setDisabled(appeal.status !== 'pending'),
    new ButtonBuilder().setCustomId(`mod_case_appeal_history:${modCase.caseId}:0`).setLabel('← Appeal History').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod_search_open:${modCase.caseId}`).setLabel('Case Detail').setStyle(ButtonStyle.Secondary)
  )];
  return { embeds: [embed], components };
}
function buildAppealQueuePayload(guildId, requestedPage = 0) {
  const pending = getPendingAppeals(guildId);
  const totalPages = Math.max(1, Math.ceil(pending.length / APPEAL_PAGE_SIZE));
  const page = Math.max(0, Math.min(Math.trunc(Number(requestedPage) || 0), totalPages - 1));
  const slice = pending.slice(page * APPEAL_PAGE_SIZE, (page + 1) * APPEAL_PAGE_SIZE);
  const embed = new EmbedBuilder().setColor(COLORS.PRIMARY).setTitle('📥 Pending Appeal Queue').setDescription(slice.length ? slice.map(({ case: modCase, appeal }, index) => `${page * APPEAL_PAGE_SIZE + index + 1}. **Case #${modCase.caseId}** • ${modCase.action} • <@${appeal.appellantId}>\n${String(appeal.grounds || '').replace(/\s+/g, ' ').slice(0, 180)}`).join('\n\n') : 'No pending appeals.').setFooter({ text: `${pending.length} pending appeal${pending.length === 1 ? '' : 's'} • Page ${page + 1}/${totalPages}` }).setTimestamp();
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod_case_appeal_queue:${Math.max(0, page - 1)}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`mod_case_appeal_queue:${Math.min(totalPages - 1, page + 1)}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
    new ButtonBuilder().setCustomId(`mod_case_appeal_queue:${page}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
  )];
  if (slice.length) rows.push(new ActionRowBuilder().addComponents(...slice.map(({ case: modCase, appeal }) => new ButtonBuilder().setCustomId(`mod_case_appeal_open:${modCase.caseId}:${appeal.id}`).setLabel(`#${modCase.caseId}`).setStyle(ButtonStyle.Primary))));
  return { embeds: [embed], components: rows };
}

function getCaseIdFromModal(interaction, field = 'case_id') { const raw = interaction.fields.getTextInputValue(field).trim(); return /^\d+$/.test(raw) ? Number(raw) : null; }
function editCaseReason(guildId, caseId, reason, actorId = null) { return updateCaseReason(guildId, caseId, String(reason || '').trim(), actorId); }
function setCaseNote(guildId, caseId, note, actorId = null) {
  const value = String(note || '').trim();
  return value ? updateCaseNote(guildId, caseId, value, actorId) : clearCaseNote(guildId, caseId, actorId);
}
function getTargetIdFromCustomId(customId) { const [, targetId] = String(customId || '').split(':'); return targetId || 'none'; }

async function openCaseTool(interaction) {
  const id = String(interaction.customId || '');
  const targetId = getTargetIdFromCustomId(id);
  if (id.startsWith('mod_case_detail:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) return safeReply(interaction, ephemeralError('No permission to view case details.'));
    if (targetId === 'none') return safeReply(interaction, ephemeralError('No user selected.'));
    await interaction.showModal(buildCaseIdModal(`mod_submit_case_detail:${targetId}`, 'View Case Detail')); return true;
  }
  if (id.startsWith('mod_edit_case:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'edit_case')) return safeReply(interaction, ephemeralError('No permission to edit cases.'));
    if (targetId === 'none') return safeReply(interaction, ephemeralError('No user selected.'));
    await interaction.showModal(buildEditCaseModal(`mod_submit_edit_case:${targetId}`)); return true;
  }
  if (id === 'mod_search_cases') {
    if (!canUseModAction(interaction.member, interaction.guild, 'view_cases')) return safeReply(interaction, ephemeralError('No permission to search cases.'));
    await interaction.showModal(buildCaseSearchModal());
    return true;
  }
  return false;
}

async function handleCaseAction(interaction, { fetchTarget, createConfirmation } = {}) {
  const id = String(interaction.customId || '');
  if (id.startsWith('mod_case_appeal_submit:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) return safeReply(interaction, ephemeralError('No permission to record case appeals.'));
    const [, caseIdRaw] = id.split(':');
    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
    if (!modCase) return safeReply(interaction, ephemeralError('Case not found.'));
    if (getPendingAppeal(modCase)) return safeReply(interaction, ephemeralError('This case already has a pending appeal.'));
    await interaction.showModal(buildAppealSubmitModal(modCase));
    return true;
  }
  if (id.startsWith('mod_case_appeal_history:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) return safeReply(interaction, ephemeralError('No permission to view appeals.'));
    const [, caseIdRaw, pageRaw] = id.split(':');
    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
    if (!modCase) return safeReply(interaction, ephemeralError('Case not found.'));
    return safeReply(interaction, { ...buildAppealHistoryEmbed(modCase, pageRaw), flags: 64 });
  }
  if (id.startsWith('mod_case_appeal_queue:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'view_cases')) return safeReply(interaction, ephemeralError('No permission to view the appeal queue.'));
    const [, pageRaw] = id.split(':');
    return safeReply(interaction, { ...buildAppealQueuePayload(interaction.guild.id, pageRaw), flags: 64 });
  }
  if (id.startsWith('mod_case_appeal_open:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) return safeReply(interaction, ephemeralError('No permission to review appeals.'));
    const [, caseIdRaw, appealId] = id.split(':');
    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
    const appeal = modCase ? getAppealById(modCase, appealId) : null;
    if (!modCase || !appeal) return safeReply(interaction, ephemeralError('Appeal could not be found.'));
    return safeReply(interaction, { ...buildAppealDetailPayload(modCase, appeal), flags: 64 });
  }
  if (id.startsWith('mod_case_appeal_decide:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'edit_case')) return safeReply(interaction, ephemeralError('No permission to decide appeals.'));
    const [, caseIdRaw, appealId, decision] = id.split(':');
    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
    const appeal = modCase ? getAppealById(modCase, appealId) : null;
    if (!modCase || !appeal || appeal.status !== 'pending') return safeReply(interaction, ephemeralError('Pending appeal could not be found.'));
    await interaction.showModal(buildAppealDecisionModal(modCase, appeal, decision));
    return true;
  }
  if (id.startsWith('mod_case_note:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'add_case_note')) return safeReply(interaction, ephemeralError('No permission to add case notes.'));
    const [, caseIdRaw] = id.split(':');
    if (!/^\d+$/.test(caseIdRaw)) return safeReply(interaction, ephemeralError('Case ID must be a number.'));
    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
    if (!modCase) return safeReply(interaction, ephemeralError('Case not found.'));
    await interaction.showModal(buildCaseNoteModal(`mod_submit_case_note:${modCase.caseId}`, modCase.note || '')); return true;
  }
  if (id.startsWith('mod_search_open:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) return safeReply(interaction, ephemeralError('No permission to view case details.'));
    const [, caseIdRaw] = id.split(':');
    if (!/^\d+$/.test(caseIdRaw)) return safeReply(interaction, ephemeralError('Case ID must be a number.'));
    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
    if (!modCase) return safeReply(interaction, ephemeralError('Case not found.'));
    return safeReply(interaction, { embeds: [buildCaseDetailEmbed(modCase)], components: buildCaseDetailButtons(modCase), flags: 64 });
  }
  if (id.startsWith('mod_case_reverse_warning:') || id.startsWith('mod_case_reverse_timeout:')) {
    const isWarning = id.startsWith('mod_case_reverse_warning:');
    const permission = isWarning ? 'remove_warning' : 'remove_timeout';
    if (!canUseModAction(interaction.member, interaction.guild, permission)) return safeReply(interaction, ephemeralError(isWarning ? 'No permission to reverse warnings.' : 'No permission to reverse timeouts.'));
    const [, caseIdRaw] = id.split(':');
    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
    const expectedAction = isWarning ? 'warn' : 'timeout';
    if (!modCase || modCase.action !== expectedAction) return safeReply(interaction, ephemeralError(isWarning ? 'Warning case could not be found.' : 'That timeout case could not be found.'));
    if (typeof fetchTarget !== 'function' || typeof createConfirmation !== 'function') return false;
    const target = await fetchTarget(interaction.guild, modCase.userId);
    if (!target) return safeReply(interaction, ephemeralError('User not found for that case.'));
    return createConfirmation(interaction, target.id, isWarning ? 'remove-warning' : 'remove-timeout', isWarning ? { caseId: modCase.caseId } : { sourceCaseId: modCase.caseId }, isWarning ? `⚠️ Reverse warning from **Case #${modCase.caseId}**?` : `⏳ Reverse timeout from **Case #${modCase.caseId}**?`);
  }
  return false;
}

async function submitCaseModal(interaction, { fetchTarget, refreshCasesDashboard } = {}) {
  const id = String(interaction.customId || '');
  if (id.startsWith('mod_submit_case_appeal_decision:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'edit_case')) return safeReply(interaction, ephemeralError('No permission to decide appeals.'));
    const [, caseIdRaw, appealId, decision] = id.split(':');
    const caseId = Number(caseIdRaw);
    const result = await resolveAppeal(interaction, caseId, appealId, decision, interaction.fields.getTextInputValue('review_note'), fetchTarget);
    if (!result.ok) return safeReply(interaction, ephemeralError(result.error || 'Failed to decide appeal.'));
    return safeReply(interaction, { ...buildAppealDetailPayload(result.case, result.appeal), flags: 64 });
  }
  if (id.startsWith('mod_submit_case_appeal:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) return safeReply(interaction, ephemeralError('No permission to record appeals.'));
    const [, caseIdRaw] = id.split(':');
    const caseId = Number(caseIdRaw);
    const modCase = getCaseById(interaction.guild.id, caseId);
    if (!modCase) return safeReply(interaction, ephemeralError('Case not found.'));
    const result = submitAppeal(interaction.guild.id, caseId, {
      appellantId: interaction.fields.getTextInputValue('appellant_id') || modCase.userId,
      grounds: interaction.fields.getTextInputValue('grounds'),
      requestedResolution: interaction.fields.getTextInputValue('requested_resolution'),
    }, interaction.user?.id || null);
    if (!result.ok) return safeReply(interaction, ephemeralError(result.error || 'Failed to submit appeal.'));
    return safeReply(interaction, { ...buildAppealDetailPayload(result.case, result.appeal), flags: 64 });
  }
  if (id.startsWith('mod_submit_case_detail:')) {
    const targetId = getTargetIdFromCustomId(id); const caseId = getCaseIdFromModal(interaction);
    if (!caseId) return safeReply(interaction, ephemeralError('Case ID must be a number.'));
    if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) return safeReply(interaction, ephemeralError('No permission to view case details.'));
    const modCase = getCaseById(interaction.guild.id, caseId);
    if (!modCase) return safeReply(interaction, ephemeralError('Case not found.'));
    if (targetId !== 'none' && modCase.userId !== targetId) return safeReply(interaction, ephemeralError('That case does not belong to the currently selected user.'));
    return safeReply(interaction, { embeds: [buildCaseDetailEmbed(modCase)], components: buildCaseDetailButtons(modCase), flags: 64 });
  }
  if (id.startsWith('mod_submit_edit_case:')) {
    const targetId = getTargetIdFromCustomId(id); const caseId = getCaseIdFromModal(interaction); const reason = interaction.fields.getTextInputValue('reason').trim();
    if (!caseId) return safeReply(interaction, ephemeralError('Case ID must be a number.'));
    if (!canUseModAction(interaction.member, interaction.guild, 'edit_case')) return safeReply(interaction, ephemeralError('No permission to edit cases.'));
    const existing = getCaseById(interaction.guild.id, caseId);
    if (!existing) return safeReply(interaction, ephemeralError('Case not found.'));
    if (targetId !== 'none' && existing.userId !== targetId) return safeReply(interaction, ephemeralError('That case does not belong to the currently selected user.'));
    const actorId = interaction.user?.id || null;
    const updated = editCaseReason(interaction.guild.id, caseId, reason, actorId);
    if (!updated) return safeReply(interaction, ephemeralError('Failed to update case.'));
    const target = typeof fetchTarget === 'function' ? await fetchTarget(interaction.guild, updated.userId) : null;
    await safeReply(interaction, { content: `✏️ Updated reason for **Case #${updated.caseId}**.`, flags: 64 });
    if (target && typeof refreshCasesDashboard === 'function') await refreshCasesDashboard(interaction, target);
    return true;
  }
  if (id.startsWith('mod_submit_case_search')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'view_cases')) return safeReply(interaction, ephemeralError('No permission to search cases.'));
    const parsed = parseCaseSearchInput(interaction);
    if (parsed.error) return safeReply(interaction, ephemeralError(parsed.error));
    const result = searchCases(interaction.guild.id, parsed.filters);
    return safeReply(interaction, {
      embeds: [buildCaseSearchResultsEmbed(result, parsed.filters)],
      components: [...buildCaseSearchResultButtons(result), ...buildCaseSearchPaginationButtons(result.page, result.totalPages)],
      flags: 64,
    });
  }
  if (id.startsWith('mod_submit_case_note:')) {
    const [, caseIdRaw] = id.split(':');
    if (!/^\d+$/.test(caseIdRaw)) return safeReply(interaction, ephemeralError('Case ID must be a number.'));
    if (!canUseModAction(interaction.member, interaction.guild, 'add_case_note')) return safeReply(interaction, ephemeralError('No permission to add case notes.'));
    const caseId = Number(caseIdRaw); const existing = getCaseById(interaction.guild.id, caseId);
    if (!existing) return safeReply(interaction, ephemeralError('Case not found.'));
    const note = interaction.fields.getTextInputValue('note').trim(); const actorId = interaction.user?.id || null;
    const updated = setCaseNote(interaction.guild.id, caseId, note, actorId);
    if (!updated) return safeReply(interaction, ephemeralError('Failed to update case note.'));
    const target = typeof fetchTarget === 'function' ? await fetchTarget(interaction.guild, updated.userId) : null;
    await safeReply(interaction, { content: note ? `📝 Updated note for **Case #${updated.caseId}**.` : `🗑️ Cleared note for **Case #${updated.caseId}**.`, flags: 64 });
    if (target && typeof refreshCasesDashboard === 'function') await refreshCasesDashboard(interaction, target);
    return true;
  }
  return false;
}

function getBulkActionProgressEmbed({ actionLabel, total, processed, successCount, failCount }) { return createEmbed({ title: `${EMOJIS.SETTINGS} ${EMOJIS.BULK} ${actionLabel} Progress`, description: `${EMOJIS.FIRE} Bulk moderation is currently running...`, color: COLORS.PRIMARY, fields: [{ name: '📦 Processed', value: `${processed}/${total}`, inline: true }, { name: `${EMOJIS.SUCCESS} Success`, value: String(successCount), inline: true }, { name: `${EMOJIS.ERROR} Failed`, value: String(failCount), inline: true }] }); }
function getBulkActionSummaryEmbed({ actionLabel, total, success, failed }) { return createEmbed({ title: failed.length ? `${EMOJIS.WARNING} ${EMOJIS.BULK} ${actionLabel} Complete` : `${EMOJIS.SUCCESS} ${EMOJIS.BULK} ${actionLabel} Complete`, color: failed.length ? COLORS.ERROR : COLORS.SUCCESS, fields: [{ name: '🎯 Total Targets', value: String(total), inline: true }, { name: `${EMOJIS.SUCCESS} Successful`, value: String(success.length), inline: true }, { name: `${EMOJIS.ERROR} Failed`, value: String(failed.length), inline: true }, { name: `${EMOJIS.SUCCESS} Successes`, value: success.length ? success.join('\n').slice(0, 1024) : 'None' }, { name: `${EMOJIS.ERROR} Failures`, value: failed.length ? failed.join('\n').slice(0, 1024) : 'None' }] }); }

module.exports = {
  getStatusLabel,
  formatCaseSummary,
  getModerationAnalytics,
  buildCaseFilterButtons,
  buildCasesPageButtons,
  buildCaseDetailButtons,
  buildCaseSearchModal,
  parseCaseSearchInput,
  buildCaseSearchResultsEmbed,
  buildCaseSearchResultButtons,
  buildCaseSearchPaginationButtons,
  openCaseTool,
  handleCaseAction,
  submitCaseModal,
  getBulkActionProgressEmbed,
  getBulkActionSummaryEmbed,
  getCaseAppeals,
  getPendingAppeals,
};