'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('verification health reads canonical module state', () => {
  const source = read('src/modules/securityStudio/verificationHealth.js');
  assert.match(source, /guildManager\.isModuleEnabled\(guild\.id, 'verification'\)/);
});

test('verification startup reads canonical module state', () => {
  const source = read('src/modules/securityStudio/verification.js');
  assert.match(source, /guildManager\.isModuleEnabled\(guild\.id, 'verification'\)/);
});

test('verification route does not persist enabled through manager config', () => {
  const source = read('src/modules/securityStudio/verificationRoute.js');
  assert.match(source, /enabled: guildManager\.isModuleEnabled\(guildId, 'verification'\) === true/);
  assert.doesNotMatch(source, /configureVerification\(guildId, \{ enabled,/);
});

test('verification store removes module-level enabled state', () => {
  const source = read('src/modules/securityStudio/verificationStore.js');
  const defaultSection = source.slice(
    source.indexOf('function defaultVerificationSection()'),
    source.indexOf('function normalizeAnalytics('),
  );
  assert.doesNotMatch(defaultSection, /enabled\s*:/);
  assert.match(source, /delete normalized\.enabled;/);
});

test('verification member events are guarded by canonical module state', () => {
  const source = read('src/events/members/memberJoinLeave.js');
  assert.match(source, /guildManager\.isModuleEnabled\(member\.guild\.id, 'verification'\)/);
  assert.match(source, /guildManager\.isModuleEnabled\(newMember\.guild\.id, 'verification'\)/);
});

test('welcome and goodbye member events are guarded by canonical module state', () => {
  const source = read('src/events/members/memberJoinLeave.js');
  assert.match(source, /guildManager\.isModuleEnabled\(member\.guild\.id, 'welcome'\)/);
  assert.match(source, /guildManager\.isModuleEnabled\(member\.guild\.id, 'goodbye'\)/);
});

test('polls startup recovery reads canonical module state', () => {
  const source = read('src/events/polls/pollsReady.js');
  assert.match(source, /guildManager\.isModuleEnabled\(guild\.id, 'polls'\)/);
  assert.doesNotMatch(source, /section\.enabled/);
});

test('poll creation reads canonical module state', () => {
  const source = read('src/modules/communityStudio/polls/polls.js');
  assert.match(source, /guildManager\.isModuleEnabled\(guildId, MODULE_KEY\)/);
  assert.doesNotMatch(source.slice(source.indexOf('function createPoll'), source.indexOf('function updatePoll')), /section\.enabled/);
});

test('invite tracking dispatch reads canonical module state', () => {
  const source = read('src/modules/communityStudio/invites/invitesTracking.js');
  assert.match(source, /isModuleEnabled\(member\.guild\.id, 'invites'\)/);
  assert.doesNotMatch(source, /section\.enabled/);
});

test('timed roles member join is guarded by canonical module state', () => {
  const source = read('src/events/timedroles/timedRolesMemberJoin.js');
  assert.match(source, /guildManager\.isModuleEnabled\(member\.guild\.id, 'timedRoles'\)/);
  assert.doesNotMatch(source, /section\.enabled/);
});

test('timed roles API reports and writes canonical module state', () => {
  const source = read('src/modules/roleStudio/timedRoles/timedRolesRoute.js');
  assert.match(source, /guildManager\.isModuleEnabled\(id, 'timedRoles'\)/);
  assert.match(source, /guildManager\.setModuleEnabled\(id, 'timedRoles', req\.body\?\.enabled === true/);
  assert.doesNotMatch(source, /timedRoles\.setEnabled/);
  assert.doesNotMatch(source, /enabled: config\.enabled !== false/);
});

test('leveling message tracking reads canonical module state', () => {
  const source = read('src/modules/communityStudio/leveling/levelingTracking.js');
  assert.match(source, /isModuleEnabled\(message\.guild\.id, 'leveling'\)/);
  assert.doesNotMatch(source, /section\.enabled/);
});

test('schedule tracking reads canonical module state', () => {
  const source = read('src/modules/utilityStudio/schedule/scheduleTracking.js');
  assert.match(source, /isModuleEnabled\(guild\.id, 'schedule'\)/);
  assert.doesNotMatch(source, /section\.enabled/);
});

test('translation startup and message runtime read canonical module state', () => {
  const startup = read('src/modules/utilityStudio/translation/translationStartup.js');
  const messages = read('src/events/messages/messageCreate.js');
  const threads = read('src/modules/utilityStudio/translation/translationThreadManager.js');
  assert.match(startup, /isModuleEnabled\(guild\.id, 'translation'\)/);
  assert.match(messages, /guildManager\.isModuleEnabled\(message\.guild\.id, 'translation'\)/);
  assert.match(threads, /guildManager\.isModuleEnabled\(guildId, 'translation'\)/);
  assert.doesNotMatch(threads.slice(threads.indexOf('async function handleMessageCreate')), /section\.enabled/);
});

test('translation owner overview reads canonical module state', () => {
  const source = read('src/server/routes/ownerTranslation.js');
  assert.match(source, /enabled: guildManager\.isModuleEnabled\(guildId, 'translation'\)/);
  assert.doesNotMatch(source, /enabled: section\.enabled === true/);
});

test('reaction role add and remove dispatch read canonical module state', () => {
  const add = read('src/events/messages/messageReactionAdd.js');
  const remove = read('src/events/messages/messageReactionRemove.js');
  assert.match(add, /isModuleEnabled\(guildId, 'reactionRoles'\)/);
  assert.match(remove, /isModuleEnabled\(guildId, 'reactionRoles'\)/);
});

test('reaction roles API reports and writes canonical module state', () => {
  const source = read('src/modules/roleStudio/reactionRoles/reactionRolesRoute.js');
  assert.match(source, /enabled: guildManager\.isModuleEnabled\(guildId, 'reactionRoles'\)/);
  assert.match(source, /guildManager\.setModuleEnabled\(guildId, 'reactionRoles', req\.body\?\.enabled === true/);
  assert.doesNotMatch(source, /reactionRoles\.setEnabled/);
});

test('stats verification summary reads canonical module state', () => {
  const source = read('src/modules/utilityStudio/stats/statsRoute.js');
  assert.match(source, /enabled: guildManager\.isModuleEnabled\(guildId, 'verification'\)/);
  assert.doesNotMatch(source, /enabled: section\.enabled === true/);
});
