'use strict';

// src/modules/giveaways/giveawayManager.js

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const giveawayStore = require('./giveawayStore');
const { isModuleEnabled } = require('../../core/guild/guildManager');

const ENTER_EMOJI = '🎉';

function assertGiveawaysModuleEnabled(guildId) {
  if (!isModuleEnabled(guildId, 'giveaways')) {
    throw new Error('Giveaways module is disabled for this server.');
  }
}

function canManageGiveaways(member) {
  return Boolean(
    member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
    member?.permissions?.has(PermissionFlagsBits.ManageMessages)
  );
}

function parseDurationMs(value) {
  if (typeof value === 'number') return Math.max(60_000, value);

  const text = String(value || '').trim().toLowerCase();
  const match = text.match(/^(\d+)\s*(m|h|d)$/);

  if (!match) return 60 * 60 * 1000;

  const amount = Number(match[1]);
  const unit = match[2];

  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  if (unit === 'd') return amount * 24 * 60 * 60 * 1000;

  return 60 * 60 * 1000;
}

function buildGiveawayEmbed(giveaway) {
  const endsAtSeconds = giveaway.endsAt
    ? Math.floor(new Date(giveaway.endsAt).getTime() / 1000)
    : null;

  const statusText = giveaway.status === 'active'
    ? `Ends ${endsAtSeconds ? `<t:${endsAtSeconds}:R>` : 'soon'}`
    : `Status: ${giveaway.status}`;

  const winners = giveaway.winners?.length
    ? giveaway.winners.map((id) => `<@${id}>`).join(', ')
    : 'Not drawn yet';

  return new EmbedBuilder()
    .setColor(giveaway.status === 'active' ? '#f59e0b' : '#22c55e')
    .setTitle(`🎉 ${giveaway.prize}`)
    .setDescription(giveaway.description || 'React with 🎉 to enter.')
    .addFields(
      { name: 'Status', value: statusText, inline: true },
      { name: 'Winners', value: String(giveaway.winnerCount || 1), inline: true },
      { name: 'Entries', value: String(giveaway.entries?.length || 0), inline: true },
      { name: 'Winner(s)', value: winners, inline: false }
    )
    .setFooter({ text: `Giveaway ID: ${giveaway.giveawayId}` })
    .setTimestamp(new Date(giveaway.updatedAt || Date.now()));
}

function hasRequiredRoles(member, giveaway) {
  const required = giveaway.requiredRoleIds || [];
  const blocked = giveaway.blockedRoleIds || [];

  if (required.length && !required.some((roleId) => member.roles.cache.has(roleId))) {
    return false;
  }

  if (blocked.some((roleId) => member.roles.cache.has(roleId))) {
    return false;
  }

  return true;
}

function pickWinners(entries = [], count = 1) {
  const pool = [...new Set(entries)];
  const winners = [];

  while (pool.length && winners.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(index, 1)[0]);
  }

  return winners;
}

async function createGiveaway(channel, input = {}) {
  if (!channel?.guild) return null;
  assertGiveawaysModuleEnabled(channel.guild.id);

  const durationMs = parseDurationMs(input.duration || input.durationMs);
  const giveaway = giveawayStore.saveGiveaway(channel.guild.id, {
    prize: input.prize,
    description: input.description,
    channelId: channel.id,
    hostId: input.hostId,
    winnerCount: input.winnerCount || 1,
    requiredRoleIds: input.requiredRoleIds || [],
    blockedRoleIds: input.blockedRoleIds || [],
    endsAt: new Date(Date.now() + durationMs).toISOString(),
  });

  const message = await channel.send({ embeds: [buildGiveawayEmbed(giveaway)] });
  await message.react(ENTER_EMOJI).catch(() => null);

  return giveawayStore.updateGiveaway(channel.guild.id, giveaway.giveawayId, {
    messageId: message.id,
    channelId: channel.id,
  });
}

async function enterGiveaway(reaction, user) {
  if (user?.bot || reaction.emoji?.name !== ENTER_EMOJI) return null;

  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (reaction.message?.partial) await reaction.message.fetch().catch(() => null);

  const message = reaction.message;
  const guild = message?.guild;

  if (!guild?.id || !message?.id) return null;
  if (!isModuleEnabled(guild.id, 'giveaways')) return null;

  const giveaway = giveawayStore
    .getActiveGiveaways(guild.id)
    .find((item) => item.messageId === message.id);

  if (!giveaway) return null;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member || !hasRequiredRoles(member, giveaway)) return null;

  if (giveaway.entries.includes(user.id)) return giveaway;

  return giveawayStore.updateGiveaway(guild.id, giveaway.giveawayId, {
    entries: [...giveaway.entries, user.id],
  });
}

async function leaveGiveaway(reaction, user) {
  if (user?.bot || reaction.emoji?.name !== ENTER_EMOJI) return null;

  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (reaction.message?.partial) await reaction.message.fetch().catch(() => null);

  const message = reaction.message;
  const guild = message?.guild;

  if (!guild?.id || !message?.id) return null;
  if (!isModuleEnabled(guild.id, 'giveaways')) return null;

  const giveaway = giveawayStore
    .getActiveGiveaways(guild.id)
    .find((item) => item.messageId === message.id);

  if (!giveaway) return null;

  return giveawayStore.updateGiveaway(guild.id, giveaway.giveawayId, {
    entries: giveaway.entries.filter((id) => id !== user.id),
  });
}

async function refreshGiveawayMessage(client, guildId, giveaway) {
  if (!client || !giveaway?.channelId || !giveaway?.messageId) return null;
  if (!isModuleEnabled(guildId, 'giveaways')) return null;

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  const channel = guild?.channels?.cache?.get(giveaway.channelId) || await guild?.channels?.fetch(giveaway.channelId).catch(() => null);
  const message = await channel?.messages?.fetch(giveaway.messageId).catch(() => null);

  if (!message?.editable) return null;

  await message.edit({ embeds: [buildGiveawayEmbed(giveaway)] });
  return message;
}

async function endGiveaway(client, guildId, giveawayId) {
  assertGiveawaysModuleEnabled(guildId);

  const giveaway = giveawayStore.getGiveaway(guildId, giveawayId);
  if (!giveaway || giveaway.status !== 'active') return null;

  const winners = pickWinners(giveaway.entries, giveaway.winnerCount);

  const updated = giveawayStore.updateGiveaway(guildId, giveawayId, {
    status: 'ended',
    winners,
    endedAt: new Date().toISOString(),
  });

  await refreshGiveawayMessage(client, guildId, updated);

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  const channel = guild?.channels?.cache?.get(updated.channelId) || await guild?.channels?.fetch(updated.channelId).catch(() => null);

  if (channel?.send) {
    await channel.send({
      content: winners.length
        ? `🎉 Giveaway ended! Winner(s): ${winners.map((id) => `<@${id}>`).join(', ')}`
        : '🎉 Giveaway ended, but there were no valid entries.',
    }).catch(() => null);
  }

  return updated;
}

async function rerollGiveaway(client, guildId, giveawayId) {
  assertGiveawaysModuleEnabled(guildId);

  const giveaway = giveawayStore.getGiveaway(guildId, giveawayId);
  if (!giveaway) return null;

  const winners = pickWinners(giveaway.entries, giveaway.winnerCount);
  const updated = giveawayStore.updateGiveaway(guildId, giveawayId, { winners });

  await refreshGiveawayMessage(client, guildId, updated);
  return updated;
}

async function checkExpiredGiveaways(client) {
  const results = [];

  for (const guild of client.guilds.cache.values()) {
    if (!isModuleEnabled(guild.id, 'giveaways')) continue;

    const active = giveawayStore.getActiveGiveaways(guild.id);

    for (const giveaway of active) {
      if (giveaway.endsAt && new Date(giveaway.endsAt).getTime() <= Date.now()) {
        const ended = await endGiveaway(client, guild.id, giveaway.giveawayId).catch(() => null);
        if (ended) results.push(ended);
      }
    }
  }

  return results;
}

function startGiveawayScheduler(client, intervalMs = 60 * 1000) {
  if (!client || client.__goliathGiveawaySchedulerStarted) return null;

  client.__goliathGiveawaySchedulerStarted = true;

  const timer = setInterval(() => {
    checkExpiredGiveaways(client).catch((error) => {
      console.error('[Giveaways] Scheduler failed:', error);
    });
  }, intervalMs);

  timer.unref?.();
  return timer;
}

module.exports = {
  ENTER_EMOJI,
  canManageGiveaways,
  parseDurationMs,
  buildGiveawayEmbed,
  createGiveaway,
  enterGiveaway,
  leaveGiveaway,
  endGiveaway,
  rerollGiveaway,
  checkExpiredGiveaways,
  startGiveawayScheduler,
};
