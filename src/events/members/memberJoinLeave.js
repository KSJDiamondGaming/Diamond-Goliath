'use strict';

const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const { buildPreviewEmbed, TEMPLATES } = require('../../modules/embed/embedPanel');
const embedTemplateManager = require('../../modules/embed/embedTemplateManager');
const guildManager = require('../../core/guild/guildManager');
const autoRoleManager = require('../../modules/autoRoles/autoRoleManager');
const statsManager = require('../../modules/stats/statsManager');
const verificationManager = require('../../modules/verification/verificationManager');
const welcomeManager = require('../../modules/welcome/welcomeManager');

function formatTimestamp(timestamp, style = 'R') {
  return timestamp ? `<t:${Math.floor(timestamp / 1000)}:${style}>` : 'Unknown';
}

function formatUser(user) {
  if (!user) return 'Unknown User';
  return `${user} \`${user.tag || user.username || user.id}\``;
}

function getAvatar(member) {
  return member.displayAvatarURL({ extension: 'png', size: 256 });
}

function getRolesText(member, addedRoles = []) {
  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => role.toString());

  for (const role of addedRoles) {
    if (!roles.includes(role.toString())) roles.push(role.toString());
  }

  return roles.length ? roles.join(', ').slice(0, 1024) : 'No roles';
}

function isLogEnabled(guildId, eventName) {
  if (typeof guildManager.isLogEventEnabled !== 'function') return true;
  return guildManager.isLogEventEnabled(guildId, eventName) !== false;
}

function buildLeaveVariables(member) {
  const guild = member.guild;
  const leftAt = formatTimestamp(Date.now(), 'F');
  return {
    guild: guild.name,
    guildId: guild.id,
    guildIcon: guild.iconURL?.({ extension: 'png', size: 256 }) || '',
    guildBanner: guild.bannerURL?.({ extension: 'png', size: 1024 }) || '',
    memberCount: guild.memberCount,
    user: String(member.user),
    userMention: `<@${member.user.id}>`,
    username: member.user.username || member.user.tag || member.user.id,
    userId: member.user.id,
    userAvatar: getAvatar(member),
    memberAvatar: getAvatar(member),
    createdAt: formatTimestamp(member.user.createdTimestamp, 'F'),
    joinedAt: member.joinedTimestamp ? formatTimestamp(member.joinedTimestamp, 'F') : 'Unknown',
    leftAt,
    timestamp: leftAt,
  };
}

function getDefaultPresetData(guildId, type) {
  let defaultPresetName = null;
  if (typeof guildManager.getEmbedDefaultPreset === 'function') {
    const value = guildManager.getEmbedDefaultPreset(guildId, type);
    defaultPresetName = typeof value === 'string' ? value : value?.name || value?.presetName || null;
    if (value && typeof value === 'object') return value;
  }
  if (!defaultPresetName && typeof guildManager.getEmbedDefaults === 'function') {
    defaultPresetName = guildManager.getEmbedDefaults(guildId)?.[type] || null;
  }
  return defaultPresetName && typeof guildManager.getEmbedPreset === 'function'
    ? guildManager.getEmbedPreset(guildId, defaultPresetName)
    : null;
}

async function sendPublicLeaveEmbed(member) {
  try {
    const guild = member.guild;
    const section = guildManager.getGuildSection(guild.id, 'leave', null)
      || guildManager.getGuildSection(guild.id, 'leaveSettings', null)
      || {};
    const rendered = embedTemplateManager.renderBinding(
      guild.id,
      'welcome',
      'leave',
      buildLeaveVariables(member),
      section.templateId || 'leave_default'
    );
    const messageData = {
      ...(TEMPLATES.leave || {}),
      ...section,
      ...(getDefaultPresetData(guild.id, 'leave') || {}),
      ...(rendered?.embed || {}),
      content: rendered?.content || section.content || section.message || '',
    };
    const channelId = messageData.channelId || section.channelId || null;
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return;
    const fakeInteraction = { guild, guildId: guild.id, user: member.user, member };
    await channel.send({
      content: messageData.content || '',
      embeds: [buildPreviewEmbed(messageData, fakeInteraction)],
      allowedMentions: { parse: [], repliedUser: false },
    });
  } catch (error) {
    console.error('[joinLeave] Failed to send public leave embed:', error);
  }
}

const REMOVAL_TYPES = {
  left: { key: 'left', title: '👋 Member Left', color: '#ED4245', eventName: 'memberLeave', reasonLabel: 'No reason - user left normally' },
  kicked: { key: 'kicked', title: '👢 Member Kicked', color: '#FAA61A', eventName: 'memberKick', auditType: AuditLogEvent.MemberKick, reasonLabel: 'No reason provided' },
  banned: { key: 'banned', title: '🔨 Member Banned', color: '#ED4245', eventName: 'memberBan', auditType: AuditLogEvent.MemberBanAdd, reasonLabel: 'No reason provided' },
  pruned: { key: 'pruned', title: '🧹 Member Pruned / Removed', color: '#FEE75C', eventName: 'memberPrune', auditType: AuditLogEvent.MemberPrune, reasonLabel: 'Possible prune or bulk removal' },
};

async function findRecentAuditLog(guild, userId, auditType, maxAgeMs = 15000) {
  if (!auditType) return null;
  try {
    const logs = await guild.fetchAuditLogs({ limit: 10, type: auditType });
    return logs.entries.find((entry) => {
      const targetId = entry.target?.id;
      return (!targetId || targetId === userId) && Date.now() - entry.createdTimestamp < maxAgeMs;
    }) || null;
  } catch (error) {
    console.warn(`[joinLeave] Audit log check failed for ${auditType}:`, error.message);
    return null;
  }
}

async function detectRemoval(member) {
  const guild = member.guild;
  const userId = member.user.id;
  const banLog = await findRecentAuditLog(guild, userId, AuditLogEvent.MemberBanAdd, 20000);
  if (banLog) return { ...REMOVAL_TYPES.banned, auditLog: banLog };
  const kickLog = await findRecentAuditLog(guild, userId, AuditLogEvent.MemberKick, 20000);
  if (kickLog) return { ...REMOVAL_TYPES.kicked, auditLog: kickLog };
  const pruneLog = await findRecentAuditLog(guild, userId, AuditLogEvent.MemberPrune, 30000);
  if (pruneLog) return { ...REMOVAL_TYPES.pruned, auditLog: pruneLog };
  return { ...REMOVAL_TYPES.left, auditLog: null };
}

async function getAdminMemberLogChannel(guild, eventName = 'memberJoin') {
  const channelId = guildManager.getLogChannelId(guild.id, eventName, 'member');
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  return channel?.isTextBased?.() ? channel : null;
}

function buildAdminJoinLog(member, addedRoles = []) {
  const guild = member.guild;
  return new EmbedBuilder()
    .setColor('#57F287')
    .setTitle('👥 Member Joined')
    .setThumbnail(getAvatar(member))
    .addFields(
      { name: 'User', value: formatUser(member.user), inline: true },
      { name: 'User ID', value: `\`${member.user.id}\``, inline: true },
      { name: 'Type', value: member.user.bot ? '🤖 Bot' : '👤 User', inline: true },
      { name: 'Account Created', value: `${formatTimestamp(member.user.createdTimestamp, 'R')}\n${formatTimestamp(member.user.createdTimestamp, 'F')}`, inline: true },
      { name: 'Joined Server', value: `${formatTimestamp(member.joinedTimestamp, 'R')}\n${formatTimestamp(member.joinedTimestamp, 'F')}`, inline: true },
      { name: 'Member Count', value: `\`${guild.memberCount}\``, inline: true },
      { name: 'Roles', value: getRolesText(member, addedRoles), inline: false }
    )
    .setFooter({ text: 'Admin Log' })
    .setTimestamp();
}

function buildAdminRemovalLog(member, removal) {
  const guild = member.guild;
  const auditLog = removal?.auditLog || null;
  const reason = auditLog?.reason || removal?.reasonLabel || 'No reason provided';
  const moderator = auditLog?.executor || null;
  const embed = new EmbedBuilder()
    .setColor(removal.color || '#ED4245')
    .setTitle(removal.title || '🚪 Member Removed')
    .setThumbnail(getAvatar(member))
    .addFields(
      { name: 'User', value: formatUser(member.user), inline: true },
      { name: 'User ID', value: `\`${member.user.id}\``, inline: true },
      { name: 'Type', value: member.user.bot ? '🤖 Bot' : '👤 User', inline: true },
      { name: 'Removal Type', value: `\`${removal.key || 'unknown'}\``, inline: true },
      { name: 'Account Created', value: `${formatTimestamp(member.user.createdTimestamp, 'R')}\n${formatTimestamp(member.user.createdTimestamp, 'F')}`, inline: true },
      { name: 'Joined Server', value: member.joinedTimestamp ? `${formatTimestamp(member.joinedTimestamp, 'R')}\n${formatTimestamp(member.joinedTimestamp, 'F')}` : 'Unknown', inline: true },
      { name: 'Member Count', value: `\`${guild.memberCount}\``, inline: true },
      { name: 'Roles', value: getRolesText(member), inline: false },
      { name: 'Reason', value: String(reason).slice(0, 1024), inline: false }
    )
    .setFooter({ text: 'Admin Log' })
    .setTimestamp();
  if (moderator) embed.addFields({ name: 'Moderator', value: formatUser(moderator), inline: true });
  return embed;
}

async function sendAdminMemberJoinLog(member, addedRoles = []) {
  try {
    if (!isLogEnabled(member.guild.id, 'memberJoin')) return;
    const channel = await getAdminMemberLogChannel(member.guild, 'memberJoin');
    if (channel) await channel.send({ embeds: [buildAdminJoinLog(member, addedRoles)] });
  } catch (error) {
    console.error('[joinLeave] Failed to send admin member join log:', error);
  }
}

async function sendAdminMemberRemovalLog(member, removal) {
  try {
    const eventName = removal?.eventName || 'memberRemove';
    if (!isLogEnabled(member.guild.id, eventName) && !isLogEnabled(member.guild.id, 'memberLeave')) return;
    const channel = await getAdminMemberLogChannel(member.guild, eventName);
    if (channel) await channel.send({ embeds: [buildAdminRemovalLog(member, removal)] });
  } catch (error) {
    console.error('[joinLeave] Failed to send admin member removal log:', error);
  }
}

module.exports = [
  {
    name: 'guildMemberAdd',
    async execute(member) {
      await statsManager.handleGuildMemberAdd(member);

      const verificationResult = await verificationManager.handleMemberJoin(member).catch((error) => {
        console.error('[verification] Failed to process member join:', error);
        return { assigned: [] };
      });

      const addedRoles = await autoRoleManager.applyAutoRoles(member).catch((error) => {
        console.error('[autoRoles] Failed to apply auto roles:', error);
        return [];
      });

      for (const role of verificationResult?.assigned || []) {
        if (!addedRoles.some((addedRole) => addedRole.id === role.id)) addedRoles.push(role);
      }

      await welcomeManager.sendWelcome(member).catch((error) => {
        console.error('[Welcome] Failed to process member join:', error);
      });
      await sendAdminMemberJoinLog(member, addedRoles);
    },
  },
  {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember) {
      await verificationManager.handleMemberUpdate(oldMember, newMember).catch((error) => {
        console.error('[verification] Failed to process member update:', error);
      });
    },
  },
  {
    name: 'guildMemberRemove',
    async execute(member) {
      await statsManager.handleGuildMemberRemove(member);
      const removal = await detectRemoval(member);
      await sendPublicLeaveEmbed(member);
      await sendAdminMemberRemovalLog(member, removal);
    },
  },
];
