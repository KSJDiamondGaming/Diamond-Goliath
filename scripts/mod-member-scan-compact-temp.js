'use strict';
const fs = require('fs');
const path = 'src/core/administration/mod/interactions.js';
let src = fs.readFileSync(path, 'utf8');
const start = src.indexOf('  const fields = [\n', src.indexOf('function buildMemberScanPayload'));
const endMarker = '  // Data-source provenance remains in the scan audit metadata rather than consuming viewer space.\n';
const end = src.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('Member scan field block not found');
const replacement = String.raw`  const identityLines = [
    'Username: ' + String(target.user.username) + ' • Global: ' + String(target.user.globalName || 'None'),
    'Display: ' + String(target.displayName || target.user.username) + ' • Bot: ' + (target.user.bot ? 'Yes' : 'No'),
    'Created: ' + scanTimestamp(target.user.createdTimestamp),
  ];
  if (access.history) identityLines.push(historicalNames.length
    ? 'Previous: ' + historicalNames.slice(0, 8).join(' • ') + ' • ' + history.scanCount + ' prior scan(s)'
    : 'History: No identity changes captured • ' + history.scanCount + ' prior scan(s)');

  const membershipLines = [
    'Joined: ' + scanTimestamp(target.joinedTimestamp),
    'Boosting: ' + (target.premiumSinceTimestamp ? scanTimestamp(target.premiumSinceTimestamp) : 'No') + ' • Screening: ' + (target.pending ? 'Pending' : 'Complete'),
    'Timeout: ' + (target.communicationDisabledUntilTimestamp ? scanTimestamp(target.communicationDisabledUntilTimestamp) : 'None'),
    'Roles (' + roles.length + '): ' + ((roles.slice(0, 10).map((role) => String(role)).join(', ') || 'None').slice(0, 500)),
    'Elevated permissions: ' + (keyPermissions.length ? keyPermissions.join(', ') : 'None'),
    'Account flags: ' + (flags.length ? flags.join(', ') : 'None'),
  ];

  const moderationLines = [
    'Warnings: **' + warningCount + '** • Cases: **' + cases.length + '** (' + activeCases + ' active) • Appeals: **' + appeals + '**',
    'Timeouts: **' + timeouts + '** • Bans: **' + bans + '** • Evidence: **' + evidence + '**',
    'Risk: **' + risk.score + '/100 • ' + risk.label + '**',
  ];
  if (risk.reasons.length) moderationLines.push(risk.reasons.map((reason) => '• ' + reason).join('\n'));
  moderationLines.push('Risk uses only intelligence this viewer is authorized to access.');

  const investigationLines = [];
  if (access.watch) investigationLines.push('Watch: **' + (investigation.watched ? 'ON' : 'OFF') + '**' + (investigation.watch?.reason ? ' • ' + investigation.watch.reason : ''));
  if (access.notes) investigationLines.push('Notes: **' + investigation.notes.length + '**' + (investigation.notes[0] ? ' • Latest: ' + investigation.notes[0].note.slice(0, 240) : ''));
  if (access.network) investigationLines.push(crossGuild.guildCount
    ? 'Network: **' + crossGuild.caseCount + '** case(s) across **' + crossGuild.guildCount + '** other Goliath guild(s)'
    : 'Network: No cases for this Discord ID in other Goliath guilds.');
  if (access.suspects) investigationLines.push('Suspected accounts: ' + (suspects.length ? '**' + suspects.length + ' match(es)**\n' + suspectText.slice(0, 500) : '**None found**'));
  if (access.links) investigationLines.push('Confirmed links: ' + (persistentLinks.length ? '**' + persistentLinks.length + ' evidence record(s)**' : 'None'));

  const fields = [
    { name: '🪪 Identity & History', value: identityLines.join('\n').slice(0, 1024), inline: false },
    { name: '🏠 Membership & Access', value: membershipLines.join('\n').slice(0, 1024), inline: false },
    { name: '⚖️ Moderation & Risk', value: moderationLines.join('\n').slice(0, 1024), inline: false },
    { name: '🕘 Recent Cases', value: recent.slice(0, 1024), inline: false },
  ];
  if (investigationLines.length) fields.push({ name: '👁️ Investigation Intelligence', value: investigationLines.join('\n').slice(0, 1024), inline: false });

  const sources = ['Discord API', 'guild member cache', 'Goliath moderation cases', 'warnings', 'case metadata', 'appeals', 'evidence'];
  if (access.history) sources.push('scan history');
  if (access.network) sources.push('same-ID cross-guild case intelligence');
  if (access.links) sources.push('persistent scan correlation');
  if (access.notes || access.watch) sources.push('investigation state');
  if (access.suspects) sources.push('heuristic guild correlation');
  // Data-source provenance remains in the scan audit metadata rather than consuming viewer space.
`;
src = src.slice(0, start) + replacement + src.slice(end + endMarker.length);
fs.writeFileSync(path, src);
console.log('Compacted Member Intelligence Scan embed fields.');
