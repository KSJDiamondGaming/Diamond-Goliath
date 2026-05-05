const { PermissionFlagsBits } = require('discord.js');

const DEFAULT_COOLDOWN_MS = Number(process.env.SECURITY_COOLDOWN_MS || 2500);
const cooldowns = new Map();

function getBotOwnerId() {
  return String(process.env.BOT_OWNER_ID || '').trim();
}

function isBotOwner(userId) {
  const ownerId = getBotOwnerId();
  return Boolean(ownerId && String(userId) === ownerId);
}

function isGuildOwner(interaction) {
  if (!interaction?.guild || !interaction?.user) return false;
  return interaction.guild.ownerId === interaction.user.id;
}

function hasPermission(interaction, level = 'mod') {
  if (!interaction?.user) return false;

  if (isBotOwner(interaction.user.id)) return true;

  if (!interaction.guild || !interaction.member) return false;

  const member = interaction.member;

  if (level === 'botOwner') {
    return isBotOwner(interaction.user.id);
  }

  if (level === 'guildOwner') {
    return isGuildOwner(interaction);
  }

  if (level === 'owner') {
    return isBotOwner(interaction.user.id) || isGuildOwner(interaction);
  }

  if (level === 'admin') {
    return (
      isGuildOwner(interaction) ||
      member.permissions?.has(PermissionFlagsBits.Administrator)
    );
  }

  if (level === 'mod') {
    return (
      isGuildOwner(interaction) ||
      member.permissions?.has(PermissionFlagsBits.Administrator) ||
      member.permissions?.has(PermissionFlagsBits.ModerateMembers) ||
      member.permissions?.has(PermissionFlagsBits.KickMembers) ||
      member.permissions?.has(PermissionFlagsBits.BanMembers) ||
      member.permissions?.has(PermissionFlagsBits.ManageMessages)
    );
  }

  return false;
}

function canModerateTarget(interaction, targetMember) {
  if (!interaction?.guild || !interaction?.member || !targetMember) {
    return {
      allowed: false,
      reason: 'Missing guild, moderator, or target member.',
    };
  }

  const moderator = interaction.member;
  const botMember = interaction.guild.members.me;

  if (isBotOwner(interaction.user.id)) {
    return {
      allowed: true,
      reason: null,
    };
  }

  if (targetMember.id === interaction.guild.ownerId) {
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

  if (targetMember.id === botMember?.id) {
    return {
      allowed: false,
      reason: 'You cannot moderate the bot.',
    };
  }

  if (
    moderator.id !== interaction.guild.ownerId &&
    moderator.roles.highest.position <= targetMember.roles.highest.position
  ) {
    return {
      allowed: false,
      reason: 'That user has an equal or higher role than you.',
    };
  }

  if (
    botMember &&
    botMember.roles.highest.position <= targetMember.roles.highest.position
  ) {
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

function checkCooldown(userId, key, ms = DEFAULT_COOLDOWN_MS) {
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
  const payload = {
    content: message,
    embeds: [],
    components: [],
    ephemeral: true,
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
      await safeDeny(interaction, '❌ Only the bot owner or server owner can do this.');
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

module.exports = {
  PermissionFlagsBits,

  isBotOwner,
  isGuildOwner,
  hasPermission,
  canModerateTarget,
  checkCooldown,
  enforceInteractionSecurity,
};