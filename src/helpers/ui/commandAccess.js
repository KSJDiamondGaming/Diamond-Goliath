const { PermissionFlagsBits } = require('discord.js');
const security = require('../../security/securityCore');

function hasRequiredPermissions(member, permissions = []) {
  if (!permissions.length) return true;
  return permissions.every((perm) => member.permissions.has(perm));
}

function canAccessCommand(interaction, command) {
  if (!command) return false;

  const access = command.access || {};

  // 🔥 GOLIATH OWNER ALWAYS PASSES
  if (security.isBotOwner(interaction.user.id)) return true;

  // Owner-only commands
  if (access.ownerOnly) {
    return security.isBotOwner(interaction.user.id);
  }

  // Level-based access (NEW SYSTEM)
  if (access.level) {
    return security.hasPermission(interaction, access.level);
  }

  // Fallback: raw Discord permissions (legacy support)
  const permissions = Array.isArray(access.permissions)
    ? access.permissions
    : [];

  return hasRequiredPermissions(interaction.member, permissions);
}

async function enforceCommandAccess(interaction, command) {
  const access = command.access || {};

  // 🔥 GOLIATH OWNER ALWAYS PASSES
  if (security.isBotOwner(interaction.user.id)) return false;

  // OWNER ONLY
  if (access.ownerOnly) {
    if (!security.isBotOwner(interaction.user.id)) {
      await reply(interaction, '❌ This command is bot-owner only.');
      return true;
    }
  }

  // LEVEL SYSTEM (NEW)
  if (access.level) {
    const check = await security.enforceInteractionSecurity(interaction, {
      level: access.level,
      cooldownKey: `cmd:${interaction.commandName}`,
      cooldownMs: 2000,
      guildOnly: true,
    });

    if (!check.allowed) return true;
  }

  // LEGACY PERMISSIONS SUPPORT
  const permissions = Array.isArray(access.permissions)
    ? access.permissions
    : [];

  if (permissions.length && !hasRequiredPermissions(interaction.member, permissions)) {
    await reply(interaction, '❌ You do not have permission to use this command.');
    return true;
  }

  return false;
}

/* ---------------- SAFE REPLY ---------------- */

async function reply(interaction, content) {
  const payload = {
    content,
    embeds: [],
    components: [],
    flags: 64,
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }

  return interaction.reply(payload);
}

module.exports = {
  PermissionFlagsBits,
  canAccessCommand,
  enforceCommandAccess,
};