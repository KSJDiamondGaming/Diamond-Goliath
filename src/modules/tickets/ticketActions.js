'use strict';

/**
 * GOLIATH UNIVERSAL TICKET ACTION SYSTEM
 *
 * Standardized to existing ticketStore architecture.
 *
 * Uses:
 * - ticket.ticketId
 * - ticket.guildId
 * - ticket.discordChannelId
 * - creatorId
 * - claimedById
 *
 * Discord channel operations are delegated to ticketChannelManager.
 * Realtime dashboard updates are emitted through ticketSocketEvents when options.io is provided.
 */

const { ChannelType } = require('discord.js');

const ticketManager = require('./ticketManager');
const ticketTimeline = require('./ticketTimeline');
const ticketTranscriptManager = require('./ticketTranscriptManager');
const ticketSocketEvents = require('./ticketSocketEvents');

const {
  getTicket,
  updateTicket,
  deleteTicket: deleteStoredTicket,
} = require('./ticketStore');

const {
  closeTicketChannel,
  archiveTicketChannel,
  reopenTicketChannel,
  deleteTicketChannel,
} = require('./ticketChannelManager');

const STATUS = {
  OPEN: 'open',
  CLAIMED: 'claimed',
  WAITING_USER: 'waiting_user',
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  DENIED: 'denied',
  CLOSED: 'closed',
  ARCHIVED: 'archived',
};

const PRIORITY = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

function now() {
  return new Date().toISOString();
}

function getActor(actor) {
  if (!actor) {
    return {
      id: null,
      tag: 'System',
    };
  }

  return {
    id: actor.id || actor.user?.id || null,
    tag:
      actor.tag ||
      actor.user?.tag ||
      actor.username ||
      actor.user?.username ||
      'Unknown Staff',
  };
}

async function fetchTicket(ticketOrId, guildId = null) {
  if (!ticketOrId) {
    throw new Error('Missing ticket.');
  }

  if (typeof ticketOrId === 'object') {
    return ticketOrId;
  }

  if (!guildId) {
    throw new Error('Missing guild id.');
  }

  const ticket = getTicket(guildId, ticketOrId);

  if (!ticket) {
    throw new Error('Ticket not found.');
  }

  return ticket;
}

async function saveTicket(ticket, updates = {}) {
  if (!ticket?.guildId || !ticket?.ticketId) {
    throw new Error('Invalid ticket.');
  }

  return updateTicket(
    ticket.guildId,
    ticket.ticketId,
    {
      ...updates,
      updatedAt: now(),
    }
  );
}

function emitAction(io, ticket, event, payload = {}) {
  if (!io || !ticket?.guildId) return false;

  return ticketSocketEvents.emitForTicket(
    io,
    ticket,
    event,
    payload
  );
}

async function getGuildFromClient(client, guildId) {
  if (!client || !guildId) return null;

  return client.guilds
    .fetch(guildId)
    .catch(() => null);
}

async function getDiscordChannel(client, ticket) {
  if (!client || !ticket?.guildId || !ticket?.discordChannelId) {
    return null;
  }

  const guild = await getGuildFromClient(client, ticket.guildId);
  if (!guild) return null;

  return guild.channels
    .fetch(ticket.discordChannelId)
    .catch(() => null);
}

async function createTranscript(ticket, actor, options = {}) {
  if (!options.client || options.createTranscript === false) {
    return null;
  }

  try {
    const transcript =
      await ticketTranscriptManager.createAndUploadTranscript(
        options.client,
        ticket,
        {
          generatedBy: getActor(actor).id,
          reason: options.reason || 'Ticket action',
          channelId: options.transcriptChannelId,
          transcriptChannelId: options.transcriptChannelId,
          limit: options.transcriptLimit,
        }
      );

    if (transcript) {
      emitAction(
        options.io,
        ticket,
        ticketSocketEvents.TICKET_SOCKET_EVENTS.TRANSCRIPT_CREATED,
        { transcript }
      );

      if (transcript.upload?.uploaded) {
        emitAction(
          options.io,
          ticket,
          ticketSocketEvents.TICKET_SOCKET_EVENTS.TRANSCRIPT_UPLOADED,
          {
            upload: transcript.upload,
          }
        );
      }
    }

    return transcript;
  } catch (error) {
    console.error(
      '[TicketActions] Failed to create transcript:',
      error
    );

    return {
      error: true,
      message: error.message,
    };
  }
}

async function maybeCloseChannel(ticket, options = {}) {
  if (!options.client) return null;

  const guild = await getGuildFromClient(
    options.client,
    ticket.guildId
  );

  if (!guild) return null;

  const channel = await closeTicketChannel({
    guild,
    ticket,
  });

  if (channel) {
    emitAction(
      options.io,
      ticket,
      ticketSocketEvents.TICKET_SOCKET_EVENTS.CHANNEL_CLOSED,
      {
        channelId: channel.id,
      }
    );
  }

  return channel;
}

async function maybeArchiveChannel(ticket, options = {}) {
  if (!options.client) return null;

  const guild = await getGuildFromClient(
    options.client,
    ticket.guildId
  );

  if (!guild) return null;

  const channel = await archiveTicketChannel({
    guild,
    ticket,
    panel: options.panel || null,
  });

  if (channel) {
    emitAction(
      options.io,
      ticket,
      ticketSocketEvents.TICKET_SOCKET_EVENTS.CHANNEL_ARCHIVED,
      {
        channelId: channel.id,
      }
    );
  }

  return channel;
}

async function maybeReopenChannel(ticket, options = {}) {
  if (!options.client) return null;

  const guild = await getGuildFromClient(
    options.client,
    ticket.guildId
  );

  if (!guild) return null;

  const channel = await reopenTicketChannel({
    guild,
    ticket,
  });

  if (channel) {
    emitAction(
      options.io,
      ticket,
      ticketSocketEvents.TICKET_SOCKET_EVENTS.CHANNEL_REOPENED,
      {
        channelId: channel.id,
      }
    );
  }

  return channel;
}

async function maybeDeleteChannel(ticket, options = {}) {
  if (!options.client || options.deleteDiscordChannel === false) {
    return false;
  }

  const guild = await getGuildFromClient(
    options.client,
    ticket.guildId
  );

  if (!guild) return false;

  const deleted = await deleteTicketChannel({
    guild,
    ticket,
    reason: options.reason || 'Ticket deleted',
  });

  if (deleted) {
    emitAction(
      options.io,
      ticket,
      ticketSocketEvents.TICKET_SOCKET_EVENTS.CHANNEL_DELETED,
      {
        channelId: ticket.discordChannelId,
      }
    );
  }

  return deleted;
}

async function claim(ticketOrId, actor, options = {}) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  if (
    ticket.status === STATUS.CLOSED ||
    ticket.status === STATUS.ARCHIVED
  ) {
    throw new Error(
      'Cannot claim a closed or archived ticket.'
    );
  }

  const updated = await ticketManager.claimTicket({
    guildId: ticket.guildId,
    ticketId: ticket.ticketId,
    actorId: getActor(actor).id,
  });

  await ticketTimeline.addTicketClaimedEntry(
    ticket.guildId,
    ticket.ticketId,
    getActor(actor).id
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.TICKET_SOCKET_EVENTS.CLAIMED
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.TICKET_SOCKET_EVENTS.UPDATED
  );

  return updated;
}

async function close(ticketOrId, actor, options = {}) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  const transcript = await createTranscript(
    ticket,
    actor,
    {
      ...options,
      reason: options.reason || 'Ticket closed',
    }
  );

  const updated = await ticketManager.closeTicket({
    guildId: ticket.guildId,
    ticketId: ticket.ticketId,
    actorId: getActor(actor).id,
    reason: options.reason,
  });

  const saved = await saveTicket(ticket, {
    transcript,
    closedById: getActor(actor).id,
    closedAt: now(),
    closeReason: options.reason || null,
  });

  await maybeCloseChannel(saved || ticket, options);

  await ticketTimeline.addTicketClosedEntry(
    ticket.guildId,
    ticket.ticketId,
    getActor(actor).id,
    options.reason || 'Ticket closed.'
  );

  emitAction(
    options.io,
    saved || updated || ticket,
    ticketSocketEvents.TICKET_SOCKET_EVENTS.CLOSED
  );

  emitAction(
    options.io,
    saved || updated || ticket,
    ticketSocketEvents.TICKET_SOCKET_EVENTS.UPDATED
  );

  return saved || updated;
}

async function reopen(ticketOrId, actor, options = {}) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  const updated = await ticketManager.reopenTicket({
    guildId: ticket.guildId,
    ticketId: ticket.ticketId,
    actorId: getActor(actor).id,
  });

  await maybeReopenChannel(updated || ticket, options);

  await ticketTimeline.addTicketReopenedEntry(
    ticket.guildId,
    ticket.ticketId,
    getActor(actor).id
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.TICKET_SOCKET_EVENTS.REOPENED
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.TICKET_SOCKET_EVENTS.UPDATED
  );

  return updated;
}

async function archive(ticketOrId, actor, options = {}) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  const transcript = await createTranscript(
    ticket,
    actor,
    {
      ...options,
      reason: options.reason || 'Ticket archived',
    }
  );

  const updated = await saveTicket(ticket, {
    status: STATUS.ARCHIVED,
    archivedById: getActor(actor).id,
    archivedAt: now(),
    transcript,
  });

  await maybeArchiveChannel(updated || ticket, options);

  await ticketTimeline.addTicketArchivedEntry(
    ticket.guildId,
    ticket.ticketId,
    getActor(actor).id
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.TICKET_SOCKET_EVENTS.ARCHIVED
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.TICKET_SOCKET_EVENTS.UPDATED
  );

  return updated;
}

async function deleteTicket(ticketOrId, actor, options = {}) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  const transcript = options.createTranscript === false
    ? null
    : await createTranscript(
        ticket,
        actor,
        {
          ...options,
          reason: options.reason || 'Ticket deleted',
        }
      );

  await saveTicket(ticket, {
    transcript,
    deletedById: getActor(actor).id,
    deletedAt: now(),
  });

  await ticketTimeline.addTicketDeletedEntry(
    ticket.guildId,
    ticket.ticketId,
    getActor(actor).id,
    options.reason || 'Ticket deleted.'
  );

  await maybeDeleteChannel(ticket, options);

  await deleteStoredTicket(
    ticket.guildId,
    ticket.ticketId
  );

  ticketSocketEvents.emitTicketDeleted(
    options.io,
    ticket.guildId,
    ticket.ticketId
  );

  return true;
}

async function addUser(
  client,
  ticketOrId,
  userId,
  actor,
  options = {}
) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  if (!userId) {
    throw new Error('Missing user id.');
  }

  const channel = await getDiscordChannel(
    client,
    ticket
  );

  if (
    channel &&
    channel.type === ChannelType.GuildText
  ) {
    await channel.permissionOverwrites.edit(
      userId,
      {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
      }
    );
  }

  const existingUsers = Array.isArray(ticket.allowedUserIds)
    ? ticket.allowedUserIds
    : [];

  const updatedUsers = [...new Set([
    ...existingUsers,
    userId,
  ])];

  const updated = await saveTicket(ticket, {
    allowedUserIds: updatedUsers,
  });

  await ticketTimeline.addUserAddedEntry(
    ticket.guildId,
    ticket.ticketId,
    getActor(actor).id,
    userId
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.TICKET_SOCKET_EVENTS.UPDATED
  );

  return updated;
}

async function removeUser(
  client,
  ticketOrId,
  userId,
  actor,
  options = {}
) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  if (!userId) {
    throw new Error('Missing user id.');
  }

  const channel = await getDiscordChannel(
    client,
    ticket
  );

  if (
    channel &&
    channel.type === ChannelType.GuildText
  ) {
    await channel.permissionOverwrites
      .delete(userId)
      .catch(() => null);
  }

  const existingUsers = Array.isArray(ticket.allowedUserIds)
    ? ticket.allowedUserIds
    : [];

  const updatedUsers = existingUsers.filter(
    (id) => id !== userId
  );

  const updated = await saveTicket(ticket, {
    allowedUserIds: updatedUsers,
  });

  await ticketTimeline.addUserRemovedEntry(
    ticket.guildId,
    ticket.ticketId,
    getActor(actor).id,
    userId
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.TICKET_SOCKET_EVENTS.UPDATED
  );

  return updated;
}

async function rename(
  client,
  ticketOrId,
  newName,
  actor,
  options = {}
) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  const cleanName = String(newName || '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);

  if (!cleanName) {
    throw new Error('Invalid ticket name.');
  }

  const channel = await getDiscordChannel(
    client,
    ticket
  );

  if (channel) {
    await channel.setName(cleanName);
  }

  const updated = await saveTicket(ticket, {
    title: cleanName,
  });

  await ticketTimeline.addTimelineEntry(
    ticket.guildId,
    ticket.ticketId,
    {
      type: 'ticket_renamed',
      actorId: getActor(actor).id,
      message: `Ticket renamed to ${cleanName}.`,
    }
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.TICKET_SOCKET_EVENTS.UPDATED
  );

  return updated;
}

async function changePriority(
  ticketOrId,
  priority,
  actor,
  options = {}
) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  const nextPriority = String(priority || '').toLowerCase();

  if (!Object.values(PRIORITY).includes(nextPriority)) {
    throw new Error(`Invalid priority: ${priority}`);
  }

  const updated = await saveTicket(ticket, {
    priority: nextPriority,
  });

  ticketTimeline.addPriorityChangeEntry(
    ticket.guildId,
    ticket.ticketId,
    getActor(actor).id,
    ticket.priority,
    nextPriority
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.TICKET_SOCKET_EVENTS.PRIORITY_CHANGED
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.TICKET_SOCKET_EVENTS.UPDATED
  );

  return updated;
}

async function changeStatus(
  ticketOrId,
  status,
  actor,
  options = {}
) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  const nextStatus = String(status || '').toLowerCase();

  if (!Object.values(STATUS).includes(nextStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const updated = await ticketManager.updateTicketStatus({
    guildId: ticket.guildId,
    ticketId: ticket.ticketId,
    actorId: getActor(actor).id,
    status: nextStatus,
  });

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.TICKET_SOCKET_EVENTS.STATUS_CHANGED
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.TICKET_SOCKET_EVENTS.UPDATED
  );

  return updated;
}

module.exports = {
  STATUS,
  PRIORITY,

  claim,
  close,
  reopen,
  archive,
  deleteTicket,

  addUser,
  removeUser,
  rename,

  changePriority,
  changeStatus,

  fetchTicket,
  saveTicket,
};