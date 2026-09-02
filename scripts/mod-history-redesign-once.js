'use strict';

const fs = require('fs');
const path = 'src/core/administration/mod/panel.js';
let source = fs.readFileSync(path, 'utf8');

const start = source.indexOf('function buildModeratorAnalyticsEmbed(guild, analytics) {');
const end = source.indexOf('\nfunction buildAnalyticsRows(', start);
if (start < 0 || end < 0) throw new Error('Moderator analytics embed block not found');

const replacement = `function buildModeratorAnalyticsEmbed(guild, analytics, currentUserId = null) {
  const appeals = analytics.moderatorAppeals;
  const ownHistory = currentUserId && String(currentUserId) === String(analytics.moderatorId);
  const statuses = analytics.moderatorStatusCounts;
  const totalAppeals = Number(appeals.pending || 0) + Number(appeals.approved || 0) + Number(appeals.denied || 0);
  const recentActions = analytics.recentCases.length
    ? analytics.recentCases.map((entry) => {
        const when = getCaseTime(entry);
        return \`**#\${entry.caseId}** • \${String(entry.action || 'unknown').toUpperCase()} • <@\${entry.userId}>\\n\${getStatusLabel(entry)} • \${timestamp(when, 'f')}\`;
      }).join('\\n\\n')
    : 'No moderation actions in this period.';
  return createEmbed({
    title: ownHistory ? '👤 My Moderation History' : '👤 Moderator History',
    description: [
      ownHistory ? 'Your moderation activity and case history.' : \`Moderation activity and case history for <@\${analytics.moderatorId}>.\`,
      '',
      \`**Period:** \${analytics.windowLabel}\`,
    ].join('\\n'),
    color: COLORS.PRIMARY,
    fields: [
      { name: '📁 Cases Handled', value: \`Total **\${analytics.moderatorCases}** • Active **\${statuses.active || 0}** • Reversed **\${statuses.reversed || 0}** • Expired **\${statuses.expired || 0}**\`, inline: false },
      { name: '⚡ Actions Taken', value: \`Warnings **\${Number(analytics.moderatorActionCounts.warn || 0)}** • Timeouts **\${Number(analytics.moderatorActionCounts.timeout || 0)}** • Kicks **\${Number(analytics.moderatorActionCounts.kick || 0)}** • Bans **\${Number(analytics.moderatorActionCounts.ban || 0)}**\`, inline: false },
      { name: '👥 Members Moderated', value: \`**\${analytics.affectedUsers}**\`, inline: true },
      { name: '↩️ Reversal Rate', value: \`**\${analytics.moderatorReversalRate}**\`, inline: true },
      { name: '⚖️ Appeals', value: \`**\${totalAppeals}**\`, inline: true },
      { name: '🕘 Recent Actions', value: recentActions.slice(0, 1024), inline: false },
    ],
    footer: \`\${guild?.name || 'Server'} • \${analytics.windowLabel.toLowerCase()}\`,
  });
}`;
source = source.slice(0, start) + replacement + source.slice(end);

const oldCall = "embeds.push(buildModeratorAnalyticsEmbed(interaction.guild, getModeratorAnalytics(interaction.guild.id, context.analyticsModeratorId, window)))";
const newCall = "embeds.push(buildModeratorAnalyticsEmbed(interaction.guild, getModeratorAnalytics(interaction.guild.id, context.analyticsModeratorId, window), interaction.user?.id || null))";
if (!source.includes(oldCall)) throw new Error('Moderator analytics embed call not found');
source = source.replace(oldCall, newCall);

const oldNav = `    if (canUseModAction(member, guild, 'export_cases')) finalButtons.push(new ButtonBuilder().setCustomId(\`mod_export_cases:\${returnId}\`).setLabel('📤 Export').setStyle(ButtonStyle.Secondary));
    finalButtons.push(new ButtonBuilder()
      .setCustomId(\`mod_analytics_refresh:\${context.analyticsWindow || '30d'}:\${context.analyticsMode || 'overview'}:\${context.analyticsModeratorId || 'none'}:\${returnId}\`)
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary));`;
const newNav = `    finalButtons.push(new ButtonBuilder()
      .setCustomId(\`mod_analytics_refresh:\${context.analyticsWindow || '30d'}:\${context.analyticsMode || 'overview'}:\${context.analyticsModeratorId || 'none'}:\${returnId}\`)
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary));
    if (canUseModAction(member, guild, 'export_cases')) finalButtons.push(new ButtonBuilder().setCustomId(\`mod_export_cases:\${returnId}\`).setLabel('📤 Export').setStyle(ButtonStyle.Secondary));`;
if (!source.includes(oldNav)) throw new Error('Analytics final navigation block not found');
source = source.replace(oldNav, newNav);

fs.writeFileSync(path, source);
