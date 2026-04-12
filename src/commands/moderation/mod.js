const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags
} = require('discord.js');

const { getNextEscalationPreview } = require('../../utils/moderation/escalationSystem');

function formatRoles(member, guild) {
  return member.roles.cache
    .filter(r => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map(r => r.toString())
    .slice(0, 10)
    .join(', ') || 'No roles';
}

function buildModPanelEmbed(guild, moderator, target = null, extra = {}) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🛡️ Moderation Panel')
    .setDescription('Manage users or use bulk moderation tools.')
    .addFields(
      { name: 'Moderator', value: `${moderator}`, inline: true },
      {
        name: 'Selected User',
        value: target
          ? `${target}\n\`${target.user.tag}\`\nID: \`${target.id}\``
          : 'None selected',
        inline: true
      },
      { name: 'Server', value: guild.name, inline: true }
    )
    .setTimestamp();

  const icon = guild.iconURL({ dynamic: true });
  if (icon) embed.setThumbnail(icon);

  if (!target) {
    embed.addFields({
      name: 'Bulk Tools',
      value: '**Warn • Timeout • Kick • Ban**'
    });
    return embed;
  }

  embed.addFields(
    {
      name: 'Joined',
      value: target.joinedTimestamp
        ? `<t:${Math.floor(target.joinedTimestamp / 1000)}:F>`
        : 'Unknown',
      inline: true
    },
    {
      name: 'Created',
      value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:F>`,
      inline: true
    },
    {
      name: 'Top Role',
      value:
        target.roles.highest?.id !== guild.id
          ? target.roles.highest.toString()
          : 'None',
      inline: true
    },
    {
      name: 'Roles',
      value: formatRoles(target, guild),
      inline: false
    },
    {
      name: 'Warnings',
      value: String(extra.warningCount ?? 0),
      inline: true
    },
    {
      name: 'Cases',
      value: String(extra.caseCount ?? 0),
      inline: true
    },
    {
      name: 'Next Escalation',
      value: getNextEscalationPreview(guild.id, target.id),
      inline: false
    }
  );

  if (extra.lastCaseSummary) {
    embed.addFields({
      name: 'Latest Case',
      value: extra.lastCaseSummary
    });
  }

  return embed;
}

function buildButton(id, label, emoji, style, disabled = false) {
  return new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setEmoji(emoji)
    .setStyle(style)
    .setDisabled(disabled);
}

function buildModPanelRows(targetId = null) {
  const hasTarget = !!targetId;

  return [
    new ActionRowBuilder().addComponents(
      buildButton('mod_select_user', 'Select', '🔍', ButtonStyle.Primary),
      buildButton(`mod_refresh:${targetId || 'none'}`, 'Refresh', '🔄', ButtonStyle.Secondary),
      buildButton(`mod_view_cases:${targetId || 'none'}:0`, 'Cases', '📜', ButtonStyle.Secondary, !hasTarget)
    ),
    new ActionRowBuilder().addComponents(
      buildButton(`mod_open_ban:${targetId}`, 'Ban', '🔨', ButtonStyle.Danger, !hasTarget),
      buildButton(`mod_open_kick:${targetId}`, 'Kick', '👢', ButtonStyle.Danger, !hasTarget),
      buildButton(`mod_open_warn:${targetId}`, 'Warn', '⚠️', ButtonStyle.Secondary, !hasTarget),
      buildButton(`mod_open_timeout:${targetId}`, 'Timeout', '⏳', ButtonStyle.Secondary, !hasTarget),
      buildButton(`mod_remove_timeout:${targetId}`, 'Un-timeout', '✅', ButtonStyle.Success, !hasTarget)
    ),
    new ActionRowBuilder().addComponents(
      buildButton(`mod_case_detail:${targetId}`, 'Details', '🧾', ButtonStyle.Secondary, !hasTarget),
      buildButton(`mod_edit_case:${targetId}`, 'Edit', '✏️', ButtonStyle.Secondary, !hasTarget),
      buildButton(`mod_remove_warning:${targetId}`, 'Unwarn', '🗑️', ButtonStyle.Secondary, !hasTarget)
    )
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Open moderation panel')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers |
      PermissionFlagsBits.KickMembers |
      PermissionFlagsBits.BanMembers
    ),

  async execute(interaction) {
    const embed = buildModPanelEmbed(interaction.guild, interaction.member);
    const rows = buildModPanelRows();

    const payload = {
      embeds: [embed],
      components: rows,
      flags: MessageFlags.Ephemeral
    };

    return interaction.reply(payload);
  },

  buildModPanelEmbed,
  buildModPanelRows
};