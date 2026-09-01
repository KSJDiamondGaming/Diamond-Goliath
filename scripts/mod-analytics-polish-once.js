'use strict';

const fs = require('node:fs');
const path = 'src/core/administration/mod/panel.js';
let source = fs.readFileSync(path, 'utf8');

function replaceBetween(startNeedle, endNeedle, replacement, label) {
  const start = source.indexOf(startNeedle);
  if (start < 0) throw new Error(`${label}: start not found`);
  const end = source.indexOf(endNeedle, start);
  if (end < 0) throw new Error(`${label}: end not found`);
  source = source.slice(0, start) + replacement.trimEnd() + '\n' + source.slice(end);
}

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`${label}: source text not found`);
  source = source.replace(from, to);
}

replaceBetween(
  'function formatActionBreakdown(',
  'function hasAny(',
  `function formatActionBreakdown(counts = {}) {
  const primary = [
    \`Warnings **\${Number(counts.warn || 0)}**\`,
    \`Timeouts **\${Number(counts.timeout || 0)}**\`,
    \`Kicks **\${Number(counts.kick || 0)}**\`,
    \`Bans **\${Number(counts.ban || 0)}**\`,
  ].join(' • ');
  const reversals = [];
  if (Number(counts.unwarn || 0) > 0) reversals.push(\`Warnings removed **\${Number(counts.unwarn)}**\`);
  if (Number(counts['remove-timeout'] || 0) > 0) reversals.push(\`Timeouts cleared **\${Number(counts['remove-timeout'])}**\`);
  return reversals.length ? \`\${primary}\\n\${reversals.join(' • ')}\` : primary;
}`,
  'action breakdown'
);

replaceBetween(
  'function buildAnalyticsOverviewEmbed(',
  'function buildModeratorAnalyticsEmbed(',
  `function buildAnalyticsOverviewEmbed(guild, analytics) {
  const topModerators = analytics.topModerators.length
    ? analytics.topModerators.map(([id, count], index) => \`\${index + 1}. <@\${id}> — **\${count}**\`).join('\\n')
    : 'No moderator activity in this period.';
  const topUsers = analytics.topUsers.length
    ? analytics.topUsers.map(([id, count], index) => \`\${index + 1}. <@\${id}> — **\${count}**\`).join('\\n')
    : 'No moderated members in this period.';
  const trend = analytics.trend.length
    ? analytics.trend.map((entry) => \`**\${entry.label}** — \${entry.count}\`).join('\\n')
    : 'No moderation activity in the recent trend window.';
  const appeal = analytics.appealCounts;
  const comparison = analytics.change === null
    ? 'Previous period: no baseline available.'
    : \`Previous period: **\${analytics.change >= 0 ? '+' : ''}\${analytics.change}%** change in cases.\`;
  return createEmbed({
    title: \`📊 Moderation Analytics • \${analytics.windowLabel}\`,
    description: \`**Server:** \${guild?.name || 'Server'}\\n\${comparison}\`,
    color: COLORS.PRIMARY,
    fields: [
      { name: '📁 Cases', value: \`**\${analytics.totalCases} total** • \${analytics.activeCases} active • \${analytics.reversedCases} reversed • \${analytics.expiredCases} expired\`, inline: false },
      { name: '⚡ Actions', value: formatActionBreakdown(analytics.actionCounts), inline: false },
      { name: '👥 Members', value: \`Unique **\${analytics.uniqueUsers}**\\nRepeat **\${analytics.repeatOffenders}**\`, inline: true },
      { name: '↩️ Reversal Rate', value: \`**\${analytics.reversalRate}**\`, inline: true },
      { name: '🧾 Audit Activity', value: \`**\${analytics.auditActions}** events\`, inline: true },
      { name: '⚖️ Appeals', value: \`**\${appeal.pending} pending** • \${appeal.approved} approved • \${appeal.denied} denied\\nApproval rate **\${analytics.appealApprovalRate}**\`, inline: false },
      { name: '🏆 Top Moderators', value: topModerators.slice(0, 1024), inline: true },
      { name: '👥 Frequent Members', value: topUsers.slice(0, 1024), inline: true },
      { name: '📈 Recent Activity', value: trend.slice(0, 1024), inline: false },
    ],
    footer: \`Moderation activity • \${analytics.windowLabel.toLowerCase()} view\`,
  });
}`,
  'analytics overview embed'
);

replaceBetween(
  'function buildModeratorAnalyticsEmbed(',
  'function buildAnalyticsRows(',
  `function buildModeratorAnalyticsEmbed(guild, analytics) {
  const appeals = analytics.moderatorAppeals;
  const recentCases = analytics.recentCases.length
    ? analytics.recentCases.map((entry) => \`**#\${entry.caseId}** • \${String(entry.action || 'unknown').toUpperCase()} • \${entry.status || 'active'} • <@\${entry.userId}>\`).join('\\n')
    : 'No cases in this period.';
  const auditEvents = analytics.topAuditEvents.length
    ? analytics.topAuditEvents.map(([event, count]) => \`\${String(event).replace(/^case\\./, '')}: **\${count}**\`).join('\\n')
    : 'No audited activity.';
  return createEmbed({
    title: \`👤 Moderator Analytics • \${analytics.windowLabel}\`,
    description: \`**Moderator:** <@\${analytics.moderatorId}>\\n**Server:** \${guild?.name || 'Server'}\`,
    color: COLORS.PRIMARY,
    fields: [
      { name: '📁 Case Activity', value: \`**\${analytics.moderatorCases} cases** • \${analytics.affectedUsers} members • \${analytics.repeatTargets} repeat targets\`, inline: false },
      { name: '⚡ Actions', value: formatActionBreakdown(analytics.moderatorActionCounts), inline: false },
      { name: '↩️ Outcomes', value: \`Active **\${analytics.moderatorStatusCounts.active || 0}** • Reversed **\${analytics.moderatorStatusCounts.reversed || 0}** • Expired **\${analytics.moderatorStatusCounts.expired || 0}**\\nReversal rate **\${analytics.moderatorReversalRate}**\`, inline: false },
      { name: '⚖️ Appeals', value: \`**\${appeals.pending} pending** • \${appeals.approved} approved • \${appeals.denied} denied\\nApproval rate **\${analytics.moderatorAppealApprovalRate}**\`, inline: false },
      { name: '🧾 Audit Activity', value: \`**\${analytics.moderatorAuditActions}** events\`, inline: true },
      { name: 'Top Audit Events', value: auditEvents.slice(0, 1024), inline: true },
      { name: 'Recent Cases', value: recentCases.slice(0, 1024), inline: false },
    ],
    footer: \`Moderator activity • \${analytics.windowLabel.toLowerCase()} view\`,
  });
}`,
  'moderator analytics embed'
);

replaceBetween(
  'function buildAnalyticsRows(',
  'function buildTargetStats(',
  `function buildAnalyticsRows(windowKey, mode = 'overview', moderatorId = null, currentUserId = null, returnTargetId = 'none') {
  const window = normalizeAnalyticsWindow(windowKey);
  const returnId = returnTargetId || 'none';
  const viewButtons = [];
  if (mode === 'moderator') {
    viewButtons.push(new ButtonBuilder()
      .setCustomId(\`mod_analytics_overview:\${window}:\${returnId}\`)
      .setLabel('📊 Server')
      .setStyle(ButtonStyle.Secondary));
  }
  if (!(mode === 'moderator' && moderatorId && currentUserId && String(moderatorId) === String(currentUserId))) {
    viewButtons.push(new ButtonBuilder()
      .setCustomId(\`mod_analytics_my:\${window}:\${currentUserId || 'none'}:\${returnId}\`)
      .setLabel('👤 My History')
      .setStyle(ButtonStyle.Secondary));
  }
  viewButtons.push(new ButtonBuilder()
    .setCustomId('mod_case_appeal_queue:0')
    .setLabel('⚖️ Appeal Queue')
    .setStyle(ButtonStyle.Secondary));
  return [
    new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(\`mod_analytics_moderator_select:\${window}:\${returnId}\`)
        .setPlaceholder('👤 Select moderator for history')
        .setMinValues(1)
        .setMaxValues(1)
    ),
    new ActionRowBuilder().addComponents(
      Object.keys(ANALYTICS_WINDOWS).map((key) => new ButtonBuilder()
        .setCustomId(\`mod_analytics_window:\${key}:\${mode}:\${moderatorId || 'none'}:\${returnId}\`)
        .setLabel(ANALYTICS_WINDOW_LABELS[key])
        .setStyle(window === key ? ButtonStyle.Primary : ButtonStyle.Secondary))
    ),
    new ActionRowBuilder().addComponents(viewButtons),
  ];
}`,
  'analytics rows'
);

replaceOnce(
  `  } else if (active === 'analytics') {
    const returnId = context.analyticsReturnTargetId || 'none';
    finalButtons.push(new ButtonBuilder().setCustomId(\`mod_dashboard:\${returnId}:actions\`).setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary));
    if (canUseModAction(member, guild, 'export_cases')) finalButtons.push(new ButtonBuilder().setCustomId(\`mod_export_cases:\${returnId}\`).setLabel('📤 Export').setStyle(ButtonStyle.Secondary));
  } else {`,
  `  } else if (active === 'analytics') {
    const returnId = context.analyticsReturnTargetId || 'none';
    finalButtons.push(new ButtonBuilder().setCustomId(\`mod_dashboard:\${returnId}:actions\`).setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary));
    finalButtons.push(new ButtonBuilder()
      .setCustomId(\`mod_analytics_refresh:\${context.analyticsWindow || '30d'}:\${context.analyticsMode || 'overview'}:\${context.analyticsModeratorId || 'none'}:\${returnId}\`)
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary));
    if (canUseModAction(member, guild, 'export_cases')) finalButtons.push(new ButtonBuilder().setCustomId(\`mod_export_cases:\${returnId}\`).setLabel('📤 Export').setStyle(ButtonStyle.Secondary));
  } else {`,
  'analytics final navigation row'
);

if (/setLabel\('📊 Server'\)/.test(source)) {
  const analyticsRowsStart = source.indexOf('function buildAnalyticsRows(');
  const analyticsRowsEnd = source.indexOf('function buildTargetStats(', analyticsRowsStart);
  const analyticsRowsBlock = source.slice(analyticsRowsStart, analyticsRowsEnd);
  if (!analyticsRowsBlock.includes("if (mode === 'moderator')")) throw new Error('Server button is not conditional to moderator history.');
}
if (!source.includes(".setLabel('🔄 Refresh')")) throw new Error('Refresh was not moved to the final analytics row.');
if (!source.includes("title: `📊 Moderation Analytics • ${analytics.windowLabel}`")) throw new Error('Analytics title polish missing.');

fs.writeFileSync(path, source);
