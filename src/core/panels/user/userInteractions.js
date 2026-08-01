const { PermissionFlagsBits } = require('discord.js');
const guildManager = require('../../guild/guildManager');
const security = require('../../security/securityCore');
const leveling = require('../../../modules/communityStudio/leveling/leveling');
const {
  buildCategoryPanel,
  buildMainPanel,
  buildModulePanel,
  buildProfilePanel,
  buildRolesPanel,
  buildSocialAccessDeniedPanel,
} = require('./userPanel');

function getMemberDisplayName(interaction) {
  return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';
}

function getSocialUserRoleIds(guildId) {
  const social = guildManager.getGuildSection(guildId, 'social', {});
  return Array.isArray(social.userRoleIds) ? social.userRoleIds.filter(Boolean) : [];
}

function getUserPanelSettings(guildId) {
  const section = guildManager.getGuildSection(guildId, 'userPanel', {});
  const profile = section?.profile && typeof section.profile === 'object' ? section.profile : {};
  return {
    profile: {
      rolesEnabled: profile.rolesEnabled !== false,
      showHighestRole: profile.showHighestRole !== false,
      showRoleCount: profile.showRoleCount !== false,
      showRoleList: profile.showRoleList !== false,
    },
  };
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

function buildLiveProfile(interaction) {
  const user = leveling.getUser(interaction.guildId, interaction.user.id);
  const leaderboard = leveling.getLeaderboard(interaction.guildId, 100);
  const rankIndex = leaderboard.findIndex((entry) => entry.userId === interaction.user.id || entry.id === interaction.user.id);

  return {
    leveling: user ? {
      level: Math.max(0, Number(user.level || 0)),
      xp: Math.max(0, Number(user.xp || 0)),
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
    } : null,
  };
}

async function updatePanel(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return true;
  }
  await interaction.update(payload);
  return true;
}

async function showProfile(interaction) {
  const settings = getUserPanelSettings(interaction.guildId);
  return updatePanel(interaction, buildProfilePanel(interaction, buildLiveProfile(interaction), settings.profile));
}

async function handleUserPanelInteraction(interaction) {
  const customId = String(interaction?.customId || '');
  if (!customId.startsWith('user:')) return false;
  if (!interaction.guild) {
    await interaction.reply({ content: 'This panel can only be used inside a server.', flags: 64 });
    return true;
  }

  const memberDisplayName = getMemberDisplayName(interaction);

  if (customId === 'user:close' && interaction.isButton?.()) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
    await interaction.deleteReply().catch(() => null);
    return true;
  }

  if (customId === 'user:home') return updatePanel(interaction, buildMainPanel(memberDisplayName));

  if (customId === 'user:profile:refresh' || customId === 'user:module:profile') {
    return showProfile(interaction);
  }

  if (customId === 'user:profile:roles' && interaction.isButton?.()) {
    const settings = getUserPanelSettings(interaction.guildId).profile;
    if (!settings.rolesEnabled) return showProfile(interaction);
    return updatePanel(interaction, buildRolesPanel(interaction, settings));
  }

  if (customId === 'user:profile:progress' && interaction.isButton?.()) {
    return updatePanel(interaction, buildModulePanel('leveling', memberDisplayName));
  }

  if (interaction.isStringSelectMenu?.() && customId === 'user:search') {
    const [moduleKey] = interaction.values || [];
    if (moduleKey === 'profile') return showProfile(interaction);
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
    if (moduleMatch[1] === 'profile') return showProfile(interaction);
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
