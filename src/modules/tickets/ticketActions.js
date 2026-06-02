'use strict';

const {
  ChannelType,
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
} = require('./ticketStore');

const {
  buildTicketChannelName,
  closeTicketChannel,
  archiveTicketChannel,
  reopenTicketChannel,
  deleteTicketChannel,
} = require('./ticketChannelManager');

const {
  getTicketActionRows,
  getClosedTicketActionRows,
  getArchivedTicketActionRows,
} = require('./ticketChannelButtons');

const {
  getPanel,
} = require('./ticketStore');

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

  const panelId = ticket.metadata?.panelId || null;
  const panel = panelId ? getPanel(ticket.guildId, panelId) : null;

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

  const status = String(ticket.status || 'open').toLowerCase();

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

async function maybeCloseChannel(ticket, options = {}) {
  if (!options.client) return null;

  const guild = await getGuildFromClient(options.client, ticket.guildId);
  if (!guild) return null;

  const channel = await closeTicketChannel({
    guild,
    ticket,
  });

  if (channel) {
    emitAction(
      options.io,
      ticket,
      ticketSocketEvents.EVENTS.TICKET_CLOSED,
      {
        channelId: channel.id,
      }
    );
  }

  return channel;
}

async function maybeArchiveChannel(ticket, options = {}) {
  if (!options.client) return null;

  const guild = await getGuildFromClient(options.client, ticket.guildId);
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
      ticketSocketEvents.EVENTS.TICKET_ARCHIVED,
      {
        channelId: channel.id,
      }
    );
  }

  return channel;
}

async function maybeReopenChannel(ticket, options = {}) {
  if (!options.client) return null;

  const guild = await getGuildFromClient(options.client, ticket.guildId);
  if (!guild) return null;

  const channel = await reopenTicketChannel({
    guild,
    ticket,
  });

  if (channel) {
    emitAction(
      options.io,
      ticket,
      ticketSocketEvents.EVENTS.TICKET_REOPENED,
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

  const guild = await getGuildFromClient(options.client, ticket.guildId);
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
      ticketSocketEvents.EVENTS.TICKET_DELETED,
      {
        channelId: ticket.discordChannelId,
      }
    );
  }

  return deleted;
}

async function claim(ticketOrId, actor, options = {}) {
  const ticket = await fetchTicket(ticketOrId, options.guildId);

  if (
    ticket.status === STATUS.CLOSED ||
    ticket.status === STATUS.ARCHIVED
  ) {
    throw new Error('Cannot claim a closed or archived ticket.');
  }

  const actorData = getActor(actor);

  const updated = await ticketManager.claimTicket({
    guildId: ticket.guildId,
    ticketId: ticket.ticketId,
    actorId: actorData.id,
  });

  const saved = await saveTicket(updated || ticket, {
    claimedById: actorData.id,
    claimedAt: now(),
    statusChangedAt: now(),
  });

  await ticketTimeline.addTicketClaimedEntry(
    ticket.guildId,
    ticket.ticketId,
    actorData.id
  );

  await addStaffActivity(
    saved || updated || ticket,
    actor,
    'staff_claimed_ticket',
    `Ticket claimed by ${actorData.tag}.`,
    {
      claimedById: actorData.id,
    }
  );

  emitAction(
    options.io,
    saved || updated || ticket,
    ticketSocketEvents.EVENTS.TICKET_CLAIMED
  );

  emitAction(
    options.io,
    saved || updated || ticket,
    ticketSocketEvents.EVENTS.TICKET_UPDATED
  );

  return saved || updated;
}

async function close(ticketOrId, actor, options = {}) {
  const ticket = await fetchTicket(ticketOrId, options.guildId);
  const actorData = getActor(actor);

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
    actorId: actorData.id,
    reason: options.reason,
  });

  const saved = await saveTicket(updated || ticket, {
    transcript,
    closedById: actorData.id,
    closedAt: now(),
    closeReason: options.reason || null,
    statusChangedAt: now(),
  });

  await maybeCloseChannel(saved || updated || ticket, options);

  await ticketTimeline.addTicketClosedEntry(
    ticket.guildId,
    ticket.ticketId,
    actorData.id,
    options.reason || 'Ticket closed.'
  );

  await addStaffActivity(
    saved || updated || ticket,
    actor,
    'staff_closed_ticket',
    `Ticket closed by ${actorData.tag}.`,
    {
      reason: options.reason || null,
    }
  );

  emitAction(
    options.io,
    saved || updated || ticket,
    ticketSocketEvents.EVENTS.TICKET_CLOSED
  );

  emitAction(
    options.io,
    saved || updated || ticket,
    ticketSocketEvents.EVENTS.TICKET_UPDATED
  );

  return saved || updated;
}

async function reopen(ticketOrId, actor, options = {}) {
  const ticket = await fetchTicket(ticketOrId, options.guildId);
  const actorData = getActor(actor);

  const updated = await ticketManager.reopenTicket({
    guildId: ticket.guildId,
    ticketId: ticket.ticketId,
    actorId: actorData.id,
  });

  const saved = await saveTicket(updated || ticket, {
    reopenedById: actorData.id,
    reopenedAt: now(),
    statusChangedAt: now(),
  });

  await maybeReopenChannel(saved || updated || ticket, options);

  await ticketTimeline.addTicketReopenedEntry(
    ticket.guildId,
    ticket.ticketId,
    actorData.id
  );

  await addStaffActivity(
    saved || updated || ticket,
    actor,
    'staff_reopened_ticket',
    `Ticket reopened by ${actorData.tag}.`
  );

  emitAction(
    options.io,
    saved || updated || ticket,
    ticketSocketEvents.EVENTS.TICKET_REOPENED
  );

  emitAction(
    options.io,
    saved || updated || ticket,
    ticketSocketEvents.EVENTS.TICKET_UPDATED
  );

  return saved || updated;
}

async function archive(ticketOrId, actor, options = {}) {
  const ticket = await fetchTicket(ticketOrId, options.guildId);
  const actorData = getActor(actor);

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
    archivedById: actorData.id,
    archivedAt: now(),
    archiveReason: options.reason || null,
    statusChangedAt: now(),
    transcript,
  });

  await maybeArchiveChannel(updated || ticket, options);

  await ticketTimeline.addTicketArchivedEntry(
    ticket.guildId,
    ticket.ticketId,
    actorData.id
  );

  await addStaffActivity(
    updated || ticket,
    actor,
    'staff_archived_ticket',
    `Ticket archived by ${actorData.tag}.`,
    {
      reason: options.reason || null,
    }
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.EVENTS.TICKET_ARCHIVED
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.EVENTS.TICKET_UPDATED
  );

  return updated;
}

async function deleteTicket(ticketOrId, actor, options = {}) {
  if (
    options.requireConfirmation === true &&
    options.confirmed !== true
  ) {
    throw new Error('Delete confirmation required.');
  }

  const ticket = await fetchTicket(ticketOrId, options.guildId);
  const actorData = getActor(actor);

  const transcript =
    options.createTranscript === false
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
    deletedById: actorData.id,
    deletedAt: now(),
    deleteReason: options.reason || null,
    statusChangedAt: now(),
  });

  await ticketTimeline.addTicketDeletedEntry(
    ticket.guildId,
    ticket.ticketId,
    actorData.id,
    options.reason || 'Ticket deleted.'
  );

  await addStaffActivity(
    ticket,
    actor,
    'staff_deleted_ticket',
    `Ticket deleted by ${actorData.tag}.`,
    {
      reason: options.reason || null,
    }
  );

  await maybeDeleteChannel(ticket, options);

  await deleteStoredTicket(ticket.guildId, ticket.ticketId);

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
  const ticket = await fetchTicket(ticketOrId, options.guildId);
  const actorData = getActor(actor);

  if (!userId) {
    throw new Error('Missing user id.');
  }

  const channel = await getDiscordChannel(client, ticket);

  if (channel && channel.type === ChannelType.GuildText) {
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

  const updatedUsers = [
    ...new Set([
      ...existingUsers,
      userId,
    ]),
  ];

  const updated = await saveTicket(ticket, {
    allowedUserIds: updatedUsers,
  });

  await ticketTimeline.addUserAddedEntry(
    ticket.guildId,
    ticket.ticketId,
    actorData.id,
    userId
  );

  await addStaffActivity(
    updated || ticket,
    actor,
    'staff_added_user',
    `User ${userId} added by ${actorData.tag}.`,
    {
      userId,
    }
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.EVENTS.TICKET_UPDATED
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
  const ticket = await fetchTicket(ticketOrId, options.guildId);
  const actorData = getActor(actor);

  if (!userId) {
    throw new Error('Missing user id.');
  }

  const channel = await getDiscordChannel(client, ticket);

  if (channel && channel.type === ChannelType.GuildText) {
    await channel.permissionOverwrites
      .delete(userId)
      .catch(() => null);
  }

  const existingUsers = Array.isArray(ticket.allowedUserIds)
    ? ticket.allowedUserIds
    : [];

  const updatedUsers = existingUsers.filter((id) => id !== userId);

  const updated = await saveTicket(ticket, {
    allowedUserIds: updatedUsers,
  });

  await ticketTimeline.addUserRemovedEntry(
    ticket.guildId,
    ticket.ticketId,
    actorData.id,
    userId
  );

  await addStaffActivity(
    updated || ticket,
    actor,
    'staff_removed_user',
    `User ${userId} removed by ${actorData.tag}.`,
    {
      userId,
    }
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.EVENTS.TICKET_UPDATED
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
  const ticket = await fetchTicket(ticketOrId, options.guildId);
  const actorData = getActor(actor);

  const cleanName = String(newName || '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);

  if (!cleanName) {
    throw new Error('Invalid ticket name.');
  }

  const channel = await getDiscordChannel(client, ticket);

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
      actorId: actorData.id,
      message: `Ticket renamed to ${cleanName}.`,
    }
  );

  await addStaffActivity(
    updated || ticket,
    actor,
    'staff_renamed_ticket',
    `Ticket renamed by ${actorData.tag}.`,
    {
      newName: cleanName,
    }
  );

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.EVENTS.TICKET_UPDATED
  );

  return updated;
}

async function changePriority(
  ticketOrId,
  priority,
  actor,
  options = {}
) {
  const ticket = await fetchTicket(ticketOrId, options.guildId);
  const actorData = getActor(actor);

  const nextPriority = String(priority || '')
    .toLowerCase()
    .trim();

  if (!Object.values(PRIORITY).includes(nextPriority)) {
    throw new Error(`Invalid priority: ${priority}`);
  }

  const updated = await saveTicket(ticket, {
    priority: nextPriority,
  });

  ticketTimeline.addPriorityChangeEntry(
    ticket.guildId,
    ticket.ticketId,
    actorData.id,
    ticket.priority,
    nextPriority
  );

  await addStaffActivity(
    updated || ticket,
    actor,
    'staff_changed_priority',
    `Priority changed from ${ticket.priority} to ${nextPriority} by ${actorData.tag}.`,
    {
      oldPriority: ticket.priority,
      newPriority: nextPriority,
    }
  );

  if (options.client) {
    try {
      const channel = await getDiscordChannel(
        options.client,
        updated
      );

      if (channel?.manageable) {
        const newName = buildTicketChannelName(
          updated,
          channel.guild
        );

        if (channel.name !== newName) {
          channel
            .setName(
              newName,
              `Ticket priority changed to ${nextPriority}`
            )
            .catch((error) => {
              console.warn(
                '[Tickets] Priority rename skipped:',
                error?.message || error
               );
            });
        }
      }

      await refreshTicketControlMessage(
        options.client,
        updated
      );
    } catch (error) {
      console.error(
        '[Tickets] Failed to update priority channel/embed:',
        error
      );
    }
  }

  emitAction(
    options.io,
    updated || ticket,
    ticketSocketEvents.EVENTS.TICKET_UPDATED
  );

  return updated;
}

async function changeStatus(
  ticketOrId,
  status,
  actor,
  options = {}
) {
  const ticket = await fetchTicket(ticketOrId, options.guildId);
  const actorData = getActor(actor);

  const nextStatus = String(status || '').toLowerCase();

  if (!Object.values(STATUS).includes(nextStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const updated = await ticketManager.updateTicketStatus({
    guildId: ticket.guildId,
    ticketId: ticket.ticketId,
    actorId: actorData.id,
    status: nextStatus,
  });

  const saved = await saveTicket(updated || ticket, {
    status: nextStatus,
    statusChangedAt: now(),
  });

  await addStaffActivity(
    saved || updated || ticket,
    actor,
    'staff_changed_status',
    `Status changed to ${nextStatus} by ${actorData.tag}.`,
    {
      oldStatus: ticket.status,
      newStatus: nextStatus,
    }
  );

  emitAction(
    options.io,
    saved || updated || ticket,
    ticketSocketEvents.EVENTS.TICKET_UPDATED
  );

  return saved || updated;
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
  addStaffActivity,
};