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

test('invites core removes duplicate module state and uses canonical runtime gates', () => {
  const source = read('src/modules/communityStudio/invites/invites.js');
  const defaults = source.slice(source.indexOf('function defaults()'), source.indexOf('function normalizeReward('));
  assert.doesNotMatch(defaults, /enabled\s*:/);
  assert.match(source, /delete normalized\.enabled;/);
  assert.match(source, /guildManager\.setModuleEnabled\(guildId, SECTION, enabled === true, meta\)/);
  assert.match(source, /guildManager\.isModuleEnabled\(guild\.id, SECTION\)/);
  assert.doesNotMatch(source, /section\.enabled/);
  assert.match(source, /enabled: memberTemplate\.enabled !== false/);
  assert.match(source, /enabled: item\.enabled !== false/);
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

test('timed roles runtime and store use canonical module state', () => {
  const source = read('src/modules/roleStudio/timedRoles/timedRoles.js');
  const defaults = source.slice(source.indexOf('function defaultSection()'), source.indexOf('function normalizeRule('));
  assert.doesNotMatch(defaults, /enabled\s*:/);
  assert.match(source, /delete normalized\.enabled;/);
  assert.match(source, /guildManager\.setModuleEnabled\(guildId, SECTION, enabled === true, meta\)/);
  assert.match(source, /guildManager\.isModuleEnabled\(guildId, SECTION\)/);
  assert.match(source, /guildManager\.isModuleEnabled\(guild\.id, SECTION\)/);
  assert.doesNotMatch(source, /section\.enabled === false/);
});

test('timed roles panel reports, writes and exports canonical module state', () => {
  const source = read('src/modules/roleStudio/timedRoles/timedRolesPanel.js');
  assert.match(source, /const enabled = guildManager\.isModuleEnabled\(guild\.id, 'timedRoles'\)/);
  assert.match(source, /guildManager\.setModuleEnabled\(interaction\.guild\.id, 'timedRoles', true/);
  assert.match(source, /guildManager\.setModuleEnabled\(interaction\.guild\.id, 'timedRoles', false/);
  assert.match(source, /enabled: guildManager\.isModuleEnabled\(interaction\.guild\.id, 'timedRoles'\)/);
  assert.doesNotMatch(source, /section\.enabled !== false/);
  assert.doesNotMatch(source, /timedRoles\.setEnabled/);
  assert.match(source, /enabled: !rule\.enabled/);
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

test('schedule runtime and store use canonical module state', () => {
  const source = read('src/modules/utilityStudio/schedule/schedule.js');
  const defaults = source.slice(source.indexOf('function defaultSection()'), source.indexOf('function validTimezone('));
  assert.doesNotMatch(defaults, /enabled\s*:/);
  assert.match(source, /delete normalized\.enabled;/);
  assert.match(source, /guildManager\.setModuleEnabled\(guildId, SECTION, enabled === true, meta\)/);
  assert.match(source, /guildManager\.isModuleEnabled\(guild\.id, SECTION\)/);
  assert.doesNotMatch(source, /section\.enabled/);
  assert.match(source, /enabled: event\.enabled !== false/);
  assert.match(source, /event\.enabled === false/);
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

test('translation store removes duplicate module state', () => {
  const source = read('src/modules/utilityStudio/translation/translationStore.js');
  const defaults = source.slice(source.indexOf('function defaultTranslationSection()'), source.indexOf('function normalizeChannelConfig('));
  assert.doesNotMatch(defaults, /enabled\s*:/);
  assert.match(source, /delete normalized\.enabled;/);
  assert.match(source, /guildManager\.setModuleEnabled\(guildId, MODULE, enabled === true, guildOrMeta\)/);
  assert.match(source, /guildManager\.isModuleEnabled\(guildId, MODULE\)/);
  assert.match(source, /enabled: source\.openai\?\.enabled !== false/);
  assert.match(source, /enabled: source\.enabled !== false/);
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

test('reaction roles runtime and store use canonical module state', () => {
  const source = read('src/modules/roleStudio/reactionRoles/reactionRoles.js');
  const defaults = source.slice(source.indexOf('function defaultSection()'), source.indexOf('function normalizeEmoji('));
  assert.doesNotMatch(defaults, /enabled\s*:/);
  assert.match(source, /delete normalized\.enabled;/);
  assert.match(source, /guildManager\.setModuleEnabled\(guildId, SECTION, enabled === true, meta\)/);
  assert.match(source, /guildManager\.isModuleEnabled\(guild\.id, SECTION\)/);
  assert.doesNotMatch(source, /getSection\(guild\.id\)\.enabled === false/);
  assert.match(source, /panel\.enabled === false/);
  assert.match(source, /mapping\.enabled !== false/);
});

test('stats verification summary reads canonical module state', () => {
  const source = read('src/modules/utilityStudio/stats/statsRoute.js');
  assert.match(source, /enabled: guildManager\.isModuleEnabled\(guildId, 'verification'\)/);
  assert.doesNotMatch(source, /enabled: section\.enabled === true/);
});

test('stats runtime and store use canonical module state', () => {
  const source = read('src/modules/utilityStudio/stats/statsStore.js');
  const defaults = source.slice(source.indexOf('const DEFAULT_STATS = {'), source.indexOf('function copy('));
  assert.doesNotMatch(defaults, /enabled\s*:/);
  assert.match(source, /delete normalized\.enabled;/);
  assert.match(source, /guildManager\.setModuleEnabled\(guildId, MODULE_KEY, enabled === true, guildOrMeta\)/);
  assert.match(source, /guildManager\.isModuleEnabled\(guildId, MODULE_KEY\)/);
  assert.doesNotMatch(source, /stats\.enabled !== true/);
  assert.match(source, /enabled: isEnabled\(guildId\)/);
});

test('stats API reports and writes canonical module state', () => {
  const source = read('src/modules/utilityStudio/stats/statsRoute.js');
  assert.match(source, /enabled: guildManager\.isModuleEnabled\(guildId, 'stats'\)/);
  assert.match(source, /guildManager\.setModuleEnabled\(guildId, 'stats', req\.body\.enabled/);
  assert.doesNotMatch(source, /const allowed = \['enabled'/);
});

test('temp voice API reports and writes canonical module state', () => {
  const source = read('src/server/routes/tempVoice.js');
  assert.match(source, /enabled: isModuleEnabled\(guildId, 'tempVoice'\)/);
  assert.match(source, /setModuleEnabled\(guildId, 'tempVoice', enabled,/);
  assert.doesNotMatch(source, /\.\.\.section, enabled, updatedAt/);
  assert.doesNotMatch(source, /enabled: section\.enabled !== false/);
  assert.match(source, /enabled: input\.enabled !== false/);
});

test('temp voice store removes duplicate module state without removing hub state', () => {
  const source = read('src/modules/utilityStudio/tempVoice/tempVoiceStore.js');
  const defaults = source.slice(source.indexOf('function defaultTempVoiceSection()'), source.indexOf('function normalizeHub('));
  assert.doesNotMatch(defaults, /enabled\s*:/);
  assert.match(source, /delete normalized\.enabled;/);
  assert.doesNotMatch(source, /enabled: source\.enabled !== false/);
  assert.match(source, /enabled: hub\.enabled !== false/);
  assert.match(source, /hub\.enabled !== false && hub\.joinChannelId/);
});

test('goodbye API reports and writes canonical module state', () => {
  const source = read('src/server/routes/goodbye.js');
  assert.match(source, /enabled: guildManager\.isModuleEnabled\(guildId, 'goodbye'\)/);
  assert.match(source, /guildManager\.setModuleEnabled\(guildId, 'goodbye', req\.body\?\.enabled === true/);
  assert.match(source, /const \{ enabled, templateId, \.\.\.configPatch \} = patch;/);
  assert.doesNotMatch(source, /goodbye\.updateConfig\(guildId, \{ enabled:/);
  assert.doesNotMatch(source, /enabled: config\.enabled !== false/);
  assert.match(source, /dmEnabled: dmConfig\.enabled/);
});

test('goodbye runtime and store use canonical module state', () => {
  const source = read('src/modules/messageStudio/goodbye/goodbye.js');
  const defaults = source.slice(source.indexOf('function defaultGoodbyeSection()'), source.indexOf('function normalizeAnalytics('));
  assert.doesNotMatch(defaults, /enabled\s*:/);
  assert.match(source, /delete normalized\.enabled;/);
  assert.match(source, /guildManager\.setModuleEnabled\(guildId, MODULE, enabled, meta\)/);
  assert.match(source, /guildManager\.isModuleEnabled\(member\.guild\.id, MODULE\)/);
  assert.match(source, /const enabled = guildManager\.isModuleEnabled\(guild\.id, MODULE\)/);
  assert.doesNotMatch(source, /config\.enabled === false/);
  const repair = source.slice(source.indexOf('async function repairConfiguration'), source.indexOf('function exportConfiguration'));
  assert.doesNotMatch(repair, /enabled\s*:/);
});

test('forms API reports and writes canonical module state', () => {
  const source = read('src/server/routes/forms.js');
  assert.match(source, /enabled: guildManager\.isModuleEnabled\(guildId, 'forms'\)/);
  assert.match(source, /guildManager\.setModuleEnabled\(guildId, 'forms', req\.body\.enabled/);
  assert.match(source, /config: canonicalConfig\(guildId/);
  assert.doesNotMatch(source, /enabled: section\.enabled !== false/);
  const settingsRoute = source.slice(source.indexOf("router.patch('/:guildId/settings'"));
  assert.doesNotMatch(settingsRoute, /enabled: req\.body\?\.enabled !== false/);
  assert.match(source, /form\.enabled !== false/);
});

test('giveaways runtime reads canonical module state', () => {
  const source = read('src/modules/communityStudio/giveaways/giveawaysManager.js');
  assert.match(source, /guildManager\.isModuleEnabled\(guild\.id, 'giveaways'\)/);
  assert.match(source, /guildManager\.isModuleEnabled\(guildId, 'giveaways'\)/);
  assert.doesNotMatch(source, /section\.enabled === false/);
  assert.match(source, /giveaway\.status !== 'active'/);
});