const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const {
  getCaseById,
  getCasesForUser,
  getFilteredCases,
  getCasesByModerator
} = require('../../utils/moderation/caseStore');

function hasCasePermission(member) {
  return (
    member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    member.permissions.has(PermissionFlagsBits.KickMembers) ||
    member.permissions.has(PermissionFlagsBits.BanMembers)
  );
}

function formatStatus(status) {
  if (status === 'reversed') return '🔁 Reversed';
  if (status === 'expired') return '⌛ Expired';
  return '🟢 Active';
}

async function findMemberByQuery(guild, query) {
  const cleaned = query.trim().toLowerCase();

  if (/^\d{17,20}$/.test(cleaned)) {
    try {
      return await guild.members.fetch(cleaned);
    } catch {
      return null;
    }
  }

  await guild.members.fetch();

  return guild.members.cache.find(member => {
    const tag = member.user.tag?.toLowerCase() || '';
    const username = member.user.username?.toLowerCase() || '';
    const displayName = member.displayName?.toLowerCase() || '';

    return (
      tag === cleaned ||
      username === cleaned ||
      displayName === cleaned ||
      tag.includes(cleaned) ||
      username.includes(cleaned) ||
      displayName.includes(cleaned)
    );
  }) || null;
}

function buildCasePanelEmbed(guild, moderator) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('📂 Case Management Panel')
    .setDescription('Browse, search, filter, and export moderation cases using the controls below.')
    .addFields(
      {
        name: 'Moderator',
        value: `${moderator}`,
        inline: true
      },
      {
        name: 'Server',
        value: guild.name,
        inline: true
      },
      {
        name: 'Tools',
        value: [
          '🔎 Search by case ID',
          '👤 Search by member',
          '📜 Recent cases',
          '🎛️ Filter by action/status',
          '👮 Moderator lookup',
          '📦 Export member history'
        ].join('\n'),
        inline: false
      }
    )
    .setTimestamp();

  const icon = guild.iconURL({ dynamic: true });
  if (icon) embed.setThumbnail(icon);

  return embed;
}

function buildCasePanelRows() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('casepanel_search_case')
      .setLabel('Search Case')
      .setEmoji('🔎')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('casepanel_search_member')
      .setLabel('Search Member')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('casepanel_recent')
      .setLabel('Recent Cases')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('casepanel_filter_action')
      .setLabel('Filter Action')
      .setEmoji('🎯')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('casepanel_filter_status')
      .setLabel('Filter Status')
      .setEmoji('🏷️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('casepanel_moderator')
      .setLabel('Moderator Cases')
      .setEmoji('👮')
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('casepanel_export')
      .setLabel('Export Cases')
      .setEmoji('📦')
      .setStyle(ButtonStyle.Success)
  );

  return [row1, row2, row3];
}

function buildCasesEmbed(title, cases, footerText = null) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(title)
    .setDescription(
      cases.length
        ? cases.map(entry =>
            `**#${entry.caseId}** • ${entry.action}\nUser: \`${entry.userId}\`\nModerator: \`${entry.moderatorId}\`\nStatus: ${formatStatus(entry.status)}\nReason: ${entry.reason || 'No reason provided'}\n<t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:R>`
          ).join('\n\n')
        : 'No cases found.'
    )
    .setTimestamp();

  if (footerText) {
    embed.setFooter({ text: footerText });
  }

  return embed;
}

function buildCaseDetailEmbed(modCase) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`🧾 Case #${modCase.caseId}`)
    .addFields(
      { name: 'Action', value: modCase.action, inline: true },
      { name: 'Status', value: formatStatus(modCase.status), inline: true },
      { name: 'User ID', value: modCase.userId, inline: true },
      { name: 'Moderator ID', value: modCase.moderatorId, inline: true },
      { name: 'Reason', value: modCase.reason || 'No reason provided', inline: false },
      {
        name: 'Created',
        value: `<t:${Math.floor(new Date(modCase.createdAt).getTime() / 1000)}:F>`,
        inline: true
      },
      {
        name: 'Updated',
        value: modCase.updatedAt
          ? `<t:${Math.floor(new Date(modCase.updatedAt).getTime() / 1000)}:F>`
          : 'Never',
        inline: true
      }
    )
    .setTimestamp();

  if (modCase.relatedCaseId) {
    embed.addFields({
      name: 'Related Case',
      value: `#${modCase.relatedCaseId}`,
      inline: true
    });
  }

  if (modCase.metadata && Object.keys(modCase.metadata).length) {
    embed.addFields({
      name: 'Metadata',
      value: `\`\`\`json\n${JSON.stringify(modCase.metadata, null, 2)}\n\`\`\``,
      inline: false
    });
  }

  return embed;
}

function buildCaseSearchModal() {
  const modal = new ModalBuilder()
    .setCustomId('casepanel_submit_search_case')
    .setTitle('Search Case');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('case_id')
        .setLabel('Case ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('123')
        .setRequired(true)
        .setMaxLength(10)
    )
  );

  return modal;
}

function buildMemberSearchModal() {
  const modal = new ModalBuilder()
    .setCustomId('casepanel_submit_search_member')
    .setTitle('Search Member Cases');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('member_query')
        .setLabel('User ID, username, tag, or display name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('123456789012345678 or TwoToneTaj')
        .setRequired(true)
        .setMaxLength(100)
    )
  );

  return modal;
}

function buildModeratorSearchModal() {
  const modal = new ModalBuilder()
    .setCustomId('casepanel_submit_moderator')
    .setTitle('Moderator Cases');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('moderator_query')
        .setLabel('Moderator ID, username, tag, or display name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Moderator name or ID')
        .setRequired(true)
        .setMaxLength(100)
    )
  );

  return modal;
}

function buildExportModal() {
  const modal = new ModalBuilder()
    .setCustomId('casepanel_submit_export')
    .setTitle('Export Member Cases');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('member_query')
        .setLabel('Member ID, username, tag, or display name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Member name or ID')
        .setRequired(true)
        .setMaxLength(100)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('format')
        .setLabel('Format: json or csv')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('json')
        .setRequired(true)
        .setMaxLength(10)
    )
  );

  return modal;
}

function toCsv(rows) {
  const headers = [
    'caseId',
    'guildId',
    'userId',
    'moderatorId',
    'action',
    'reason',
    'status',
    'relatedCaseId',
    'createdAt',
    'updatedAt',
    'metadata'
  ];

  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;

  return [
    headers.join(','),
    ...rows.map(row => [
      row.caseId,
      row.guildId,
      row.userId,
      row.moderatorId,
      row.action,
      row.reason,
      row.status,
      row.relatedCaseId,
      row.createdAt,
      row.updatedAt,
      JSON.stringify(row.metadata || {})
    ].map(escape).join(','))
  ].join('\n');
}

async function handleCasePanelButton(interaction) {
  if (!hasCasePermission(interaction.member)) {
    return interaction.reply({
      content: '❌ No permission to use the case panel.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'casepanel_search_case') {
    return interaction.showModal(buildCaseSearchModal());
  }

  if (interaction.customId === 'casepanel_search_member') {
    return interaction.showModal(buildMemberSearchModal());
  }

  if (interaction.customId === 'casepanel_recent') {
    await interaction.guild.members.fetch();

    const allMembers = interaction.guild.members.cache.map(member => member.id);
    let allCases = [];

    for (const userId of allMembers) {
      allCases.push(...getCasesForUser(interaction.guild.id, userId));
    }

    allCases = allCases
      .sort((a, b) => b.caseId - a.caseId)
      .slice(0, 15);

    return interaction.reply({
      embeds: [buildCasesEmbed('📜 Recent Cases', allCases, 'Latest 15 cases')],
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'casepanel_filter_action') {
    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('casepanel_filter_action_warn')
          .setLabel('Warns')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('casepanel_filter_action_timeout')
          .setLabel('Timeouts')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('casepanel_filter_action_note')
          .setLabel('Notes')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('casepanel_filter_action_ban')
          .setLabel('Bans')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('casepanel_filter_action_kick')
          .setLabel('Kicks')
          .setStyle(ButtonStyle.Secondary)
      )
    ];

    return interaction.reply({
      content: 'Choose an action filter:',
      components: rows,
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'casepanel_filter_status') {
    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('casepanel_filter_status_active')
          .setLabel('Active')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('casepanel_filter_status_reversed')
          .setLabel('Reversed')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('casepanel_filter_status_expired')
          .setLabel('Expired')
          .setStyle(ButtonStyle.Secondary)
      )
    ];

    return interaction.reply({
      content: 'Choose a status filter:',
      components: rows,
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'casepanel_moderator') {
    return interaction.showModal(buildModeratorSearchModal());
  }

  if (interaction.customId === 'casepanel_export') {
    return interaction.showModal(buildExportModal());
  }

  if (interaction.customId.startsWith('casepanel_filter_action_')) {
    const action = interaction.customId.replace('casepanel_filter_action_', '');

    await interaction.guild.members.fetch();
    const memberIds = interaction.guild.members.cache.map(member => member.id);

    let cases = [];
    for (const userId of memberIds) {
      cases.push(...getFilteredCases(interaction.guild.id, userId, { action }));
    }

    cases = cases.sort((a, b) => b.caseId - a.caseId).slice(0, 20);

    return interaction.reply({
      embeds: [buildCasesEmbed(`🎯 Cases filtered by action: ${action}`, cases)],
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('casepanel_filter_status_')) {
    const status = interaction.customId.replace('casepanel_filter_status_', '');

    await interaction.guild.members.fetch();
    const memberIds = interaction.guild.members.cache.map(member => member.id);

    let cases = [];
    for (const userId of memberIds) {
      cases.push(...getFilteredCases(interaction.guild.id, userId, { status }));
    }

    cases = cases.sort((a, b) => b.caseId - a.caseId).slice(0, 20);

    return interaction.reply({
      embeds: [buildCasesEmbed(`🏷️ Cases filtered by status: ${status}`, cases)],
      flags: MessageFlags.Ephemeral
    });
  }

  return false;
}

async function handleCasePanelModal(interaction) {
  if (!hasCasePermission(interaction.member)) {
    return interaction.reply({
      content: '❌ No permission to use the case panel.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'casepanel_submit_search_case') {
    const caseIdRaw = interaction.fields.getTextInputValue('case_id').trim();

    if (!/^\d+$/.test(caseIdRaw)) {
      return interaction.reply({
        content: '❌ Case ID must be a number.',
        flags: MessageFlags.Ephemeral
      });
    }

    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));

    if (!modCase) {
      return interaction.reply({
        content: '❌ Case not found.',
        flags: MessageFlags.Ephemeral
      });
    }

    return interaction.reply({
      embeds: [buildCaseDetailEmbed(modCase)],
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'casepanel_submit_search_member') {
    const query = interaction.fields.getTextInputValue('member_query').trim();
    const member = await findMemberByQuery(interaction.guild, query);

    if (!member) {
      return interaction.reply({
        content: '❌ Member not found.',
        flags: MessageFlags.Ephemeral
      });
    }

    const cases = getCasesForUser(interaction.guild.id, member.id);

    return interaction.reply({
      embeds: [buildCasesEmbed(`👤 Cases for ${member.user.tag}`, cases)],
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'casepanel_submit_moderator') {
    const query = interaction.fields.getTextInputValue('moderator_query').trim();
    const moderator = await findMemberByQuery(interaction.guild, query);

    if (!moderator) {
      return interaction.reply({
        content: '❌ Moderator not found.',
        flags: MessageFlags.Ephemeral
      });
    }

    const cases = getCasesByModerator(interaction.guild.id, moderator.id).slice(0, 20);

    return interaction.reply({
      embeds: [buildCasesEmbed(`👮 Cases by ${moderator.user.tag}`, cases)],
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'casepanel_submit_export') {
    const query = interaction.fields.getTextInputValue('member_query').trim();
    const formatRaw = interaction.fields.getTextInputValue('format').trim().toLowerCase();

    if (!['json', 'csv'].includes(formatRaw)) {
      return interaction.reply({
        content: '❌ Format must be `json` or `csv`.',
        flags: MessageFlags.Ephemeral
      });
    }

    const member = await findMemberByQuery(interaction.guild, query);

    if (!member) {
      return interaction.reply({
        content: '❌ Member not found.',
        flags: MessageFlags.Ephemeral
      });
    }

    const cases = getCasesForUser(interaction.guild.id, member.id);
    const exportDir = path.join(process.cwd(), 'data', 'moderation', 'exports');
    fs.mkdirSync(exportDir, { recursive: true });

    const filePath = path.join(
      exportDir,
      `cases-${interaction.guild.id}-${member.id}.${formatRaw}`
    );

    if (formatRaw === 'csv') {
      fs.writeFileSync(filePath, toCsv(cases), 'utf8');
    } else {
      fs.writeFileSync(filePath, JSON.stringify(cases, null, 2), 'utf8');
    }

    return interaction.reply({
      content: `📦 Exported ${cases.length} case(s) for **${member.user.tag}** as ${formatRaw.toUpperCase()}.`,
      files: [new AttachmentBuilder(filePath)],
      flags: MessageFlags.Ephemeral
    });
  }

  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('Open the case management panel')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers |
      PermissionFlagsBits.KickMembers |
      PermissionFlagsBits.BanMembers
    ),

  async execute(interaction) {
    const payload = {
      embeds: [buildCasePanelEmbed(interaction.guild, interaction.member)],
      components: buildCasePanelRows(),
      flags: MessageFlags.Ephemeral
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
  },

  buildCasePanelEmbed,
  buildCasePanelRows,
  handleCasePanelButton,
  handleCasePanelModal
};