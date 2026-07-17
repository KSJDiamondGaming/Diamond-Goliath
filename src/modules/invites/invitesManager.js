'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
} = require('discord.js');
const { updateModuleSection } = require('../../core/guild/moduleSectionManager');
const invites = require('./invites');

const sessions = new Map();
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder()
  .setCustomId(id)
  .setLabel(label)
  .setStyle(style)
  .setDisabled(Boolean(disabled));

function sessionFor(interaction) {
  const key = `${interaction.guildId}:${interaction.user.id}`;
  if (!sessions.has(key)) sessions.set(key, { selectedUserId: null });
  return sessions.get(key);
}

function personalLinks(guildId) {
  const byMember = new Map();
  for (const link of invites.listInviteLinks(guildId).filter((item) => item.personal && item.inviterId)) {
    if (!byMember.has(link.inviterId)) byMember.set(link.inviterId, link);
  }
  return [...byMember.values()];
}

function statsFor(section, userId) {
  const stats = section.inviters?.[userId] || {};
  const score = Math.max(0, Number(stats.active || 0) + Number(stats.bonus || 0));
  return {
    total: Math.max(0, Number(stats.total || 0)),
    active: Math.max(0, Number(stats.active || 0)),
    left: Math.max(0, Number(stats.left || 0)),
    fake: Math.max(0, Number(stats.fake || 0)),
    bonus: Number(stats.bonus || 0),
    score,
  };
}

function formatDate(value) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? `<t:${Math.floor(timestamp / 1000)}:f>` : 'Unknown';
}

function roleList(roleIds) {
  return roleIds?.length ? roleIds.map((id) => `<@&${id}>`).join(', ') : 'None';
}

function buildInviteManagerPayload(interaction) {
  const section = invites.getSection(interaction.guildId);
  const links = personalLinks(interaction.guildId);
  const state = sessionFor(interaction);
  if (!links.some((link) => link.inviterId === state.selectedUserId)) state.selectedUserId = links[0]?.inviterId || null;

  const selected = links.find((link) => link.inviterId === state.selectedUserId) || null;
  const stats = selected ? statsFor(section, selected.inviterId) : null;
  const ranking = invites.leaderboard(interaction.guildId, 100);
  const rankIndex = selected ? ranking.findIndex((entry) => entry.inviterId === selected.inviterId) : -1;
  const invitees = selected
    ? Object.values(section.members || {})
      .filter((record) => record.inviterId === selected.inviterId)
      .sort((a, b) => String(b.joinedAt || '').localeCompare(String(a.joinedAt || '')))
      .slice(0, 5)
    : [];

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🗂️ Invite Manager')
    .setDescription('Invite Studio is the authoritative view of member-owned links. Discord will show Goliath as creator because the bot creates each link on the member’s behalf.')
    .addFields(
      { name: 'Personal Links', value: String(links.length), inline: true },
      { name: 'Leaderboard Members', value: String(ranking.length), inline: true },
      { name: 'Tracked Invitees', value: String(Object.values(section.members || {}).filter((record) => record.inviterId).length), inline: true },
    );

  if (selected) {
    const member = interaction.guild.members.cache.get(selected.inviterId);
    const recentInvitees = invitees.length
      ? invitees.map((record) => `• <@${record.memberId}> — ${record.leftAt ? 'Left' : 'Active'} — ${formatDate(record.joinedAt)}`).join('\n')
      : 'No tracked invitees yet.';
    embed.addFields(
      { name: 'Selected Member', value: member ? `${member} (${member.user.username})` : `<@${selected.inviterId}>`, inline: false },
      { name: 'Personal Link', value: `https://discord.gg/${selected.code}`, inline: false },
      { name: 'Discord Uses', value: String(selected.uses || 0), inline: true },
      { name: 'Valid Score', value: String(stats.score), inline: true },
      { name: 'Rank', value: rankIndex >= 0 ? `#${rankIndex + 1}` : 'Unranked', inline: true },
      { name: 'Lifetime / Active / Left', value: `${stats.total} / ${stats.active} / ${stats.left}`, inline: true },
      { name: 'Bonus / Flagged', value: `${stats.bonus} / ${stats.fake}`, inline: true },
      { name: 'Created', value: formatDate(selected.createdAt), inline: true },
      { name: 'Channel', value: selected.channelId ? `<#${selected.channelId}>` : 'Unknown', inline: true },
      { name: 'Expires', value: selected.expiresAt ? formatDate(selected.expiresAt) : 'Never', inline: true },
      { name: 'Roles Granted', value: roleList(selected.roleIds), inline: false },
      { name: 'Recent Invitees', value: recentInvitees, inline: false },
    );
  } else {
    embed.addFields({ name: 'No Personal Links', value: 'No member has created a personal invite yet.', inline: false });
  }

  const components = [];
  if (links.length) {
    const options = links.slice(0, 25).map((link) => {
      const member = interaction.guild.members.cache.get(link.inviterId);
      const stats = statsFor(section, link.inviterId);
      return {
        label: (member?.displayName || member?.user?.username || link.inviterId).slice(0, 100),
        value: link.inviterId,
        description: `${stats.score} valid • ${link.uses || 0} Discord uses`.slice(0, 100),
        default: link.inviterId === state.selectedUserId,
      };
    });
    components.push(row(new StringSelectMenuBuilder()
      .setCustomId('invites:manager-select')
      .setPlaceholder('Select a member invite')
      .addOptions(options)));
  }

  components.push(row(
    button('invites:manager-verify', 'Verify Link', ButtonStyle.Secondary, !selected),
    button('invites:manager-resend', 'Resend Link', ButtonStyle.Primary, !selected),
    button('invites:manager-delete', 'Delete Link', ButtonStyle.Danger, !selected),
    button('invites:manager-reset-member', 'Reset Member Score', ButtonStyle.Danger, !selected),
  ));
  components.push(row(button('invites:admin-config', 'Back')));

  return { embeds: [embed], components };
}

function updateRawSection(guildId, updater, meta = {}) {
  return updateModuleSection(guildId, invites.SECTION, updater, invites.defaults(), meta);
}

function resetMemberScore(guildId, userId, meta = {}) {
  return updateRawSection(guildId, (current = {}) => {
    const inviters = { ...(current.inviters || {}) };
    delete inviters[userId];
    const members = {};
    for (const [memberId, record] of Object.entries(current.members || {})) {
      members[memberId] = record?.inviterId === userId
        ? { ...record, inviterId: null, attribution: 'reset' }
        : record;
    }
    const history = [...(current.history || []), {
      id: `${Date.now()}_member_reset`,
      at: new Date().toISOString(),
      type: 'member_leaderboard_reset',
      inviterId: userId,
      actorId: meta.actorId || null,
    }].slice(-1000);
    return { ...current, inviters, members, history };
  }, meta);
}

function resetLeaderboard(guildId, meta = {}) {
  return updateRawSection(guildId, (current = {}) => ({
    ...current,
    inviters: {},
    members: {},
    history: [...(current.history || []), {
      id: `${Date.now()}_leaderboard_reset`,
      at: new Date().toISOString(),
      type: 'leaderboard_reset',
      actorId: meta.actorId || null,
    }].slice(-1000),
  }), meta);
}

function renderTemplate(text, guild, user, url) {
  return String(text || '')
    .replaceAll('{server}', guild.name)
    .replaceAll('{user}', user.username)
    .replaceAll('{invite}', url);
}

async function resendSelected(interaction, selected) {
  const member = await interaction.guild.members.fetch(selected.inviterId).catch(() => null);
  if (!member?.user) throw new Error('The selected member is no longer available in this server.');
  const live = await interaction.guild.invites.fetch(selected.code).catch(() => null);
  if (!live) throw new Error('The selected personal link no longer exists in Discord.');
  const template = invites.getSection(interaction.guildId).settings.memberInviteTemplate;
  const url = live.url || `https://discord.gg/${selected.code}`;
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(renderTemplate(template.dmTitle, interaction.guild, member.user, url))
    .setDescription(renderTemplate(template.dmMessage, interaction.guild, member.user, url))
    .setFooter({ text: 'This is your only personal Invite Studio link.' })
    .setTimestamp();
  await member.user.send({ embeds: [embed] });
  return url;
}

async function publicRefresh(guild) {
  const panels = require('./invitesPublicPanels');
  await panels.refreshPublicPanel(guild, { action: 'invite_manager_refresh' }).catch(() => null);
}

async function handleInviteManagerInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('invites:manager-')) return false;
  const state = sessionFor(interaction);
  const links = personalLinks(interaction.guildId);

  if (customId === 'invites:manager-select' && interaction.isStringSelectMenu()) {
    state.selectedUserId = interaction.values[0];
    await interaction.update(buildInviteManagerPayload(interaction));
    return true;
  }

  const selected = links.find((link) => link.inviterId === state.selectedUserId) || null;
  if (!selected) {
    await interaction.reply({ content: '❌ Select a member invite first.', flags: MessageFlags.Ephemeral });
    return true;
  }

  if (customId === 'invites:manager-verify') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const live = await interaction.guild.invites.fetch(selected.code).catch(() => null);
    if (!live) {
      await interaction.editReply('❌ This personal link no longer exists in Discord.');
      return true;
    }
    await invites.syncGuild(interaction.guild, { actorId: interaction.user.id, action: 'invite_manager_verify' }).catch(() => null);
    await interaction.editReply(`✅ Personal link verified.\n${live.url}\n\nDiscord uses: **${live.uses || 0}**\nOwner in Invite Studio: <@${selected.inviterId}>`);
    return true;
  }

  if (customId === 'invites:manager-resend') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const url = await resendSelected(interaction, selected);
      await interaction.editReply(`✅ Personal link resent to <@${selected.inviterId}>.\n${url}`);
    } catch (error) {
      await interaction.editReply(`❌ ${String(error?.message || error).slice(0, 1800)}`);
    }
    return true;
  }

  if (customId === 'invites:manager-delete') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await invites.deletePersonalInvite(interaction.guild, selected.inviterId, {
      actorId: interaction.user.id,
      action: 'invite_manager_delete_personal',
    });
    state.selectedUserId = null;
    await interaction.editReply('✅ Personal link deleted. The member can create a new link using the current admin template.');
    return true;
  }

  if (customId === 'invites:manager-reset-member') {
    resetMemberScore(interaction.guildId, selected.inviterId, {
      actorId: interaction.user.id,
      action: 'invite_manager_reset_member_score',
    });
    await publicRefresh(interaction.guild);
    await interaction.reply({ content: `✅ Invite score reset for <@${selected.inviterId}>. Their personal link was kept.`, flags: MessageFlags.Ephemeral });
    return true;
  }

  return false;
}

module.exports = {
  buildInviteManagerPayload,
  handleInviteManagerInteraction,
  resetLeaderboard,
  resetMemberScore,
};
