const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { buildPreviewEmbed, TEMPLATES } = require('../../functions/embed/embedPanel');
const guildManager = require('../../guild/guildManager');

/* ---------------- AUTO JOIN ROLES ---------------- */

function getAutoRolesConfig(guildId) {
  return guildManager.getGuildSection(guildId, 'autoRoles', {
    enabled: false,
    roleIds: [],
  });
}

function getRoleIds(config) {
  return Array.isArray(config?.roleIds)
    ? [...new Set(config.roleIds.filter(Boolean))]
    : [];
}

async function getBotMember(guild) {
  return guild.members.me || (await guild.members.fetchMe().catch(() => null));
}

function canBotManageRole(botMember, role) {
  if (!botMember || !role) return false;
  if (role.managed) return false;
  if (role.position >= botMember.roles.highest.position) return false;

  return botMember.permissions.has(PermissionsBitField.Flags.ManageRoles);
}

async function applyAutoRoles(member) {
  try {
    const guild = member.guild;
    const config = getAutoRolesConfig(guild.id);

    if (!config.enabled) return;

    const roleIds = getRoleIds(config);
    if (!roleIds.length) return;

    const botMember = await getBotMember(guild);

    if (!botMember) {
      console.warn('[autoRoles] Could not fetch bot member.');
      return;
    }

    for (const roleId of roleIds) {
      const role =
        guild.roles.cache.get(roleId) ||
        (await guild.roles.fetch(roleId).catch(() => null));

      if (!role) {
        console.warn(`[autoRoles] Role not found: ${roleId}`);
        continue;
      }

      if (member.roles.cache.has(role.id)) continue;

      if (!canBotManageRole(botMember, role)) {
        console.warn(`[autoRoles] Cannot manage role: ${role.name}`);
        continue;
      }

      await member.roles.add(role, 'Auto role on member join');
      console.log(`[autoRoles] Added ${role.name} to ${member.user.tag}`);
    }
  } catch (error) {
    console.error('[autoRoles] Failed to apply auto roles:', error);
  }
}

/* ---------------- MEMBER LOGS ---------------- */

async function getMemberLogChannel(guild) {
  const channelId =
    guildManager.getLogChannelId(guild.id, 'member', 'general') ||
    guildManager.getLogChannelId(guild.id, 'general');

  if (!channelId) return null;

  const channel =
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null));

  return channel?.isTextBased() ? channel : null;
}

function formatUser(user) {
  if (!user) return 'Unknown User';
  return `${user} \`${user.tag || user.username || user.id}\``;
}

async function sendMemberJoinLog(member) {
  try {
    const guild = member.guild;

    if (!guildManager.isLogEventEnabled(guild.id, 'memberJoin')) return;

    const logChannel = await getMemberLogChannel(guild);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('👥 Member Joined')
      .addFields(
        { name: 'User', value: formatUser(member.user), inline: true },
        { name: 'User ID', value: `\`${member.user.id}\``, inline: true },
        {
          name: 'Account Created',
          value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
          inline: true,
        },
        {
          name: 'Member Count',
          value: `\`${guild.memberCount}\``,
          inline: true,
        }
      )
      .setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 256 }))
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[memberJoinLeave] Failed to send member join log:', error);
  }
}

async function sendMemberLeaveLog(member) {
  try {
    const guild = member.guild;

    if (!guildManager.isLogEventEnabled(guild.id, 'memberLeave')) return;

    const logChannel = await getMemberLogChannel(guild);
    if (!logChannel) return;

    const joinedAt = member.joinedTimestamp
      ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
      : 'Unknown';

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle('👥 Member Left')
      .addFields(
        { name: 'User', value: formatUser(member.user), inline: true },
        { name: 'User ID', value: `\`${member.user.id}\``, inline: true },
        { name: 'Joined Server', value: joinedAt, inline: true },
        {
          name: 'Member Count',
          value: `\`${guild.memberCount}\``,
          inline: true,
        }
      )
      .setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 256 }))
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[memberJoinLeave] Failed to send member leave log:', error);
  }
}

/* ---------------- MEMBER EMBEDS ---------------- */

async function sendMemberEmbed(member, type) {
  try {
    const guild = member.guild;

    const preset =
      typeof guildManager.getEmbedDefaultPreset === 'function'
        ? guildManager.getEmbedDefaultPreset(guild.id, type)
        : null;

    const messageData = preset || TEMPLATES[type];

    if (!messageData) return;

    const channelId =
      messageData.channelId ||
      guildManager.getGuildSection(guild.id, type, {})?.channelId ||
      null;

    if (!channelId) return;

    const channel =
      guild.channels.cache.get(channelId) ||
      (await guild.channels.fetch(channelId).catch(() => null));

    if (!channel?.isTextBased()) return;

    const fakeInteraction = {
      guild,
      guildId: guild.id,
      user: member.user,
      member,
    };

    await channel.send({
      content: messageData.allowUserPing ? `<@${member.user.id}>` : '',
      embeds: [buildPreviewEmbed(messageData, fakeInteraction)],
      allowedMentions: messageData.allowUserPing
        ? { users: [member.user.id], roles: [], repliedUser: false }
        : { parse: [], repliedUser: false },
    });
  } catch (error) {
    console.error(`[memberJoinLeave] Failed to send ${type} message:`, error);
  }
}

/* ---------------- EVENTS ---------------- */

module.exports = [
  {
    name: 'guildMemberAdd',

    async execute(member) {
      await applyAutoRoles(member);
      await sendMemberJoinLog(member);
      await sendMemberEmbed(member, 'welcome');
    },
  },

  {
    name: 'guildMemberRemove',

    async execute(member) {
      await sendMemberLeaveLog(member);
      await sendMemberEmbed(member, 'leave');
    },
  },
];