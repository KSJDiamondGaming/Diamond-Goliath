'use strict';

const fs = require('fs');
const path = 'src/core/security/protection/quarantine.js';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`Anchor not found: ${label}`);
  source = source.replace(oldText, newText);
}

replaceOnce(`      await interviewChannel.permissionOverwrites.edit(member.id, {\n        ViewChannel: false,\n        SendMessages: false,\n        AddReactions: false,\n      }, { reason: 'Investigation escalated to full Security Isolation' }).catch(() => null);`, `      await interviewChannel.permissionOverwrites.edit(member.id, {\n        ViewChannel: false,\n      }, { reason: 'Investigation escalated to full Security Isolation' }).catch(() => null);`, 'security escalation overwrite');

replaceOnce(`      await channel.permissionOverwrites.edit(String(snapshot.memberId), {\n        ViewChannel: false,\n        SendMessages: false,\n        AddReactions: false,\n      }, { reason: options.reason || 'Investigation isolation closed' });`, `      await channel.permissionOverwrites.edit(String(snapshot.memberId), {\n        ViewChannel: false,\n      }, { reason: options.reason || 'Investigation isolation closed' });`, 'archive member overwrite');

fs.writeFileSync(path, source);

if (source.includes("ViewChannel: false,\n        SendMessages: false,\n        AddReactions: false")) {
  throw new Error('Overbroad quarantine member overwrite still present.');
}
console.log('Quarantine overwrite hardening applied.');
