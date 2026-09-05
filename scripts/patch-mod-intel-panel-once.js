'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src/core/administration/mod/intelligence.js');
let source = fs.readFileSync(file, 'utf8');

const start = source.indexOf('async function decorateScan(interaction, target, report) {');
const end = source.indexOf('\nfunction backRow(targetId) {', start);
if (start < 0 || end < 0) throw new Error('decorateScan anchor not found');

const replacement = `async function decorateScan(interaction, target, report) {
  const localSummary = {
    warningCount: 0,
    activeCases: report?.cases?.filter?.((entry) => String(entry.status || 'active') === 'active').length || 0,
    timeouts: report?.cases?.filter?.((entry) => entry.action === 'timeout').length || 0,
    bans: report?.cases?.filter?.((entry) => entry.action === 'ban').length || 0,
  };
  try {
    const warningRow = db.prepare('SELECT COUNT(*) AS count FROM warnings WHERE guild_id = ? AND user_id = ?').get(String(interaction.guild.id), String(target.id));
    localSummary.warningCount = Number(warningRow?.count || 0);
  } catch {}

  const context = await buildContext(interaction.client, target, localSummary);
  report.intelligenceContext = context;
  report.risk = context.risk;

  for (const field of [
    '🪪 Identity & History',
    '🏠 Membership & Access',
    '⚖️ Moderation & Risk',
    '🕘 Recent Cases',
    '👁️ Investigation Intelligence',
    '⚖️ Moderation Overview',
    '🧠 Intelligence Summary',
    '🌐 Network Reputation',
    '📊 Behaviour Pattern',
    '🔗 Verified Identity Links',
  ]) removeField(report.embed, field);

  const history = context.guildHistory || [];
  const currentGuilds = history.filter((item) => item.present).length;
  const formerGuilds = history.filter((item) => item.present === false).length;
  const reputation = context.reputation || {};
  const behavior = context.behavior || {};
  const roles = [...(target.roles?.cache?.values?.() || [])]
    .filter((role) => role.id !== interaction.guild.id)
    .sort((a, b) => b.position - a.position);
  const elevated = target.permissions?.toArray?.().filter((name) => ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'ManageMessages', 'ModerateMembers', 'KickMembers', 'BanMembers'].includes(name)) || [];
  const latestCase = report.cases?.[0] || null;
  const watchState = context.watch?.state || 'clear';
  const watchConfig = WATCH_STATES[watchState] || WATCH_STATES.clear;
  const investigationWatch = report.investigation?.watched ? 'ON' : 'OFF';
  const externalSummary = reputation.verifiedExternal
    ? \`**\${reputation.verifiedExternal} verified**\`
    : 'No verified records';

  report.embed
    .setTitle(\`🔎 Member Intelligence • \${target.user.tag}\`)
    .setDescription([
      \`**Target:** \${target.user} (\\\`\${target.id}\\\`)\`,
      'Evidence-led member overview for authorized management. Start with status and risk, then open a drill-down when more detail is needed.',
    ].join('\\n\\n'))
    .setFooter({ text: \`Scan \${report.scanId} • Scanned by \${interaction.user?.tag || interaction.user?.username || interaction.user?.id || 'Unknown'} • evidence-based intelligence\` });

  setOrReplaceField(report.embed, '🚦 Status & Risk', [
    \`Risk **\${context.risk.score}/100 • \${context.risk.label}**\`,
    \`Watchlist **\${watchConfig.emoji} \${watchConfig.label}** • Active Cases **\${localSummary.activeCases}** • Warnings **\${localSummary.warningCount}**\`,
    \`Network **\${history.length}** observed guild(s) • External \${externalSummary}\`,
  ].join('\\n'));

  setOrReplaceField(report.embed, '👤 Member', [
    \`Username **\${target.user.username}** • Display **\${target.displayName || target.user.username}**\`,
    \`Created \${discordTime(target.user.createdAt || target.user.createdTimestamp, 'F')} • Joined \${discordTime(target.joinedAt || target.joinedTimestamp, 'F')}\`,
    \`Roles **\${roles.length}** • Elevated permissions **\${elevated.length ? elevated.join(', ') : 'None'}**\`,
    \`Timeout **\${target.communicationDisabledUntilTimestamp ? discordTime(target.communicationDisabledUntilTimestamp, 'R') : 'None'}**\`,
  ].join('\\n'));

  setOrReplaceField(report.embed, '⚖️ Moderation', [
    \`Cases **\${report.cases?.length || 0}** • Warnings **\${localSummary.warningCount}** • Timeouts **\${localSummary.timeouts}** • Bans **\${localSummary.bans}**\`,
    latestCase
      ? \`Latest **#\${latestCase.caseId} • \${latestCase.action} • \${latestCase.status || 'active'}** — \${String(latestCase.reason || 'No reason').slice(0, 180)}\`
      : 'Latest **No recorded moderation cases**',
  ].join('\\n'));

  const investigationLines = [
    \`Investigation Watch **\${investigationWatch}** • Notes **\${report.investigation?.notes?.length || 0}**\`,
    \`Link Evidence **\${report.persistentLinks?.length || 0}** • Verified identity links **\${context.confirmedLinks?.length || 0}**\`,
  ];
  if (report.suspects?.length) investigationLines.push(\`Suspected accounts **\${report.suspects.length} match(es)** — open evidence/history before drawing a conclusion.\`);
  setOrReplaceField(report.embed, '🔎 Investigation', investigationLines.join('\\n'));

  setOrReplaceField(report.embed, '🧠 Intelligence Summary', [
    \`Network **\${history.length}** observed • **\${currentGuilds}** current • **\${formerGuilds}** former • Cross-guild cases **\${context.network?.caseCount || 0}**\`,
    \`External **\${reputation.verifiedExternal || 0}** verified • **\${reputation.submitted || 0}** submitted • **\${reputation.unverified || 0}** unverified\`,
    \`Behaviour **\${String(behavior.trend || 'stable').toUpperCase()}** • 30d **\${behavior.windows?.d30?.total || 0}** case(s)\`,
  ].join('\\n'));

  const components = [];
  const primary = [
    new Discord.ButtonBuilder().setCustomId(\`mod_member_scan:\${target.id}\`).setLabel('Rescan').setEmoji('🔄').setStyle(Discord.ButtonStyle.Primary),
  ];
  if (report.access?.history) primary.push(new Discord.ButtonBuilder().setCustomId(\`mod_scan_history:\${target.id}\`).setLabel('Scan History').setEmoji('🕘').setStyle(Discord.ButtonStyle.Secondary));
  primary.push(
    new Discord.ButtonBuilder().setCustomId(\`mod_intel_guilds:\${target.id}\`).setLabel('Network Reputation').setEmoji('🌐').setStyle(Discord.ButtonStyle.Secondary),
    new Discord.ButtonBuilder().setCustomId(\`mod_intel_risk:\${target.id}\`).setLabel('Risk Details').setEmoji('📈').setStyle(Discord.ButtonStyle.Secondary),
  );
  components.push(new Discord.ActionRowBuilder().addComponents(...primary));

  const evidence = [
    new Discord.ButtonBuilder().setCustomId(\`mod_intel_identity:\${target.id}\`).setLabel('Identity History').setEmoji('🪪').setStyle(Discord.ButtonStyle.Secondary),
    new Discord.ButtonBuilder().setCustomId(\`mod_intel_behavior:\${target.id}\`).setLabel('Behaviour').setEmoji('📊').setStyle(Discord.ButtonStyle.Secondary),
  ];
  if (report.access?.links) evidence.push(new Discord.ButtonBuilder().setCustomId(\`mod_scan_links:\${target.id}\`).setLabel(\`Link Evidence (\${report.persistentLinks?.length || 0})\`.slice(0, 80)).setEmoji('🔗').setStyle(Discord.ButtonStyle.Secondary));
  if (report.access?.notes) evidence.push(new Discord.ButtonBuilder().setCustomId(\`mod_scan_note:\${target.id}\`).setLabel('Add Note').setEmoji('📝').setStyle(Discord.ButtonStyle.Secondary));
  components.push(new Discord.ActionRowBuilder().addComponents(...evidence));

  const stateControls = [];
  if (report.access?.watch) stateControls.push(new Discord.ButtonBuilder()
    .setCustomId(\`mod_scan_watch:\${target.id}\`)
    .setLabel(report.investigation?.watched ? 'Remove Investigation Watch' : 'Investigation Watch')
    .setEmoji('👁️')
    .setStyle(report.investigation?.watched ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Secondary));
  stateControls.push(new Discord.ButtonBuilder()
    .setCustomId(\`mod_intel_watchlist:\${target.id}\`)
    .setLabel('Watchlist')
    .setEmoji('🛡️')
    .setStyle(watchState === 'blacklisted' ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Secondary));
  components.push(new Discord.ActionRowBuilder().addComponents(...stateControls));

  const nav = [new Discord.ButtonBuilder().setCustomId(\`mod_dashboard:\${target.id}:intelligence\`).setLabel('⬅️ Back').setStyle(Discord.ButtonStyle.Secondary)];
  if (report.access?.cases) nav.push(new Discord.ButtonBuilder().setCustomId(\`mod_export_cases:\${target.id}\`).setLabel('📤 Export').setStyle(Discord.ButtonStyle.Secondary));
  components.push(new Discord.ActionRowBuilder().addComponents(...nav));
  report.components = components;
  return report;
}
`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(file, source);
console.log('✅ Member Intelligence panel hierarchy and controls updated');
