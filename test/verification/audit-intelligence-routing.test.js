'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const router = fs.readFileSync(path.join(ROOT, 'src/owner/auditIntelligence/auditRouter.js'), 'utf8');
const events = fs.readFileSync(path.join(ROOT, 'src/owner/auditIntelligence/auditEvents.js'), 'utf8');
const intelligence = fs.readFileSync(path.join(ROOT, 'src/owner/auditIntelligence/auditIntelligence.js'), 'utf8');
const store = fs.readFileSync(path.join(ROOT, 'src/owner/auditIntelligence/auditStore.js'), 'utf8');
const embeds = fs.readFileSync(path.join(ROOT, 'src/owner/auditIntelligence/auditEmbeds.js'), 'utf8');
const userIntelligence = fs.readFileSync(path.join(ROOT, 'src/owner/auditIntelligence/userIntelligence.js'), 'utf8');
const ready = fs.readFileSync(path.join(ROOT, 'src/events/client/ready.js'), 'utf8');

const auditSources = { router, events, intelligence, store, embeds, userIntelligence };

test('Audit Intelligence source files are not placeholder stubs', () => {
  for (const [name, source] of Object.entries(auditSources)) {
    const trimmed = source.trim();
    assert.ok(trimmed.length > 100, `${name} must contain a real implementation`);
    assert.notEqual(trimmed, 'PLACEHOLDER', `${name} must not be replaced by a placeholder stub`);
    assert.doesNotMatch(source, /^\s*PLACEHOLDER\s*;?\s*$/m, `${name} must not contain a standalone PLACEHOLDER stub`);
  }
});

test('audit delivery enforces per-guild pause and monitoring families', () => {
  assert.match(router, /guildConfig\.enabled === false/);
  assert.match(router, /monitoring\[monitorKeyForEvent\(event\)\] !== false/);
  assert.match(router, /!monitoringEnabled\(sourceGuild, event\)/);
});

test('audit delivery honours configured category routes and default fallback', () => {
  assert.match(router, /routes\[key\] \|\| routes\.default/);
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

test('managed audit routes self-heal required Goliath delivery permissions', () => {
  assert.match(router, /async function repairManagedChannelPermissions/);
  assert.match(router, /ViewChannel: true, SendMessages: true, ReadMessageHistory: true/);
  assert.match(router, /unhealthy report route repair failed/);
});

test('structure repair re-provisions report routes and returns before-after health', () => {
  assert.match(router, /async function repairStructure/);
  assert.match(router, /ensureReportRoutes\(client, sourceGuild\)/);
  assert.match(router, /return \{ before, after: await inspectStructure\(client, sourceGuild\) \}/);
  assert.match(events, /Last Repair Result/);
  assert.match(events, /structureRepairSummary\(session\.repairResult\)/);
});

test('health repair orchestrates Command Center and guild structure recovery', () => {
  assert.match(router, /async function repairHealth\(client\)/);
  assert.match(router, /needsCommandCenterRepair/);
  assert.match(router, /repairStructure\(client,/);
  assert.match(router, /repairHealth,/);
});

test('Command Center exposes health repair control and visible repair outcome', () => {
  assert.match(events, /owner:commandcenter:health:repair/);
  assert.match(events, /setLabel\('Repair Health'\)/);
  assert.match(events, /auditRouter\.repairHealth\(client\)/);
  assert.match(events, /Last Health Repair/);
  assert.match(events, /healthRepairSummary\(repairResult\)/);
});

test('remote live probes expose explicit lifecycle states and ownership metadata', () => {
  assert.match(store, /status: 'pending'/);
  assert.match(store, /status: 'claimed'/);
  assert.match(store, /status: 'completed'/);
  assert.match(store, /status: 'failed'/);
  assert.match(store, /status: 'expired'/);
  assert.match(store, /claimedAt/);
  assert.match(store, /claimedBy/);
  assert.match(store, /failedAt/);
  assert.match(store, /failedBy/);
});

test('remote probe processor claims ownership before execution and respects claimant on completion', () => {
  const claimAt = ready.indexOf('auditStore.claimLiveProbeRequest');
  const executeAt = ready.indexOf('auditRouter.runLocalEndToEndProbe');
  const completeAt = ready.indexOf('auditStore.completeLiveProbeRequest');
  assert.ok(claimAt >= 0, 'processor must claim the request');
  assert.ok(executeAt > claimAt, 'collector must claim before executing the probe');
  assert.ok(completeAt > executeAt, 'collector must complete only after execution');
  assert.match(ready, /fresh\?\.status === 'claimed'/);
  assert.match(ready, /fresh\.claimedBy/);
  assert.match(ready, /auditStore\.failLiveProbeRequest/);
});

test('remote probe router preserves distinct terminal outcomes', () => {
  assert.match(router, /status === 'completed'/);
  assert.match(router, /status === 'failed'/);
  assert.match(router, /status === 'expired'/);
  assert.match(router, /reason: 'remote-failed'/);
  assert.match(router, /reason: 'expired'/);
  assert.match(router, /reason: 'remote-timeout'/);
  assert.match(router, /lifecycleStatus/);
  assert.match(router, /current\?\.claimedBy \|\| targetMode/);
});

test('Routing panel surfaces remote probe failure, expiry and timeout distinctly', () => {
  assert.match(events, /case 'remote-timeout'/);
  assert.match(events, /timed out waiting for/);
  assert.match(events, /case 'expired'/);
  assert.match(events, /request expired/);
  assert.match(events, /case 'remote-failed'/);
  assert.match(events, /remote collector/);
  assert.match(events, /lifecycleStatus/);
  assert.match(events, /Check the collector logs before retrying/);
});

test('user intelligence builds a structured cross-environment deep summary', () => {
  assert.match(userIntelligence, /function buildDeepSummary\(stored, liveGuilds\)/);
  assert.match(userIntelligence, /environments,/);
  assert.match(userIntelligence, /guildPresence:/);
  assert.match(userIntelligence, /subjectEvents:/);
  assert.match(userIntelligence, /actorActions:/);
  assert.match(userIntelligence, /actionsPerformed:/);
  assert.match(userIntelligence, /topEventTypes:/);
  assert.match(userIntelligence, /topCategories:/);
  assert.match(userIntelligence, /recentActivity,/);
  assert.match(userIntelligence, /deep: buildDeepSummary\(stored, liveGuilds\)/);
});

test('Deep Scan renders structured intelligence instead of raw count objects', () => {
  assert.match(embeds, /const deep = report\?\.deep \|\| \{\}/);
  assert.match(embeds, /Environment Coverage/);
  assert.match(embeds, /Guild Presence/);
  assert.match(embeds, /Subject vs Actor Activity/);
  assert.match(embeds, /Activity Totals/);
  assert.match(embeds, /Top Event Types/);
  assert.match(embeds, /Top Categories/);
  assert.match(embeds, /Recent Cross-Environment Activity/);
  assert.match(embeds, /Latest Moderation/);
  assert.match(embeds, /Latest Action Performed/);
  assert.doesNotMatch(embeds, /name: 'Event Totals', value: compact\(report\.counts/);
});

test('User Intelligence exposes identity and actor-history controls', () => {
  assert.match(embeds, /owner:audit:identity/);
  assert.match(embeds, /setLabel\('Identity History'\)/);
  assert.match(embeds, /owner:audit:actions/);
  assert.match(embeds, /setLabel\('Actions Performed'\)/);
  assert.match(events, /\['deep', 'identity', 'guilds', 'moderation', 'roles', 'voice', 'timeline', 'actions'\]/);
});

test('Identity History renders observed cross-environment identity evidence', () => {
  assert.match(userIntelligence, /function buildIdentitySummary\(stored, liveUser, liveGuilds\)/);
  assert.match(userIntelligence, /identity: buildIdentitySummary\(stored, liveUser, liveGuilds\)/);
  assert.match(embeds, /section === 'identity'/);
  assert.match(embeds, /Current Identity/);
  assert.match(embeds, /Observed Coverage/);
  assert.match(embeds, /Username History/);
  assert.match(embeds, /Global Name History/);
  assert.match(embeds, /Display Name History/);
  assert.match(embeds, /Nickname History by Guild/);
  assert.match(embeds, /Current Live Nicknames/);
  assert.match(embeds, /does not infer unobserved Discord identity changes/);
});

test('User Intelligence builds structured moderation intelligence', () => {
  assert.match(userIntelligence, /function buildModerationSummary\(stored\)/);
  assert.match(userIntelligence, /moderation: buildModerationSummary\(stored\)/);
  assert.match(userIntelligence, /reasoned,/);
  assert.match(userIntelligence, /withoutReason:/);
  assert.match(userIntelligence, /attributedActorCount:/);
  assert.match(userIntelligence, /unresolvedActor,/);
  assert.match(userIntelligence, /topTypes:/);
  assert.match(userIntelligence, /topGuilds:/);
  assert.match(userIntelligence, /topActors:/);
  assert.match(userIntelligence, /recent:/);
});

test('Moderation section renders structured cross-environment intelligence', () => {
  assert.match(embeds, /const moderation = report\?\.moderation \|\| \{\}/);
  assert.match(embeds, /Moderation Overview/);
  assert.match(embeds, /Environment Coverage/);
  assert.match(embeds, /First Recorded Moderation/);
  assert.match(embeds, /Latest Moderation/);
  assert.match(embeds, /Top Moderation Types/);
  assert.match(embeds, /Top Guilds/);
  assert.match(embeds, /Top Attributed Actors/);
  assert.match(embeds, /Recent Moderation History/);
  assert.match(embeds, /Unresolved actor/);
});

test('User Intelligence builds structured role intelligence', () => {
  assert.match(userIntelligence, /function buildRoleSummary\(stored, liveGuilds\)/);
  assert.match(userIntelligence, /roles: buildRoleSummary\(stored, liveGuilds\)/);
  assert.match(userIntelligence, /additions:/);
  assert.match(userIntelligence, /removals:/);
  assert.match(userIntelligence, /replacements:/);
  assert.match(userIntelligence, /attributedActorCount:/);
  assert.match(userIntelligence, /unresolvedActor,/);
  assert.match(userIntelligence, /topTypes:/);
  assert.match(userIntelligence, /topGuilds:/);
  assert.match(userIntelligence, /topActors:/);
  assert.match(userIntelligence, /currentGuilds:/);
  assert.match(userIntelligence, /uniqueCurrentRoles:/);
  assert.match(userIntelligence, /recent:/);
});

test('Roles section renders structured live and stored role intelligence', () => {
  assert.match(embeds, /const roles = report\?\.roles \|\| \{\}/);
  assert.match(embeds, /Role Change Overview/);
  assert.match(embeds, /First Recorded Role Change/);
  assert.match(embeds, /Latest Role Change/);
  assert.match(embeds, /Top Role Event Types/);
  assert.match(embeds, /Top Guilds/);
  assert.match(embeds, /Top Attributed Actors/);
  assert.match(embeds, /Current Live Role State/);
  assert.match(embeds, /Highest Roles/);
  assert.match(embeds, /Unique Current Roles/);
  assert.match(embeds, /Recent Role History/);
});

test('User Intelligence builds structured voice intelligence', () => {
  assert.match(userIntelligence, /function buildVoiceSummary\(stored, liveGuilds\)/);
  assert.match(userIntelligence, /voice: buildVoiceSummary\(stored, liveGuilds\)/);
  assert.match(userIntelligence, /joins:/);
  assert.match(userIntelligence, /leaves:/);
  assert.match(userIntelligence, /moves:/);
  assert.match(userIntelligence, /stateChanges:/);
  assert.match(userIntelligence, /topTypes:/);
  assert.match(userIntelligence, /topGuilds:/);
  assert.match(userIntelligence, /topChannels:/);
  assert.match(userIntelligence, /currentGuilds:/);
  assert.match(userIntelligence, /recent:/);
});

test('Voice section renders structured live and stored voice intelligence', () => {
  assert.match(embeds, /const voice = report\?\.voice \|\| \{\}/);
  assert.match(embeds, /Voice Activity Overview/);
  assert.match(embeds, /Current Voice State/);
  assert.match(embeds, /First Recorded Voice Event/);
  assert.match(embeds, /Latest Voice Event/);
  assert.match(embeds, /Top Voice Event Types/);
  assert.match(embeds, /Top Guilds/);
  assert.match(embeds, /Most Seen Voice Channels/);
  assert.match(embeds, /Current Live Voice State/);
  assert.match(embeds, /Recent Voice History/);
  assert.match(embeds, /Server mute\/deaf/);
  assert.match(embeds, /Self mute\/deaf/);
});
