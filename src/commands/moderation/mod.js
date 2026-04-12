const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags
} = require('discord.js');

function buildModPanelEmbed(guild, moderator, targetMember = null, extra = {}) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🛡️ Moderation Panel')
    .setDescription('Select a member, then choose a moderation action below.')
    .addFields(
      {
        name: 'Moderator',
        value: `${moderator}`,
        inline: true
      },
      {
        name: 'Selected User',
        value: targetMember
          ? `${targetMember}\n\`${targetMember.user.tag}\`\nID: \`${targetMember.id}\``
          : 'None selected',
        inline: true
      },
      {
        name: 'Server',
        value: guild.name,
        inline: true
      }
    )
    .setTimestamp();

  const icon = guild.iconURL({ dynamic: true });
  if (icon) embed.setThumbnail(icon);

  if (targetMember) {
    const roles = targetMember.roles.cache
      .filter(role => role.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map(role => role.toString())
      .slice(0, 10);

    embed.addFields(
      {
        name: 'Joined Server',
        value: targetMember.joinedTimestamp
          ? `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:F>`
          : 'Unknown',
        inline: true
      },
      {
        name: 'Account Created',
        value: `<t:${Math.floor(targetMember.user.createdTimestamp / 1000)}:F>`,
        inline: true
      },
      {
        name: 'Top Role',
        value:
          targetMember.roles.highest?.id !== guild.id
            ? targetMember.roles.highest.toString()
            : 'None',
        inline: true
      },
      {
        name: 'Roles',
        value: roles.length ? roles.join(', ') : 'No roles',
        inline: false
      }
    );

    if (typeof extra.warningCount === 'number') {
      embed.addFields({
        name: 'Warnings',
        value: String(extra.warningCount),
        inline: true
      });
    }

    if (typeof extra.caseCount === 'number') {
      embed.addFields({
        name: 'Cases',
        value: String(extra.caseCount),
        inline: true
      });
    }

    if (extra.lastCaseSummary) {
      embed.addFields({
        name: 'Latest Case',
        value: extra.lastCaseSummary,
        inline: false
      });
    }
  }

  return embed;
}

function buildModPanelRows(targetId = null) {
  const hasTarget = Boolean(targetId);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mod_select_user')
      .setLabel('Select User')
      .setEmoji('🔍')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`mod_refresh:${targetId || 'none'}`)
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`mod_view_cases:${targetId || 'none'}:0`)
      .setLabel('View Cases')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasTarget)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mod_open_ban:${targetId || 'none'}`)
      .setLabel('Ban')
      .setEmoji('🔨')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!hasTarget),
    new ButtonBuilder()
      .setCustomId(`mod_open_kick:${targetId || 'none'}`)
      .setLabel('Kick')
      .setEmoji('👢')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!hasTarget),
    new ButtonBuilder()
      .setCustomId(`mod_open_warn:${targetId || 'none'}`)
      .setLabel('Warn')
      .setEmoji('⚠️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasTarget),
    new ButtonBuilder()
      .setCustomId(`mod_open_timeout:${targetId || 'none'}`)
      .setLabel('Timeout')
      .setEmoji('⏳')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasTarget),
    new ButtonBuilder()
      .setCustomId(`mod_remove_timeout:${targetId || 'none'}`)
      .setLabel('Remove Timeout')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!hasTarget)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mod_case_detail:${targetId || 'none'}`)
      .setLabel('Case Detail')
      .setEmoji('🧾')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasTarget),
    new ButtonBuilder()
      .setCustomId(`mod_edit_case:${targetId || 'none'}`)
      .setLabel('Edit Case')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasTarget),
    new ButtonBuilder()
      .setCustomId(`mod_remove_warning:${targetId || 'none'}`)
      .setLabel('Remove Warning')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasTarget)
  );

  return [row1, row2, row3];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Open the moderation panel')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers |
      PermissionFlagsBits.KickMembers |
      PermissionFlagsBits.BanMembers
    ),

  async execute(interaction) {
    const embed = buildModPanelEmbed(interaction.guild, interaction.member, null);
    const rows = buildModPanelRows();

    const payload = {
      embeds: [embed],
      components: rows,
      flags: MessageFlags.Ephemeral
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
  },

  buildModPanelEmbed,
  buildModPanelRows
}