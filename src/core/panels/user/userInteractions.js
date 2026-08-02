const guildManager = require('../../guild/guildManager');
const leveling = require('../../../modules/communityStudio/leveling/leveling');
const invites = require('../../../modules/communityStudio/invites/invites');
const socialStudio = require('../../../modules/socialStudio/socialAlerts/socialStudio');
const notesUserPanel = require('../../../modules/utilityStudio/notes/notesUserPanel');
const pingCommand = require('../../../commands/utility/ping');
const helpCommand = require('../../../commands/utility/help');
const serverInfoCommand = require('../../../commands/utility/serverinfo');
const translateCommand = require('../../../commands/utility/translate');
const profileDevelopmentPage = require('./profileDevelopmentPage');
const {
  buildCategoryPanel,
  buildModulePanel,
  buildProfilePanel,
  buildAccountRecordPanel,
  buildInProgressPanel,
  buildHelpPanel,
  buildProgressPanel,
  buildRolesPanel,
} = require('./userPanel');

function getMemberDisplayName(interaction) {
  return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';
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
      showProgressSummary: profile.showProgressSummary !== false,
    },
  };
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
  const leaderboard = Object.values(section.users || {}).sort((a, b) => Number(b.xp || 0) - Number(a.xp || 0));
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

function buildUserHomePanel(interaction) {
  const settings = getUserPanelSettings(interaction.guildId);
  const payload = buildProfilePanel(interaction, buildLiveProfile(interaction), settings.profile);
  return profileDevelopmentPage.sortNonNavigationButtons(payload);
}

async function updatePanel(interaction, payload) {
  const sortedPayload = profileDevelopmentPage.sortNonNavigationButtons(payload);
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(sortedPayload);
    return true;
  }
  await interaction.update(sortedPayload);
  return true;
}

async function executeUtilityCommand(interaction, command) {
  await command.execute(interaction);
  return true;
}

async function showProfile(interaction) {
  return updatePanel(interaction, buildUserHomePanel(interaction));
}

async function showProgress(interaction) {
  const profile = buildLiveProfile(interaction);
  if (!profile.leveling) return showProfile(interaction);
  return updatePanel(interaction, buildProgressPanel(interaction, profile.leveling));
}

async function delegateModuleUserInteraction(interaction) {
  if (await socialStudio.user.handleInteraction(interaction, updatePanel)) return true;
  if (await notesUserPanel.user.handleInteraction(interaction, updatePanel)) return true;
  return false;
}

async function handleUserPanelInteraction(interaction) {
  const customId = String(interaction?.customId || '');
  if (!customId.startsWith('user:')) return false;
  if (!interaction.guild) {
    await interaction.reply({ content: 'This panel can only be used inside a server.', flags: 64 });
    return true;
  }

  if (await delegateModuleUserInteraction(interaction)) return true;

  const memberDisplayName = getMemberDisplayName(interaction);

  if (customId === 'user:close' && interaction.isButton?.()) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
    await interaction.deleteReply().catch(() => null);
    return true;
  }

  if (customId === 'user:home') return showProfile(interaction);
  if (customId === 'user:account:record' && interaction.isButton?.()) return updatePanel(interaction, buildAccountRecordPanel(memberDisplayName));
  if (customId === 'user:help' && interaction.isButton?.()) return updatePanel(interaction, buildHelpPanel(memberDisplayName));
  if (customId === 'user:preferences' && interaction.isButton?.()) return updatePanel(interaction, profileDevelopmentPage.buildPreferencesDevelopmentPanel(interaction));

  const inProgressMatch = customId.match(/^user:in-progress:(\d+)$/);
  if (inProgressMatch && interaction.isButton?.()) return updatePanel(interaction, buildInProgressPanel(memberDisplayName, Number(inProgressMatch[1])));

  if (customId === 'user:profile:refresh' || customId === 'user:module:profile') return showProfile(interaction);

  if (customId === 'user:profile:roles' && interaction.isButton?.()) {
    const settings = getUserPanelSettings(interaction.guildId).profile;
    if (!settings.rolesEnabled) return showProfile(interaction);
    return updatePanel(interaction, buildRolesPanel(interaction, settings));
  }

  if (customId === 'user:profile:progress' && interaction.isButton?.()) return showProgress(interaction);

  if (interaction.isStringSelectMenu?.() && customId === 'user:search') {
    const [moduleKey] = interaction.values || [];
    if (moduleKey === 'notes') return updatePanel(interaction, notesUserPanel.user.buildPanel(interaction));
    if (moduleKey === 'social') return updatePanel(interaction, socialStudio.user.buildLanding(interaction));
    if (moduleKey === 'ping') return executeUtilityCommand(interaction, pingCommand);
    if (moduleKey === 'help') return executeUtilityCommand(interaction, helpCommand);
    if (moduleKey === 'serverinfo') return executeUtilityCommand(interaction, serverInfoCommand);
    if (moduleKey === 'translate') return executeUtilityCommand(interaction, translateCommand);
    return updatePanel(interaction, buildModulePanel(moduleKey, memberDisplayName));
  }

  const categoryMatch = customId.match(/^user:category:([a-zA-Z0-9_-]+)$/);
  if (categoryMatch && interaction.isButton?.()) return updatePanel(interaction, buildCategoryPanel(categoryMatch[1], memberDisplayName));

  const moduleMatch = customId.match(/^user:module:([a-zA-Z0-9_-]+)$/);
  if (moduleMatch && interaction.isButton?.()) {
    const moduleKey = moduleMatch[1];
    if (moduleKey === 'profile') return showProfile(interaction);
    if (moduleKey === 'ping') return executeUtilityCommand(interaction, pingCommand);
    if (moduleKey === 'help') return executeUtilityCommand(interaction, helpCommand);
    if (moduleKey === 'serverinfo') return executeUtilityCommand(interaction, serverInfoCommand);
    if (moduleKey === 'translate') return executeUtilityCommand(interaction, translateCommand);

    const placeholders = {
      'role-history': ['📜 Role History — Development', 'Role history access will be designed and connected in a later stage.'],
      'security-notifications': ['🔔 Security Notifications — Development', 'Member security notifications will be designed and connected in a later stage.'],
      verification: ['✅ Verification — Development', 'Member verification status will be designed and connected in a later stage.'],
    };
    if (placeholders[moduleKey]) {
      return updatePanel(interaction, profileDevelopmentPage.buildSimpleDevelopmentPanel(interaction, placeholders[moduleKey][0], placeholders[moduleKey][1]));
    }

    return updatePanel(interaction, buildModulePanel(moduleKey, memberDisplayName));
  }

  return false;
}

module.exports = {
  handleUserPanelInteraction,
  canUseUserSocialStudio: (interaction) => socialStudio.user.canAccess(interaction),
  buildUserHomePanel,
};