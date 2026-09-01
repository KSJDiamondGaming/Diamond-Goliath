'use strict';
const fs = require('fs');
const path = 'src/core/administration/mod/cases.js';
let s = fs.readFileSync(path, 'utf8');
const start = s.indexOf('function buildAppealQueuePayload(');
const end = s.indexOf('\nfunction getCaseIdFromModal', start);
if (start < 0 || end < 0) throw new Error('Appeal queue payload function not found');
const replacement = `function buildAppealQueuePayload(guildId, requestedPage = 0, filters = { status: 'pending' }, token = null) {
  const normalizedStatus = ['pending', 'approved', 'denied', 'all'].includes(String(filters.status || '').toLowerCase()) ? String(filters.status).toLowerCase() : 'pending';
  const activeFilters = { ...filters, status: normalizedStatus };
  const results = listAppeals(guildId, activeFilters);
  const allAppeals = listAppeals(guildId, { status: 'all' });
  const counts = { pending: 0, approved: 0, denied: 0 };
  for (const { appeal } of allAppeals) if (Object.prototype.hasOwnProperty.call(counts, appeal.status)) counts[appeal.status] += 1;
  const totalPages = Math.max(1, Math.ceil(results.length / APPEAL_PAGE_SIZE));
  const page = Math.max(0, Math.min(Math.trunc(Number(requestedPage) || 0), totalPages - 1));
  const slice = results.slice(page * APPEAL_PAGE_SIZE, (page + 1) * APPEAL_PAGE_SIZE);
  const activeToken = token || rememberAppealQueue(guildId, activeFilters);
  const extraFilters = [activeFilters.userId ? \`User <@\${activeFilters.userId}>\` : null, activeFilters.caseId ? \`Case #\${activeFilters.caseId}\` : null, activeFilters.moderatorId ? \`Moderator <@\${activeFilters.moderatorId}>\` : null].filter(Boolean);
  const emptyText = normalizedStatus === 'pending' && !extraFilters.length
    ? '**📭 No Pending Appeals**\\nThere are currently no moderation appeals awaiting review.'
    : \`**📭 No Appeals Found**\\nNo \${normalizedStatus === 'all' ? '' : normalizedStatus + ' '}appeals matched the current filters.\`;
  const description = slice.length
    ? ['Review and manage appeals submitted against moderation cases.', '', ...slice.map(({ case: modCase, appeal }) => {
        const submitted = appeal.submittedAt ? \`<t:\${getCaseTimestamp(appeal.submittedAt)}:f>\` : 'Unknown';
        return [\`**Case #\${modCase.caseId} • \${String(modCase.action || 'case').toUpperCase()} Appeal**\`, \`Member: <@\${appeal.appellantId}>\`, \`Moderator: <@\${modCase.moderatorId}>\`, \`Submitted: \${submitted}\`, \`Status: **\${String(appeal.status || 'pending').toUpperCase()}**\`, \`Appeal: \${String(appeal.grounds || 'No grounds recorded').replace(/\\s+/g, ' ').slice(0, 220)}\`].join('\\n');
      })].join('\\n\\n')
    : ['Review and manage appeals submitted against moderation cases.', '', emptyText].join('\\n');
  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle('⚖️ Moderation Appeals')
    .setDescription(description)
    .addFields(
      { name: '⏳ Pending', value: \`**\${counts.pending}**\`, inline: true },
      { name: '✅ Approved', value: \`**\${counts.approved}**\`, inline: true },
      { name: '❌ Denied', value: \`**\${counts.denied}**\`, inline: true },
    );
  if (extraFilters.length) embed.addFields({ name: '🔎 Additional Filters', value: extraFilters.join(' • '), inline: false });
  embed.setFooter({ text: \`\${results.length} matching appeal\${results.length === 1 ? '' : 's'} • Page \${page + 1}/\${totalPages}\` }).setTimestamp();
  const statusRow = new ActionRowBuilder().addComponents(
    ...['pending', 'approved', 'denied', 'all'].map((status) => new ButtonBuilder()
      .setCustomId(\`mod_case_appeal_queue_status:\${activeToken}:\${status}\`)
      .setLabel(status === 'pending' ? 'Pending' : status === 'approved' ? 'Approved' : status === 'denied' ? 'Denied' : 'All')
      .setStyle(normalizedStatus === status ? ButtonStyle.Primary : ButtonStyle.Secondary))
  );
  const pageRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(\`mod_case_appeal_queue:\${activeToken}:\${Math.max(0, page - 1)}\`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(\`mod_case_appeal_queue:\${activeToken}:\${Math.min(totalPages - 1, page + 1)}\`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
  );
  const rows = [statusRow, pageRow];
  if (slice.length) rows.push(new ActionRowBuilder().addComponents(...slice.map(({ case: modCase, appeal }) => new ButtonBuilder().setCustomId(\`mod_case_appeal_open:\${modCase.caseId}:\${appeal.id}\`).setLabel(\`#\${modCase.caseId}\`).setStyle(ButtonStyle.Primary))));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mod_dashboard:none:analytics').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(\`mod_case_appeal_queue_refresh:\${activeToken}:\${page}\`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(\`mod_case_appeal_queue_filter:\${activeToken}\`).setLabel('🔎 Filter').setStyle(ButtonStyle.Secondary)
  ));
  return { embeds: [embed], components: rows };
}
`;
s = s.slice(0, start) + replacement + s.slice(end);
const marker = "  if (id.startsWith('mod_case_appeal_queue_filter:')) {";
const idx = s.indexOf(marker);
if (idx < 0) throw new Error('Appeal queue handler marker not found');
const handlers = `  if (id.startsWith('mod_case_appeal_queue_status:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'view_cases')) return safeReply(interaction, ephemeralError('No permission to filter appeals.'));
    const [, token, status] = id.split(':');
    const state = getAppealQueueState(token, interaction.guild.id);
    if (!state) return safeReply(interaction, ephemeralError('This appeal queue session expired. Open the queue again.'));
    if (!['pending', 'approved', 'denied', 'all'].includes(status)) return safeReply(interaction, ephemeralError('That appeal status filter is invalid.'));
    state.filters = { ...state.filters, status };
    state.createdAt = Date.now();
    return interaction.update(buildAppealQueuePayload(interaction.guild.id, 0, state.filters, token));
  }
  if (id.startsWith('mod_case_appeal_queue_refresh:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'view_cases')) return safeReply(interaction, ephemeralError('No permission to view the appeal queue.'));
    const [, token, pageRaw] = id.split(':');
    const state = getAppealQueueState(token, interaction.guild.id);
    if (!state) return safeReply(interaction, ephemeralError('This appeal queue session expired. Open the queue again.'));
    state.createdAt = Date.now();
    return interaction.update(buildAppealQueuePayload(interaction.guild.id, pageRaw, state.filters, token));
  }
`;
s = s.slice(0, idx) + handlers + s.slice(idx);
fs.writeFileSync(path, s);
console.log('Applied moderation appeal queue polish.');
