'use strict';

const leveling = require('./leveling');
const panel = require('./levelingPanel');
const tracking = require('./levelingTracking');
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

function numberField(interaction, id, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  const raw = interaction.fields.getTextInputValue(id).trim();
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${id} must be a valid number.`);
  const normalized = integer ? Math.round(value) : value;
  if (normalized < min || normalized > max) throw new Error(`${id} must be between ${min} and ${max}.`);
  return normalized;
}

function optionalField(interaction, id) {
  try {
    return interaction.fields.getTextInputValue(id).trim();
  } catch {
    return '';
  }
}

function refreshVoiceTracking(interaction) {
  try {
    tracking.refreshGuildVoiceSessions(interaction.guild);
  } catch (error) {
    console.error('[Leveling] Failed to refresh voice XP sessions:', error?.stack || error?.message || error);
  }
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
      return safeUpdate(interaction, panel.buildLeaderboardPanel(interaction.guild, displayName, 0, 'xp'));
    }
    const leaderboardMatch = customId.match(/^admin:leveling:leaderboard:(xp|level|messages|voice):(\d+)$/);
    if (leaderboardMatch) {
      return safeUpdate(interaction, panel.buildLeaderboardPanel(
        interaction.guild,
        displayName,
        Number(leaderboardMatch[2]),
        leaderboardMatch[1],
      ));
    }
    if (customId === 'admin:leveling:trackingRules') {
      return safeUpdate(interaction, panel.buildTrackingRulesPanel(interaction.guild, displayName));
    }
    if (customId === 'admin:leveling:ranks') {
      return safeUpdate(interaction, panel.buildRankRewardsPanel(interaction.guild, displayName));
    }
    if (customId === 'admin:leveling:ranks:add') {
      return safeUpdate(interaction, panel.buildAddRewardsPanel(interaction.guild, displayName));
    }
    if (customId === 'admin:leveling:ranks:manage') {
      return safeUpdate(interaction, panel.buildManageRewardsPanel(interaction.guild, displayName));
    }
    if (customId === 'admin:leveling:ranks:preview') {
      return safeUpdate(interaction, panel.buildRewardsPreviewPanel(interaction.guild, displayName));
    }
    const rewardViewMatch = customId.match(/^admin:leveling:ranks:view:(\d+)$/);
    if (rewardViewMatch) {
      return safeUpdate(interaction, panel.buildRewardDetailPanel(interaction.guild, Number(rewardViewMatch[1]), displayName));
    }
    const rewardDeleteMatch = customId.match(/^admin:leveling:ranks:delete:(\d+)$/);
    if (rewardDeleteMatch) {
      return safeUpdate(interaction, panel.buildDeleteRewardConfirmPanel(interaction.guild, Number(rewardDeleteMatch[1]), displayName));
    }
    const rewardEditMatch = customId.match(/^admin:leveling:ranks:edit:(\d+)$/);
    if (rewardEditMatch && interaction.isButton?.()) {
      const reward = leveling.getLevelRewards(interaction.guildId)
        .find((entry) => Number(entry.level) === Number(rewardEditMatch[1]));
      if (!reward) throw new Error('That level reward no longer exists.');
      await interaction.showModal(panel.buildEditRewardModal(reward));
      return true;
    }
    if (customId === 'admin:leveling:configureMessage' && interaction.isButton?.()) {
      await interaction.showModal(panel.buildMessageXpModal(leveling.getSection(interaction.guildId)));
      return true;
    }
    if (customId === 'admin:leveling:configureVoice' && interaction.isButton?.()) {
      await interaction.showModal(panel.buildVoiceXpModal(leveling.getSection(interaction.guildId)));
      return true;
    }
    if (customId === 'admin:leveling:configureMultiplier' && interaction.isButton?.()) {
      await interaction.showModal(panel.buildMultiplierModal(leveling.getSection(interaction.guildId)));
      return true;
    }
    if (customId === 'admin:leveling:configureRankLevels' && interaction.isButton?.()) {
      await interaction.showModal(panel.buildRankLevelsModal(leveling.getSection(interaction.guildId)));
      return true;
    }

    const save = (updater) => leveling.updateSection(interaction.guildId, updater, {
      actorId: interaction.user.id,
      action: customId,
    });

    if (interaction.isRoleSelectMenu?.() && customId === 'admin:leveling:ranks:add:roles') {
      const roleIds = [...new Set(interaction.values || [])];
      if (!roleIds.length) throw new Error('Select at least one reward role.');
      await interaction.showModal(panel.buildAddRewardLevelsModal(roleIds));
      return true;
    }

    const addLevelsMatch = customId.match(/^admin:leveling:ranks:add:levels:([0-9.]+)$/);
    if (interaction.isModalSubmit?.() && addLevelsMatch) {
      const roleIds = addLevelsMatch[1].split('.').filter(Boolean);
      const levels = interaction.fields.getTextInputValue('levels')
        .split(',')
        .map((entry) => Number(entry.trim()))
        .filter((value) => Number.isFinite(value))
        .map((value) => Math.round(value));
      if (levels.length !== roleIds.length) throw new Error(`Enter exactly ${roleIds.length} level value(s).`);
      if (levels.some((level) => level < 1 || level > 100000)) throw new Error('Reward levels must be between 1 and 100000.');
      if (new Set(levels).size !== levels.length) throw new Error('Each selected reward must use a unique level.');
      const existingLevels = new Set(leveling.getLevelRewards(interaction.guildId).map((reward) => Number(reward.level)));
      const conflicts = levels.filter((level) => existingLevels.has(level));
      if (conflicts.length) throw new Error(`Reward level(s) already exist: ${conflicts.join(', ')}`);
      leveling.addLevelRewards(interaction.guildId, roleIds.map((roleId, index) => ({
        roleId,
        level: levels[index],
      })), { actorId: interaction.user.id, action: customId });
      return safeUpdate(interaction, panel.buildRankRewardsPanel(interaction.guild, displayName));
    }

    if (interaction.isStringSelectMenu?.() && customId === 'admin:leveling:ranks:select') {
      const level = Number(interaction.values?.[0]);
      return safeUpdate(interaction, panel.buildRewardDetailPanel(interaction.guild, level, displayName));
    }

    const editSubmitMatch = customId.match(/^admin:leveling:ranks:edit:(\d+):submit$/);
    if (interaction.isModalSubmit?.() && editSubmitMatch) {
      const oldLevel = Number(editSubmitMatch[1]);
      const level = numberField(interaction, 'level', { min: 1, max: 100000, integer: true });
      const roleId = interaction.fields.getTextInputValue('roleId').replace(/[<@&>]/g, '').trim();
      const label = optionalField(interaction, 'label');
      if (!/^\d{15,25}$/.test(roleId)) throw new Error('roleId must be a valid Discord role ID.');
      const conflict = leveling.getLevelRewards(interaction.guildId)
        .some((reward) => Number(reward.level) === level && Number(reward.level) !== oldLevel);
      if (conflict) throw new Error(`A reward already exists at level ${level}.`);
      leveling.updateLevelReward(interaction.guildId, oldLevel, { level, roleId, label }, {
        actorId: interaction.user.id,
        action: customId,
      });
      return safeUpdate(interaction, panel.buildRewardDetailPanel(interaction.guild, level, displayName));
    }

    const deleteConfirmMatch = customId.match(/^admin:leveling:ranks:delete:(\d+):confirm$/);
    if (deleteConfirmMatch) {
      leveling.deleteLevelReward(interaction.guildId, Number(deleteConfirmMatch[1]), {
        actorId: interaction.user.id,
        action: customId,
      });
      return safeUpdate(interaction, panel.buildManageRewardsPanel(interaction.guild, displayName));
    }

    if (customId === 'admin:leveling:ranks:behaviour') {
      const current = leveling.getRewardBehaviour(interaction.guildId);
      const next = current === leveling.REWARD_BEHAVIOURS.HIGHEST_ONLY
        ? leveling.REWARD_BEHAVIOURS.STACK
        : leveling.REWARD_BEHAVIOURS.HIGHEST_ONLY;
      leveling.setRewardBehaviour(interaction.guildId, next, {
        actorId: interaction.user.id,
        action: customId,
      });
      return safeUpdate(interaction, panel.buildRankRewardsPanel(interaction.guild, displayName));
    }

    if (customId === 'admin:leveling:ranks:repair') {
      const result = leveling.repairMissingLevelRewards(interaction.guild, {
        actorId: interaction.user.id,
        action: customId,
      });
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
      await interaction.followUp({
        content: result.removed
          ? `🩹 Removed ${result.removed} missing reward mapping${result.removed === 1 ? '' : 's'}.`
          : '✅ No missing level reward roles were found.',
        flags: 64,
      }).catch(() => null);
      return safeUpdate(interaction, panel.buildRankRewardsPanel(interaction.guild, displayName));
    }

    if (interaction.isModalSubmit?.() && customId === 'admin:leveling:configureMessage:submit') {
      const amount = numberField(interaction, 'amount', { min: 1, max: 100000, integer: true });
      const cooldownSeconds = numberField(interaction, 'cooldown', { min: 0, max: 86400, integer: true });
      const description = optionalField(interaction, 'description');
      leveling.setXpSource(interaction.guildId, 'message', {
        amount,
        cooldownSeconds,
        description: description || 'Earn XP for eligible server messages.',
      }, { actorId: interaction.user.id, action: customId });
    } else if (interaction.isModalSubmit?.() && customId === 'admin:leveling:configureVoice:submit') {
      const amount = numberField(interaction, 'amount', { min: 1, max: 100000, integer: true });
      const intervalMinutes = numberField(interaction, 'interval', { min: 1, max: 1440, integer: true });
      const description = optionalField(interaction, 'description');
      leveling.setXpSource(interaction.guildId, 'voice', {
        amount,
        intervalMinutes,
        description: description || 'Earn XP for eligible time spent in voice channels.',
      }, { actorId: interaction.user.id, action: customId });
      refreshVoiceTracking(interaction);
    } else if (interaction.isModalSubmit?.() && customId === 'admin:leveling:configureMultiplier:submit') {
      const name = interaction.fields.getTextInputValue('name').trim();
      const value = numberField(interaction, 'value', { min: 1, max: 100 });
      const durationMinutes = numberField(interaction, 'duration', { min: 1, max: 525600, integer: true });
      const rawSources = interaction.fields.getTextInputValue('sources').trim();
      const sourceIds = /^all$/i.test(rawSources)
        ? []
        : [...new Set(rawSources.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
      const validSources = new Set(Object.keys(leveling.getSection(interaction.guildId).xpSources));
      const invalid = sourceIds.filter((sourceId) => !validSources.has(sourceId));
      if (invalid.length) throw new Error(`Unknown XP source(s): ${invalid.join(', ')}`);
      const startsAt = new Date();
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60000);
      leveling.setMultiplier(interaction.guildId, {
        enabled: value > 1,
        name: name || 'XP Multiplier',
        value,
        sourceIds,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      }, { actorId: interaction.user.id, action: customId });
    } else if (interaction.isModalSubmit?.() && customId === 'admin:leveling:configureRankLevels:submit') {
      const section = leveling.getSection(interaction.guildId);
      const roles = section.levelRewards.map((reward) => reward.roleId);
      const levels = interaction.fields.getTextInputValue('levels')
        .split(',')
        .map((entry) => Number(entry.trim()))
        .filter((value) => Number.isFinite(value))
        .map((value) => Math.round(value));
      if (!roles.length) throw new Error('Choose at least one rank reward role first.');
      if (levels.length !== roles.length) throw new Error(`Enter exactly ${roles.length} level value(s), one for each selected role.`);
      if (levels.some((level) => level < 1 || level > 100000)) throw new Error('Rank levels must be between 1 and 100000.');
      if (new Set(levels).size !== levels.length) throw new Error('Each rank reward must use a unique level.');
      leveling.setLevelRewards(interaction.guildId, roles.map((roleId, index) => ({
        roleId,
        level: levels[index],
      })), { actorId: interaction.user.id, action: customId });
      return safeUpdate(interaction, panel.buildRankRewardsPanel(interaction.guild, displayName));
    } else if (interaction.isChannelSelectMenu?.() && customId === 'admin:leveling:announceChannel') {
      save((section) => ({ ...section, announceChannelId: interaction.values?.[0] || null }));
    } else if (interaction.isRoleSelectMenu?.() && customId === 'admin:leveling:managerRoles') {
      save((section) => ({ ...section, managerRoleIds: [...new Set(interaction.values || [])] }));
    } else if (interaction.isChannelSelectMenu?.() && customId === 'admin:leveling:ignoredChannels') {
      save((section) => ({ ...section, ignoredChannelIds: [...new Set(interaction.values || [])] }));
      refreshVoiceTracking(interaction);
      return safeUpdate(interaction, panel.buildTrackingRulesPanel(interaction.guild, displayName));
    } else if (interaction.isRoleSelectMenu?.() && customId === 'admin:leveling:ignoredRoles') {
      save((section) => ({ ...section, ignoredRoleIds: [...new Set(interaction.values || [])] }));
      refreshVoiceTracking(interaction);
      return safeUpdate(interaction, panel.buildTrackingRulesPanel(interaction.guild, displayName));
    } else if (interaction.isRoleSelectMenu?.() && customId === 'admin:leveling:levelRoles') {
      const selected = [...new Set(interaction.values || [])];
      const current = leveling.getSection(interaction.guildId).levelRewards;
      leveling.setLevelRewards(interaction.guildId, selected.map((roleId, index) => ({
        level: current[index]?.level || index + 1,
        roleId,
      })), {
        actorId: interaction.user.id,
        action: customId,
      });
      return safeUpdate(interaction, panel.buildRankRewardsPanel(interaction.guild, displayName));
    } else if (customId === 'admin:leveling:enable') {
      setModuleEnabled(interaction.guildId, 'leveling', true, { actorId: interaction.user.id, action: customId });
      refreshVoiceTracking(interaction);
    } else if (customId === 'admin:leveling:disable') {
      setModuleEnabled(interaction.guildId, 'leveling', false, { actorId: interaction.user.id, action: customId });
      refreshVoiceTracking(interaction);
    } else if (customId === 'admin:leveling:toggleMessages') {
      const current = leveling.getSection(interaction.guildId).xpSources.message;
      leveling.setXpSource(interaction.guildId, 'message', { enabled: !current.enabled }, { actorId: interaction.user.id, action: customId });
    } else if (customId === 'admin:leveling:toggleVoice') {
      const current = leveling.getSection(interaction.guildId).xpSources.voice;
      leveling.setXpSource(interaction.guildId, 'voice', { enabled: !current.enabled }, { actorId: interaction.user.id, action: customId });
      refreshVoiceTracking(interaction);
    } else if (customId === 'admin:leveling:toggleAnnounce') {
      save((section) => ({ ...section, announceLevelUps: !section.announceLevelUps }));
    } else if (customId === 'admin:leveling:toggleRemovePrevious') {
      const next = leveling.getRewardBehaviour(interaction.guildId) === leveling.REWARD_BEHAVIOURS.HIGHEST_ONLY
        ? leveling.REWARD_BEHAVIOURS.STACK
        : leveling.REWARD_BEHAVIOURS.HIGHEST_ONLY;
      leveling.setRewardBehaviour(interaction.guildId, next, { actorId: interaction.user.id, action: customId });
      return safeUpdate(interaction, panel.buildRankRewardsPanel(interaction.guild, displayName));
    } else if (customId === 'admin:leveling:stopMultiplier') {
      leveling.clearMultiplier(interaction.guildId, { actorId: interaction.user.id, action: customId });
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
