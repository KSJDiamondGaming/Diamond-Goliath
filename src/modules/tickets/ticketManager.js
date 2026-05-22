// src/modules/tickets/ticketManager.js

const crypto = require('crypto');

const {
  TICKET_STATUS,
} = require('./ticketDefaults');

const {
  getTicket,
  getAllTickets,
  createTicket,
  updateTicket,
  deleteTicket,
} = require('./ticketStore');

const {
  addTicketCreatedEntry,
  addStatusChangeEntry,
  addAssignmentEntry,
  addNoteEntry,
} = require('./ticketTimeline');

function generateTicketId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

async function createNewTicket({
  guildId,
  creatorId,
  type,
  title,
  description = '',
  priority,
  source,
  sourceId = null,
  formSubmissionId = null,
  moderationCaseId = null,
  securityIncidentId = null,
  tags = [],
  metadata = {},
} = {}) {
  if (!guildId) {
    throw new Error('Missing guildId');
  }

  const ticket = createTicket(guildId, {
    ticketId: generateTicketId(),

    creatorId,

    type,
    title,
    description,

    priority,

    source,
    sourceId,

    formSubmissionId,
    moderationCaseId,
    securityIncidentId,

    tags,
    metadata,

    createdAt: now(),
  });

  addTicketCreatedEntry(
    guildId,
    ticket.ticketId,
    creatorId
  );

  return ticket;
}

async function closeTicket({
  guildId,
  ticketId,
  actorId,
  reason = null,
} = {}) {
  const ticket = getTicket(guildId, ticketId);

  if (!ticket) {
    return null;
  }

  if (ticket.status === TICKET_STATUS.CLOSED) {
    return ticket;
  }

  const updatedTicket = updateTicket(
    guildId,
    ticketId,
    {
      status: TICKET_STATUS.CLOSED,
      closedAt: now(),
      closedById: actorId || null,
      closeReason: reason || null,
    }
  );

  return updatedTicket;
}

async function reopenTicket({
  guildId,
  ticketId,
  actorId,
} = {}) {
  const ticket = getTicket(guildId, ticketId);

  if (!ticket) {
    return null;
  }

  const previousStatus = ticket.status;

  const updatedTicket = updateTicket(
    guildId,
    ticketId,
    {
      status: TICKET_STATUS.OPEN,
      closedAt: null,
      closedById: null,
    }
  );

  addStatusChangeEntry(
    guildId,
    ticketId,
    actorId,
    previousStatus,
    TICKET_STATUS.OPEN
  );

  return updatedTicket;
}

async function claimTicket({
  guildId,
  ticketId,
  actorId,
} = {}) {
  const ticket = getTicket(guildId, ticketId);

  if (!ticket) {
    return null;
  }

  const assignedStaffIds = Array.isArray(
    ticket.assignedStaffIds
  )
    ? [...ticket.assignedStaffIds]
    : [];

  if (
    actorId &&
    !assignedStaffIds.includes(actorId)
  ) {
    assignedStaffIds.push(actorId);
  }

  const previousStatus = ticket.status;

  const updatedTicket = updateTicket(
    guildId,
    ticketId,
    {
      claimedById: actorId,
      assignedStaffIds,
      status: TICKET_STATUS.CLAIMED,
    }
  );

  if (previousStatus !== TICKET_STATUS.CLAIMED) {
    addStatusChangeEntry(
      guildId,
      ticketId,
      actorId,
      previousStatus,
      TICKET_STATUS.CLAIMED
    );
  }

  return updatedTicket;
}

async function assignTicket({
  guildId,
  ticketId,
  actorId,
  assignedUserId,
} = {}) {
  const ticket = getTicket(guildId, ticketId);

  if (!ticket) {
    return null;
  }

  const assignedStaffIds = Array.isArray(
    ticket.assignedStaffIds
  )
    ? [...ticket.assignedStaffIds]
    : [];

  if (
    assignedUserId &&
    !assignedStaffIds.includes(assignedUserId)
  ) {
    assignedStaffIds.push(assignedUserId);
  }

  const updatedTicket = updateTicket(
    guildId,
    ticketId,
    {
      assignedStaffIds,
    }
  );

  addAssignmentEntry(
    guildId,
    ticketId,
    actorId,
    assignedUserId
  );

  return updatedTicket;
}

async function updateTicketStatus({
  guildId,
  ticketId,
  actorId,
  status,
} = {}) {
  const ticket = getTicket(guildId, ticketId);

  if (!ticket) {
    return null;
  }

  const previousStatus = ticket.status;

  if (previousStatus === status) {
    return ticket;
  }

  const updates = {
    status,
  };

  if (status === TICKET_STATUS.CLOSED) {
    updates.closedAt = now();
  }

  if (status === TICKET_STATUS.ARCHIVED) {
    updates.archivedAt = now();
  }

  const updatedTicket = updateTicket(
    guildId,
    ticketId,
    updates
  );

  addStatusChangeEntry(
    guildId,
    ticketId,
    actorId,
    previousStatus,
    status
  );

  return updatedTicket;
}

async function addTicketNote({
  guildId,
  ticketId,
  actorId,
  note,
} = {}) {
  const ticket = getTicket(guildId, ticketId);

  if (!ticket) {
    return null;
  }

  const notes = Array.isArray(ticket.notes)
    ? [...ticket.notes]
    : [];

  const noteObject = {
    id: crypto.randomUUID(),
    authorId: actorId,
    content: note,
    createdAt: now(),
  };

  notes.push(noteObject);

  updateTicket(guildId, ticketId, {
    notes,
  });

  addNoteEntry(
    guildId,
    ticketId,
    actorId,
    note
  );

  return noteObject;
}

async function archiveTicket({
  guildId,
  ticketId,
  actorId,
} = {}) {
  const ticket = getTicket(guildId, ticketId);

  if (!ticket) {
    return null;
  }

  const previousStatus = ticket.status;

  const updatedTicket = updateTicket(
    guildId,
    ticketId,
    {
      status: TICKET_STATUS.ARCHIVED,
      archivedAt: now(),
      archivedById: actorId || null,
    }
  );

  addStatusChangeEntry(
    guildId,
    ticketId,
    actorId,
    previousStatus,
    TICKET_STATUS.ARCHIVED
  );

  return updatedTicket;
}

async function removeTicket({
  guildId,
  ticketId,
} = {}) {
  return deleteTicket(guildId, ticketId);
}

function getTicketById(
  guildId,
  ticketId
) {
  return getTicket(guildId, ticketId);
}

function getGuildTickets(guildId) {
  return getAllTickets(guildId);
}

/**
 * Aliases for compatibility
 */

function getTickets(guildId) {
  return getGuildTickets(guildId);
}

function getAllGuildTickets(guildId) {
  return getGuildTickets(guildId);
}

module.exports = {
  createNewTicket,

  closeTicket,
  reopenTicket,

  claimTicket,
  assignTicket,

  updateTicketStatus,

  addTicketNote,

  archiveTicket,
  removeTicket,

  getTicketById,
  getGuildTickets,

  getTickets,
  getAllGuildTickets,
};