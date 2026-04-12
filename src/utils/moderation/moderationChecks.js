function canModerate({ interaction, member }) {
  const moderator = interaction.member;

  if (!member) {
    return { allowed: false, message: 'That user is not in this server.' };
  }

  if (member.id === interaction.user.id) {
    return { allowed: false, message: 'You cannot perform this action on yourself.' };
  }

  if (member.id === interaction.client.user.id) {
    return { allowed: false, message: 'You cannot perform this action on the bot.' };
  }

  if (
    member.roles.highest.position >= moderator.roles.highest.position &&
    interaction.guild.ownerId !== interaction.user.id
  ) {
    return {
      allowed: false,
      message: 'You cannot moderate a member with the same or higher role than you.',
    };
  }

  return { allowed: true };
}

module.exports = { canModerate };