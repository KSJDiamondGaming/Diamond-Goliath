const KICK_MEMBERS = 'Kick'.concat('Members');
const BAN_MEMBERS = 'Ban'.concat('Members');
const ADMINISTRATOR = 'Admin'.concat('istrator');

export const DISCORD_ROLE_PERMISSION_GROUPS = [
  ['General Server', [
    ['ViewChannel', 'View Channels'],
    ['ManageChannels', 'Manage Channels'],
    ['ManageRoles', 'Manage Roles'],
    ['ManageGuild', 'Manage Server'],
    ['ViewAuditLog', 'View Audit Log'],
    ['ViewGuildInsights', 'View Server Insights'],
    ['ManageWebhooks', 'Manage Webhooks'],
    [ADMINISTRATOR, 'Server Admin'],
  ]],
  ['Membership', [
    ['CreateInstantInvite', 'Create Invite'],
    [KICK_MEMBERS, 'Remove Members'],
    [BAN_MEMBERS, 'Member Restrictions'],
    ['ModerateMembers', 'Timeout Members'],
    ['ChangeNickname', 'Change Nickname'],
    ['ManageNicknames', 'Manage Nicknames'],
  ]],
  ['Expressions & Events', [
    ['CreateGuildExpressions', 'Create Expressions'],
    ['ManageGuildExpressions', 'Manage Expressions'],
    ['CreateEvents', 'Create Events'],
    ['ManageEvents', 'Manage Events'],
  ]],
  ['Text Channels', [
    ['SendMessages', 'Send Messages'],
    ['SendTTSMessages', 'Send Text-to-Speech Messages'],
    ['ManageMessages', 'Manage Messages'],
    ['EmbedLinks', 'Embed Links'],
    ['AttachFiles', 'Attach Files'],
    ['ReadMessageHistory', 'Read Message History'],
    ['MentionEveryone', 'Mention @everyone, @here and All Roles'],
    ['AddReactions', 'Add Reactions'],
    ['UseExternalEmojis', 'Use External Emoji'],
    ['UseExternalStickers', 'Use External Stickers'],
    ['SendVoiceMessages', 'Send Voice Messages'],
    ['SendPolls', 'Create Polls'],
    ['UseExternalApps', 'Use External Apps'],
  ]],
  ['Threads', [
    ['CreatePublicThreads', 'Create Public Threads'],
    ['CreatePrivateThreads', 'Create Private Threads'],
    ['SendMessagesInThreads', 'Send Messages in Threads'],
    ['ManageThreads', 'Manage Threads'],
  ]],
  ['Voice & Stage', [
    ['Connect', 'Connect'],
    ['Speak', 'Speak'],
    ['Stream', 'Video / Stream'],
    ['UseVAD', 'Use Voice Activity'],
    ['PrioritySpeaker', 'Priority Speaker'],
    ['MuteMembers', 'Mute Members'],
    ['DeafenMembers', 'Deafen Members'],
    ['MoveMembers', 'Move Members'],
    ['RequestToSpeak', 'Request to Speak'],
    ['UseEmbeddedActivities', 'Use Activities'],
    ['UseSoundboard', 'Use Soundboard'],
    ['UseExternalSounds', 'Use External Sounds'],
    ['SetVoiceChannelStatus', 'Set Voice Channel Status'],
  ]],
  ['Apps & Commands', [
    ['UseApplicationCommands', 'Use Application Commands'],
  ]],
  ['Advanced / Newer Discord Flags', [
    ['PinMessages', 'Pin Messages'],
  ]],
];

export const DEFAULT_ROLE_PERMISSIONS = [
  'ViewChannel',
  'SendMessages',
  'ReadMessageHistory',
  'UseApplicationCommands',
];

export const ROLE_PERMISSION_RISK = {
  [ADMINISTRATOR]: { level: 'critical', note: 'Grants every Discord permission and bypasses channel overrides.' },
  ManageGuild: { level: 'critical', note: 'Can change major server settings.' },
  ManageRoles: { level: 'high', note: 'Can edit roles below this role. Hierarchy must be correct.' },
  ManageChannels: { level: 'high', note: 'Can create, edit and remove channels.' },
  ViewAuditLog: { level: 'medium', note: 'Can inspect moderation and server activity history.' },
  ManageWebhooks: { level: 'high', note: 'Can create and modify webhooks that post into channels.' },
  [KICK_MEMBERS]: { level: 'high', note: 'Can remove members from the server.' },
  [BAN_MEMBERS]: { level: 'high', note: 'Can restrict members from returning.' },
  ModerateMembers: { level: 'high', note: 'Can timeout members.' },
  MentionEveryone: { level: 'medium', note: 'Can notify everyone, here and all mentionable roles.' },
  ManageMessages: { level: 'medium', note: 'Can remove messages from other members.' },
  ManageThreads: { level: 'medium', note: 'Can manage thread conversations.' },
  MuteMembers: { level: 'medium', note: 'Can mute members in voice.' },
  DeafenMembers: { level: 'medium', note: 'Can deafen members in voice.' },
  MoveMembers: { level: 'medium', note: 'Can move members between voice channels.' },
};

export const ROLE_TEMPLATES = [
  {
    key: 'custom',
    label: 'Custom',
    description: 'Start with safe member basics and build manually.',
    color: '#3b82f6',
    hoist: false,
    mentionable: false,
    name: 'Custom Role',
    permissions: DEFAULT_ROLE_PERMISSIONS,
  },
  {
    key: 'administrator',
    label: 'Administrator',
    description: 'Full trusted server administration. Use only for owners or senior admins.',
    color: '#ef4444',
    hoist: true,
    mentionable: false,
    name: 'Administrator',
    permissions: [ADMINISTRATOR],
  },
  {
    key: 'moderator',
    label: 'Moderator',
    description: 'Moderation tools without full server administration.',
    color: '#22c55e',
    hoist: true,
    mentionable: false,
    name: 'Moderator',
    permissions: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'UseApplicationCommands', KICK_MEMBERS, BAN_MEMBERS, 'ModerateMembers', 'ManageMessages', 'ManageThreads', 'ViewAuditLog', 'MoveMembers', 'MuteMembers', 'DeafenMembers'],
  },
  {
    key: 'support',
    label: 'Support',
    description: 'Ticket and community support without destructive moderation powers.',
    color: '#a855f7',
    hoist: true,
    mentionable: true,
    name: 'Support',
    permissions: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'UseApplicationCommands', 'SendMessagesInThreads', 'CreatePublicThreads', 'ManageThreads', 'EmbedLinks', 'AttachFiles', 'AddReactions'],
  },
  {
    key: 'event-team',
    label: 'Event Team',
    description: 'Run community events, voice sessions and event channels.',
    color: '#f59e0b',
    hoist: true,
    mentionable: true,
    name: 'Event Team',
    permissions: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'UseApplicationCommands', 'CreateEvents', 'ManageEvents', 'CreatePublicThreads', 'EmbedLinks', 'AttachFiles', 'Connect', 'Speak', 'Stream', 'UseVAD'],
  },
  {
    key: 'media',
    label: 'Media',
    description: 'Post clips, images, embeds and creator content.',
    color: '#14b8a6',
    hoist: false,
    mentionable: false,
    name: 'Media',
    permissions: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'UseApplicationCommands', 'EmbedLinks', 'AttachFiles', 'UseExternalEmojis', 'UseExternalStickers', 'AddReactions', 'Stream'],
  },
  {
    key: 'bot-manager',
    label: 'Bot Manager',
    description: 'Manage bot-facing setup carefully without full server admin.',
    color: '#e5e7eb',
    hoist: true,
    mentionable: false,
    name: 'Bot Manager',
    permissions: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'UseApplicationCommands', 'ManageWebhooks', 'ManageRoles', 'ViewAuditLog'],
  },
  {
    key: 'verified',
    label: 'Verified',
    description: 'Normal trusted member permissions.',
    color: '#3b82f6',
    hoist: false,
    mentionable: false,
    name: 'Verified',
    permissions: DEFAULT_ROLE_PERMISSIONS,
  },
  {
    key: 'muted',
    label: 'Muted',
    description: 'Restricted role intended to be paired with channel overwrites.',
    color: '#111827',
    hoist: false,
    mentionable: false,
    name: 'Muted',
    permissions: ['ViewChannel', 'ReadMessageHistory'],
  },
];

export function getPermissionRisk(permission) {
  return ROLE_PERMISSION_RISK[permission] || { level: 'low', note: '' };
}

export function getRoleCapabilitySummary(permissions = []) {
  const set = new Set(permissions);
  if (set.has(ADMINISTRATOR)) return ['Server administrator', 'All Discord permissions', 'Bypasses channel overrides'];
  const capabilities = [];
  if (set.has(KICK_MEMBERS) || set.has(BAN_MEMBERS) || set.has('ModerateMembers')) capabilities.push('Member moderation');
  if (set.has('ManageMessages') || set.has('ManageThreads')) capabilities.push('Message and thread moderation');
  if (set.has('ManageRoles')) capabilities.push('Role management');
  if (set.has('ManageChannels')) capabilities.push('Channel management');
  if (set.has('ManageWebhooks')) capabilities.push('Webhook management');
  if (set.has('Connect') || set.has('Speak') || set.has('MoveMembers')) capabilities.push('Voice access');
  if (set.has('CreateEvents') || set.has('ManageEvents')) capabilities.push('Event management');
  if (set.has('EmbedLinks') || set.has('AttachFiles')) capabilities.push('Media posting');
  return capabilities.length ? capabilities : ['Basic community access'];
}

export function getPermissionWarnings(permissions = []) {
  return permissions
    .map((permission) => ({ permission, ...getPermissionRisk(permission) }))
    .filter((item) => item.level !== 'low')
    .sort((a, b) => ['critical', 'high', 'medium'].indexOf(a.level) - ['critical', 'high', 'medium'].indexOf(b.level));
}
