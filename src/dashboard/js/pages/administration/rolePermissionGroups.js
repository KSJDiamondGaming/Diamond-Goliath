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
