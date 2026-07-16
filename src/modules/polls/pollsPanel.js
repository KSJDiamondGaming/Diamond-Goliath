'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  AttachmentBuilder,
} = require('discord.js');

const polls = require('./polls');
const pollsHealth = require('./pollsHealth');

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

function updateSection(guild, updater, actorId = null) {
  const current = polls.getSection(guild.id);
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) };
  return polls.saveSection(guild.id, next, { actorId });
}

function buildPollsAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const section = polls.getSection(guild.id);
  const pollList = Object.values(section.polls || {});
  const active = pollList.filter((poll) => poll.status === 'active').length;

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
      `**Auto Close:** ${Number(section.settings?.autoCloseHours || 0) > 0 ? `${section.settings.autoCloseHours} hour(s)` : 'Disabled'}`,
      '',
      `Polls: \`${pollList.length}\` | Active: \`${active}\` | Votes: \`${section.analytics.votes || 0}\``,
      `Created: \`${section.analytics.created || 0}\` | Deployed: \`${section.analytics.deployed || 0}\` | Closed: \`${section.analytics.closed || 0}\``,
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
      row(
        button('admin:polls:health', '🩺 Health', ButtonStyle.Secondary),
        button('admin:polls:repair', '🛠️ Repair', ButtonStyle.Primary),
        button('admin:polls:export', '📤 Export', ButtonStyle.Secondary),
        button('admin:polls:reset', '🗑️ Reset', ButtonStyle.Danger),
        button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary)
      ),
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
  const actorId = interaction.user?.id || null;

  try {
    if (customId === 'admin:polls') {
      return safeUpdate(interaction, buildPollsAdminPanel(interaction.guild, memberDisplayName));
    }

    if (interaction.isChannelSelectMenu?.()) {
      const value = interaction.values?.[0] || null;
      const prop = customId.split(':')[2];
      if (prop === 'defaultChannel') updateSection(interaction.guild, (section) => ({ ...section, defaultChannelId: value, settings: { ...(section.settings || {}), defaultChannelId: value } }), actorId);
      if (prop === 'resultsChannel') updateSection(interaction.guild, (section) => ({ ...section, resultsChannelId: value }), actorId);
      return safeUpdate(interaction, buildPollsAdminPanel(interaction.guild, memberDisplayName));
    }

    if (interaction.isRoleSelectMenu?.() && customId === 'admin:polls:managerRoles') {
      updateSection(interaction.guild, (section) => ({ ...section, managerRoleIds: [...new Set(interaction.values || [])] }), actorId);
      return safeUpdate(interaction, buildPollsAdminPanel(interaction.guild, memberDisplayName));
    }

    if (customId === 'admin:polls:enable') updateSection(interaction.guild, (section) => ({ ...section, enabled: true }), actorId);
    if (customId === 'admin:polls:disable') updateSection(interaction.guild, (section) => ({ ...section, enabled: false }), actorId);
    if (customId === 'admin:polls:toggleAnonymous') updateSection(interaction.guild, (section) => ({ ...section, anonymousVoting: !section.anonymousVoting, settings: { ...(section.settings || {}), anonymousVotes: !section.anonymousVoting } }), actorId);
    if (customId === 'admin:polls:toggleMultiple') updateSection(interaction.guild, (section) => ({ ...section, allowMultipleChoice: !section.allowMultipleChoice, settings: { ...(section.settings || {}), allowMultipleVotes: !section.allowMultipleChoice } }), actorId);
    if (customId === 'admin:polls:toggleLive') updateSection(interaction.guild, (section) => ({ ...section, showResultsLive: !section.showResultsLive }), actorId);

    if (customId === 'admin:polls:deploySample') {
      await interaction.deferUpdate().catch(() => null);
      await polls.deploySamplePoll(interaction.guild, actorId);
      return safeUpdate(interaction, buildPollsAdminPanel(interaction.guild, memberDisplayName));
    }

    if (customId === 'admin:polls:health') {
      await interaction.deferReply({ flags: 64 }).catch(() => null);
      const health = await pollsHealth.buildHealth(interaction.guild);
      const issueLines = health.issues.length
        ? health.issues.slice(0, 10).map((issue) => `• ${issue.code}${issue.pollId ? ` — ${issue.pollId}` : ''}`)
        : ['• No issues found.'];
      await interaction.editReply({ content: `**Polls Health:** ${health.healthy ? 'Healthy ✅' : 'Needs attention ⚠️'}\n${issueLines.join('\n')}` });
      return true;
    }

    if (customId === 'admin:polls:repair') {
      await interaction.deferReply({ flags: 64 }).catch(() => null);
      const result = await pollsHealth.repair(interaction.guild, { actorId });
      await interaction.editReply({ content: `Poll repair complete. Repaired: **${result.repaired.length}** · Failed: **${result.failed.length}**.` });
      return true;
    }

    if (customId === 'admin:polls:export') {
      const exported = pollsHealth.exportConfig(interaction.guild.id);
      const attachment = new AttachmentBuilder(Buffer.from(JSON.stringify(exported, null, 2)), { name: `polls-${interaction.guild.id}.json` });
      await interaction.reply({ content: 'Poll configuration export.', files: [attachment], flags: 64 });
      return true;
    }

    if (customId === 'admin:polls:reset') {
      return safeUpdate(interaction, {
        content: 'This deletes every tracked poll message and resets the Polls module. Confirm?',
        embeds: [],
        components: [row(button('admin:polls:resetConfirm', 'Confirm Reset', ButtonStyle.Danger), button('admin:polls', 'Cancel', ButtonStyle.Secondary))],
      });
    }

    if (customId === 'admin:polls:resetConfirm') {
      await interaction.deferUpdate().catch(() => null);
      await pollsHealth.reset(interaction.guild, { actorId });
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
