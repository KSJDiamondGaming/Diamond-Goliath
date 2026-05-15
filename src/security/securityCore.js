const { PermissionFlagsBits, MessageFlags } = require('discord.js');

const DEFAULT_COOLDOWN_MS = Number(process.env.SECURITY_COOLDOWN_MS || 2500);

const cooldowns = new Map();

const OWNER_IDS = (process.env.OWNER_IDS || '')
  .split(',')
  .map((id) => String(id).trim())
  .filter(Boolean);

function getBotOwnerIds() {
  return [...new Set(OWNER_IDS)];
}

function getBotOwnerId() {
  return OWNER_IDS[0] || null;
}

function isBotOwner(userId) {
  return OWNER_IDS.includes(String(userId));
}

function isGuildOwner(interaction) {
  return Boolean(
    interaction?.guild &&
      interaction?.user &&
      interaction.guild.ownerId === interaction.user.id
  );
}

function hasPermission(interaction, level = 'mod') {
  if (!interaction?.user) return false;

  if (isBotOwner(interaction.user.id)) return true;

  if (!interaction.guild || !interaction.member) return false;

  const member = interaction.member;
  const permissions = member.permissions;

  switch (level) {
    case 'botOwner':
      return isBotOwner(interaction.user.id);

    case 'guildOwner':
      return isGuildOwner(interaction);

    case 'owner':
      return isBotOwner(interaction.user.id) || isGuildOwner(interaction);

    case 'admin':
      return (
        isGuildOwner(interaction) ||
        permissions?.has(PermissionFlagsBits.Administrator)
      );

    case 'mod':
      return (
        isGuildOwner(interaction) ||
        permissions?.has(PermissionFlagsBits.Administrator) ||
        permissions?.has(PermissionFlagsBits.ModerateMembers) ||
        permissions?.has(PermissionFlagsBits.KickMembers) ||
        permissions?.has(PermissionFlagsBits.BanMembers) ||
        permissions?.has(PermissionFlagsBits.ManageMessages)
      );

    default:
      return false;
  }
}

function canModerateTarget(interaction, targetMember) {
  if (!interaction?.guild || !interaction?.member || !targetMember) {
    return {
      allowed: false,
      reason: 'Missing guild, moderator, or target member.',
    };
  }

  const guild = interaction.guild;
  const moderator = interaction.member;
  const botMember = guild.members.me;

  if (isBotOwner(interaction.user.id)) {
    return {
      allowed: true,
      reason: null,
    };
  }

  if (targetMember.id === guild.ownerId) {
    return {
      allowed: false,
      reason: 'You cannot moderate the server owner.',
    };
  }

  if (targetMember.id === interaction.user.id) {
    return {
      allowed: false,
      reason: 'You cannot moderate yourself.',
    };
  }

  if (botMember && targetMember.id === botMember.id) {
    return {
      allowed: false,
      reason: 'You cannot moderate the bot.',
    };
  }

  const moderatorHighest = moderator.roles?.highest?.position ?? 0;
  const targetHighest = targetMember.roles?.highest?.position ?? 0;
  const botHighest = botMember?.roles?.highest?.position ?? 0;

  if (moderator.id !== guild.ownerId && moderatorHighest <= targetHighest) {
    return {
      allowed: false,
      reason: 'That user has an equal or higher role than you.',
    };
  }

  if (botMember && botHighest <= targetHighest) {
    return {
      allowed: false,
      reason: 'That user has an equal or higher role than the bot.',
    };
  }

  return {
    allowed: true,
    reason: null,
  };
}

function checkCooldown(userId, key = 'global', ms = DEFAULT_COOLDOWN_MS) {
  const safeUserId = String(userId || '');
  const safeKey = String(key || 'global');
  const cooldownMs = Number(ms || DEFAULT_COOLDOWN_MS);

  if (!safeUserId) {
    return {
      allowed: false,
      remainingMs: cooldownMs,
    };
  }

  if (isBotOwner(safeUserId)) {
    return {
      allowed: true,
      remainingMs: 0,
    };
  }

  const now = Date.now();
  const cooldownKey = `${safeUserId}:${safeKey}`;
  const expiresAt = cooldowns.get(cooldownKey) || 0;

  if (expiresAt > now) {
    return {
      allowed: false,
      remainingMs: expiresAt - now,
    };
  }

  cooldowns.set(cooldownKey, now + cooldownMs);

  return {
    allowed: true,
    remainingMs: 0,
  };
}

async function safeDeny(interaction, message) {
  if (!interaction) return null;

  const payload = {
    content: message,
    embeds: [],
    components: [],
    flags: MessageFlags.Ephemeral,
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }

  return interaction.reply(payload);
}

async function enforceInteractionSecurity(interaction, options = {}) {
  const {
    level = null,
    cooldownKey = null,
    cooldownMs = DEFAULT_COOLDOWN_MS,
    guildOnly = true,
    ownerOnly = false,
    allowGuildOwner = true,
  } = options;

  if (!interaction?.user) {
    return {
      allowed: false,
      reason: 'Invalid interaction.',
    };
  }

  if (guildOnly && !interaction.guild) {
    await safeDeny(interaction, '❌ This can only be used inside a server.');

    return {
      allowed: false,
      reason: 'Guild only.',
    };
  }

  if (ownerOnly) {
    const allowed =
      isBotOwner(interaction.user.id) ||
      (allowGuildOwner && isGuildOwner(interaction));

    if (!allowed) {
      await safeDeny(
        interaction,
        '❌ Only the Goliath Owner or Guild Owner can do this.'
      );

      return {
        allowed: false,
        reason: 'Owner only.',
      };
    }
  }

  if (level && !hasPermission(interaction, level)) {
    await safeDeny(interaction, '❌ You do not have permission to do this.');

    return {
      allowed: false,
      reason: `Missing permission level: ${level}`,
    };
  }

  if (cooldownKey) {
    const cooldown = checkCooldown(interaction.user.id, cooldownKey, cooldownMs);

    if (!cooldown.allowed) {
      const seconds = Math.ceil(cooldown.remainingMs / 1000);

      await safeDeny(interaction, `⏱️ Slow down. Try again in ${seconds}s.`);

      return {
        allowed: false,
        reason: 'Cooldown active.',
        remainingMs: cooldown.remainingMs,
      };
    }
  }

  return {
    allowed: true,
    reason: null,
  };
}

function canUseRestore(interaction) {
  if (!interaction?.user) {
    return {
      allowed: false,
      reason: 'Invalid restore request.',
    };
  }

  if (isBotOwner(interaction.user.id)) {
    return {
      allowed: true,
      level: 'BOT_OWNER',
    };
  }

  return {
    allowed: false,
    reason: 'Only the Goliath Owner can use restore systems.',
  };
}

function checkRestoreCooldown(guildId) {
  return checkCooldown(
    String(guildId),
    'server_restore',
    Number(process.env.RESTORE_COOLDOWN_MS || 10 * 60 * 1000)
  );
}

function validateBotHierarchy(guild) {
  if (!guild?.members?.me) {
    return {
      valid: false,
      reason: 'Bot member not found.',
    };
  }

  const botMember = guild.members.me;

  if (botMember.roles.highest.position <= 1) {
    return {
      valid: false,
      reason: 'Bot role is too low in hierarchy.',
    };
  }

  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return {
      valid: false,
      reason: 'Bot is missing ManageRoles permission.',
    };
  }

  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return {
      valid: false,
      reason: 'Bot is missing ManageChannels permission.',
    };
  }

  return {
    valid: true,
    reason: null,
  };
}

function hasDangerousPermissions(member) {
  if (!member?.permissions) return false;

  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.ManageRoles) ||
    member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    member.permissions.has(PermissionFlagsBits.BanMembers) ||
    member.permissions.has(PermissionFlagsBits.KickMembers) ||
    member.permissions.has(PermissionFlagsBits.ManageWebhooks)
  );
}

function canManageTargetRole(guild, role) {
  if (!guild?.members?.me || !role) {
    return {
      allowed: false,
      reason: 'Invalid guild or role.',
    };
  }

  const botHighest = guild.members.me.roles.highest.position;

  if (role.managed) {
    return {
      allowed: false,
      reason: 'Cannot manage integration roles.',
    };
  }

  if (role.position >= botHighest) {
    return {
      allowed: false,
      reason: 'Role is above bot hierarchy.',
    };
  }

  return {
    allowed: true,
    reason: null,
  };
}

function canManageTargetMember(guild, targetMember) {
  if (!guild?.members?.me || !targetMember) {
    return { allowed: false, reason: 'Invalid guild or target member.' };
  }

  // Block bot owner
  if (isBotOwner(targetMember.id)) {
    return { allowed: false, reason: 'Cannot manage the Goliath owner.' };
  }

  // Block server owner
  if (targetMember.id === guild.ownerId) {
    return { allowed: false, reason: 'Cannot manage server owner.' };
  }

  const botHighest = guild.members.me.roles.highest.position;
  const targetHighest = targetMember.roles.highest.position;

  if (targetHighest >= botHighest) {
    return { allowed: false, reason: 'Target is above bot hierarchy.' };
  }

  return { allowed: true, reason: null };
}

module.exports = {
  PermissionFlagsBits,

  getBotOwnerIds,
  getBotOwnerId,
  isBotOwner,
  isGuildOwner,
  hasPermission,
  canModerateTarget,
  checkCooldown,
  enforceInteractionSecurity,
  safeDeny,

  canUseRestore,
  checkRestoreCooldown,

  validateBotHierarchy,
  hasDangerousPermissions,
  canManageTargetRole,
  canManageTargetMember,
};