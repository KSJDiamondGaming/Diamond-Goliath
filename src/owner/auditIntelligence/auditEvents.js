'use strict';

const { Events } = require('discord.js');
const audit = require('./auditIntelligence');
const { snapshotMember } = require('./userIntelligence');

const wired = new WeakSet();
const roleState = (role) => role ? { id: role.id, name: role.name, color: role.hexColor, position: role.position, hoist: role.hoist, mentionable: role.mentionable, permissions: role.permissions?.bitfield?.toString?.() || null } : null;
const channelState = (channel) => channel ? { id: channel.id, name: channel.name, type: channel.type, parentId: channel.parentId || null, position: channel.rawPosition ?? channel.position ?? null, topic: channel.topic || null, nsfw: channel.nsfw || false } : null;
const guildState = (guild) => guild ? { id: guild.id, name: guild.name, ownerId: guild.ownerId, verificationLevel: guild.verificationLevel, explicitContentFilter: guild.explicitContentFilter, preferredLocale: guild.preferredLocale } : null;
const messageState = (message) => message ? { id: message.id, content: message.content || null, authorId: message.author?.id || null, authorTag: message.author?.tag || message.author?.username || null, channelId: message.channelId || null, createdAt: message.createdAt?.toISOString?.() || null, attachments: [...(message.attachments?.values?.() || [])].map((item) => ({ id: item.id, name: item.name, url: item.url, size: item.size })) } : null;

function registerAuditEvents(client) {
  if (!client || wired.has(client)) return false;
  wired.add(client);

  client.on(Events.GuildMemberAdd, (member) => audit.capture(client, { type: 'member.join', category: 'member', action: 'join', title: 'Member Joined', icon: '📥', guild: member.guild, member, target: { id: member.id, label: member.user?.tag || member.user?.username }, after: snapshotMember(member) }));
  client.on(Events.GuildMemberRemove, (member) => audit.capture(client, { type: 'member.leave', category: 'member', action: 'leave', title: 'Member Left / Removed', icon: '📤', guild: member.guild, member, target: { id: member.id, label: member.user?.tag || member.user?.username }, before: snapshotMember(member) }));
  client.on(Events.GuildMemberUpdate, (before, after) => audit.capture(client, { type: 'member.update', category: 'member', action: 'update', title: 'Member Updated', icon: '👤', guild: after.guild, member: after, target: { id: after.id, label: after.user?.tag || after.user?.username }, before: snapshotMember(before), after: snapshotMember(after) }));
  client.on(Events.GuildBanAdd, (ban) => audit.capture(client, { type: 'member.ban', category: 'moderation', action: 'create', title: 'Member Banned', icon: '🔨', guild: ban.guild, user: ban.user, target: { id: ban.user.id, label: ban.user.tag || ban.user.username }, reason: ban.reason || null }));
  client.on(Events.GuildBanRemove, (ban) => audit.capture(client, { type: 'member.unban', category: 'moderation', action: 'delete', title: 'Member Unbanned', icon: '🕊️', guild: ban.guild, user: ban.user, target: { id: ban.user.id, label: ban.user.tag || ban.user.username } }));

  client.on(Events.GuildRoleCreate, (role) => audit.capture(client, { type: 'role.create', category: 'role', action: 'create', title: 'Role Created', icon: '🎭', guild: role.guild, target: { id: role.id, label: role.name }, after: roleState(role) }));
  client.on(Events.GuildRoleUpdate, (before, after) => audit.capture(client, { type: 'role.update', category: 'role', action: 'update', title: 'Role Updated', icon: '🎭', guild: after.guild, target: { id: after.id, label: after.name }, before: roleState(before), after: roleState(after) }));
  client.on(Events.GuildRoleDelete, (role) => audit.capture(client, { type: 'role.delete', category: 'role', action: 'delete', title: 'Role Deleted', icon: '🗑️', guild: role.guild, target: { id: role.id, label: role.name }, before: roleState(role) }));

  client.on(Events.ChannelCreate, (channel) => channel.guild && audit.capture(client, { type: 'channel.create', category: 'channel', action: 'create', title: 'Channel Created', icon: '🆕', guild: channel.guild, channel, target: { id: channel.id, label: channel.name }, after: channelState(channel) }));
  client.on(Events.ChannelUpdate, (before, after) => after.guild && audit.capture(client, { type: 'channel.update', category: 'channel', action: 'update', title: 'Channel Updated', icon: '📝', guild: after.guild, channel: after, target: { id: after.id, label: after.name }, before: channelState(before), after: channelState(after) }));
  client.on(Events.ChannelDelete, (channel) => channel.guild && audit.capture(client, { type: 'channel.delete', category: 'channel', action: 'delete', title: 'Channel Deleted', icon: '🗑️', guild: channel.guild, channel, target: { id: channel.id, label: channel.name }, before: channelState(channel) }));

  client.on(Events.MessageUpdate, (before, after) => after.guild && audit.capture(client, { type: 'message.update', category: 'message', action: 'update', title: 'Message Edited', icon: '✏️', guild: after.guild, channel: after.channel, user: after.author, target: { id: after.id, label: `Message ${after.id}` }, before: messageState(before), after: messageState(after) }));
  client.on(Events.MessageDelete, (message) => message.guild && audit.capture(client, { type: 'message.delete', category: 'message', action: 'delete', title: 'Message Deleted', icon: '🗑️', guild: message.guild, channel: message.channel, user: message.author, target: { id: message.id, label: `Message ${message.id}` }, before: messageState(message) }));
  client.on(Events.MessageBulkDelete, (messages, channel) => channel.guild && audit.capture(client, { type: 'message.bulkDelete', category: 'message', action: 'delete', title: 'Messages Bulk Deleted', icon: '🧹', guild: channel.guild, channel, target: { id: channel.id, label: `${messages.size} messages` }, before: [...messages.values()].slice(0, 100).map(messageState), metadata: { count: messages.size } }));

  client.on(Events.VoiceStateUpdate, (before, after) => {
    const guild = after.guild || before.guild;
    if (!guild || before.channelId === after.channelId && before.serverMute === after.serverMute && before.serverDeaf === after.serverDeaf) return;
    audit.capture(client, { type: 'voice.update', category: 'voice', action: 'update', title: 'Voice State Changed', icon: '🔊', guild, member: after.member || before.member, target: { id: after.id || before.id, label: after.member?.user?.tag || before.member?.user?.tag }, before: { channelId: before.channelId, serverMute: before.serverMute, serverDeaf: before.serverDeaf }, after: { channelId: after.channelId, serverMute: after.serverMute, serverDeaf: after.serverDeaf } });
  });

  client.on(Events.InviteCreate, (invite) => invite.guild && audit.capture(client, { type: 'invite.create', category: 'invite', action: 'create', title: 'Invite Created', icon: '🔗', guild: invite.guild, channel: invite.channel, target: { id: invite.code, label: invite.code }, after: { code: invite.code, inviterId: invite.inviterId || null, maxAge: invite.maxAge, maxUses: invite.maxUses, temporary: invite.temporary } }));
  client.on(Events.InviteDelete, (invite) => invite.guild && audit.capture(client, { type: 'invite.delete', category: 'invite', action: 'delete', title: 'Invite Deleted', icon: '🔗', guild: invite.guild, channel: invite.channel, target: { id: invite.code, label: invite.code }, before: { code: invite.code, inviterId: invite.inviterId || null, maxAge: invite.maxAge, maxUses: invite.maxUses, temporary: invite.temporary } }));
  client.on(Events.GuildUpdate, (before, after) => audit.capture(client, { type: 'guild.update', category: 'guild', action: 'update', title: 'Guild Settings Updated', icon: '🏰', guild: after, target: { id: after.id, label: after.name }, before: guildState(before), after: guildState(after) }));

  console.log('[Audit Intelligence] Discord event capture registered.');
  return true;
}

module.exports = { registerAuditEvents };
