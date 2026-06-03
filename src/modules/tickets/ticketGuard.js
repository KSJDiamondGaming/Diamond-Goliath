'use strict';

/**
 * GOLIATH TICKET GUARD
 *
 * Handles:
 * - duplicate ticket protection
 * - one active ticket per type
 * - per-panel max open ticket limits
 * - 0 = unlimited ticket limits
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

function normaliseType(type) {
  return String(type || 'ticket')
    .toLowerCase()
    .replace(/_/g, '-')
    .trim();
}

function formatTypeLabel(type) {
  return String(type || 'ticket')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getCooldownKey(guildId, userId, type) {
  return `${guildId}:${userId}:${normaliseType(type)}`;
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

function isSameUser(ticket, userId) {
  return (
    ticket.creatorId === userId ||
    ticket.userId === userId ||
    ticket.createdBy === userId
  );
}

function isActiveTicket(ticket) {
  return (
    ACTIVE_STATUSES.includes(
      normaliseStatus(ticket.status)
    ) &&
    !ticket.deletedAt
  );
}

function isSameType(ticket, type) {
  if (!type) return true;

  return (
    normaliseType(ticket.type) ===
    normaliseType(type)
  );
}

async function findActiveTicket({ guildId, userId, type } = {}) {
  const tickets = await getAllTickets(guildId);

  return (
    tickets.find((ticket) => {
      return (
        ticket.guildId === guildId &&
        isSameUser(ticket, userId) &&
        isSameType(ticket, type) &&
        isActiveTicket(ticket)
      );
    }) || null
  );
}

async function findActiveTickets({ guildId, userId, type } = {}) {
  const tickets = await getAllTickets(guildId);

  return tickets.filter((ticket) => {
    return (
      ticket.guildId === guildId &&
      isSameUser(ticket, userId) &&
      isSameType(ticket, type) &&
      isActiveTicket(ticket)
    );
  });
}

function checkCooldown({
  guildId,
  userId,
  type,
  cooldownMs = DEFAULT_COOLDOWN_MS,
} = {}) {
  const cleanCooldownMs = Number(cooldownMs || 0);

  if (cleanCooldownMs <= 0) {
    return {
      allowed: true,
      remainingMs: 0,
    };
  }

  const key = getCooldownKey(guildId, userId, type);
  const lastUsed = memoryCooldowns.get(key);

  if (!lastUsed) {
    return {
      allowed: true,
      remainingMs: 0,
    };
  }

  const elapsed = now() - lastUsed;
  const remainingMs = cleanCooldownMs - elapsed;

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

function setCooldown({ guildId, userId, type } = {}) {
  if (!guildId || !userId) return false;

  const key = getCooldownKey(guildId, userId, type);
  memoryCooldowns.set(key, now());

  return true;
}

function clearCooldown({ guildId, userId, type } = {}) {
  if (!guildId || !userId) return false;

  const key = getCooldownKey(guildId, userId, type);
  memoryCooldowns.delete(key);

  return true;
}

function formatRemaining(ms) {
  const seconds = Math.ceil(Number(ms || 0) / 1000);

  if (seconds <= 1) return '1s';
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.ceil(seconds / 60);

  if (minutes <= 1) return '1m';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.ceil(minutes / 60);

  if (hours <= 1) return '1h';

  return `${hours}h`;
}

function resolveConfiguredMax({
  maxOpenTicketsPerUser = null,
  maxOpenTickets = null,
  maxActiveTicketsPerUser = null,
  oneActivePerType = true,
} = {}) {
  const raw =
    maxOpenTicketsPerUser ??
    maxOpenTickets ??
    maxActiveTicketsPerUser ??
    (oneActivePerType ? 1 : 0);

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    return oneActivePerType ? 1 : 0;
  }

  return Math.max(0, Math.floor(value));
}

function buildLimitReason({
  type,
  count,
  max,
} = {}) {
  const label = formatTypeLabel(type);

  if (max === 1) {
    return `You already have an active ${label} ticket.`;
  }

  return `You already have ${count}/${max} active ${label} tickets.`;
}

async function checkPanelLimit({
  guildId,
  userId,
  type,
  maxOpenTicketsPerUser = null,
  maxOpenTickets = null,
  maxActiveTicketsPerUser = null,
  oneActivePerType = true,
} = {}) {
  const configuredMax = resolveConfiguredMax({
    maxOpenTicketsPerUser,
    maxOpenTickets,
    maxActiveTicketsPerUser,
    oneActivePerType,
  });

  const activeTickets = await findActiveTickets({
    guildId,
    userId,
    type,
  });

  if (configuredMax === 0) {
    return {
      allowed: true,
      unlimited: true,
      count: activeTickets.length,
      maxOpenTickets: 0,
      maxOpenTicketsPerUser: 0,
      tickets: activeTickets,
    };
  }

  if (activeTickets.length >= configuredMax) {
    const firstTicket = activeTickets[0] || null;

    return {
      allowed: false,
      reason: buildLimitReason({
        type,
        count: activeTickets.length,
        max: configuredMax,
      }),
      code:
        configuredMax === 1
          ? 'DUPLICATE_ACTIVE_TICKET'
          : 'MAX_ACTIVE_TICKETS_REACHED',
      ticket: firstTicket,
      tickets: activeTickets,
      count: activeTickets.length,
      maxOpenTickets: configuredMax,
      maxOpenTicketsPerUser: configuredMax,
      unlimited: false,
    };
  }

  return {
    allowed: true,
    unlimited: false,
    count: activeTickets.length,
    maxOpenTickets: configuredMax,
    maxOpenTicketsPerUser: configuredMax,
    tickets: activeTickets,
  };
}

async function canCreateTicket({
  guildId,
  userId,
  type,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  oneActivePerType = true,
  maxOpenTickets = null,
  maxOpenTicketsPerUser = null,
  maxActiveTicketsPerUser = null,
} = {}) {
  if (!guildId) {
    return {
      allowed: false,
      reason: 'Missing guild id.',
      code: 'MISSING_GUILD_ID',
    };
  }

  if (!userId) {
    return {
      allowed: false,
      reason: 'Missing user id.',
      code: 'MISSING_USER_ID',
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

  const limit = await checkPanelLimit({
    guildId,
    userId,
    type,
    oneActivePerType,
    maxOpenTickets,
    maxOpenTicketsPerUser,
    maxActiveTicketsPerUser,
  });

  if (!limit.allowed) {
    return limit;
  }

  return {
    allowed: true,
    code: 'ALLOWED',
    count: limit.count,
    maxOpenTickets: limit.maxOpenTickets,
    maxOpenTicketsPerUser: limit.maxOpenTicketsPerUser,
    unlimited: limit.unlimited,
  };
}

async function markTicketCreated({
  guildId,
  userId,
  type,
} = {}) {
  if (!guildId || !userId) return false;

  return setCooldown({
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

  checkPanelLimit,

  findActiveTicket,
  findActiveTickets,

  checkCooldown,
  setCooldown,
  clearCooldown,

  formatRemaining,
  formatTypeLabel,
  normaliseStatus,
  normaliseType,
};