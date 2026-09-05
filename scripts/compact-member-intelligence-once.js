'use strict';
const fs = require('fs');

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing patch anchor: ${label}`);
  return text.replace(from, to);
}

const intelPath = 'src/core/administration/mod/intelligence.js';
let intel = fs.readFileSync(intelPath, 'utf8');
const oldBlock = `  removeField(report.embed, '⚖️ Moderation & Risk');
  setOrReplaceField(report.embed, '⚖️ Moderation & Risk', [
    \`Cases: **\${report.cases?.length || 0}** • Active: **\${localSummary.activeCases}** • Warnings: **\${localSummary.warningCount}**\`,
    \`Timeouts: **\${localSummary.timeouts}** • Bans: **\${localSummary.bans}**\`,
    \`Risk: **\${context.risk.score}/100 • \${context.risk.label}**\`,
    ...(context.risk.reasons.slice(0, 4).map((item) => \`+\${item.points} • \${item.reason}\`)),
  ].join('\\n'));
  setOrReplaceField(report.embed, '🌐 Network Reputation', contextSummary(context));
  setOrReplaceField(report.embed, '📊 Behaviour Pattern', behaviorSummary(context.behavior));
  setOrReplaceField(report.embed, '🔗 Verified Identity Links', context.confirmedLinks.length ? context.confirmedLinks.slice(0, 5).map((link) => \`• <@\${String(link.userId) === String(target.id) ? link.linkedUserId : link.userId}> • \${link.provider} • verified \${discordTime(link.verifiedAt)}\`).join('\\n') : 'No verified identity links are stored for this member.');`;
const newBlock = `  removeField(report.embed, '⚖️ Moderation & Risk');
  removeField(report.embed, '🌐 Network Reputation');
  removeField(report.embed, '📊 Behaviour Pattern');
  removeField(report.embed, '🔗 Verified Identity Links');
  setOrReplaceField(report.embed, '⚖️ Moderation Overview', [
    \`Cases **\${report.cases?.length || 0}** • Active **\${localSummary.activeCases}** • Warnings **\${localSummary.warningCount}** • Timeouts **\${localSummary.timeouts}** • Bans **\${localSummary.bans}**\`,
    \`Risk **\${context.risk.score}/100 • \${context.risk.label}** • Watchlist \${watchLine(context.watch)}\`,
  ].join('\\n'));
  const history = context.guildHistory || [];
  const currentGuilds = history.filter((item) => item.present).length;
  const formerGuilds = history.filter((item) => item.present === false).length;
  const reputation = context.reputation || {};
  const behavior = context.behavior || {};
  setOrReplaceField(report.embed, '🧠 Intelligence Summary', [
    \`Network: **\${history.length}** observed guild(s) • **\${currentGuilds}** current • **\${formerGuilds}** former\`,
    \`Cross-guild: **\${context.network?.caseCount || 0}** cases • **\${context.network?.banCount || 0}** bans • **\${context.network?.timeoutCount || 0}** timeouts\`,
    \`External: **\${reputation.verifiedExternal || 0}** verified • **\${reputation.submitted || 0}** submitted • **\${reputation.unverified || 0}** unverified\`,
    \`Behaviour: **\${String(behavior.trend || 'stable').toUpperCase()}** • 30d **\${behavior.windows?.d30?.total || 0}** case(s) • Verified links **\${context.confirmedLinks.length}**\`,
    'Open the drill-down controls below for evidence and history.',
  ].join('\\n'));`;
intel = replaceOnce(intel, oldBlock, newBlock, 'compact intelligence overview');
fs.writeFileSync(intelPath, intel);

const interactionsPath = 'src/core/administration/mod/interactions.js';
let interactions = fs.readFileSync(interactionsPath, 'utf8');
interactions = replaceOnce(interactions,
  "    'Roles (' + roles.length + '): ' + ((roles.slice(0, 10).map((role) => String(role)).join(', ') || 'None').slice(0, 500)),",
  "    'Roles (' + roles.length + '): ' + ((roles.slice(0, 5).map((role) => String(role)).join(', ') || 'None').slice(0, 320)) + (roles.length > 5 ? ` • +${roles.length - 5} more` : ''),",
  'compact role summary');
interactions = replaceOnce(interactions,
  "  const recent = cases.slice(0, 5).map((entry) => `#${entry.caseId} • ${entry.action} • ${entry.status || 'active'} • ${entry.reason || 'No reason'}`).join('\\n') || 'No recorded moderation cases.';",
  "  const recent = cases.slice(0, 3).map((entry) => `#${entry.caseId} • ${entry.action} • ${entry.status || 'active'} • ${(entry.reason || 'No reason').slice(0, 120)}`).join('\\n') || 'No recorded moderation cases.';",
  'compact recent cases');
interactions = replaceOnce(interactions,
  "      'Permission-filtered intelligence for authorized management. Correlation signals are investigation aids, not proof of identity or ownership.',",
  "      'Evidence-led overview for authorized management. Use the drill-down controls for full history, reputation and risk evidence.',",
  'short scan description');
fs.writeFileSync(interactionsPath, interactions);
console.log('Member Intelligence overview compacted.');
