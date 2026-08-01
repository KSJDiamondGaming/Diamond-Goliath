const { PermissionFlagsBits } = require('discord.js');
const guildManager = require('../../guild/guildManager');
const security = require('../../security/securityCore');
const leveling = require('../../../modules/communityStudio/leveling/leveling');
const invites = require('../../../modules/communityStudio/invites/invites');
const {
  buildCategoryPanel,
  buildMainPanel,
  buildModulePanel,
  buildProfilePanel,
  buildProgressPanel,
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

function countUserGiveawayActivity(guildId, userId) {
  const section = guildManager.getGuildSection(guildId, 'giveaways', {});
  const source = section.giveaways || section.items || section.records || {};
  const records = Array.isArray(source) ? source : Object.values(source && typeof source === 'object' ? source : {});
  let entries = 0;
  let wins = 0;

  for (const giveaway of records) {
    const entrants = giveaway?.entrantIds || giveaway?.entries || giveaway?.participants || giveaway?.userIds || [];
    const winners = giveaway?.winnerIds || giveaway?.winners || [];
    const entrantIds = Array.isArray(entrants)
      ? entrants.map((entry) => String(entry?.userId || entry?.id || entry))
      : Object.keys(entrants && typeof entrants === 'object' ? entrants : {});
    const winnerIds = Array.isArray(winners)
      ? winners.map((entry) => String(entry?.userId || entry?.id || entry))
      : Object.keys(winners && typeof winners === 'object' ? winners : {});
    if (entrantIds.includes(String(userId))) entries += 1;
    if (winnerIds.includes(String(userId))) wins += 1;
  }

  return { entries, wins };
}

function buildLiveProfile(interaction) {
  const section = leveling.getSection(interaction.guildId);
  const user = section.users?.[interaction.user.id] || null;
  const leaderboard = Object.values(section.users || {})
    .sort((a, b) => Number(b.xp || 0) - Number(a.xp || 0));
  const rankIndex = leaderboard.findIndex((entry) => entry.userId === interaction.user.id || entry.id === interaction.user.id);

  const inviteSection = invites.getSection(interaction.guildId);
  const inviteStats = inviteSection.inviters?.[interaction.user.id] || {};
  const giveawayStats = countUserGiveawayActivity(interaction.guildId, interaction.user.id);

  return {
    leveling: user ? {
      level: Math.max(0, Number(user.level || 0)),
      xp: Math.max(0, Number(user.xp || 0)),
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      messages: Math.max(0, Number(user.messages || 0)),
      voiceMinutes: Math.max(0, Number(user.voiceMinutes || 0)),
      currentLevelXp: leveling.xpForLevel(Math.max(0, Number(user.level || 0))),
      nextLevelXp: leveling.xpForLevel(Math.max(0, Number(user.level || 0)) + 1),
    } : null,
    invites: Math.max(0, Number(inviteStats.total || 0)),
    giveawayEntries: giveawayStats.entries,
    giveawayWins: giveawayStats.wins,
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

async function showProgress(interaction) {
  const profile = buildLiveProfile(interaction);
  if (!profile.leveling) return showProfile(interaction);
  return updatePanel(interaction, buildProgressPanel(interaction, profile.leveling));
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
  if (customId === 'user:profile:refresh' || customId === 'user:module:profile') return showProfile(interaction);

  if (customId === 'user:profile:roles' && interaction.isButton?.()) {
    const settings = getUserPanelSettings(interaction.guildId).profile;
    if (!settings.rolesEnabled) return showProfile(interaction);
    return updatePanel(interaction, buildRolesPanel(interaction, settings));
  }

  if (customId === 'user:profile:progress' && interaction.isButton?.()) return showProgress(interaction);

  if (interaction.isStringSelectMenu?.() && customId === 'user:search') {
    const [moduleKey] = interaction.values || [];
    if (moduleKey === 'social' && !canUseUserSocialStudio(interaction)) {
      return updatePanel(interaction, buildSocialAccessDeniedPanel(memberDisplayName));
    }
    return updatePanel(interaction, buildModulePanel(moduleKey, memberDisplayName));
  }

  const categoryMatch = customId.match(/^user:category:([a-zA-Z0-9_-]+)$/);
  if (categoryMatch && interaction.isButton?.()) {
    if (categoryMatch[1] === 'account') return showProfile(interaction);
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
