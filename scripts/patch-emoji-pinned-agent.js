'use strict';

const fs = require('node:fs');
const path = 'src/modules/utilityStudio/emojis/emojisApi.js';
const source = fs.readFileSync(path, 'utf8');

const before = `function pinnedAgent(parsed, addresses) {
  const selected = addresses.find((entry) => Number(entry.family) === 4) || addresses[0];
  const Agent = parsed.protocol === 'https:' ? https.Agent : http.Agent;
  return new Agent({
    lookup(hostname, options, callback) {
      callback(null, selected.address, selected.family);
    },
  });
}`;

const after = `function pinnedAgent(parsed, addresses) {
  const selected = addresses.find((entry) => Number(entry.family) === 4) || addresses[0];
  const address = String(selected?.address || '');
  const family = Number(selected?.family) || net.isIP(address);
  if (!address || !family) throw new Error('Emoji link hostname resolved to an invalid public address.');

  const Agent = parsed.protocol === 'https:' ? https.Agent : http.Agent;
  return new Agent({
    lookup(hostname, options, callback) {
      // Node 20+ may request lookup({ all: true }). In that mode the callback
      // must receive an array of address records rather than scalar address/family.
      if (options?.all) {
        callback(null, [{ address, family }]);
        return;
      }
      callback(null, address, family);
    },
  });
}`;

if (!source.includes(before)) {
  throw new Error('Expected pinnedAgent block not found; refusing unsafe patch.');
}
if (source.split(before).length !== 2) {
  throw new Error('Expected exactly one pinnedAgent block.');
}

fs.writeFileSync(path, source.replace(before, after));
console.log('Patched pinnedAgent for Node lookup all-mode compatibility.');
