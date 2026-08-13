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
  assert.match(events, /\['deep', 'identity', 'account', 'evidence', 'guilds', 'moderation', 'roles', 'voice', 'timeline', 'actions'\]/);
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

test('former user discovery searches stored cross-environment identity evidence', () => {
  assert.match(store, /function searchUsersAcrossModes\(query, options = \{\}\)/);
  assert.match(store, /record\.guilds\?\.\[guildId\]/);
  assert.match(store, /record\.names \|\| \[\]/);
  assert.match(store, /record\.globalNames \|\| \[\]/);
  assert.match(store, /record\.displayNames \|\| \[\]/);
  assert.match(store, /record\.nicknames \|\| \[\]/);
  assert.match(events, /auditStore\.searchUsersAcrossModes\?\.\(value, \{ guildId: sourceGuild\.id, limit: 25 \}\)/);
});

test('former users remain discoverable by exact Discord ID after leaving a selected guild', () => {
  assert.match(events, /\^\\d\{16,22\}\$/);
  assert.match(events, /auditStore\.getUserAcrossModes\?\.\(value\)/);
  assert.match(events, /stored\?\.guilds\?\.\[sourceGuild\.id\]/);
  assert.match(events, /stored\.displayNames\?\.at\?\.\(-1\)/);
  assert.match(events, /Object\.keys\(stored\.environments \|\| \{\}\)/);
});

test('former user presence is reconciled against live guild visibility', () => {
  assert.match(userIntelligence, /function reconcileGuildPresence\(stored, liveGuilds\)/);
  assert.match(userIntelligence, /storedCurrentMember: guild\.currentMember/);
  assert.match(userIntelligence, /currentMember: Boolean\(live\) \? true : guild\.currentMember === false \? false : null/);
  assert.match(userIntelligence, /presenceSource: live \? 'live' : guild\.currentMember === false \? false : null/);
  assert.match(userIntelligence, /presenceSource: live \? 'live' : guild\.currentMember === false \? false : null/);
  assert.match(userIntelligence, /presenceSource: 'live'/);
  assert.match(userIntelligence, /const reconciledGuilds = reconcileGuildPresence\(stored, liveGuilds\)/);
  assert.match(userIntelligence, /formerGuilds: reconciledGuilds\.filter/);
  assert.match(userIntelligence, /unknownGuilds: reconciledGuilds\.filter/);
});

test('Guild History and Deep Scan consume reconciled former-user presence', () => {
  assert.match(userIntelligence, /guildPresence: \{/);
  assert.match(userIntelligence, /all: reconciledGuilds/);
  assert.match(userIntelligence, /current: reconciledGuilds\.filter/);
  assert.match(userIntelligence, /former: reconciledGuilds\.filter/);
  assert.match(userIntelligence, /unknown: reconciledGuilds\.filter/);
  assert.match(userIntelligence, /stored: \{ \.\.\.stored, guilds: reconciledGuildMap \}/);
  assert.match(userIntelligence, /function buildDeepSummary\(stored, liveGuilds\)/);
  assert.match(userIntelligence, /const guilds = reconcileGuildPresence\(stored, liveGuilds\)/);
  assert.match(embeds, /section === 'guilds'/);
  assert.match(embeds, /current member/);
  assert.match(embeds, /former member/);
  assert.match(embeds, /membership unknown/);
});

test('cross-mode user intelligence merges environment coverage and historical evidence', () => {
  assert.match(store, /function getUserAcrossModes\(userId\)/);
  assert.match(store, /for \(const item of availableAuditRoots\(\)\)/);
  assert.match(store, /environments\[item\.mode\] = \{/);
  assert.match(store, /merged\.names = mergeUniqueArray/);
  assert.match(store, /merged\.globalNames = mergeUniqueArray/);
  assert.match(store, /merged\.displayNames = mergeUniqueArray/);
  assert.match(store, /merged\.nicknames = mergeUniqueArray/);
  assert.match(store, /merged\.guilds = mergeGuildMembership/);
  assert.match(store, /mergeCountMap\(merged\.eventTypes, record\.eventTypes\)/);
  assert.match(store, /mergeCountMap\(merged\.categories, record\.categories\)/);
  assert.match(store, /mergeCountMap\(merged\.relations, record\.relations\)/);
  assert.match(store, /merged\.environments = environments/);
});

test('cross-mode history merge preserves bounded deduplicated timelines', () => {
  assert.match(store, /function mergeUniqueArray\(target, source, keyFn, limit = HISTORY_LIMIT\)/);
  assert.match(store, /map\.set\(key, item\)/);
  assert.match(store, /\.slice\(-limit\)/);
  assert.match(store, /merged\.joinHistory = mergeUniqueArray/);
  assert.match(store, /merged\.leaveHistory = mergeUniqueArray/);
  assert.match(store, /merged\.roleHistory = mergeUniqueArray/);
  assert.match(store, /merged\.moderationHistory = mergeUniqueArray/);
  assert.match(store, /merged\.voiceHistory = mergeUniqueArray/);
  assert.match(store, /merged\.actorHistory = mergeUniqueArray/);
  assert.match(store, /merged\.recentEvents = mergeUniqueArray/);
});

test('cross-mode user discovery ranks merged candidates after scanning every environment', () => {
  assert.match(store, /function searchIdentityValues\(userId, record\)/);
  assert.match(store, /kind: 'id', weight: 100/);
  assert.match(store, /kind: 'username', weight: 50/);
  assert.match(store, /kind: 'globalName', weight: 60/);
  assert.match(store, /kind: 'displayName', weight: 70/);
  assert.match(store, /kind: 'nickname', weight: 40/);
  assert.match(store, /function identityMatchScore\(value, candidate\)/);
  assert.match(store, /normalized === value/);
  assert.match(store, /normalized\.startsWith\(value\)/);
  assert.match(store, /normalized\.includes\(value\)/);
  assert.doesNotMatch(store, /if \(found\.size >= limit\) break;/);
  assert.match(store, /b\.score - a\.score/);
  assert.match(store, /b\.environments\.size - a\.environments\.size/);
  assert.match(store, /String\(b\.lastObservedAt \|\| ''\)\.localeCompare/);
});

test('cross-mode discovery returns deterministic environment order and match evidence', () => {
  assert.match(store, /REGISTRY_MODES\.filter\(\(mode\) => entry\.environments\.has\(mode\)\)/);
  assert.match(store, /matchedOn: entry\.matchedOn/);
  assert.match(store, /matchedValue: entry\.matchedValue/);
  assert.match(store, /current\.environments\.add\(item\.mode\)/);
  assert.match(store, /if \(best\.score > current\.score\)/);
});

test('cross-mode discovery makes match evidence visible in Discord result labels', () => {
  assert.match(store, /function identityMatchKindLabel\(kind\)/);
  assert.match(store, /id: 'ID'/);
  assert.match(store, /username: 'username'/);
  assert.match(store, /globalName: 'global name'/);
  assert.match(store, /displayName: 'display name'/);
  assert.match(store, /nickname: 'nickname'/);
  assert.match(store, /matched \$\{identityMatchKindLabel\(entry\.matchedOn\)\}: \$\{String\(entry\.matchedValue\)/);
});

test('single-result auto-select preserves and displays match evidence', () => {
  assert.match(events, /function intelligenceMatchKindLabel\(kind\)/);
  assert.match(events, /function intelligenceMatchEvidence\(match\)/);
  assert.match(events, /const selectedMatch = session\.userId \? session\.matches\?\.find/);
  assert.match(events, /const selectedEvidence = intelligenceMatchEvidence\(selectedMatch\)/);
  assert.match(events, /selectedEvidence \? `\\n\$\{selectedEvidence\}` : ''/);
  assert.match(events, /const userId = matches\.length === 1 \? matches\[0\]\.id : null/);
  assert.match(events, /matchedOn: entry\.matchedOn \|\| null/);
  assert.match(events, /matchedValue: entry\.matchedValue \?\? null/);
  assert.match(events, /matchedOn: 'id', matchedValue: value/);
  assert.match(events, /matchedOn: 'liveSearch', matchedValue: value/);
});

test('multi-result selector descriptions include match evidence and user identity context', () => {
  assert.match(events, /setCustomId\('owner:commandcenter:intelligence:result'\)/);
  assert.match(events, /match\.environments\.join\(' • '\)/);
  assert.match(events, /match\.matchedOn && match\.matchedValue != null/);
  assert.match(events, /Matched \$\{intelligenceMatchKindLabel\(match\.matchedOn\)\}: \$\{String\(match\.matchedValue\)\}/);
  assert.match(events, /User ID: \$\{match\.id\}/);
  assert.match(events, /description: .*\.slice\(0, 100\)/);
});

test('account and membership intelligence consolidates live and reconciled member state', () => {
  assert.match(userIntelligence, /function buildAccountMembershipSummary\(stored, liveUser, liveGuilds, reconciledGuilds\)/);
  assert.match(userIntelligence, /knownToDiscord: Boolean\(liveUser\)/);
  assert.match(userIntelligence, /accountCreatedAt: liveUser\?\.accountCreatedAt \|\| stored\.accountCreatedAt \|\| null/);
  assert.match(userIntelligence, /currentGuilds: current\.length/);
  assert.match(userIntelligence, /formerGuilds: former\.length/);
  assert.match(userIntelligence, /unknownGuilds: unknown\.length/);
  assert.match(userIntelligence, /pendingGuilds: pendingGuilds\.length/);
  assert.match(userIntelligence, /timedOutGuilds: timedOutGuilds\.length/);
  assert.match(userIntelligence, /earliestLiveJoinAt: joined\[0\] \|\| null/);
  assert.match(userIntelligence, /latestLiveJoinAt: joined\.at\?\.\(-1\) \|\| null/);
  assert.match(userIntelligence, /currentMemberships: memberships/);
  assert.match(userIntelligence, /pendingMemberships: pendingGuilds/);
  assert.match(userIntelligence, /timedOutMemberships: timedOutGuilds/);
  assert.match(userIntelligence, /accountMembership: buildAccountMembershipSummary\(stored, liveUser, liveGuilds, reconciledGuilds\)/);
});

test('Account & Membership view is exposed, routed and renders reconciled per-guild state', () => {
  assert.match(embeds, /owner:audit:account/);
  assert.match(embeds, /setLabel\('Account & Membership'\)/);
  assert.match(embeds, /section === 'account'/);
  assert.match(embeds, /Discord Account/);
  assert.match(embeds, /Membership Overview/);
  assert.match(embeds, /Live Join Range/);
  assert.match(embeds, /Current Memberships/);
  assert.match(embeds, /Former Memberships/);
  assert.match(embeds, /Unknown \/ Historical-only Memberships/);
  assert.match(events, /\['deep', 'identity', 'account', 'evidence', 'guilds', 'moderation', 'roles', 'voice', 'timeline', 'actions'\]/);
});