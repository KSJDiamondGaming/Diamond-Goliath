'use strict';

const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'src', 'modules', 'embed', 'embedPanel.js');
let text = fs.readFileSync(target, 'utf8');
const original = text;

text = text.replace(
  '  "{userJoinedAt}",\n  "{userJoinedTimestamp}",\n  "{nowTimestamp}",',
  '  "{userJoinedAt}",\n  "{userJoinedTimestamp}",\n  "{createdAt}",\n  "{joinedAt}",\n  "{leftAt}",\n  "{timestamp}",\n  "{accountAge}",\n  "{membershipDuration}",\n  "{departureIcon}",\n  "{departureType}",\n  "{departureLabel}",\n  "{departureReason}",\n  "{departureModerator}",\n  "{departureModeratorId}",\n  "{nowTimestamp}",'
);

text = text.replace(
  '    userJoinedTimestamp: fmtTs(member.joinedTimestamp),\n    userjoinedtimestamp: fmtTs(member.joinedTimestamp),\n    nowTimestamp: now,\n    nowtimestamp: now,',
  '    userJoinedTimestamp: fmtTs(member.joinedTimestamp),\n    userjoinedtimestamp: fmtTs(member.joinedTimestamp),\n    createdAt: fmtTs(user.createdTimestamp) || "Unknown",\n    createdat: fmtTs(user.createdTimestamp) || "Unknown",\n    joinedAt: fmtTs(member.joinedTimestamp) || "Unknown",\n    joinedat: fmtTs(member.joinedTimestamp) || "Unknown",\n    leftAt: now,\n    leftat: now,\n    timestamp: now,\n    accountAge: "4 years, 2 months",\n    accountage: "4 years, 2 months",\n    membershipDuration: "1 year, 8 months",\n    membershipduration: "1 year, 8 months",\n    departureIcon: "👋",\n    departureicon: "👋",\n    departureType: "left",\n    departuretype: "left",\n    departureLabel: "Left Voluntarily",\n    departurelabel: "Left Voluntarily",\n    departureReason: "No reason — the member left voluntarily.",\n    departurereason: "No reason — the member left voluntarily.",\n    departureModerator: "Not applicable",\n    departuremoderator: "Not applicable",\n    departureModeratorId: "Not applicable",\n    departuremoderatorid: "Not applicable",\n    nowTimestamp: now,\n    nowtimestamp: now,'
);

text = text.replace('"Author name or icon variable"', '"Author name"');
text = text.replace('"Footer text or icon variable"', '"Footer text"');

if (text === original) {
  console.log('embedPanel.js already patched or expected anchors were not found.');
  process.exit(0);
}

fs.writeFileSync(target, text, 'utf8');
console.log('Patched embedPanel.js departure variables and preview aliases.');
