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

const suggestionsStore = require('../../../modules/suggestions/suggestionsStore');
const suggestionsManager = require('../../../modules/suggestions/suggestionsManager');

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

function buildSuggestionsAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const section = suggestionsStore.getSection(guild.id);
  const embed = new EmbedBuilder()
    .setColor(section.enabled !== false ? 0x57f287 : 0x5865f2)
    .setTitle('💡 Suggestions')
    .setDescription([
      'Configure suggestion intake, review and voting.',
      '',
      `**Status:** ${section.enabled !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Submit Channel:** ${formatChannel(section.submitChannelId)}`,
      `**Review Channel:** ${formatChannel(section.reviewChannelId)}`,
      `**Approved Channel:** ${formatChannel(section.approvedChannelId)}`,
      `**Denied Channel:** ${formatChannel(section.deniedChannelId)}`,
      `**Reviewer Roles:** ${formatRoles(section.reviewerRoleIds)}`,
      `**Voting:** ${section.voting !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Require Review:** ${section.requireReview !== false ? 'Yes ✅' : 'No ❌'}`,
      `**Anonymous:** ${section.anonymous === true ? 'Yes ✅' : 'No ❌'}`,
      '',
      `Submitted: \`${section.analytics.submitted}\` | Approved: \`${section.analytics.approved}\` | Denied: \`${section.analytics.denied}\``,
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(
        new ChannelSelectMenuBuilder().setCustomId('admin:suggestions:submitChannel').setPlaceholder('Submit channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)
      ),
      row(
        new ChannelSelectMenuBuilder().setCustomId('admin:suggestions:reviewChannel').setPlaceholder('Review channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)
      ),
      row(
        new RoleSelectMenuBuilder().setCustomId('admin:suggestions:reviewerRoles').setPlaceholder('Reviewer roles').setMinValues(0).setMaxValues(10)
      ),
      row(
        button('admin:suggestions:deploy', '🚀 Deploy Submit Panel', ButtonStyle.Success),
        button(section.enabled !== false ? 'admin:suggestions:disable' : 'admin:suggestions:enable', section.enabled !== false ? '⏸️ Disable' : '▶️ Enable', ButtonStyle.Secondary),
        button('admin:suggestions:toggleVoting', '🗳️ Voting', ButtonStyle.Secondary),
        button('admin:suggestions:toggleReview', '🔎 Review', ButtonStyle.Secondary),
        button('admin:suggestions:toggleAnonymous', '👤 Anonymous', ButtonStyle.Secondary)
      ),
      row(button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary)),
    ],
  };
}

function save(guild, updater) {
  return suggestionsStore.updateSection(guild.id, updater, guild);
}

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return true;
  }
  await interaction.update(payload);
  return true;
}

async function handleSuggestionsAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:suggestions')) return false;

  const memberDisplayName = getMemberDisplayName(interaction);

  try {
    if (customId === 'admin:suggestions') {
      return safeUpdate(interaction, buildSuggestionsAdminPanel(interaction.guild, memberDisplayName));
    }

    if (interaction.isChannelSelectMenu?.()) {
      const value = interaction.values?.[0] || null;
      const prop = customId.split(':')[2];
      if (['submitChannel', 'reviewChannel', 'approvedChannel', 'deniedChannel'].includes(prop)) {
        const key = `${prop}Id`;
        save(interaction.guild, (section) => ({ ...section, [key]: value }));
      }
      return safeUpdate(interaction, buildSuggestionsAdminPanel(interaction.guild, memberDisplayName));
    }

    if (interaction.isRoleSelectMenu?.() && customId === 'admin:suggestions:reviewerRoles') {
      save(interaction.guild, (section) => ({ ...section, reviewerRoleIds: [...new Set(interaction.values || [])] }));
      return safeUpdate(interaction, buildSuggestionsAdminPanel(interaction.guild, memberDisplayName));
    }

    if (customId === 'admin:suggestions:enable') save(interaction.guild, (section) => ({ ...section, enabled: true }));
    if (customId === 'admin:suggestions:disable') save(interaction.guild, (section) => ({ ...section, enabled: false }));
    if (customId === 'admin:suggestions:toggleVoting') save(interaction.guild, (section) => ({ ...section, voting: !section.voting }));
    if (customId === 'admin:suggestions:toggleReview') save(interaction.guild, (section) => ({ ...section, requireReview: !section.requireReview }));
    if (customId === 'admin:suggestions:toggleAnonymous') save(interaction.guild, (section) => ({ ...section, anonymous: !section.anonymous }));

    if (customId === 'admin:suggestions:deploy') {
      await interaction.deferUpdate().catch(() => null);
      await suggestionsManager.deploySubmitPanel(interaction.guild);
      return safeUpdate(interaction, buildSuggestionsAdminPanel(interaction.guild, memberDisplayName));
    }

    return safeUpdate(interaction, buildSuggestionsAdminPanel(interaction.guild, memberDisplayName));
  } catch (error) {
    const payload = { content: `❌ Suggestions setup failed: ${error.message}`, flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = {
  buildSuggestionsAdminPanel,
  handleSuggestionsAdminInteraction,
};
