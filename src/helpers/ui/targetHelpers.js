const { PermissionFlagsBits } = require('discord.js');

/* ---------------- TARGET RESOLVERS ---------------- */

function getMemberFromInteraction(interaction) {
  return (
    interaction.options?.getMember?.('user') ||
    interaction.options?.getMember?.('target') ||
    interaction.options?.getMember?.('member') ||
    interaction.guild?.members?.cache?.get(interaction.targetId) ||
    null
  );
}

function getUserFromInteraction(interaction) {
  return (
    interaction.options?.getUser?.('user') ||
    interaction.options?.getUser?.('target') ||
    interaction.options?.getUser?.('member') ||
    interaction.user ||
    null
  );
}

/* ---------------- MODERATION CHECKS ---------------- */

function canModerate(interaction, targetMember) {
  if (!interaction.guild || !interaction.member || !targetMember) {
    return { ok: false, reason: 'Target member not found.' };
  }

  if (targetMember.id === interaction.user.id) {
    return { ok: false, reason: 'You cannot moderate yourself.' };
  }

  if (targetMember.id === interaction.guild.ownerId) {
    return { ok: false, reason: 'You cannot moderate the server owner.' };
  }

  if (interaction.member.id !== interaction.guild.ownerId) {
    const actorHighestRole = interaction.member.roles?.highest;
    const targetHighestRole = targetMember.roles?.highest;

    if (
      actorHighestRole &&
      targetHighestRole &&
      targetHighestRole.position >= actorHighestRole.position
    ) {
      return {
        ok: false,
        reason: 'You cannot moderate a member with an equal or higher role.',
      };
    }
  }

  const botMember =
    interaction.guild.members.me ||
    interaction.guild.members.cache.get(interaction.client.user.id);

  if (!botMember) {
    return { ok: false, reason: 'Bot member not found.' };
  }

  const botHighestRole = botMember.roles?.highest;
  const targetHighestRole = targetMember.roles?.highest;

  if (
    botHighestRole &&
    targetHighestRole &&
    targetHighestRole.position >= botHighestRole.position
  ) {
    return {
      ok: false,
      reason: 'I cannot moderate a member with an equal or higher role than mine.',
    };
  }

  return { ok: true, reason: null };
}

function hasModerationPermission(member) {
  if (!member) return false;

  return member.permissions.has([
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.ManageMessages,
  ]);
}

/* ---------------- EXPORTS ---------------- */

module.exports = {
  getMemberFromInteraction,
  getUserFromInteraction,
  canModerate,
  hasModerationPermission,
};