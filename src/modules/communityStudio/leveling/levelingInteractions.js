'use strict';

const leveling = require('./leveling');
const panel = require('./levelingPanel');

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

    const save = (updater) => leveling.updateSection(interaction.guildId, updater, {
      actorId: interaction.user.id,
      action: customId,
    });

    if (interaction.isChannelSelectMenu?.() && customId === 'admin:leveling:announceChannel') {
      save((section) => ({ ...section, announceChannelId: interaction.values?.[0] || null }));
    } else if (interaction.isRoleSelectMenu?.() && customId === 'admin:leveling:managerRoles') {
      save((section) => ({ ...section, managerRoleIds: [...new Set(interaction.values || [])] }));
    } else if (interaction.isRoleSelectMenu?.() && customId === 'admin:leveling:levelRoles') {
      save((section) => ({ ...section, levelRoleIds: [...new Set(interaction.values || [])] }));
    } else if (customId === 'admin:leveling:enable') {
      save((section) => ({ ...section, enabled: true }));
    } else if (customId === 'admin:leveling:disable') {
      save((section) => ({ ...section, enabled: false }));
    } else if (customId === 'admin:leveling:toggleMessages') {
      save((section) => ({ ...section, trackMessages: !section.trackMessages }));
    } else if (customId === 'admin:leveling:toggleVoice') {
      save((section) => ({ ...section, trackVoice: !section.trackVoice }));
    } else if (customId === 'admin:leveling:toggleAnnounce') {
      save((section) => ({ ...section, announceLevelUps: !section.announceLevelUps }));
    } else if (customId === 'admin:leveling:xpUp') {
      save((section) => ({ ...section, xpPerMessage: Math.min(1000, Number(section.xpPerMessage || 10) + 5) }));
    } else if (customId === 'admin:leveling:xpDown') {
      save((section) => ({ ...section, xpPerMessage: Math.max(1, Number(section.xpPerMessage || 10) - 5) }));
    } else if (customId === 'admin:leveling:cooldownUp') {
      save((section) => ({ ...section, cooldownSeconds: Math.min(3600, Number(section.cooldownSeconds || 60) + 15) }));
    } else if (customId === 'admin:leveling:cooldownDown') {
      save((section) => ({ ...section, cooldownSeconds: Math.max(0, Number(section.cooldownSeconds || 60) - 15) }));
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
