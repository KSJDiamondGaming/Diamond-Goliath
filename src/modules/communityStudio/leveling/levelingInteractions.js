'use strict';

const leveling = require('./leveling');
const panel = require('./levelingPanel');
const { setModuleEnabled } = require('../../../core/guild/guildManager');

const memberName = (interaction) => interaction.member?.displayName
  || interaction.user?.displayName
  || interaction.user?.username
  || 'Unknown User';

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.update(payload);
  return true;
}

async function handleLevelingInteraction(interaction) {
  const customId = String(interaction?.customId || '');
  if (!customId.startsWith('admin:leveling')) return false;
  const displayName = memberName(interaction);

  try {
    if (customId === 'admin:leveling') {
      return safeUpdate(interaction, panel.buildLevelingPanel(interaction.guild, displayName));
    }
    if (customId === 'admin:leveling:leaderboard') {
      return safeUpdate(interaction, panel.buildLeaderboardPanel(interaction.guild, displayName));
    }

    const save = (updater) => leveling.updateSection(interaction.guildId, updater, {
      actorId: interaction.user.id,
      action: customId,
    });

    if (interaction.isChannelSelectMenu?.() && customId === 'admin:leveling:announceChannel') {
      save((section) => ({ ...section, announceChannelId: interaction.values?.[0] || null }));
    } else if (interaction.isRoleSelectMenu?.() && customId === 'admin:leveling:managerRoles') {
      save((section) => ({ ...section, managerRoleIds: [...new Set(interaction.values || [])] }));
    } else if (interaction.isRoleSelectMenu?.() && customId === 'admin:leveling:levelRoles') {
      const selected = [...new Set(interaction.values || [])];
      leveling.setLevelRewards(interaction.guildId, selected.map((roleId, index) => ({
        level: index + 1,
        roleId,
      })), {
        actorId: interaction.user.id,
        action: customId,
      });
    } else if (customId === 'admin:leveling:enable') {
      setModuleEnabled(interaction.guildId, 'leveling', true, { actorId: interaction.user.id, action: customId });
    } else if (customId === 'admin:leveling:disable') {
      setModuleEnabled(interaction.guildId, 'leveling', false, { actorId: interaction.user.id, action: customId });
    } else if (customId === 'admin:leveling:toggleMessages') {
      const current = leveling.getSection(interaction.guildId).xpSources.message;
      leveling.setXpSource(interaction.guildId, 'message', { enabled: !current.enabled }, { actorId: interaction.user.id, action: customId });
    } else if (customId === 'admin:leveling:toggleVoice') {
      const current = leveling.getSection(interaction.guildId).xpSources.voice;
      leveling.setXpSource(interaction.guildId, 'voice', { enabled: !current.enabled }, { actorId: interaction.user.id, action: customId });
    } else if (customId === 'admin:leveling:toggleAnnounce') {
      save((section) => ({ ...section, announceLevelUps: !section.announceLevelUps }));
    } else if (customId === 'admin:leveling:toggleRemovePrevious') {
      save((section) => ({ ...section, removePreviousLevelRoles: !section.removePreviousLevelRoles }));
    } else if (customId === 'admin:leveling:xpUp') {
      const current = leveling.getSection(interaction.guildId).xpSources.message;
      leveling.setXpSource(interaction.guildId, 'message', { amount: Math.min(1000, Number(current.amount || 10) + 5) }, { actorId: interaction.user.id, action: customId });
    } else if (customId === 'admin:leveling:xpDown') {
      const current = leveling.getSection(interaction.guildId).xpSources.message;
      leveling.setXpSource(interaction.guildId, 'message', { amount: Math.max(1, Number(current.amount || 10) - 5) }, { actorId: interaction.user.id, action: customId });
    } else if (customId === 'admin:leveling:multiplierToggle') {
      const active = leveling.getActiveMultiplier(interaction.guildId, null);
      if (active) {
        leveling.clearMultiplier(interaction.guildId, { actorId: interaction.user.id, action: customId });
      } else {
        const startsAt = new Date();
        const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
        leveling.setMultiplier(interaction.guildId, {
          enabled: true,
          name: 'Double XP Hour',
          value: 2,
          sourceIds: [],
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        }, { actorId: interaction.user.id, action: customId });
      }
    } else {
      return false;
    }

    return safeUpdate(interaction, panel.buildLevelingPanel(interaction.guild, displayName));
  } catch (error) {
    const payload = { content: `❌ Leveling setup failed: ${error.message}`, flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = { handleLevelingInteraction };
