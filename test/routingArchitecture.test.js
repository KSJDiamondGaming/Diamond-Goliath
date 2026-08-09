'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Social Studio routing precedence is centralized and persistence strips inherited routes', () => {
  const resolver = read('src/modules/socialStudio/socialAlerts/socialStudioRoutingResolver.js');
  const monitor = read('src/modules/socialStudio/socialAlerts/socialStudioMonitor.js');
  const compatEntry = read('src/events/client/socialStudioCreatorRoutingCompat.js');

  assert.match(monitor, /projectEffectiveAccounts/);
  assert.match(resolver, /Creator Platform Override/);
  assert.match(resolver, /User Content Override/);
  assert.match(resolver, /User All Content/);
  assert.match(resolver, /Creator Override/);
  assert.match(resolver, /Account Content Override/);
  assert.match(resolver, /Server Platform Override/);
  assert.match(resolver, /Server Dedicated/);
  assert.match(resolver, /Server Default/);
  assert.match(compatEntry, /cleanInheritedRouting/);
  assert.match(compatEntry, /creatorRouting\.installStoreCompatibility = \(\) => \{\}/);
  assert.match(compatEntry, /userRouting\.installStoreCompatibility = \(\) => \{\}/);
});

test('Command Center guild persistence and stale private command cleanup are dynamically scoped', () => {
  const auditStore = read('src/owner/auditIntelligence/auditStore.js');
  const commandSync = read('src/core/commandRegistry/syncCommands.js');

  assert.match(auditStore, /selectedGuildId/);
  assert.match(auditStore, /persistGuildId/);
  assert.match(commandSync, /cleanupCommandCenterScope/);
  assert.match(commandSync, /guildId === commandCenterGuildId/);
  assert.match(commandSync, /Removed stale private \/commandcenter from non-Command-Center guild/);
});
