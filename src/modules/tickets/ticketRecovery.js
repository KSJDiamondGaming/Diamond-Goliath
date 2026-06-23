'use strict';

/**
 * GOLIATH TICKET RECOVERY
 *
 * Handles:
 * - restoring ticket cache after reboot
 * - validating active tickets
 * - checking missing Discord channels
 * - preparing future panel redeploy/recovery
 */

const ticketStore = require('./ticketStore');

const ACTIVE_STATUSES = [
  'open',
  'claimed',
  'waiting_user',
  'in_review',
  'approved',
  'denied',
];

function isActiveTicket(ticket) {
  return ACTIVE_STATUSES.includes(
    String(ticket.status || 'open').toLowerCase()
  );
}

async function fetchGuild(client, guildId) {
  if (!client || !guildId) return null;

  return client.guilds
    .fetch(guildId)
    .catch(() => null);
}

async function fetchChannel(guild, channelId) {
  if (!guild || !channelId) return null;

  return guild.channels
    .fetch(channelId)
    .catch(() => null);
}

async function recoverGuildTickets(client, guildId) {
  ticketStore.reloadGuildTickets(guildId);

  const tickets = ticketStore.getAllTickets(guildId);
  const activeTickets = tickets.filter(isActiveTicket);

  const guild = await fetchGuild(client, guildId);

  const results = {
    guildId,
    totalTickets: tickets.length,
    activeTickets: activeTickets.length,
    missingChannels: [],
    validChannels: [],
  };

  if (!guild) {
    return {
      ...results,
      guildFound: false,
    };
  }

  for (const ticket of activeTickets) {
    const channel = await fetchChannel(
      guild,
      ticket.discordChannelId
    );

    if (!channel) {
      results.missingChannels.push({
        ticketId: ticket.ticketId,
        displayId: ticket.displayId,
        discordChannelId: ticket.discordChannelId,
      });

      continue;
    }

    results.validChannels.push({
      ticketId: ticket.ticketId,
      displayId: ticket.displayId,
      discordChannelId: channel.id,
    });
  }

  return {
    ...results,
    guildFound: true,
  };
}

async function recoverAllClientGuildTickets(client) {
  if (!client?.guilds?.cache) {
    return [];
  }

  const guildIds = [...client.guilds.cache.keys()];
  const results = [];

  for (const guildId of guildIds) {
    const result = await recoverGuildTickets(
      client,
      guildId
    );

    results.push(result);
  }

  return results;
}

module.exports = {
  ACTIVE_STATUSES,

  isActiveTicket,

  recoverGuildTickets,
  recoverAllClientGuildTickets,
};
