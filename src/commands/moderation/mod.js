const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const {
  createPanelEmbed,
  createSuccessEmbed,
  createDangerEmbed,
} = require('../../utils/embed/embedStyle');
const logModerationAction = require('../../utils/logging/ModerationActionLog');
const { canModerate } = require('../../utils/logging/ModerationChecks');
const createModCase = require('../../utils/moderation/createModCase');

function trimText(text, max = 1024) {
  if (!text) return 'No reason provided';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} minute(s)`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hour(s)`;
  return `${hours}h ${mins}m`;
}

function buildMainEmbed(interaction) {
  return createPanelEmbed(interaction, {
    title: '🛡️ Moderation Panel',
    description: 'Use the buttons below to browse moderation tools for this server.',
    thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
  }).addFields(
    {
      name: '⚡ Quick Actions',
      value: 'Interactive staff actions now live in the Actions tab.',
      inline: false,
    },
    {
      name: '📁 Case Tools',
      value:
        '`/case view` • `/case list`\n' +
        '`/case search-user` • `/case search-action`',
      inline: false,
    },
    {
      name: '📜 Warning Tools',
      value:
        '`/warnings` • `/clearwarnings`\n' +
        'Warning history and warning cleanup',
      inline: false,
    },
    {
      name: '📊 Stats',
      value: '`/modstats`',
      inline: false,
    }
  );
}

function buildActionsEmbed(interaction) {
  return createPanelEmbed(interaction, {
    title: '⚡ Moderation Actions',
    description: 'Use the action buttons below to moderate members directly.',
    thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
  }).addFields(
    {
      name: '✅ Live Actions',
      value: '⚠️ Warn • 👢 Kick • 🔨 Ban • ⏱️ Timeout',
      inline: false,
    },
    {
      name: '📝 Input Format',
      value:
        'Target can be a user ID or @mention.\n' +
        'Timeout duration is in minutes.',
      inline: false,
    }
  );
}

function buildCasesEmbed(interaction) {
  return createPanelEmbed(interaction, {
    title: '📁 Case Tools',
    description: 'Browse and manage moderation case history.',
    thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
  }).addFields(
    {
      name: '🔎 View Cases',
      value:
        '`/case view number:<id>`\n' +
        '`/case list`',
      inline: false,
    },
    {
      name: '👤 Search Cases',
      value:
        '`/case search-user target:<member>`\n' +
        '`/case search-action action:<type>`',
      inline: false,
    },
    {
      name: '🗒️ Notes',
      value:
        '`/case note number:<id> text:<note>`\n' +
        '`/case delete-note number:<id> note:<note-number>`',
      inline: false,
    }
  );
}

function buildWarningsEmbed(interaction) {
  return createPanelEmbed(interaction, {
    title: '📜 Warning Tools',
    description: 'Everything related to warnings and warning history.',
    thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
  }).addFields(
    {
      name: '📜 View Warnings',
      value: '`/warnings user:<member>`',
      inline: false,
    },
    {
      name: '⚠️ Create Warning',
      value: 'Use the Actions tab button.',
      inline: false,
    },
    {
      name: '🧹 Clear Warning History',
      value:
        '`/clearwarnings target:<member>`\n' +
        '`/clearwarnings target:<member> case:<id>`',
      inline: false,
    }
  );
}

function buildStatsEmbed(interaction) {
  return createPanelEmbed(interaction, {
    title: '📊 Moderation Stats',
    description: 'Server moderation overview tools.',
    thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
  }).addFields({
    name: '📈 Main Stats Command',
    value: '`/modstats`',
    inline: false,
  });
}

function buildNavButtons(active) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mod_panel_home')
        .setLabel('Home')
        .setStyle(active === 'home' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('mod_panel_actions')
        .setLabel('Actions')
        .setStyle(active === 'actions' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('mod_panel_cases')
        .setLabel('Cases')
        .setStyle(active === 'cases' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('mod_panel_warnings')
        .setLabel('Warnings')
        .setStyle(active === 'warnings' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('mod_panel_stats')
        .setLabel('Stats')
        .setStyle(active === 'stats' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    ),
  ];
}

function buildActionButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mod_action_warn')
        .setLabel('Warn')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⚠️'),
      new ButtonBuilder()
        .setCustomId('mod_action_kick')
        .setLabel('Kick')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('👢'),
      new ButtonBuilder()
        .setCustomId('mod_action_ban')
        .setLabel('Ban')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔨'),
      new ButtonBuilder()
        .setCustomId('mod_action_timeout')
        .setLabel('Timeout')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏱️')
    ),
  ];
}

function getPanelEmbed(interaction, page) {
  switch (page) {
    case 'actions':
      return buildActionsEmbed(interaction);
    case 'cases':
      return buildCasesEmbed(interaction);
    case 'warnings':
      return buildWarningsEmbed(interaction);
    case 'stats':
      return buildStatsEmbed(interaction);
    case 'home':
    default:
      return buildMainEmbed(interaction);
  }
}

function getPanelComponents(page) {
  const nav = buildNavButtons(page);
  if (page === 'actions') {
    return [...nav, ...buildActionButtons()];
  }
  return nav;
}

function buildActionModal(action) {
  const modal = new ModalBuilder()
    .setCustomId(`mod_modal_${action}`)
    .setTitle(`Moderation: ${action.charAt(0).toUpperCase() + action.slice(1)}`);

  const targetInput = new TextInputBuilder()
    .setCustomId('target')
    .setLabel('Target user ID or mention')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  const rows = [
    new ActionRowBuilder().addComponents(targetInput),
    new ActionRowBuilder().addComponents(reasonInput),
  ];

  if (action === 'timeout') {
    const durationInput = new TextInputBuilder()
      .setCustomId('duration')
      .setLabel('Duration in minutes')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    rows.push(new ActionRowBuilder().addComponents(durationInput));
  }

  modal.addComponents(...rows);
  return modal;
}

async function resolveTargetMember(guild, rawInput) {
  if (!rawInput) return null;

  const cleaned = rawInput.replace(/[<@!>]/g, '').trim();
  if (!/^\d+$/.test(cleaned)) return null;

  return guild.members.fetch(cleaned).catch(() => null);
}

async function executeWarn(interaction, member, reason) {
  const { caseNumber } = createModCase({
    guildId: interaction.guild.id,
    action: 'Warn',
    targetUser: member.user,
    moderator: interaction.user,
    reason,
  });

  try {
    const dmEmbed = createSuccessEmbed(interaction, {
      title: `⚠️ You were warned in ${interaction.guild.name}`,
      description: 'A moderator has issued you a warning.',
      thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
      footerText: interaction.guild.name,
    }).addFields({
      name: '📝 Reason',
      value: trimText(reason),
      inline: false,
    });

    await member.user.send({ embeds: [dmEmbed] });
  } catch (error) {
    // Ignore DM failures
  }

  await logModerationAction({
    guild: interaction.guild,
    action: 'Warn',
    user: member.user,
    moderator: interaction.user,
    reason,
    color: '#f39c12',
    caseId: caseNumber,
  });

  return createSuccessEmbed(interaction, {
    title: '⚠️ Member Warned',
    description: `${member.user} has been warned successfully.`,
    thumbnail: member.user.displayAvatarURL({ dynamic: true }),
  }).addFields(
    { name: '📁 Case', value: `#${caseNumber}`, inline: true },
    { name: '👤 Member', value: `${member.user}\n\`${member.user.id}\``, inline: true },
    { name: '👮 Moderator', value: `${interaction.user}\n\`${interaction.user.id}\``, inline: true },
    { name: '📝 Reason', value: trimText(reason), inline: false }
  );
}

async function executeKick(interaction, member, reason) {
  const { caseNumber } = createModCase({
    guildId: interaction.guild.id,
    action: 'Kick',
    targetUser: member.user,
    moderator: interaction.user,
    reason,
  });

  try {
    const dmEmbed = createDangerEmbed(interaction, {
      title: `👢 You were kicked from ${interaction.guild.name}`,
      description: 'A moderator has removed you from the server.',
      thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
      footerText: interaction.guild.name,
    }).addFields({
      name: '📝 Reason',
      value: trimText(reason),
      inline: false,
    });

    await member.user.send({ embeds: [dmEmbed] });
  } catch (error) {
    // Ignore DM failures
  }

  await member.kick(reason);

  await logModerationAction({
    guild: interaction.guild,
    action: 'Kick',
    user: member.user,
    moderator: interaction.user,
    reason,
    color: '#e67e22',
    caseId: caseNumber,
  });

  return createSuccessEmbed(interaction, {
    title: '👢 Member Kicked',
    description: `${member.user} has been kicked successfully.`,
    thumbnail: member.user.displayAvatarURL({ dynamic: true }),
  }).addFields(
    { name: '📁 Case', value: `#${caseNumber}`, inline: true },
    { name: '👤 Member', value: `${member.user}\n\`${member.user.id}\``, inline: true },
    { name: '🛡️ Moderator', value: `${interaction.user}\n\`${interaction.user.id}\``, inline: true },
    { name: '📝 Reason', value: trimText(reason), inline: false }
  );
}

async function executeBan(interaction, member, reason) {
  const { caseNumber } = createModCase({
    guildId: interaction.guild.id,
    action: 'Ban',
    targetUser: member.user,
    moderator: interaction.user,
    reason,
  });

  try {
    const dmEmbed = createDangerEmbed(interaction, {
      title: `🔨 You were banned from ${interaction.guild.name}`,
      description: 'A moderator has removed you from the server.',
      thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
      footerText: interaction.guild.name,
    }).addFields({
      name: '📝 Reason',
      value: trimText(reason),
      inline: false,
    });

    await member.user.send({ embeds: [dmEmbed] });
  } catch (error) {
    // Ignore DM failures
  }

  await member.ban({ reason });

  await logModerationAction({
    guild: interaction.guild,
    action: 'Ban',
    user: member.user,
    moderator: interaction.user,
    reason,
    color: '#e74c3c',
    caseId: caseNumber,
  });

  return createSuccessEmbed(interaction, {
    title: '🔨 Member Banned',
    description: `${member.user} has been banned successfully.`,
    thumbnail: member.user.displayAvatarURL({ dynamic: true }),
  }).addFields(
    { name: '📁 Case', value: `#${caseNumber}`, inline: true },
    { name: '👤 Member', value: `${member.user}\n\`${member.user.id}\``, inline: true },
    { name: '🛡️ Moderator', value: `${interaction.user}\n\`${interaction.user.id}\``, inline: true },
    { name: '📝 Reason', value: trimText(reason), inline: false }
  );
}

async function executeTimeout(interaction, member, reason, durationMinutes) {
  const durationText = formatDuration(durationMinutes);

  const { caseNumber } = createModCase({
    guildId: interaction.guild.id,
    action: 'Timeout',
    targetUser: member.user,
    moderator: interaction.user,
    reason,
    duration: durationText,
  });

  try {
    const dmEmbed = createDangerEmbed(interaction, {
      title: `⏱️ You were timed out in ${interaction.guild.name}`,
      description: 'A moderator has restricted your communication.',
      thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
      footerText: interaction.guild.name,
    }).addFields(
      {
        name: '⏱️ Duration',
        value: durationText,
        inline: true,
      },
      {
        name: '📝 Reason',
        value: trimText(reason),
        inline: false,
      }
    );

    await member.user.send({ embeds: [dmEmbed] });
  } catch (error) {
    // Ignore DM failures
  }

  await member.timeout(durationMinutes * 60 * 1000, reason);

  await logModerationAction({
    guild: interaction.guild,
    action: 'Timeout',
    user: member.user,
    moderator: interaction.user,
    reason,
    duration: durationText,
    color: '#f39c12',
    caseId: caseNumber,
  });

  return createSuccessEmbed(interaction, {
    title: '⏱️ Member Timed Out',
    description: `${member.user} has been timed out successfully.`,
    thumbnail: member.user.displayAvatarURL({ dynamic: true }),
  }).addFields(
    { name: '📁 Case', value: `#${caseNumber}`, inline: true },
    { name: '👤 Member', value: `${member.user}\n\`${member.user.id}\``, inline: true },
    { name: '🛡️ Moderator', value: `${interaction.user}\n\`${interaction.user.id}\``, inline: true },
    { name: '⏱️ Duration', value: durationText, inline: true },
    { name: '📝 Reason', value: trimText(reason), inline: false }
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation tools')
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Open the moderation panel')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub !== 'panel') {
      return interaction.reply({
        content: '❌ Invalid moderation option.',
        ephemeral: true,
      });
    }

    let currentPage = 'home';

    const response = await interaction.reply({
      embeds: [getPanelEmbed(interaction, currentPage)],
      components: getPanelComponents(currentPage),
      ephemeral: true,
      fetchReply: true,
    });

    const buttonCollector = response.createMessageComponentCollector({
      time: 180000,
    });

    buttonCollector.on('collect', async (buttonInteraction) => {
      if (buttonInteraction.user.id !== interaction.user.id) {
        return buttonInteraction.reply({
          content: '❌ You cannot use this moderation panel.',
          ephemeral: true,
        });
      }

      if (buttonInteraction.customId.startsWith('mod_action_')) {
        const action = buttonInteraction.customId.replace('mod_action_', '');
        await buttonInteraction.showModal(buildActionModal(action));
        return;
      }

      if (buttonInteraction.customId === 'mod_panel_home') {
        currentPage = 'home';
      } else if (buttonInteraction.customId === 'mod_panel_actions') {
        currentPage = 'actions';
      } else if (buttonInteraction.customId === 'mod_panel_cases') {
        currentPage = 'cases';
      } else if (buttonInteraction.customId === 'mod_panel_warnings') {
        currentPage = 'warnings';
      } else if (buttonInteraction.customId === 'mod_panel_stats') {
        currentPage = 'stats';
      }

      await buttonInteraction.update({
        embeds: [getPanelEmbed(interaction, currentPage)],
        components: getPanelComponents(currentPage),
      });
    });

    const modalCollector = response.awaitModalSubmit.bind(response);

    async function handleModal(action) {
      try {
        const modalInteraction = await modalCollector({
          time: 180000,
          filter: (i) =>
            i.user.id === interaction.user.id &&
            i.customId === `mod_modal_${action}`,
        });

        const rawTarget = modalInteraction.fields.getTextInputValue('target');
        const reason =
          modalInteraction.fields.getTextInputValue('reason') || 'No reason provided';

        const member = await resolveTargetMember(interaction.guild, rawTarget);

        if (!member) {
          return modalInteraction.reply({
            embeds: [
              createDangerEmbed(interaction, {
                title: '❌ Member Not Found',
                description: 'That member could not be found in this server.',
              }),
            ],
            ephemeral: true,
          });
        }

        const result = canModerate({ interaction: modalInteraction, member });
        if (!result.allowed) {
          return modalInteraction.reply({
            embeds: [
              createDangerEmbed(interaction, {
                title: '❌ Action Failed',
                description: result.message,
              }),
            ],
            ephemeral: true,
          });
        }

        if (action === 'warn') {
          const embed = await executeWarn(modalInteraction, member, reason);
          return modalInteraction.reply({ embeds: [embed], ephemeral: true });
        }

        if (action === 'kick') {
          if (!member.kickable) {
            return modalInteraction.reply({
              embeds: [
                createDangerEmbed(interaction, {
                  title: '❌ Cannot Kick Member',
                  description: 'I cannot kick this member. Check my role position and permissions.',
                }),
              ],
              ephemeral: true,
            });
          }

          const embed = await executeKick(modalInteraction, member, reason);
          return modalInteraction.reply({ embeds: [embed], ephemeral: true });
        }

        if (action === 'ban') {
          if (!member.bannable) {
            return modalInteraction.reply({
              embeds: [
                createDangerEmbed(interaction, {
                  title: '❌ Cannot Ban Member',
                  description: 'I cannot ban this member. Check my role position and permissions.',
                }),
              ],
              ephemeral: true,
            });
          }

          const embed = await executeBan(modalInteraction, member, reason);
          return modalInteraction.reply({ embeds: [embed], ephemeral: true });
        }

        if (action === 'timeout') {
          const rawDuration = modalInteraction.fields.getTextInputValue('duration');
          const durationMinutes = Number(rawDuration);

          if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 40320) {
            return modalInteraction.reply({
              embeds: [
                createDangerEmbed(interaction, {
                  title: '❌ Invalid Duration',
                  description: 'Timeout duration must be a whole number between 1 and 40320 minutes.',
                }),
              ],
              ephemeral: true,
            });
          }

          if (!member.moderatable) {
            return modalInteraction.reply({
              embeds: [
                createDangerEmbed(interaction, {
                  title: '❌ Cannot Timeout Member',
                  description: 'I cannot timeout this member. Check my role position and permissions.',
                }),
              ],
              ephemeral: true,
            });
          }

          const embed = await executeTimeout(
            modalInteraction,
            member,
            reason,
            durationMinutes
          );

          return modalInteraction.reply({ embeds: [embed], ephemeral: true });
        }
      } catch (error) {
        // modal timeout
      }
    }

    handleModal('warn');
    handleModal('kick');
    handleModal('ban');
    handleModal('timeout');

    buttonCollector.on('end', async () => {
      try {
        await interaction.editReply({
          components: [],
        });
      } catch (error) {
        // Ignore edit errors
      }
    });
  },
};