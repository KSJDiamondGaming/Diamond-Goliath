const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ComponentType,
} = require('discord.js');

const {
  addPunishment,
  getPunishments,
} = require('../../utils/tempPunishmentsStore');

function trimText(text, max = 1024) {
  if (!text) return 'No reason provided.';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatMinutes(minutes) {
  const mins = Number(minutes);
  if (!Number.isInteger(mins) || mins < 1) return null;

  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const remainingMinutes = mins % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (remainingMinutes) parts.push(`${remainingMinutes}m`);

  return parts.join(' ') || `${mins}m`;
}

function buildInfoEmbed(interaction, member) {
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🛡️ Moderation Panel')
    .setDescription(`Choose an action for ${member}.`)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: 'Member',
        value: `${member}\n\`${member.user.tag}\`\n\`${member.id}\``,
        inline: true,
      },
      {
        name: 'Joined',
        value: member.joinedAt
          ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
          : 'Unknown',
        inline: true,
      },
      {
        name: 'Created',
        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
        inline: true,
      }
    );
}

function buildSuccessEmbed(title, description, member, moderator) {
  return new EmbedBuilder()
    .setColor('#57F287')
    .setTitle(title)
    .setDescription(description)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: 'Member',
        value: `${member}\n\`${member.id}\``,
        inline: true,
      },
      {
        name: 'Moderator',
        value: `${moderator}\n\`${moderator.id}\``,
        inline: true,
      }
    )
    .setTimestamp();
}

function buildErrorEmbed(title, description) {
  return new EmbedBuilder()
    .setColor('#ED4245')
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function canAct(interaction, member) {
  if (!member) {
    return {
      ok: false,
      embed: buildErrorEmbed(
        '❌ Member Not Found',
        'That member could not be found in this server.'
      ),
    };
  }

  if (member.id === interaction.user.id) {
    return {
      ok: false,
      embed: buildErrorEmbed(
        '❌ Action Failed',
        'You cannot moderate yourself with this panel.'
      ),
    };
  }

  if (member.id === interaction.client.user.id) {
    return {
      ok: false,
      embed: buildErrorEmbed('❌ Action Failed', 'I cannot moderate myself.'),
    };
  }

  if (
    interaction.guild.ownerId !== interaction.user.id &&
    interaction.member.roles.highest.position <= member.roles.highest.position
  ) {
    return {
      ok: false,
      embed: buildErrorEmbed(
        '❌ Action Failed',
        'You cannot moderate a member with the same or higher role.'
      ),
    };
  }

  return { ok: true };
}

function createActionModal(action, memberId) {
  const titleMap = {
    warn: 'Warn Member',
    kick: 'Kick Member',
    ban: 'Ban Member',
    timeout: 'Timeout Member',
    tempmute: 'Temporary Mute Member',
    tempban: 'Temporary Ban Member',
  };

  const modal = new ModalBuilder()
    .setCustomId(`mod_modal_${action}_${memberId}`)
    .setTitle(titleMap[action] || 'Moderation Action');

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  const rows = [new ActionRowBuilder().addComponents(reasonInput)];

  if (action === 'timeout' || action === 'tempmute' || action === 'tempban') {
    const durationInput = new TextInputBuilder()
      .setCustomId('duration')
      .setLabel('Duration in minutes')
      .setPlaceholder('Example: 10, 60, 1440')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10);

    rows.unshift(new ActionRowBuilder().addComponents(durationInput));
  }

  modal.addComponents(...rows);
  return modal;
}

function hasActiveTempPunishment(guildId, userId, type) {
  const punishments = getPunishments();

  return punishments.find(
    (p) =>
      p.guildId === guildId &&
      p.userId === userId &&
      p.type === type &&
      Number(p.expiresAt) > Date.now()
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Open the moderation action panel for a member')
    .addUserOption((option) =>
      option
        .setName('member')
        .setDescription('The member to moderate')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('member', true);
    const member = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    const allowed = canAct(interaction, member);
    if (!allowed.ok) {
      return interaction.reply({
        embeds: [allowed.embed],
        ephemeral: true,
      });
    }

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_action_warn_${member.id}`)
        .setLabel('Warn')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`mod_action_kick_${member.id}`)
        .setLabel('Kick')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`mod_action_ban_${member.id}`)
        .setLabel('Ban')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`mod_action_timeout_${member.id}`)
        .setLabel('Timeout')
        .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_action_tempmute_${member.id}`)
        .setLabel('Temp Mute')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`mod_action_tempban_${member.id}`)
        .setLabel('Temp Ban')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
      embeds: [buildInfoEmbed(interaction, member)],
      components: [row1, row2],
      ephemeral: true,
    });

    const reply = await interaction.fetchReply();

    let buttonInteraction;
    try {
      buttonInteraction = await reply.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 60_000,
        filter: (i) => i.user.id === interaction.user.id,
      });
    } catch {
      return interaction.editReply({
        components: [],
      });
    }

    const [, , action, memberId] = buttonInteraction.customId.split('_');
    const freshMember = await interaction.guild.members
      .fetch(memberId)
      .catch(() => null);

    const allowedAgain = canAct(interaction, freshMember);
    if (!allowedAgain.ok) {
      return buttonInteraction.update({
        embeds: [allowedAgain.embed],
        components: [],
      });
    }

    const modal = createActionModal(action, memberId);
    await buttonInteraction.showModal(modal);

    let modalInteraction;
    try {
      modalInteraction = await buttonInteraction.awaitModalSubmit({
        time: 120_000,
        filter: (i) =>
          i.user.id === interaction.user.id &&
          i.customId === `mod_modal_${action}_${memberId}`,
      });
    } catch {
      return interaction.editReply({
        components: [],
      });
    }

    const memberToModerate = await interaction.guild.members
      .fetch(memberId)
      .catch(() => null);

    const allowedFinal = canAct(interaction, memberToModerate);
    if (!allowedFinal.ok) {
      return modalInteraction.reply({
        embeds: [allowedFinal.embed],
        ephemeral: true,
      });
    }

    const reason = modalInteraction.fields.getTextInputValue('reason');

    try {
      if (action === 'warn') {
        const embed = buildSuccessEmbed(
          '⚠️ Warning Issued',
          `${memberToModerate} has been warned.\n\n**Reason:** ${trimText(reason)}`,
          memberToModerate,
          interaction.user
        );

        return modalInteraction.reply({
          embeds: [embed],
          ephemeral: true,
        });
      }

      if (action === 'kick') {
        if (!memberToModerate.kickable) {
          return modalInteraction.reply({
            embeds: [
              buildErrorEmbed(
                '❌ Cannot Kick Member',
                'I cannot kick this member. Check my role position and permissions.'
              ),
            ],
            ephemeral: true,
          });
        }

        await memberToModerate.kick(reason);

        const embed = buildSuccessEmbed(
          '👢 Member Kicked',
          `**${memberToModerate.user.tag}** has been kicked.\n\n**Reason:** ${trimText(reason)}`,
          memberToModerate,
          interaction.user
        );

        return modalInteraction.reply({
          embeds: [embed],
          ephemeral: true,
        });
      }

      if (action === 'ban') {
        if (!memberToModerate.bannable) {
          return modalInteraction.reply({
            embeds: [
              buildErrorEmbed(
                '❌ Cannot Ban Member',
                'I cannot ban this member. Check my role position and permissions.'
              ),
            ],
            ephemeral: true,
          });
        }

        await interaction.guild.members.ban(memberToModerate.id, { reason });

        const embed = buildSuccessEmbed(
          '🔨 Member Banned',
          `**${memberToModerate.user.tag}** has been banned.\n\n**Reason:** ${trimText(reason)}`,
          memberToModerate,
          interaction.user
        );

        return modalInteraction.reply({
          embeds: [embed],
          ephemeral: true,
        });
      }

      if (action === 'timeout') {
        const rawDuration = modalInteraction.fields.getTextInputValue('duration');
        const durationMinutes = Number(rawDuration);

        if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 40320) {
          return modalInteraction.reply({
            embeds: [
              buildErrorEmbed(
                '❌ Invalid Duration',
                'Timeout duration must be a whole number between 1 and 40320 minutes.'
              ),
            ],
            ephemeral: true,
          });
        }

        if (!memberToModerate.moderatable) {
          return modalInteraction.reply({
            embeds: [
              buildErrorEmbed(
                '❌ Cannot Timeout Member',
                'I cannot timeout this member. Check my role position and permissions.'
              ),
            ],
            ephemeral: true,
          });
        }

        const ms = durationMinutes * 60 * 1000;
        const durationText = formatMinutes(durationMinutes);

        await memberToModerate.timeout(ms, reason);

        const embed = buildSuccessEmbed(
          '⏱️ Timeout Applied',
          `**${memberToModerate.user.tag}** has been timed out for **${durationText}**.\n\n**Reason:** ${trimText(reason)}`,
          memberToModerate,
          interaction.user
        );

        return modalInteraction.reply({
          embeds: [embed],
          ephemeral: true,
        });
      }

      if (action === 'tempmute') {
        const rawDuration = modalInteraction.fields.getTextInputValue('duration');
        const durationMinutes = Number(rawDuration);

        if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 40320) {
          return modalInteraction.reply({
            embeds: [
              buildErrorEmbed(
                '❌ Invalid Duration',
                'Temporary mute duration must be a whole number between 1 and 40320 minutes.'
              ),
            ],
            ephemeral: true,
          });
        }

        if (!memberToModerate.moderatable) {
          return modalInteraction.reply({
            embeds: [
              buildErrorEmbed(
                '❌ Cannot Temp Mute Member',
                'I cannot timeout this member. Check my role position and permissions.'
              ),
            ],
            ephemeral: true,
          });
        }

        const existingMute = hasActiveTempPunishment(
          interaction.guild.id,
          memberToModerate.id,
          'mute'
        );

        if (existingMute) {
          return modalInteraction.reply({
            embeds: [
              buildErrorEmbed(
                '❌ Already Temporarily Muted',
                'This user already has an active temporary mute.'
              ),
            ],
            ephemeral: true,
          });
        }

        const ms = durationMinutes * 60 * 1000;
        const expiresAt = Date.now() + ms;
        const durationText = formatMinutes(durationMinutes);

        await memberToModerate.timeout(ms, reason);

        addPunishment({
          userId: memberToModerate.id,
          guildId: interaction.guild.id,
          type: 'mute',
          expiresAt,
          reason,
          moderatorId: interaction.user.id,
        });

        const embed = buildSuccessEmbed(
          '🔇 Temporary Mute Applied',
          `**${memberToModerate.user.tag}** has been temporarily muted for **${durationText}**.\n\n**Reason:** ${trimText(reason)}`,
          memberToModerate,
          interaction.user
        ).addFields({
          name: 'Expires',
          value: `<t:${Math.floor(expiresAt / 1000)}:F>\n<t:${Math.floor(expiresAt / 1000)}:R>`,
          inline: false,
        });

        return modalInteraction.reply({
          embeds: [embed],
          ephemeral: true,
        });
      }

      if (action === 'tempban') {
        const rawDuration = modalInteraction.fields.getTextInputValue('duration');
        const durationMinutes = Number(rawDuration);

        if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 40320) {
          return modalInteraction.reply({
            embeds: [
              buildErrorEmbed(
                '❌ Invalid Duration',
                'Temporary ban duration must be a whole number between 1 and 40320 minutes.'
              ),
            ],
            ephemeral: true,
          });
        }

        if (!memberToModerate.bannable) {
          return modalInteraction.reply({
            embeds: [
              buildErrorEmbed(
                '❌ Cannot Temp Ban Member',
                'I cannot ban this member. Check my role position and permissions.'
              ),
            ],
            ephemeral: true,
          });
        }

        const existingBan = hasActiveTempPunishment(
          interaction.guild.id,
          memberToModerate.id,
          'ban'
        );

        if (existingBan) {
          return modalInteraction.reply({
            embeds: [
              buildErrorEmbed(
                '❌ Already Temporarily Banned',
                'This user already has an active temporary ban.'
              ),
            ],
            ephemeral: true,
          });
        }

        const ms = durationMinutes * 60 * 1000;
        const expiresAt = Date.now() + ms;
        const durationText = formatMinutes(durationMinutes);

        await interaction.guild.members.ban(memberToModerate.id, { reason });

        addPunishment({
          userId: memberToModerate.id,
          guildId: interaction.guild.id,
          type: 'ban',
          expiresAt,
          reason,
          moderatorId: interaction.user.id,
        });

        const embed = buildSuccessEmbed(
          '🔨 Temporary Ban Applied',
          `**${memberToModerate.user.tag}** has been temporarily banned for **${durationText}**.\n\n**Reason:** ${trimText(reason)}`,
          memberToModerate,
          interaction.user
        ).addFields({
          name: 'Expires',
          value: `<t:${Math.floor(expiresAt / 1000)}:F>\n<t:${Math.floor(expiresAt / 1000)}:R>`,
          inline: false,
        });

        return modalInteraction.reply({
          embeds: [embed],
          ephemeral: true,
        });
      }

      return modalInteraction.reply({
        embeds: [
          buildErrorEmbed(
            '❌ Unknown Action',
            'That moderation action is not supported.'
          ),
        ],
        ephemeral: true,
      });
    } catch (error) {
      console.error('Mod panel action failed:', error);

      return modalInteraction.reply({
        embeds: [
          buildErrorEmbed(
            '❌ Action Failed',
            'Something went wrong while trying to run that moderation action.'
          ),
        ],
        ephemeral: true,
      });
    }
  },
};