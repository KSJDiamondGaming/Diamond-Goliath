// 🛡️ Hierarchy / moderation safety checks

function checkHierarchy(interaction, target) {
  if (!interaction || !interaction.guild || !interaction.member) {
    return '❌ Invalid interaction context.';
  }

  if (!target) {
    return '❌ Could not find that member.';
  }

  if (target.id === interaction.user.id) {
    return '❌ You cannot moderate yourself.';
  }

  if (target.id === interaction.guild.ownerId) {
    return '❌ Cannot moderate the server owner.';
  }

  const actorIsOwner = interaction.member.id === interaction.guild.ownerId;
  const actorHighestRole = interaction.member.roles?.highest?.position ?? 0;
  const targetHighestRole = target.roles?.highest?.position ?? 0;
  const botHighestRole = interaction.guild.members.me?.roles?.highest?.position ?? 0;

  if (!actorIsOwner && actorHighestRole <= targetHighestRole) {
    return '❌ Target has an equal or higher role than you.';
  }

  if (botHighestRole <= targetHighestRole) {
    return '❌ My role is too low to moderate this user.';
  }

  return null;
}

function checkHierarchyForBulk(actorMember, botMember, guildOwnerId, targetMember, actorUserId) {
  if (!targetMember) {
    return 'User not found.';
  }

  if (targetMember.id === actorUserId) {
    return 'Cannot target yourself.';
  }

  if (targetMember.id === guildOwnerId) {
    return 'Cannot target the server owner.';
  }

  const actorIsOwner = actorUserId === guildOwnerId;
  const actorHighestRole = actorMember?.roles?.highest?.position ?? 0;
  const targetHighestRole = targetMember?.roles?.highest?.position ?? 0;
  const botHighestRole = botMember?.roles?.highest?.position ?? 0;

  if (!actorIsOwner && actorHighestRole <= targetHighestRole) {
    return 'Target has an equal or higher role.';
  }

  if (!botMember || botHighestRole <= targetHighestRole) {
    return 'Bot role is too low.';
  }

  return null;
}

function canActOnTarget(actorMember, targetMember, guildOwnerId) {
  if (!actorMember || !targetMember) return false;

  if (targetMember.id === guildOwnerId) return false;
  if (actorMember.id === targetMember.id) return false;
  if (actorMember.id === guildOwnerId) return true;

  const actorHighestRole = actorMember.roles?.highest?.position ?? 0;
  const targetHighestRole = targetMember.roles?.highest?.position ?? 0;

  return actorHighestRole > targetHighestRole;
}

function canBotActOnTarget(botMember, targetMember) {
  if (!botMember || !targetMember) return false;

  const botHighestRole = botMember.roles?.highest?.position ?? 0;
  const targetHighestRole = targetMember.roles?.highest?.position ?? 0;

  return botHighestRole > targetHighestRole;
}

function getHierarchySummary(actorMember, botMember, targetMember, guildOwnerId) {
  if (!targetMember) {
    return {
      ok: false,
      actorCanAct: false,
      botCanAct: false,
      reason: '❌ Target not found.'
    };
  }

  if (targetMember.id === guildOwnerId) {
    return {
      ok: false,
      actorCanAct: false,
      botCanAct: false,
      reason: '❌ Cannot moderate the server owner.'
    };
  }

  const actorCanAct = canActOnTarget(actorMember, targetMember, guildOwnerId);
  const botCanAct = canBotActOnTarget(botMember, targetMember);

  if (!actorCanAct) {
    return {
      ok: false,
      actorCanAct,
      botCanAct,
      reason: '❌ You cannot act on this target due to role hierarchy.'
    };
  }

  if (!botCanAct) {
    return {
      ok: false,
      actorCanAct,
      botCanAct,
      reason: '❌ Bot cannot act on this target due to role hierarchy.'
    };
  }

  return {
    ok: true,
    actorCanAct,
    botCanAct,
    reason: null
  };
}

module.exports = {
  checkHierarchy,
  checkHierarchyForBulk,
  canActOnTarget,
  canBotActOnTarget,
  getHierarchySummary
};