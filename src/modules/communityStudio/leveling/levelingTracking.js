'use strict';

const { PermissionFlagsBits } = require('discord.js');
const leveling = require('./leveling');
const panel = require('./levelingPanel');

async function assignLevelRole(member, section, newLevel) {
  if (!member?.roles?.add || !Array.isArray(section.levelRoleIds)) return false;
  const roleId = section.levelRoleIds[newLevel - 1];
  if (!roleId) return false;
  const role = member.guild.roles.cache.get(roleId)
    || await member.guild.roles.fetch(roleId).catch(() => null);
  if (!role || role.managed || role.id === member.guild.id) return false;
  const me = member.guild.members.me || await member.guild.members.fetchMe().catch(() => null);
  if (!me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) return false;
  if (role.position >= me.roles.highest.position) return false;
  await member.roles.add(role, `Goliath leveling reward for level ${newLevel}`).catch(() => null);
  return member.roles.cache.has(role.id);
}

async function announceLevelUp(message, section, user) {
  if (section.announceLevelUps === false) return false;
  const channelId = section.announceChannelId || message.channel.id;
  const channel = message.guild.channels.cache.get(channelId)
    || await message.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) return false;
  await channel.send({ embeds: [panel.buildLevelUpEmbed(message.member, user)] }).catch(() => null);
  return true;
}

async function handleMessageCreate(message) {
  if (!message?.guild?.id || !message.member || message.author?.bot) return false;
  const section = leveling.getSection(message.guild.id);
  if (section.enabled === false || section.trackMessages === false) return false;

  const result = leveling.awardMessageXp(message.guild.id, message.author.id, {
    actorId: message.author.id,
    action: 'leveling_message_xp',
  });
  if (!result) return false;

  if (result.levelledUp) {
    await assignLevelRole(message.member, section, result.newLevel);
    await announceLevelUp(message, section, result.user);
  }
  return true;
}

module.exports = { handleMessageCreate, assignLevelRole, announceLevelUp };
