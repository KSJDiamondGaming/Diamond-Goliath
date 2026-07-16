'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
} = require('discord.js');

const pollsManager = require('./pollsManager');

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function getMemberDisplayName(interaction) {
  return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';
}

function formatChannel(id) {
  return id ? `<#${id}>` : '`Not set`';
}

function formatRoles(ids = []) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  return list.length ? list.map((id) => `<@&${id}>`).join(', ') : '`None`';
}

function updateSection(guild, updater) {
  const current = pollsManager.getSection(guild.id);
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) };
  return pollsManager.saveSection(guild.id, next, guild);
}

function buildPollsAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const section = pollsManager.getSection(guild.id);
  const polls = Object.values(section.polls || {});
  const active = polls.filter((poll) => poll.status === 'active').length;

  const embed = new EmbedBuilder()
    .setColor(section.enabled !== false ? 0x57f287 : 0x5865f2)
    .setTitle('📊 Polls')
    .setDescription([
      'Configure poll channels, voting behaviour and defaults.',
      '',
      `**Status:** ${section.enabled !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Default Channel:** ${formatChannel(section.defaultChannelId || section.settings?.defaultChannelId)}`,
      `**Results Channel:** ${formatChannel(section.resultsChannelId)}`,
      `**Manager Roles:** ${formatRoles(section.managerRoleIds)}`,
      `**Anonymous Voting:** ${section.anonymousVoting ? 'Yes ✅' : 'No ❌'}`,
      `**Multiple Choice:** ${section.allowMultipleChoice ? 'Yes ✅' : 'No ❌'}`,
      `**Live Results:** ${section.showResultsLive !== false ? 'Yes ✅' : 'No ❌'}`,
      '',
      `Polls: \`${polls.length}\` | Active: \`${active}\` | Votes: \`${section.analytics.votes}\``,
      `Created: \`${section.analytics.created}\` | Deployed: \`${section.analytics.deployed}\` | Closed: \`${section.analytics.closed}\``,
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(
        new ChannelSelectMenuBuilder().setCustomId('admin:polls:defaultChannel').setPlaceholder('Default poll channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)
      ),
      row(
        new ChannelSelectMenuBuilder().setCustomId('admin:polls:resultsChannel').setPlaceholder('Results channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)
      ),
      row(
        new RoleSelectMenuBuilder().setCustomId('admin:polls:managerRoles').setPlaceholder('Manager roles').setMinValues(0).setMaxValues(10)
      ),
      row(
        button('admin:polls:deploySample', '🚀 Deploy Sample Poll', ButtonStyle.Success),
        button(section.enabled !== false ? 'admin:polls:disable' : 'admin:polls:enable', section.enabled !== false ? '⏸️ Disable' : '▶️ Enable', ButtonStyle.Secondary),
        button('admin:polls:toggleAnonymous', '👤 Anonymous', ButtonStyle.Secondary),
        button('admin:polls:toggleMultiple', '☑️ Multiple', ButtonStyle.Secondary),
        button('admin:polls:toggleLive', '📈 Live', ButtonStyle.Secondary)
      ),
      row(button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary)),
    ],
  };
}

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return true;
  }
  await interaction.update(payload);
  return true;
}

async function handlePollsAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:polls')) return false;

  const memberDisplayName = getMemberDisplayName(interaction);

  try {
    if (customId === 'admin:polls') {
      return safeUpdate(interaction, buildPollsAdminPanel(interaction.guild, memberDisplayName));
    }

    if (interaction.isChannelSelectMenu?.()) {
      const value = interaction.values?.[0] || null;
      const prop = customId.split(':')[2];
      if (prop === 'defaultChannel') updateSection(interaction.guild, (section) => ({ ...section, defaultChannelId: value, settings: { ...(section.settings || {}), defaultChannelId: value } }));
      if (prop === 'resultsChannel') updateSection(interaction.guild, (section) => ({ ...section, resultsChannelId: value }));
      return safeUpdate(interaction, buildPollsAdminPanel(interaction.guild, memberDisplayName));
    }

    if (interaction.isRoleSelectMenu?.() && customId === 'admin:polls:managerRoles') {
      updateSection(interaction.guild, (section) => ({ ...section, managerRoleIds: [...new Set(interaction.values || [])] }));
      return safeUpdate(interaction, buildPollsAdminPanel(interaction.guild, memberDisplayName));
    }

    if (customId === 'admin:polls:enable') updateSection(interaction.guild, (section) => ({ ...section, enabled: true }));
    if (customId === 'admin:polls:disable') updateSection(interaction.guild, (section) => ({ ...section, enabled: false }));
    if (customId === 'admin:polls:toggleAnonymous') updateSection(interaction.guild, (section) => ({ ...section, anonymousVoting: !section.anonymousVoting, settings: { ...(section.settings || {}), anonymousVotes: !section.anonymousVoting } }));
    if (customId === 'admin:polls:toggleMultiple') updateSection(interaction.guild, (section) => ({ ...section, allowMultipleChoice: !section.allowMultipleChoice, settings: { ...(section.settings || {}), allowMultipleVotes: !section.allowMultipleChoice } }));
    if (customId === 'admin:polls:toggleLive') updateSection(interaction.guild, (section) => ({ ...section, showResultsLive: !section.showResultsLive }));

    if (customId === 'admin:polls:deploySample') {
      await interaction.deferUpdate().catch(() => null);
      await pollsManager.deploySamplePoll(interaction.guild, interaction.user.id);
      return safeUpdate(interaction, buildPollsAdminPanel(interaction.guild, memberDisplayName));
    }

    return safeUpdate(interaction, buildPollsAdminPanel(interaction.guild, memberDisplayName));
  } catch (error) {
    const payload = { content: `❌ Polls setup failed: ${error.message}`, flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = {
  buildPollsAdminPanel,
  handlePollsAdminInteraction,
};
