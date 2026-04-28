const { PermissionFlagsBits } = require('discord.js');

function hasRequiredPermissions(member, permissions = []) {
  if (!permissions.length) return true;
  return permissions.every(permission => member.permissions.has(permission));
}

function canAccessCommand(interaction, command, botOwnerId) {
  if (!command) return false;

  const access = command.access || {};
  const member = interaction.member;

  if (access.ownerOnly) {
    return interaction.user.id === botOwnerId;
  }

  const permissions = Array.isArray(access.permissions) ? access.permissions : [];
  return hasRequiredPermissions(member, permissions);
}

async function enforceCommandAccess(interaction, command, botOwnerId) {
  const access = command.access || {};
  const member = interaction.member;

  if (access.ownerOnly && interaction.user.id !== botOwnerId) {
    await interaction.reply({
      content: 'This command is owner only.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const permissions = Array.isArray(access.permissions) ? access.permissions : [];
  if (permissions.length && !hasRequiredPermissions(member, permissions)) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  return false;
}

module.exports = {
  PermissionFlagsBits,
  canAccessCommand,
  enforceCommandAccess
};