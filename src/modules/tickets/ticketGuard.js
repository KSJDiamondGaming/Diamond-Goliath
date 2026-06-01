'use strict';

/**
 * GOLIATH TICKET GUARD
 *
 * Handles:
 * - duplicate ticket protection
 * - one active ticket per type
 * - cooldowns
 * - basic spam protection
 *
 * Standardized to lowercase ticket statuses.
 */

const ticketManager = require('./ticketManager');

const DEFAULT_COOLDOWN_MS = 60 * 1000;

const memoryCooldowns = new Map();

const ACTIVE_STATUSES = [
  'open',
  'claimed',
  'waiting_user',
  'in_review',
  'approved',
  'denied',
];

function now() {
  return Date.now();
}

function normaliseStatus(status) {
  return String(status || 'open').toLowerCase();
}

function getCooldownKey(guildId, userId, type) {
  return `${guildId}:${userId}:${type || 'default'}`;
}

async function getAllTickets(guildId) {
  if (typeof ticketManager.getTickets === 'function') {
    return ticketManager.getTickets(guildId);
  }

  if (typeof ticketManager.listTickets === 'function') {
    return ticketManager.listTickets(guildId);
  }

  if (typeof ticketManager.getAllTickets === 'function') {
    return ticketManager.getAllTickets(guildId);
  }

  return [];
}

async function findActiveTicket({ guildId, userId, type }) {
  const tickets = await getAllTickets(guildId);

  return (
    tickets.find((ticket) => {
      const sameGuild = ticket.guildId === guildId;

      const sameUser =
        ticket.creatorId === userId ||
        ticket.userId === userId ||
        ticket.createdBy === userId;

      const sameType = !type || ticket.type === type;

      const active = ACTIVE_STATUSES.includes(
        normaliseStatus(ticket.status)
      );

      return (
        sameGuild &&
        sameUser &&
        sameType &&
        active &&
        !ticket.deletedAt
      );
    }) || null
  );
}


async function findActiveTickets({ guildId, userId, type }) {
  const tickets = await getAllTickets(guildId);

  return tickets.filter((ticket) => {
    const sameGuild = ticket.guildId === guildId;

    const sameUser =
      ticket.creatorId === userId ||
      ticket.userId === userId ||
      ticket.createdBy === userId;

    const sameType = !type || ticket.type === type;

    const active = ACTIVE_STATUSES.includes(
      normaliseStatus(ticket.status)
    );

    return (
      sameGuild &&
      sameUser &&
      sameType &&
      active &&
      !ticket.deletedAt
    );
  });
}

function checkCooldown({
  guildId,
  userId,
  type,
  cooldownMs = DEFAULT_COOLDOWN_MS,
}) {
  const key = getCooldownKey(guildId, userId, type);
  const lastUsed = memoryCooldowns.get(key);

  if (!lastUsed) {
    return {
      allowed: true,
      remainingMs: 0,
    };
  }

  const elapsed = now() - lastUsed;
  const remainingMs = cooldownMs - elapsed;

  if (remainingMs > 0) {
    return {
      allowed: false,
      remainingMs,
    };
  }

  return {
    allowed: true,
    remainingMs: 0,
  };
}

function setCooldown({ guildId, userId, type }) {
  const key = getCooldownKey(guildId, userId, type);
  memoryCooldowns.set(key, now());
}

function clearCooldown({ guildId, userId, type }) {
  const key = getCooldownKey(guildId, userId, type);
  memoryCooldowns.delete(key);
}

function formatRemaining(ms) {
  const seconds = Math.ceil(ms / 1000);

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.ceil(seconds / 60);
  return `${minutes}m`;
}

async function canCreateTicket({
  guildId,
  userId,
  type,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  oneActivePerType = true,
  maxOpenTickets = null,
  maxOpenTicketsPerUser = null,
} = {}) {
  if (!guildId) {
    return {
      allowed: false,
      reason: 'Missing guild id.',
    };
  }

  if (!userId) {
    return {
      allowed: false,
      reason: 'Missing user id.',
    };
  }

  const cooldown = checkCooldown({
    guildId,
    userId,
    type,
    cooldownMs,
  });

  if (!cooldown.allowed) {
    return {
      allowed: false,
      reason: `Please wait ${formatRemaining(
        cooldown.remainingMs
      )} before opening another ticket.`,
      code: 'COOLDOWN',
      remainingMs: cooldown.remainingMs,
    };
  }

  const activeTickets = await findActiveTickets({
    guildId,
    userId,
    type,
  });

  const configuredMax = Number(
    maxOpenTicketsPerUser ||
    maxOpenTickets ||
    (oneActivePerType ? 1 : 0)
  );

  if (configuredMax > 0 && activeTickets.length >= configuredMax) {
    const firstTicket = activeTickets[0] || null;

    return {
      allowed: false,
      reason:
        configuredMax === 1
          ? `You already have an active ${type || 'ticket'} ticket.`
          : `You already have ${activeTickets.length}/${configuredMax} active ${
              type || 'ticket'
            } tickets.`,
      code:
        configuredMax === 1
          ? 'DUPLICATE_ACTIVE_TICKET'
          : 'MAX_ACTIVE_TICKETS_REACHED',
      ticket: firstTicket,
      tickets: activeTickets,
      maxOpenTickets: configuredMax,
    };
  }

  return {
    allowed: true,
  };
}

async function markTicketCreated({
  guildId,
  userId,
  type,
} = {}) {
  if (!guildId || !userId) return;

  setCooldown({
    guildId,
    userId,
    type,
  });
}

module.exports = {
  ACTIVE_STATUSES,
  DEFAULT_COOLDOWN_MS,

  canCreateTicket,
  markTicketCreated,

  findActiveTicket,
  findActiveTickets,
  checkCooldown,
  setCooldown,
  clearCooldown,
};