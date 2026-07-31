const { PermissionFlagsBits } = require('discord.js');
const guildManager = require('../../guild/guildManager');
const security = require('../../security/securityCore');
const {
  buildCategoryPanel,
  buildMainPanel,
  buildModulePanel,
  buildSocialAccessDeniedPanel,
} = require('./userPanel');

function getMemberDisplayName(interaction) {
  return interaction.member?.displayName ||
    interaction.user?.displayName ||
    interaction.user?.username ||
    'Unknown User';
}

function getSocialUserRoleIds(guildId) {
  const social = guildManager.getGuildSection(guildId, 'social', {});
  return Array.isArray(social.userRoleIds) ? social.userRoleIds.filter(Boolean) : [];
}

function canUseUserSocialStudio(interaction) {
  const roleIds = getSocialUserRoleIds(interaction.guildId);
  if (!roleIds.length) return true;
  return Boolean(
    security.isBotOwner?.(interaction.user?.id) ||
    interaction.guild?.ownerId === interaction.user?.id ||
    interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
    roleIds.some((id) => interaction.member?.roles?.cache?.has?.(id)),
  );
}

async function updatePanel(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return true;
  }

  await interaction.update(payload);
  return true;
}

async function handleUserPanelInteraction(interaction) {
  const customId = String(interaction?.customId || '');
  if (!customId.startsWith('user:')) return false;
  if (!interaction.guild) {
    await interaction.reply({ content: 'This panel can only be used inside a server.', flags: 64 });
    return true;
  }

  const memberDisplayName = getMemberDisplayName(interaction);

  if (customId === 'user:home') {
    return updatePanel(interaction, buildMainPanel(memberDisplayName));
  }

  if (interaction.isStringSelectMenu?.() && customId === 'user:search') {
    const [moduleKey] = interaction.values || [];
    if (moduleKey === 'social' && !canUseUserSocialStudio(interaction)) {
      return updatePanel(interaction, buildSocialAccessDeniedPanel(memberDisplayName));
    }
    return updatePanel(interaction, buildModulePanel(moduleKey, memberDisplayName));
  }

  const categoryMatch = customId.match(/^user:category:([a-zA-Z0-9_-]+)$/);
  if (categoryMatch && interaction.isButton?.()) {
    return updatePanel(interaction, buildCategoryPanel(categoryMatch[1], memberDisplayName));
  }

  const moduleMatch = customId.match(/^user:module:([a-zA-Z0-9_-]+)$/);
  if (moduleMatch && interaction.isButton?.()) {
    if (moduleMatch[1] === 'social' && !canUseUserSocialStudio(interaction)) {
      return updatePanel(interaction, buildSocialAccessDeniedPanel(memberDisplayName));
    }
    return updatePanel(interaction, buildModulePanel(moduleMatch[1], memberDisplayName));
  }

  return false;
}

module.exports = {
  handleUserPanelInteraction,
  canUseUserSocialStudio,
};
