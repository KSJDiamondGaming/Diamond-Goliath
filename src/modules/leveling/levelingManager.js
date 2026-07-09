'use strict';

const { EmbedBuilder } = require('discord.js');
const levelingStore = require('./levelingStore');

function canAwardMessageXp(user, section) {
  if (!user?.lastMessageXpAt) return true;
  const last = new Date(user.lastMessageXpAt).getTime();
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= Number(section.cooldownSeconds || 60) * 1000;
}

function buildLevelUpEmbed(member, user) {
  return new EmbedBuilder()
    .setColor(0xfacc15)
    .setTitle('🏆 Level Up!')
    .setDescription(`${member} reached **level ${user.level}**!`)
    .setFooter({ text: 'Goliath Leveling' })
    .setTimestamp();
}

async function assignLevelRoles(member, section, newLevel) {
  if (!member?.roles?.add || !Array.isArray(section.levelRoleIds)) return;
  const roleId = section.levelRoleIds[newLevel - 1];
  if (!roleId) return;
  const role = member.guild.roles.cache.get(roleId) || await member.guild.roles.fetch(roleId).catch(() => null);
  if (!role || role.managed || role.id === member.guild.id) return;
  const me = member.guild.members.me;
  if (!me?.permissions?.has?.('ManageRoles')) return;
  if (role.position >= me.roles.highest.position) return;
  await member.roles.add(role, `Goliath leveling reward for level ${newLevel}`).catch(() => null);
}

async function announceLevelUp(message, section, user) {
  if (section.announceLevelUps === false) return;
  const channelId = section.announceChannelId || message.channel.id;
  const channel = message.guild.channels.cache.get(channelId) || await message.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) return;
  await channel.send({ embeds: [buildLevelUpEmbed(message.member, user)] }).catch(() => null);
}

async function handleMessageCreate(message) {
  if (!message?.guild?.id || !message.member || message.author?.bot) return false;
  const section = levelingStore.getSection(message.guild.id);
  if (section.enabled === false || section.trackMessages === false) return false;

  const existing = levelingStore.getUser(message.guild.id, message.author.id) || {
    userId: message.author.id,
    xp: 0,
    level: 0,
    messages: 0,
  };

  if (!canAwardMessageXp(existing, section)) return false;

  const previousLevel = Number(existing.level || 0);
  const nextXp = Number(existing.xp || 0) + Number(section.xpPerMessage || 10);
  const nextLevel = levelingStore.levelForXp(nextXp);
  const nextUser = levelingStore.saveUser(message.guild.id, {
    ...existing,
    xp: nextXp,
    level: nextLevel,
    messages: Number(existing.messages || 0) + 1,
    lastMessageXpAt: new Date().toISOString(),
  }, message.guild);

  levelingStore.updateSection(message.guild.id, (current) => ({
    ...current,
    analytics: {
      ...current.analytics,
      messagesTracked: Number(current.analytics?.messagesTracked || 0) + 1,
      xpAwarded: Number(current.analytics?.xpAwarded || 0) + Number(section.xpPerMessage || 10),
      levelUps: Number(current.analytics?.levelUps || 0) + (nextLevel > previousLevel ? 1 : 0),
    },
  }), message.guild);

  if (nextLevel > previousLevel) {
    await assignLevelRoles(message.member, section, nextLevel);
    await announceLevelUp(message, section, nextUser);
  }

  return true;
}

function getLeaderboard(guildId, limit = 10) {
  const section = levelingStore.getSection(guildId);
  return Object.values(section.users || {})
    .sort((a, b) => Number(b.xp || 0) - Number(a.xp || 0))
    .slice(0, limit);
}

module.exports = {
  buildLevelUpEmbed,
  handleMessageCreate,
  getLeaderboard,
};
