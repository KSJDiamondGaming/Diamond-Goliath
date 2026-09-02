'use strict';
const fs = require('fs');
const path = 'src/core/administration/mod/interactions.js';
let src = fs.readFileSync(path, 'utf8');
const start = src.indexOf('function buildMemberScanPayload(i, target) {');
const end = src.indexOf('function buildScanHistoryPayload(i, target) {');
if (start < 0 || end < 0 || end <= start) throw new Error('Member scan payload block not found');
const replacement = String.raw`function buildMemberScanPayload(i, target) {
  const access = {
    history: canScanCapability(i, 'scan_history'),
    compare: canScanCapability(i, 'scan_compare'),
    suspects: canScanCapability(i, 'scan_suspects'),
    network: canScanCapability(i, 'scan_network'),
    notes: canScanCapability(i, 'scan_notes'),
    watch: canScanCapability(i, 'scan_watch'),
    links: canScanCapability(i, 'scan_links'),
    cases: canUseModAction(i?.member, i?.guild, 'view_cases', i),
  };
  const summary = moderationSummary(i.guild.id, target.id);
  const { cases, warningCount, activeCases, bans, timeouts, appeals, evidence } = summary;
  const roles = [...target.roles.cache.values()].filter((role) => role.id !== i.guild.id).sort((a, b) => b.position - a.position);
  const keyPermissions = target.permissions.toArray().filter((name) => ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'ManageMessages', 'ModerateMembers', 'KickMembers', 'BanMembers'].includes(name));
  const flags = target.user.flags?.toArray?.() || [];
  const suspects = access.suspects ? buildSuspectedAccounts(i.guild, target) : [];
  const history = access.history ? historicalIdentitySnapshot(i.guild.id, target.id) : { names: [], globals: [], displays: [], avatars: [], scanCount: 0 };
  const crossGuild = access.network ? getCrossGuildModeration(target.id, i.guild.id) : { guildCount: 0, caseCount: 0, rows: [] };
  const investigation = (access.notes || access.watch) ? getInvestigationState(i.guild.id, target.id) : { watched: false, watch: null, notes: [] };
  const persistentLinks = access.links ? aggregateSuspectedEvidence(i.guild.id, target.id) : [];
  const risk = calculateModerationRisk(summary, crossGuild);
  const historicalNames = [...new Set([...history.names, ...history.globals, ...history.displays])].filter((name) => name && name !== target.user.username && name !== target.user.globalName && name !== target.displayName);
  const scanId = \`scan_\${Date.now().toString(36)}_\${target.id.slice(-6)}\`;
  const recent = cases.slice(0, 3).map((entry) => \`#\${entry.caseId} • \${entry.action} • \${entry.status || 'active'} • \${entry.reason || 'No reason'}\`).join('\n') || 'No recorded moderation cases.';

  const fields = [
    { name: '🪪 Identity', value: [\`Username: \\\\`\${target.user.username}\\\\`\`, \`Global: \${target.user.globalName || 'None'}\`, \`Display: \${target.displayName || target.user.username}\`, \`Account created: \${scanTimestamp(target.user.createdTimestamp)}\`].join('\n'), inline: true },
    { name: '🏠 Membership', value: [\`Joined: \${scanTimestamp(target.joinedTimestamp)}\`, \`Boosting: \${target.premiumSinceTimestamp ? scanTimestamp(target.premiumSinceTimestamp) : 'No'}\`, \`Screening: \${target.pending ? 'Pending' : 'Complete'}\`, \`Timeout: \${target.communicationDisabledUntilTimestamp ? scanTimestamp(target.communicationDisabledUntilTimestamp) : 'None'}\`].join('\n'), inline: true },
    { name: '⚖️ Moderation', value: [\`Warnings: **\${warningCount}** • Cases: **\${cases.length}** (**\${activeCases} active**)\`, \`Timeouts: **\${timeouts}** • Bans: **\${bans}**\`, \`Appeals: **\${appeals}** • Evidence: **\${evidence}**\`].join('\n'), inline: false },
    { name: '📈 Risk', value: [\`**\${risk.score}/100 • \${risk.label}**\`, risk.reasons.length ? risk.reasons.slice(0, 4).map((reason) => \`• \${reason}\`).join('\n') : 'No recorded moderation-risk signals.'].join('\n'), inline: true },
    { name: '👁️ Investigation', value: [access.watch ? \`Watch: **\${investigation.watched ? 'ON' : 'OFF'}**\` : null, access.notes ? \`Notes: **\${investigation.notes.length}**\` : null, access.links ? \`Persistent links: **\${persistentLinks.length}**\` : null].filter(Boolean).join('\n') || 'No investigation tools available.', inline: true },
    { name: '🕘 Recent Cases', value: recent.slice(0, 1024), inline: false },
  ];

  const profile = [];
  profile.push(\`Roles: **\${roles.length}**\${roles.length ? \` • \${roles.slice(0, 8).map((role) => String(role)).join(' ')}\` : ''}\`);
  profile.push(\`Elevated permissions: \${keyPermissions.length ? keyPermissions.map((name) => \`\\\\`\${name}\\\\`\`).join(' • ') : 'None'}\`);
  profile.push(\`Discord flags: \${flags.length ? flags.join(', ') : 'None exposed'}\`);
  fields.splice(2, 0, { name: '🎭 Profile & Access', value: profile.join('\n').slice(0, 1024), inline: false });

  if (access.history) fields.push({ name: '🧾 Identity History', value: historicalNames.length ? \`\${historicalNames.slice(0, 10).map((name) => \`\\\\`\${name}\\\\`\`).join(' • ')}\n**\${history.scanCount}** previous scan snapshot(s).\` : \`No identity changes captured • **\${history.scanCount}** previous scan snapshot(s).\`, inline: false });

  const intelligence = [];
  if (access.network) intelligence.push(crossGuild.guildCount ? \`🌐 Same Discord ID: **\${crossGuild.caseCount}** case(s) across **\${crossGuild.guildCount}** other Goliath guild(s).\` : '🌐 Same Discord ID: no moderation cases found in other Goliath guilds.');
  if (access.suspects) intelligence.push(suspects.length ? \`🧬 Suspected correlation: **\${suspects.length}** evidence-led match(es) detected. Use Compare/Link Evidence to review.\` : '🧬 Suspected correlation: **No link found**.');
  if (access.links) intelligence.push('🔗 Confirmed linked accounts: **None available from a verified identity-link provider.**');
  if (intelligence.length) fields.push({ name: '🌐 Network & Identity Intelligence', value: intelligence.join('\n').slice(0, 1024), inline: false });

  const embed = new Discord.EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(\`🔎 Member Intelligence Scan • \${target.user.tag}\`)
    .setDescription([
      \`**Target:** \${target.user} • \\\\`\${target.id}\\\\`\`,
      \`**Scan:** \\\\`\${scanId}\\\\`\`,
      '',
      'Permission-filtered intelligence for authorized management. Correlation signals are investigation aids, not proof of identity or ownership.',
    ].join('\n'))
    .addFields(fields)
    .setFooter({ text: \`Scanned by \${i.user?.tag || i.user?.username || i.user?.id || 'Unknown'} • evidence-based intelligence\` })
    .setTimestamp();

  const components = [];
  const scanButtons = [new Discord.ButtonBuilder().setCustomId(\`mod_member_scan:\${target.id}\`).setLabel('Rescan').setEmoji('🔄').setStyle(Discord.ButtonStyle.Primary)];
  if (access.history) scanButtons.push(new Discord.ButtonBuilder().setCustomId(\`mod_scan_history:\${target.id}\`).setLabel('Scan History').setEmoji('📜').setStyle(Discord.ButtonStyle.Secondary));
  if (access.compare) scanButtons.push(new Discord.ButtonBuilder().setCustomId(\`mod_scan_compare:\${target.id}\`).setLabel('Compare Member').setEmoji('⚖️').setStyle(Discord.ButtonStyle.Secondary));
  components.push(new Discord.ActionRowBuilder().addComponents(...scanButtons));

  const investigationButtons = [];
  if (access.links) investigationButtons.push(new Discord.ButtonBuilder().setCustomId(\`mod_scan_links:\${target.id}\`).setLabel(\`Link Evidence (\${persistentLinks.length})\`.slice(0, 80)).setEmoji('🔗').setStyle(Discord.ButtonStyle.Secondary));
  if (access.notes) investigationButtons.push(new Discord.ButtonBuilder().setCustomId(\`mod_scan_note:\${target.id}\`).setLabel('Add Note').setEmoji('📝').setStyle(Discord.ButtonStyle.Secondary));
  if (access.watch) investigationButtons.push(new Discord.ButtonBuilder().setCustomId(\`mod_scan_watch:\${target.id}\`).setLabel(investigation.watched ? 'Remove Watch' : 'Watch Status').setEmoji('👁️').setStyle(investigation.watched ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Secondary));
  if (investigationButtons.length) components.push(new Discord.ActionRowBuilder().addComponents(...investigationButtons));

  const nav = [new Discord.ButtonBuilder().setCustomId(\`mod_dashboard:\${target.id}:intelligence\`).setLabel('⬅️ Back').setStyle(Discord.ButtonStyle.Secondary)];
  if (access.cases) nav.push(new Discord.ButtonBuilder().setCustomId(\`mod_export_cases:\${target.id}\`).setLabel('📤 Export').setStyle(Discord.ButtonStyle.Secondary));
  components.push(new Discord.ActionRowBuilder().addComponents(...nav));
  return { scanId, cases, suspects, history, crossGuild, investigation, persistentLinks, risk, access, embed, components };
}
`;
src = src.slice(0, start) + replacement + src.slice(end);
fs.writeFileSync(path, src);
console.log('Patched member scan UI');
