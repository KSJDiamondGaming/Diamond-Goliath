'use strict';

const {
  EmbedBuilder,
} = require('discord.js');

const ticketManager = require('./ticketManager');
const ticketTimeline = require('./ticketTimeline');
const ticketTranscriptManager = require('./ticketTranscriptManager');
const ticketSocketEvents = require('./ticketSocketEvents');

const {
  getTicket,
  updateTicket,
  deleteTicket: deleteStoredTicket,
  getPanel,
} = require('./ticketStore');

const {
  buildTicketChannelName,
  closeTicketChannel,
  archiveTicketChannel,
  reopenTicketChannel,
  deleteTicketChannel,
  syncTicketChannelPermissions,
} = require('./ticketChannelManager');

const {
  getTicketActionRows,
  getClosedTicketActionRows,
  getArchivedTicketActionRows,
} = require('./ticketChannelButtons');

const {
  sendTicketControlMessage,
} = require('./ticketPanelManager');

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

const PRIORITY_LABELS = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

function now() {
  return new Date().toISOString();
}

function normaliseStatus(status) {
  return String(status || STATUS.OPEN).toLowerCase();
}

function normalisePriority(priority) {
  const value = String(priority || PRIORITY.NORMAL).toLowerCase();

  if (Object.values(PRIORITY).includes(value)) {
    return value;
  }

  return PRIORITY.NORMAL;
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

function getTicketPanel(ticket) {
  if (!ticket?.guildId) return null;

  const panelId =
    ticket.metadata?.panelId ||
    ticket.panelId ||
    ticket.sourceId ||
    null;

  if (!panelId) return null;

  return getPanel(ticket.guildId, panelId);
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

async function addStaffActivity(
  ticket,
  actor,
  type,
  message,
  metadata = {}
) {
  if (!ticket?.guildId || !ticket?.ticketId) {
    return false;
  }

  try {
    await ticketTimeline.addTimelineEntry(
      ticket.guildId,
      ticket.ticketId,
      {
        type,
        actorId: getActor(actor).id,
        actorTag: getActor(actor).tag,
        message,
        metadata,
      }
    );

    return true;
  } catch {
    return false;
  }
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

async function refreshTicketControlMessage(client, ticket) {
  if (!client || !ticket?.guildId || !ticket?.discordChannelId) {
    return false;
  }

  const guild = await getGuildFromClient(client, ticket.guildId);
  if (!guild) return false;

  const channel = await guild.channels
    .fetch(ticket.discordChannelId)
    .catch(() => null);

  if (!channel) return false;

  const messageId =
    ticket.discordMessageId ||
    ticket.messageId ||
    null;

  let message = null;

  if (messageId) {
    message = await channel.messages
      .fetch(messageId)
      .catch(() => null);
  }

  if (!message) {
    const messages = await channel.messages
      .fetch({ limit: 20 })
      .catch(() => null);

    message = messages?.find(
      (msg) =>
        msg.author?.id === client.user?.id &&
        msg.embeds?.[0]?.title?.startsWith('🎫')
    );
  }

  if (!message?.editable) return false;

  const panel = getTicketPanel(ticket);

  const payload = await sendTicketControlMessage({
    channel: {
      send: async (data) => data,
    },
    ticket,
    panel,
    user: null,
  });

  let components = getTicketActionRows(ticket, {
    allowReopen: true,
    allowDelete: true,
  });

  const status = normaliseStatus(ticket.status);

  if (status === STATUS.CLOSED) {
    components = getClosedTicketActionRows(ticket, {
      allowDelete: true,
    });
  }

  if (status === STATUS.ARCHIVED) {
    components = getArchivedTicketActionRows(ticket, {
      allowDelete: true,
    });
  }

  await message.edit({
    embeds: payload.embeds || [],
    components,
  });

  return true;
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
        ticketSocketEvents.EVENTS.TRANSCRIPT_CREATED,
        { transcript }
      );

      if (transcript.upload?.uploaded) {
        emitAction(
          options.io,
          ticket,
          ticketSocketEvents.EVENTS.TRANSCRIPT_UPLOADED,
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

async function maybeSyncPermissions(ticket, options = {}) {
  if (!options.client) return false;

  const guild = await getGuildFromClient(options.client, ticket.guildId);
  if (!guild) return false;

  const channel = await getDiscordChannel(options.client, ticket);
  if (!channel) return false;

  const panel = getTicketPanel(ticket);

  return syncTicketChannelPermissions({
    guild,
    channel,
    ticket,
    panel,
  });
}

async function maybeCloseChannel(ticket, options = {}) {
  if (!options.client) return null;

  const channel = await getDiscordChannel(options.client, ticket);
  if (!channel) return null;

  const guild = channel.guild;
  const panel = getTicketPanel(ticket);

  return closeTicketChannel({
    guild,
    channel,
    ticket,
    panel,
    actorId: options.actorId || null,
  });
}

async function maybeArchiveChannel(ticket, options = {}) {
  if (!options.client) return null;

  const channel = await getDiscordChannel(options.client, ticket);
  if (!channel) return null;

  const guild = channel.guild;
  const panel = getTicketPanel(ticket);

  return archiveTicketChannel({
    guild,
    channel,
    ticket,
    panel,
    actorId: options.actorId || null,
  });
}

async function maybeReopenChannel(ticket, options = {}) {
  if (!options.client) return null;

  const channel = await getDiscordChannel(options.client, ticket);
  if (!channel) return null;

  const guild = channel.guild;
  const panel = getTicketPanel(ticket);

  return reopenTicketChannel({
    guild,
    channel,
    ticket,
    panel,
    actorId: options.actorId || null,
  });
}

async function maybeDeleteChannel(ticket, options = {}) {
  if (!options.client) return null;

  const channel = await getDiscordChannel(options.client, ticket);
  if (!channel) return null;

  const guild = channel.guild;

  return deleteTicketChannel({
    guild,
    channel,
    ticket,
    actorId: options.actorId || null,
  });
}

async function claim(ticketOrId, actor, options = {}) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  const actorData = getActor(actor);

  if (normaliseStatus(ticket.status) === STATUS.ARCHIVED) {
    throw new Error('Archived tickets cannot be claimed.');
  }

  if (normaliseStatus(ticket.status) === STATUS.CLOSED) {
    throw new Error('Closed tickets cannot be claimed.');
  }

  if (ticket.claimedById) {
    return ticket;
  }

  const updated = await saveTicket(ticket, {
    status: STATUS.CLAIMED,
    claimedById: actorData.id,
    claimedAt: now(),
    statusChangedAt: now(),
  });

  await addStaffActivity(
    updated,
    actor,
    'ticket_claimed',
    `Ticket claimed by ${actorData.tag}.`,
    {
      claimedById: actorData.id,
    }
  );

  await maybeSyncPermissions(updated, options);

  emitAction(
    options.io,
    updated,
    ticketSocketEvents.EVENTS.TICKET_CLAIMED,
    {
      actorId: actorData.id,
    }
  );

  await refreshTicketControlMessage(options.client, updated);

  return updated;
}

async function close(ticketOrId, actor, options = {}) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  const actorData = getActor(actor);
  const currentStatus = normaliseStatus(ticket.status);

  if (currentStatus === STATUS.CLOSED) {
    return ticket;
  }

  if (currentStatus === STATUS.ARCHIVED) {
    throw new Error('Archived tickets cannot be closed.');
  }

  const updated = await saveTicket(ticket, {
    status: STATUS.CLOSED,
    closedById: actorData.id,
    closedAt: now(),
    closeReason: options.reason || null,
    statusChangedAt: now(),
  });

  await createTranscript(updated, actor, {
    ...options,
    reason: options.reason || 'Ticket closed',
  });

  await maybeCloseChannel(updated, {
    ...options,
    actorId: actorData.id,
  });

  await addStaffActivity(
    updated,
    actor,
    'ticket_closed',
    `Ticket closed by ${actorData.tag}.`,
    {
      reason: options.reason || null,
    }
  );

  emitAction(
    options.io,
    updated,
    ticketSocketEvents.EVENTS.TICKET_CLOSED,
    {
      actorId: actorData.id,
      reason: options.reason || null,
    }
  );

  await refreshTicketControlMessage(options.client, updated);

  return updated;
}

async function archive(ticketOrId, actor, options = {}) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  const actorData = getActor(actor);
  const currentStatus = normaliseStatus(ticket.status);

  if (currentStatus === STATUS.ARCHIVED) {
    return ticket;
  }

  const updated = await saveTicket(ticket, {
    status: STATUS.ARCHIVED,
    archivedById: actorData.id,
    archivedAt: now(),
    archiveReason: options.reason || null,
    statusChangedAt: now(),
  });

  await createTranscript(updated, actor, {
    ...options,
    reason: options.reason || 'Ticket archived',
  });

  await maybeArchiveChannel(updated, {
    ...options,
    actorId: actorData.id,
  });

  await addStaffActivity(
    updated,
    actor,
    'ticket_archived',
    `Ticket archived by ${actorData.tag}.`,
    {
      reason: options.reason || null,
    }
  );

  emitAction(
    options.io,
    updated,
    ticketSocketEvents.EVENTS.TICKET_ARCHIVED,
    {
      actorId: actorData.id,
      reason: options.reason || null,
    }
  );

  await refreshTicketControlMessage(options.client, updated);

  return updated;
}

async function reopen(ticketOrId, actor, options = {}) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  const actorData = getActor(actor);
  const currentStatus = normaliseStatus(ticket.status);

  if (
    currentStatus !== STATUS.CLOSED &&
    currentStatus !== STATUS.ARCHIVED
  ) {
    return ticket;
  }

  const updated = await saveTicket(ticket, {
    status: STATUS.OPEN,
    reopenedById: actorData.id,
    reopenedAt: now(),
    closedById: null,
    closedAt: null,
    closeReason: null,
    archivedById: null,
    archivedAt: null,
    archiveReason: null,
    statusChangedAt: now(),
  });

  await maybeReopenChannel(updated, {
    ...options,
    actorId: actorData.id,
  });

  await addStaffActivity(
    updated,
    actor,
    'ticket_reopened',
    `Ticket reopened by ${actorData.tag}.`,
    {}
  );

  emitAction(
    options.io,
    updated,
    ticketSocketEvents.EVENTS.TICKET_REOPENED,
    {
      actorId: actorData.id,
    }
  );

  await refreshTicketControlMessage(options.client, updated);

  return updated;
}

async function deleteTicket(ticketOrId, actor, options = {}) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  const actorData = getActor(actor);

  await createTranscript(ticket, actor, {
    ...options,
    reason: options.reason || 'Ticket deleted',
  });

  await maybeDeleteChannel(ticket, {
    ...options,
    actorId: actorData.id,
  });

  await addStaffActivity(
    ticket,
    actor,
    'ticket_deleted',
    `Ticket deleted by ${actorData.tag}.`,
    {
      reason: options.reason || null,
    }
  );

  const updated = await saveTicket(ticket, {
    deletedById: actorData.id,
    deletedAt: now(),
    statusChangedAt: now(),
  });

  emitAction(
    options.io,
    updated,
    ticketSocketEvents.EVENTS.TICKET_DELETED,
    {
      actorId: actorData.id,
      reason: options.reason || null,
    }
  );

  if (options.hardDelete === true) {
    deleteStoredTicket(
      ticket.guildId,
      ticket.ticketId
    );
  }

  return updated;
}

async function setPriority(
  ticketOrId,
  priority,
  actor,
  options = {}
) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  const actorData = getActor(actor);
  const cleanPriority = normalisePriority(priority);
  const previousPriority = normalisePriority(ticket.priority);

  if (previousPriority === cleanPriority) {
    return ticket;
  }

  const updated = await saveTicket(ticket, {
    priority: cleanPriority,
    statusChangedAt: now(),
  });

  await addStaffActivity(
    updated,
    actor,
    'ticket_priority_changed',
    `Priority changed from ${PRIORITY_LABELS[previousPriority]} to ${PRIORITY_LABELS[cleanPriority]} by ${actorData.tag}.`,
    {
      previousPriority,
      priority: cleanPriority,
    }
  );

  const channel = await getDiscordChannel(options.client, updated);

  if (channel) {
    const panel = getTicketPanel(updated);

    await channel
      .setName(
        buildTicketChannelName(updated, channel.guild, panel)
      )
      .catch(() => null);
  }

  emitAction(
    options.io,
    updated,
    ticketSocketEvents.EVENTS.TICKET_UPDATED,
    {
      actorId: actorData.id,
      previousPriority,
      priority: cleanPriority,
    }
  );

  await refreshTicketControlMessage(options.client, updated);

  return updated;
}

async function assign(ticketOrId, staffId, actor, options = {}) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  const actorData = getActor(actor);

  const assignedStaffIds = [
    ...new Set([
      ...(Array.isArray(ticket.assignedStaffIds)
        ? ticket.assignedStaffIds
        : []),
      staffId,
    ].filter(Boolean)),
  ];

  const updated = await saveTicket(ticket, {
    assignedStaffIds,
  });

  await addStaffActivity(
    updated,
    actor,
    'ticket_assigned',
    `Ticket assigned by ${actorData.tag}.`,
    {
      staffId,
    }
  );

  emitAction(
    options.io,
    updated,
    ticketSocketEvents.EVENTS.TICKET_UPDATED,
    {
      actorId: actorData.id,
      assignedStaffIds,
    }
  );

  await refreshTicketControlMessage(options.client, updated);

  return updated;
}

async function addNote(ticketOrId, note, actor, options = {}) {
  const ticket = await fetchTicket(
    ticketOrId,
    options.guildId
  );

  const actorData = getActor(actor);

  const notes = Array.isArray(ticket.notes)
    ? [...ticket.notes]
    : [];

  notes.push({
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    actorId: actorData.id,
    actorTag: actorData.tag,
    note: String(note || '').slice(0, 2000),
    createdAt: now(),
  });

  const updated = await saveTicket(ticket, {
    notes,
  });

  await addStaffActivity(
    updated,
    actor,
    'ticket_note_added',
    `Internal note added by ${actorData.tag}.`,
    {}
  );

  emitAction(
    options.io,
    updated,
    ticketSocketEvents.EVENTS.TICKET_UPDATED,
    {
      actorId: actorData.id,
    }
  );

  await refreshTicketControlMessage(options.client, updated);

  return updated;
}

module.exports = {
  STATUS,
  PRIORITY,
  PRIORITY_LABELS,

  claim,
  close,
  archive,
  reopen,
  deleteTicket,

  setPriority,
  assign,
  addNote,

  refreshTicketControlMessage,
  createTranscript,

  getTicketPanel,
  fetchTicket,
};
