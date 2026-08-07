'use strict';

const { PermissionFlagsBits } = require('discord.js');
const leveling = require('./leveling');
const panel = require('./levelingPanel');
const { isModuleEnabled } = require('../../../core/guild/guildManager');

function earnedRewards(section, level) {
  const rewards = Array.isArray(section?.levelRewards) ? section.levelRewards : [];
  return rewards
    .filter((reward) => reward?.roleId && Number(reward.level || 0) <= Number(level || 0))
    .sort((left, right) => Number(left.level || 0) - Number(right.level || 0));
}

async function resolveManageableRole(member, roleId, botMember) {
  const role = member.guild.roles.cache.get(roleId)
    || await member.guild.roles.fetch(roleId).catch(() => null);
  if (!role || role.managed || role.id === member.guild.id) return null;
  if (role.position >= botMember.roles.highest.position) return null;
  return role;
}

async function assignLevelRole(member, section, newLevel) {
  if (!member?.roles?.add || !member?.guild) return false;

  const rewards = earnedRewards(section, newLevel);
  if (!rewards.length) return false;

  const me = member.guild.members.me || await member.guild.members.fetchMe().catch(() => null);
  if (!me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) return false;

  const manageable = [];
  for (const reward of rewards) {
    const role = await resolveManageableRole(member, reward.roleId, me);
    if (role) manageable.push({ reward, role });
  }
  if (!manageable.length) return false;

  const highestEarned = manageable[manageable.length - 1];
  const rolesToAdd = section.removePreviousLevelRoles === true
    ? [highestEarned.role]
    : manageable.map((entry) => entry.role);

  const missingRoles = rolesToAdd.filter((role) => !member.roles.cache.has(role.id));
  if (missingRoles.length) {
    await member.roles.add(
      missingRoles,
      `Goliath leveling rewards through level ${newLevel}`,
    ).catch(() => null);
  }

  if (section.removePreviousLevelRoles === true && member.roles?.remove) {
    const keepId = highestEarned.role.id;
    const earnedRoleIds = new Set(rewards.map((reward) => String(reward.roleId)));
    const removable = [...member.roles.cache.values()]
      .filter((role) => earnedRoleIds.has(String(role.id)) && role.id !== keepId)
      .filter((role) => !role.managed && role.position < me.roles.highest.position);

    if (removable.length) {
      await member.roles.remove(
        removable,
        `Goliath replaced previous leveling ranks at level ${newLevel}`,
      ).catch(() => null);
    }
  }

  return rolesToAdd.every((role) => member.roles.cache.has(role.id));
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
  if (!isModuleEnabled(message.guild.id, 'leveling')) return false;
  const section = leveling.getSection(message.guild.id);
  if (section.trackMessages === false) return false;

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

module.exports = {
  handleMessageCreate,
  assignLevelRole,
  announceLevelUp,
  earnedRewards,
};
