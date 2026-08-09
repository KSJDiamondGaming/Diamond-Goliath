'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const router = fs.readFileSync(path.join(ROOT, 'src/owner/auditIntelligence/auditRouter.js'), 'utf8');
const intelligence = fs.readFileSync(path.join(ROOT, 'src/owner/auditIntelligence/auditIntelligence.js'), 'utf8');

test('audit delivery enforces per-guild pause and monitoring families', () => {
  assert.match(router, /guildConfig\.enabled === false/);
  assert.match(router, /monitoring\[monitorKeyForEvent\(event\)\] !== false/);
  assert.match(router, /!monitoringEnabled\(sourceGuild, event\)/);
});

test('audit delivery honours configured category routes and default fallback', () => {
  assert.match(router, /routes\[key\] \|\| \(key !== 'default' \? routes\.default : null\)/);
  assert.match(router, /configuredRouteChannel\(client, sourceGuild, event\)/);
  assert.match(router, /routedChannel\.send\(payload\)/);
});

test('captured audit events are stored before Discord delivery is attempted', () => {
  const storeAt = intelligence.indexOf('auditStore.appendEvent(event)');
  const deliverAt = intelligence.indexOf('auditRouter.deliver(client, guild, event)');
  assert.ok(storeAt >= 0, 'capture must persist the event');
  assert.ok(deliverAt > storeAt, 'Discord delivery must happen after persistence');
});

test('audit delivery excludes the private owner Command Center guild', () => {
  assert.match(router, /sourceGuild\.id === getOwnerAuditGuildId\(\)/);
});
