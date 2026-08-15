'use strict';

const HELPERS = [
  '{userId}',
  '{userTag}',
  '{userName}',
  '{userGlobalName}',
  '{userMention}',
  '{userNoPing}',
  '{userAvatar}',
  '{userServerAvatar}',
  '{userNickname}',
  '{userDisplay}',
  '{userCreatedAt}',
  '{userCreatedTimestamp}',
  '{userJoinedAt}',
  '{userJoinedTimestamp}',
  '{createdAt}',
  '{joinedAt}',
  '{leftAt}',
  '{timestamp}',
  '{accountAge}',
  '{membershipDuration}',
  '{departureIcon}',
  '{departureType}',
  '{departureLabel}',
  '{departureReason}',
  '{departureModerator}',
  '{departureModeratorId}',
  '{nowTimestamp}',
  '{successEmoji}',
  '{warningEmoji}',
  '{errorEmoji}',
  '{proofVerifiedEmoji}',
  '{successColor}',
  '{warningColor}',
  '{errorColor}',
  '{proofVerifiedColor}',
  '{guildId}',
  '{guildName}',
  '{server}',
  '{guildIcon}',
  '{serverIcon}',
  '{guildBanner}',
  '{guildMemberCount}',
  '{memberCount}',
  '{guildVanityCode}',
];

const sessions = new Map();
let defaultStateFactory = null;
let stateSync = (state) => state;

function configure({ defaultState, sync } = {}) {
  if (typeof defaultState === 'function') defaultStateFactory = defaultState;
  if (typeof sync === 'function') stateSync = sync;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function trim(value, max = 4096) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function fmtDate(value) {
  if (!value) return 'Unknown';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toISOString();
}

function fmtTs(value) {
  if (!value) return 'Unknown';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

function avatar(member) {
  return member?.displayAvatarURL?.({ size: 1024 })
    || member?.user?.displayAvatarURL?.({ size: 1024 })
    || undefined;
}

function guildIcon(guild) {
  return guild?.iconURL?.({ size: 1024 }) || undefined;
}

function guildBanner(guild) {
  return guild?.bannerURL?.({ size: 2048 }) || undefined;
}

function memberName(interaction) {
  return interaction?.member?.displayName
    || interaction?.user?.globalName
    || interaction?.user?.username
    || 'Unknown User';
}

function displayName(member) {
  return member?.displayName
    || member?.user?.globalName
    || member?.user?.username
    || 'Unknown User';
}

function refreshGuild(interaction) {
  return interaction?.guild || null;
}

function sessionKey(interaction) {
  return `${interaction?.guildId || interaction?.guild?.id || 'global'}:${interaction?.user?.id || 'system'}`;
}

function replaceVars(value, interaction, allowUserPing = false) {
  let output = String(value ?? '');
  const guild = interaction?.guild;
  const user = interaction?.user || interaction?.member?.user;
  const member = interaction?.member;
  const memberCount = guild?.memberCount ?? 0;
  const vars = {
    '{userId}': user?.id || '',
    '{userTag}': user?.tag || user?.username || '',
    '{userName}': user?.username || '',
    '{userGlobalName}': user?.globalName || '',
    '{userMention}': user?.id ? (allowUserPing ? `<@${user.id}>` : `@${displayName(member)}`) : '',
    '{userNoPing}': user?.id ? `@${displayName(member)}` : '',
    '{userAvatar}': avatar(member) || user?.displayAvatarURL?.({ size: 1024 }) || '',
    '{userServerAvatar}': avatar(member) || '',
    '{userNickname}': member?.nickname || '',
    '{userDisplay}': displayName(member),
    '{userCreatedAt}': fmtDate(user?.createdAt),
    '{userCreatedTimestamp}': fmtTs(user?.createdAt),
    '{userJoinedAt}': fmtDate(member?.joinedAt),
    '{userJoinedTimestamp}': fmtTs(member?.joinedAt),
    '{createdAt}': fmtDate(user?.createdAt),
    '{joinedAt}': fmtDate(member?.joinedAt),
    '{leftAt}': fmtDate(new Date()),
    '{timestamp}': fmtTs(new Date()),
    '{accountAge}': '',
    '{membershipDuration}': '',
    '{departureIcon}': '',
    '{departureType}': '',
    '{departureLabel}': '',
    '{departureReason}': '',
    '{departureModerator}': '',
    '{departureModeratorId}': '',
    '{nowTimestamp}': fmtTs(new Date()),
    '{successEmoji}': '✅',
    '{warningEmoji}': '⚠️',
    '{errorEmoji}': '❌',
    '{proofVerifiedEmoji}': '✅',
    '{successColor}': '#57F287',
    '{warningColor}': '#FEE75C',
    '{errorColor}': '#ED4245',
    '{proofVerifiedColor}': '#57F287',
    '{guildId}': guild?.id || '',
    '{guildName}': guild?.name || '',
    '{server}': guild?.name || '',
    '{guildIcon}': guildIcon(guild) || '',
    '{serverIcon}': guildIcon(guild) || '',
    '{guildBanner}': guildBanner(guild) || '',
    '{guildMemberCount}': String(memberCount),
    '{memberCount}': String(memberCount),
    '{guildVanityCode}': guild?.vanityURLCode || '',
  };

  for (const [key, replacement] of Object.entries(vars)) {
    output = output.split(key).join(String(replacement ?? ''));
  }
  return output;
}

function getSession(interaction) {
  const key = sessionKey(interaction);
  if (!sessions.has(key)) {
    if (typeof defaultStateFactory !== 'function') {
      throw new Error('Embed state is not configured with a defaultState factory.');
    }
    sessions.set(key, stateSync(defaultStateFactory()));
  }
  return sessions.get(key);
}

function saveSession(interaction, state) {
  const synced = stateSync(state);
  sessions.set(sessionKey(interaction), synced);
  return synced;
}

function markUnsaved(interaction, state) {
  return saveSession(interaction, { ...state, hasUnsavedChanges: true });
}

function clearUnsaved(interaction, state) {
  return saveSession(interaction, { ...state, hasUnsavedChanges: false });
}

function resetSession(interaction) {
  if (typeof defaultStateFactory !== 'function') {
    throw new Error('Embed state is not configured with a defaultState factory.');
  }
  const next = stateSync(defaultStateFactory());
  sessions.set(sessionKey(interaction), next);
  return next;
}

function clearSession(interaction) {
  return sessions.delete(sessionKey(interaction));
}

module.exports = {
  HELPERS,
  sessions,
  configure,
  clone,
  trim,
  fmtDate,
  fmtTs,
  avatar,
  guildIcon,
  guildBanner,
  memberName,
  displayName,
  refreshGuild,
  sessionKey,
  replaceVars,
  getSession,
  saveSession,
  markUnsaved,
  clearUnsaved,
  resetSession,
  clearSession,
};
