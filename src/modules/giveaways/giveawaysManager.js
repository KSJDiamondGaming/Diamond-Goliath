'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');

const giveawaysStore = require('./giveawaysStore');

function isManager(member, section) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.ManageGuild) || member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  return (section.managerRoleIds || []).some((roleId) => member.roles?.cache?.has(roleId));
}

function buildGiveawayEmbed(giveaway) {
  const ended = giveaway.status === 'ended';
  const winners = giveaway.winners?.length ? giveaway.winners.map((id) => `<@${id}>`).join(', ') : 'Not drawn yet';
  return new EmbedBuilder()
    .setColor(ended ? 0x57f287 : 0xfaa61a)
    .setTitle(`🎉 ${giveaway.prize}`)
    .setDescription([
      giveaway.description || 'Click the button below to enter.',
      '',
      `**Status:** ${giveaway.status}`,
      `**Entries:** ${giveaway.entries?.length || 0}`,
      `**Winners:** ${winners}`,
      giveaway.endsAt ? `**Ends:** <t:${Math.floor(new Date(giveaway.endsAt).getTime() / 1000)}:R>` : null,
    ].filter(Boolean).join('\n'))
    .setFooter({ text: `Giveaway ID: ${giveaway.giveawayId}` })
    .setTimestamp();
}

function buildGiveawayRows(giveaway) {
  if (giveaway.status !== 'active') return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaways:enter:${giveaway.giveawayId}`)
        .setLabel(`Enter (${giveaway.entries?.length || 0})`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`giveaways:end:${giveaway.giveawayId}`)
        .setLabel('End')
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

async function refreshGiveawayMessage(guild, giveawayId) {
  const giveaway = giveawaysStore.getGiveaway(guild.id, giveawayId);
  if (!giveaway?.channelId || !giveaway.messageId) return null;
  const channel = guild.channels.cache.get(giveaway.channelId) || await guild.channels.fetch(giveaway.channelId).catch(() => null);
  const message = await channel?.messages?.fetch(giveaway.messageId).catch(() => null);
  if (!message?.editable) return null;
  await message.edit({ embeds: [buildGiveawayEmbed(giveaway)], components: buildGiveawayRows(giveaway) }).catch(() => null);
  return giveaway;
}

async function createGiveaway(guild, input = {}) {
  const section = giveawaysStore.getSection(guild.id);
  if (section.enabled === false) throw new Error('Giveaways are disabled.');
  const channelId = input.channelId || section.announcementChannelId;
  if (!channelId) throw new Error('Choose an announcement channel first.');
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) throw new Error('Announcement channel is not sendable.');

  let giveaway = giveawaysStore.saveGiveaway(guild.id, {
    prize: input.prize || 'Test Giveaway Prize',
    description: input.description || 'Click Enter to join this giveaway.',
    winnerCount: input.winnerCount || 1,
    endsAt: input.endsAt || null,
    channelId: channel.id,
    createdBy: input.createdBy,
    status: 'active',
  }, guild);

  const message = await channel.send({ embeds: [buildGiveawayEmbed(giveaway)], components: buildGiveawayRows(giveaway) });
  giveaway = giveawaysStore.saveGiveaway(guild.id, { ...giveaway, messageId: message.id, channelId: channel.id }, guild);
  giveawaysStore.incrementAnalytics(guild.id, { created: 1 }, guild);
  return giveaway;
}

function pickWinners(entries = [], count = 1) {
  const pool = [...new Set(entries)].sort(() => Math.random() - 0.5);
  return pool.slice(0, Math.max(1, count));
}

async function enterGiveaway(interaction, giveawayId) {
  const section = giveawaysStore.getSection(interaction.guildId);
  const giveaway = giveawaysStore.getGiveaway(interaction.guildId, giveawayId);
  if (!giveaway || giveaway.status !== 'active') throw new Error('This giveaway is not active.');

  if (section.requireRole && section.requiredRoleIds?.length) {
    const hasRequired = section.requiredRoleIds.some((roleId) => interaction.member?.roles?.cache?.has(roleId));
    if (!hasRequired) throw new Error('You do not have the required role to enter this giveaway.');
  }

  const entries = Array.isArray(giveaway.entries) ? [...giveaway.entries] : [];
  if (!section.allowMultipleEntries && entries.includes(interaction.user.id)) throw new Error('You are already entered.');
  entries.push(interaction.user.id);

  const updated = giveawaysStore.updateGiveaway(interaction.guildId, giveawayId, { entries }, interaction.guild);
  giveawaysStore.incrementAnalytics(interaction.guildId, { entries: 1 }, interaction.guild);
  await refreshGiveawayMessage(interaction.guild, giveawayId);
  return updated;
}

async function endGiveaway(interaction, giveawayId, actorId = null) {
  const section = giveawaysStore.getSection(interaction.guildId);
  if (!isManager(interaction.member, section)) throw new Error('You do not have permission to end giveaways.');
  const giveaway = giveawaysStore.getGiveaway(interaction.guildId, giveawayId);
  if (!giveaway || giveaway.status !== 'active') throw new Error('This giveaway is not active.');
  const winners = pickWinners(giveaway.entries || [], giveaway.winnerCount || 1);
  const updated = giveawaysStore.updateGiveaway(interaction.guildId, giveawayId, {
    status: 'ended',
    winners,
    endedAt: new Date().toISOString(),
  }, interaction.guild);
  giveawaysStore.incrementAnalytics(interaction.guildId, { ended: 1 }, interaction.guild);
  await refreshGiveawayMessage(interaction.guild, giveawayId);

  const channel = interaction.guild.channels.cache.get(giveaway.channelId) || await interaction.guild.channels.fetch(giveaway.channelId).catch(() => null);
  if (channel?.send) {
    await channel.send(winners.length
      ? `🎉 Giveaway ended! Winner(s): ${winners.map((id) => `<@${id}>`).join(', ')}`
      : '🎉 Giveaway ended with no valid entries.').catch(() => null);
  }
  return updated;
}

async function deployTestGiveaway(guild, actorId = null) {
  return createGiveaway(guild, {
    prize: 'Test Giveaway Prize',
    description: 'This is a test giveaway created from the Goliath Admin Panel.',
    winnerCount: 1,
    createdBy: actorId,
  });
}

module.exports = {
  isManager,
  buildGiveawayEmbed,
  buildGiveawayRows,
  createGiveaway,
  enterGiveaway,
  endGiveaway,
  refreshGiveawayMessage,
  deployTestGiveaway,
};
