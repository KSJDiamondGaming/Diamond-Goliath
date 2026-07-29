'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');

const guildManager = require('../../../core/guild/guildManager');
const giveawaysStore = require('./giveawaysStore');

const ENTER_EMOJI = '🎉';

function isManager(member, section = {}) {
  if (!member) return false;
  if (
    member.permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
    member.permissions?.has?.(PermissionFlagsBits.ManageMessages) ||
    member.permissions?.has?.(PermissionFlagsBits.Administrator)
  ) return true;
  return (section.managerRoleIds || []).some((roleId) => member.roles?.cache?.has(roleId));
}

function parseDurationMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(60_000, value);
  const match = String(value || '').trim().toLowerCase().match(/^(\d+)\s*(m|h|d)$/);
  if (!match) return 60 * 60 * 1000;
  const amount = Number(match[1]);
  if (match[2] === 'm') return amount * 60 * 1000;
  if (match[2] === 'h') return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}

function buildGiveawayEmbed(giveaway) {
  const ended = giveaway.status === 'ended';
  const winners = giveaway.winners?.length
    ? giveaway.winners.map((id) => `<@${id}>`).join(', ')
    : 'Not drawn yet';
  return new EmbedBuilder()
    .setColor(ended ? 0x57f287 : 0xfaa61a)
    .setTitle(`🎉 ${giveaway.prize}`)
    .setDescription([
      giveaway.description || 'Click the button below or react with 🎉 to enter.',
      '',
      `**Status:** ${giveaway.status}`,
      `**Entries:** ${giveaway.entries?.length || 0}`,
      `**Winner Count:** ${giveaway.winnerCount || 1}`,
      `**Winners:** ${winners}`,
      giveaway.endsAt ? `**Ends:** <t:${Math.floor(new Date(giveaway.endsAt).getTime() / 1000)}:R>` : null,
    ].filter(Boolean).join('\n'))
    .setFooter({ text: `Giveaway ID: ${giveaway.giveawayId}` })
    .setTimestamp(new Date(giveaway.updatedAt || Date.now()));
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

function pickWinners(entries = [], count = 1) {
  const pool = [...new Set(entries)];
  const winners = [];
  while (pool.length && winners.length < Math.max(1, Number(count) || 1)) {
    winners.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return winners;
}

function hasEntryRoles(member, giveaway, section) {
  const requiredRoleIds = giveaway.requiredRoleIds?.length
    ? giveaway.requiredRoleIds
    : section.requiredRoleIds || [];
  const blockedRoleIds = giveaway.blockedRoleIds?.length
    ? giveaway.blockedRoleIds
    : section.blockedRoleIds || [];
  if ((section.requireRole || requiredRoleIds.length) && requiredRoleIds.length) {
    if (!requiredRoleIds.some((roleId) => member?.roles?.cache?.has(roleId))) return false;
  }
  if (blockedRoleIds.some((roleId) => member?.roles?.cache?.has(roleId))) return false;
  return true;
}

async function refreshGiveawayMessage(guild, giveawayId) {
  const giveaway = giveawaysStore.getGiveaway(guild.id, giveawayId);
  if (!giveaway?.channelId || !giveaway.messageId) return null;
  const channel = guild.channels.cache.get(giveaway.channelId)
    || await guild.channels.fetch(giveaway.channelId).catch(() => null);
  const message = await channel?.messages?.fetch(giveaway.messageId).catch(() => null);
  if (!message?.editable) return null;
  await message.edit({ embeds: [buildGiveawayEmbed(giveaway)], components: buildGiveawayRows(giveaway) }).catch(() => null);
  return giveaway;
}

async function createGiveaway(guildOrChannel, input = {}) {
  const guild = guildOrChannel?.guild || guildOrChannel;
  if (!guild?.id) throw new Error('A guild is required to create a giveaway.');
  const section = giveawaysStore.getSection(guild.id);
  if (!guildManager.isModuleEnabled(guild.id, 'giveaways')) throw new Error('Giveaways are disabled.');

  const providedChannel = guildOrChannel?.guild ? guildOrChannel : null;
  const channelId = providedChannel?.id || input.channelId || section.announcementChannelId;
  if (!channelId) throw new Error('Choose an announcement channel first.');
  const channel = providedChannel || guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) throw new Error('Announcement channel is not sendable.');

  const endsAt = input.endsAt || new Date(Date.now() + parseDurationMs(input.duration || input.durationMs)).toISOString();
  let giveaway = giveawaysStore.saveGiveaway(guild.id, {
    prize: input.prize || 'Test Giveaway Prize',
    description: input.description || 'Click Enter or react with 🎉 to join this giveaway.',
    winnerCount: input.winnerCount || section.defaultWinnerCount || 1,
    endsAt,
    channelId: channel.id,
    createdBy: input.createdBy || input.hostId,
    requiredRoleIds: input.requiredRoleIds || [],
    blockedRoleIds: input.blockedRoleIds || [],
    status: 'active',
  }, guild);

  const message = await channel.send({ embeds: [buildGiveawayEmbed(giveaway)], components: buildGiveawayRows(giveaway) });
  await message.react(ENTER_EMOJI).catch(() => null);
  giveaway = giveawaysStore.saveGiveaway(guild.id, { ...giveaway, messageId: message.id, channelId: channel.id }, guild);
  giveawaysStore.incrementAnalytics(guild.id, { created: 1 }, guild);
  return giveaway;
}

async function addEntry(guild, giveawayId, userId, member = null) {
  const section = giveawaysStore.getSection(guild.id);
  if (!guildManager.isModuleEnabled(guild.id, 'giveaways')) throw new Error('Giveaways are disabled.');
  const giveaway = giveawaysStore.getGiveaway(guild.id, giveawayId);
  if (!giveaway || giveaway.status !== 'active') throw new Error('This giveaway is not active.');
  if (!hasEntryRoles(member, giveaway, section)) throw new Error('You do not have the required role to enter this giveaway.');

  const entries = Array.isArray(giveaway.entries) ? [...giveaway.entries] : [];
  if (!section.allowMultipleEntries && entries.includes(userId)) return giveaway;
  entries.push(userId);
  const updated = giveawaysStore.updateGiveaway(guild.id, giveawayId, { entries }, guild);
  giveawaysStore.incrementAnalytics(guild.id, { entries: 1 }, guild);
  await refreshGiveawayMessage(guild, giveawayId);
  return updated;
}

async function removeEntry(guild, giveawayId, userId) {
  const giveaway = giveawaysStore.getGiveaway(guild.id, giveawayId);
  if (!giveaway || giveaway.status !== 'active') return null;
  const updated = giveawaysStore.updateGiveaway(guild.id, giveawayId, {
    entries: (giveaway.entries || []).filter((id) => id !== userId),
  }, guild);
  await refreshGiveawayMessage(guild, giveawayId);
  return updated;
}

async function enterGiveaway(interaction, giveawayId) {
  return addEntry(interaction.guild, giveawayId, interaction.user.id, interaction.member);
}

async function enterGiveawayReaction(reaction, user) {
  if (user?.bot || reaction.emoji?.name !== ENTER_EMOJI) return null;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (reaction.message?.partial) await reaction.message.fetch().catch(() => null);
  const guild = reaction.message?.guild;
  if (!guild?.id) return null;
  const giveaway = giveawaysStore.getActiveGiveaways(guild.id)
    .find((item) => item.messageId === reaction.message.id);
  if (!giveaway) return null;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return null;
  return addEntry(guild, giveaway.giveawayId, user.id, member).catch(() => null);
}

async function leaveGiveawayReaction(reaction, user) {
  if (user?.bot || reaction.emoji?.name !== ENTER_EMOJI) return null;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (reaction.message?.partial) await reaction.message.fetch().catch(() => null);
  const guild = reaction.message?.guild;
  if (!guild?.id) return null;
  const giveaway = giveawaysStore.getActiveGiveaways(guild.id)
    .find((item) => item.messageId === reaction.message.id);
  if (!giveaway) return null;
  return removeEntry(guild, giveaway.giveawayId, user.id);
}

async function endGiveawayById(client, guildId, giveawayId, actorMember = null) {
  const section = giveawaysStore.getSection(guildId);
  if (!guildManager.isModuleEnabled(guildId, 'giveaways')) throw new Error('Giveaways are disabled.');
  if (actorMember && !isManager(actorMember, section)) throw new Error('You do not have permission to end giveaways.');
  const giveaway = giveawaysStore.getGiveaway(guildId, giveawayId);
  if (!giveaway || giveaway.status !== 'active') return null;

  const winners = pickWinners(giveaway.entries || [], giveaway.winnerCount || 1);
  const updated = giveawaysStore.updateGiveaway(guildId, giveawayId, {
    status: 'ended',
    winners,
    endedAt: new Date().toISOString(),
  });
  giveawaysStore.incrementAnalytics(guildId, { ended: 1 });

  const guild = client?.guilds?.cache?.get(guildId)
    || await client?.guilds?.fetch?.(guildId).catch(() => null);
  if (guild) {
    await refreshGiveawayMessage(guild, giveawayId);
    const channel = guild.channels.cache.get(giveaway.channelId)
      || await guild.channels.fetch(giveaway.channelId).catch(() => null);
    if (channel?.send) {
      await channel.send(winners.length
        ? `🎉 Giveaway ended! Winner(s): ${winners.map((id) => `<@${id}>`).join(', ')}`
        : '🎉 Giveaway ended with no valid entries.').catch(() => null);
    }
  }
  return updated;
}

async function endGiveaway(interaction, giveawayId) {
  return endGiveawayById(interaction.client, interaction.guildId, giveawayId, interaction.member);
}

async function rerollGiveaway(client, guildId, giveawayId) {
  const giveaway = giveawaysStore.getGiveaway(guildId, giveawayId);
  if (!giveaway || giveaway.status !== 'ended') return null;
  const winners = pickWinners(giveaway.entries || [], giveaway.winnerCount || 1);
  const updated = giveawaysStore.updateGiveaway(guildId, giveawayId, { winners });
  giveawaysStore.incrementAnalytics(guildId, { rerolls: 1 });
  const guild = client?.guilds?.cache?.get(guildId)
    || await client?.guilds?.fetch?.(guildId).catch(() => null);
  if (guild) await refreshGiveawayMessage(guild, giveawayId);
  return updated;
}

async function checkExpiredGiveaways(client) {
  const ended = [];
  for (const guild of client?.guilds?.cache?.values?.() || []) {
    if (!guildManager.isModuleEnabled(guild.id, 'giveaways')) continue;
    for (const giveaway of giveawaysStore.getActiveGiveaways(guild.id)) {
      if (giveaway.endsAt && new Date(giveaway.endsAt).getTime() <= Date.now()) {
        const result = await endGiveawayById(client, guild.id, giveaway.giveawayId).catch(() => null);
        if (result) ended.push(result);
      }
    }
  }
  return ended;
}

function startGiveawayScheduler(client, intervalMs = 60_000) {
  if (!client || client.__goliathGiveawaySchedulerStarted) return null;
  client.__goliathGiveawaySchedulerStarted = true;
  const timer = setInterval(() => {
    checkExpiredGiveaways(client).catch((error) => console.error('[Giveaways] Scheduler failed:', error));
  }, intervalMs);
  timer.unref?.();
  return timer;
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
  ENTER_EMOJI,
  isManager,
  canManageGiveaways: isManager,
  parseDurationMs,
  buildGiveawayEmbed,
  buildGiveawayRows,
  createGiveaway,
  enterGiveaway,
  enterGiveawayReaction,
  leaveGiveawayReaction,
  endGiveaway,
  endGiveawayById,
  rerollGiveaway,
  refreshGiveawayMessage,
  checkExpiredGiveaways,
  startGiveawayScheduler,
  deployTestGiveaway,
};