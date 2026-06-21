const DEVELOPMENT_TEST_GUILD_ID = process.env.TEST_GUILD_ID || '1515201360386068642';
const OWNER_PROTECTED_ACTIONS = new Set([
  'timeout',
  'kick',
  'ban',
  'quarantine',
  'role-set',
  'role-remove',
  'remove-roles',
]);

function text(value) {
  return String(value || '').trim();
}

function splitIds(value) {
  return String(value || '')
    .split(',')
    .map((entry) => text(entry))
    .filter(Boolean);
}

function configuredOwnerIds() {
  return new Set([
    ...splitIds(process.env.OWNER_ID),
    ...splitIds(process.env.OWNER_IDS),
    ...splitIds(process.env.BOT_OWNER_ID),
    ...splitIds(process.env.BOT_OWNER_IDS),
  ]);
}

function guildId(guildOrId) {
  if (!guildOrId) return '';
  if (typeof guildOrId === 'string') return text(guildOrId);
  return text(guildOrId.id || guildOrId.guildId);
}

function subjectId(memberOrUser) {
  if (!memberOrUser) return '';
  return text(memberOrUser.id || memberOrUser.user?.id);
}

function devRuntimeActive() {
  const mode = text(process.env.BOT_MODE || process.env.NODE_ENV || 'dev').toLowerCase();
  return mode === 'dev' || mode === 'development';
}

function inDevelopmentTestGuild(guildOrId) {
  return guildId(guildOrId) === DEVELOPMENT_TEST_GUILD_ID;
}

function isOwnerSubject({ guild = null, member = null, user = null, userId = '' } = {}) {
  const id = text(userId || subjectId(member) || subjectId(user));
  if (!id) return false;
  if (text(guild?.ownerId) === id) return true;
  return configuredOwnerIds().has(id);
}

function isDevOwnerOverride({ guild = null, guildId = '', member = null, user = null, userId = '' } = {}) {
  return (
    devRuntimeActive() &&
    inDevelopmentTestGuild(guild || guildId) &&
    isOwnerSubject({ guild, member, user, userId })
  );
}

function isProtectedOwnerAction(action = '') {
  return OWNER_PROTECTED_ACTIONS.has(text(action).toLowerCase());
}

function shouldBlockOwnerDestructiveAction({ guild = null, guildId = '', member = null, user = null, userId = '', action = '' } = {}) {
  return (
    isDevOwnerOverride({ guild, guildId, member, user, userId }) &&
    isProtectedOwnerAction(action)
  );
}

function shouldUseDryRunForOwner(input = {}) {
  return shouldBlockOwnerDestructiveAction(input);
}

module.exports = {
  DEVELOPMENT_TEST_GUILD_ID,
  OWNER_PROTECTED_ACTIONS,
  devRuntimeActive,
  inDevelopmentTestGuild,
  isOwnerSubject,
  isDevOwnerOverride,
  isProtectedOwnerAction,
  shouldBlockOwnerDestructiveAction,
  shouldUseDryRunForOwner,
};
