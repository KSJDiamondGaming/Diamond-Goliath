'use strict';

/**
 * GOLIATH TICKET RECOVERY
 *
 * Handles:
 * - restoring ticket cache after reboot
 * - validating active tickets
 * - checking missing Discord channels
 * - tracking Forms → Tickets submission/channel recovery state
 * - preparing future panel redeploy/recovery
 */

const ticketStore = require('./ticketStore');
const ticketChannelManager = require('./ticketChannelManager');
const { sendTicketControlMessage } = require('./ticketPanelManager');
const formStore = require('../forms/formStore');

const ACTIVE_STATUSES = [
  'open',
  'claimed',
  'waiting_user',
  'in_review',
  'approved',
  'denied',
];

function now() {
  return new Date().toISOString();
}

function isActiveTicket(ticket) {
  return ACTIVE_STATUSES.includes(
    String(ticket.status || 'open').toLowerCase()
  );
}

function isFormTicket(ticket = {}) {
  return (
    ticket.source === 'form' ||
    Boolean(ticket.formSubmissionId) ||
    Boolean(ticket.metadata?.submissionId)
  );
}

function buildFormTicketPanel(form = {}, ticket = {}) {
  return {
    panelId:
      form.formId ||
      ticket.metadata?.formId ||
      ticket.sourceId ||
      null,

    name:
      form.name ||
      ticket.metadata?.formName ||
      'Form Submission',

    ticketType:
      form.ticketType ||
      ticket.type ||
      'form',

    staffRoleIds:
      form.staffRoleIds ||
      [],

    managerRoleIds:
      form.managerRoleIds ||
      [],

    viewerRoleIds:
      form.viewerRoleIds ||
      [],

    outputCategoryId:
      form.outputCategoryId ||
      null,

    archiveCategoryId:
      form.archiveCategoryId ||
      null,

    logsChannelId:
      form.logsChannelId ||
      form.logChannelId ||
      null,

    transcriptsChannelId:
      form.transcriptsChannelId ||
      null,
  };
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

function getFormSubmissionId(ticket = {}) {
  return (
    ticket.formSubmissionId ||
    ticket.metadata?.submissionId ||
    null
  );
}

function getFormId(ticket = {}) {
  return (
    ticket.metadata?.formId ||
    ticket.sourceId ||
    null
  );
}

function getFormSubmission(guildId, ticket = {}) {
  const submissionId = getFormSubmissionId(ticket);
  if (!guildId || !submissionId) return null;

  const section = formStore.getFormsSection(guildId);
  return section.submissions?.[formStore.cleanKey(submissionId)] || null;
}

function updateSubmissionRecoveryState(guildId, submission, updates = {}, guild = null) {
  if (!guildId || !submission?.submissionId) return null;

  return formStore.updateSubmission(
    guildId,
    submission.submissionId,
    {
      ...updates,
      workflow: {
        ...(submission.workflow || {}),
        ...(updates.workflow || {}),
        recoveredAt: now(),
      },
    },
    guild || {}
  );
}

async function ensureControlMessage({ guild, channel, ticket, form } = {}) {
  if (!guild || !channel?.send || !ticket) return null;

  const existingMessageId = ticket.discordMessageId || ticket.messageId;

  if (existingMessageId) {
    const existing = await channel.messages
      ?.fetch(existingMessageId)
      .catch(() => null);

    if (existing) return existing;
  }

  const panel = buildFormTicketPanel(form, ticket);

  const message = await sendTicketControlMessage({
    channel,
    ticket,
    panel,
    user: null,
  }).catch((error) => {
    console.error('[Tickets] Failed to recreate form ticket control message:', error);
    return null;
  });

  if (message?.id) {
    ticketStore.updateTicket(guild.id, ticket.ticketId, {
      discordMessageId: message.id,
      messageId: message.id,
      updatedAt: now(),
    });
  }

  return message;
}

async function recoverFormTicketSubmission({
  client,
  guild,
  ticket,
  createMissingChannels = false,
} = {}) {
  if (!guild || !ticket || !isFormTicket(ticket)) return null;

  const submission = getFormSubmission(guild.id, ticket);
  const form = getFormId(ticket)
    ? formStore.getForm(guild.id, getFormId(ticket))
    : null;

  if (!submission) {
    return {
      ticketId: ticket.ticketId,
      displayId: ticket.displayId,
      recovered: false,
      reason: 'No linked form submission found.',
    };
  }

  const channelId = ticket.discordChannelId || ticket.channelId || submission.ticketChannelId;
  let channel = await fetchChannel(guild, channelId);

  if (channel) {
    await ensureControlMessage({ guild, channel, ticket, form });

    const updatedSubmission = updateSubmissionRecoveryState(
      guild.id,
      submission,
      {
        ticketId: ticket.ticketId,
        ticketChannelId: channel.id,
        workflow: {
          ticketCreated: true,
          ticketId: ticket.ticketId,
          ticketDisplayId: ticket.displayId,
          ticketChannelId: channel.id,
          ticketControlMessageId: ticket.discordMessageId || ticket.messageId || null,
          channelRecovered: true,
        },
      },
      guild
    );

    formStore.addSubmissionTimeline(guild.id, submission.submissionId, {
      type: 'ticket_channel_relinked',
      label: 'Ticket channel relinked during recovery',
      metadata: {
        ticketId: ticket.ticketId,
        channelId: channel.id,
      },
    }, guild);

    return {
      ticketId: ticket.ticketId,
      displayId: ticket.displayId,
      submissionId: submission.submissionId,
      channelId: channel.id,
      recovered: true,
      recreated: false,
      submission: updatedSubmission,
    };
  }

  if (!createMissingChannels) {
    return {
      ticketId: ticket.ticketId,
      displayId: ticket.displayId,
      submissionId: submission.submissionId,
      missingChannelId: channelId || null,
      recovered: false,
      recoverable: true,
      reason: 'Ticket channel missing. Set createMissingChannels=true to recreate it.',
    };
  }

  const panel = buildFormTicketPanel(form, ticket);

  channel = await ticketChannelManager.createTicketChannel({
    client,
    guild,
    ticket,
    panel,
  });

  await ensureControlMessage({ guild, channel, ticket, form });

  const updatedSubmission = updateSubmissionRecoveryState(
    guild.id,
    submission,
    {
      ticketId: ticket.ticketId,
      ticketChannelId: channel?.id || null,
      workflow: {
        ticketCreated: true,
        ticketId: ticket.ticketId,
        ticketDisplayId: ticket.displayId,
        ticketChannelId: channel?.id || null,
        channelRecreated: true,
      },
    },
    guild
  );

  formStore.addSubmissionTimeline(guild.id, submission.submissionId, {
    type: 'ticket_channel_recreated',
    label: 'Missing ticket channel recreated during recovery',
    metadata: {
      ticketId: ticket.ticketId,
      channelId: channel?.id || null,
    },
  }, guild);

  return {
    ticketId: ticket.ticketId,
    displayId: ticket.displayId,
    submissionId: submission.submissionId,
    channelId: channel?.id || null,
    recovered: true,
    recreated: true,
    submission: updatedSubmission,
  };
}

async function recoverGuildTickets(client, guildId, options = {}) {
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
    formTicketRecovery: [],
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
    } else {
      results.validChannels.push({
        ticketId: ticket.ticketId,
        displayId: ticket.displayId,
        discordChannelId: channel.id,
      });
    }

    if (isFormTicket(ticket)) {
      const recovery = await recoverFormTicketSubmission({
        client,
        guild,
        ticket,
        createMissingChannels: options.createMissingChannels === true,
      }).catch((error) => ({
        ticketId: ticket.ticketId,
        displayId: ticket.displayId,
        recovered: false,
        error: error.message,
      }));

      if (recovery) {
        results.formTicketRecovery.push(recovery);
      }
    }
  }

  return {
    ...results,
    guildFound: true,
  };
}

async function recoverAllClientGuildTickets(client, options = {}) {
  if (!client?.guilds?.cache) {
    return [];
  }

  const guildIds = [...client.guilds.cache.keys()];
  const results = [];

  for (const guildId of guildIds) {
    const result = await recoverGuildTickets(
      client,
      guildId,
      options
    );

    results.push(result);
  }

  return results;
}

module.exports = {
  ACTIVE_STATUSES,

  isActiveTicket,
  isFormTicket,

  recoverFormTicketSubmission,
  recoverGuildTickets,
  recoverAllClientGuildTickets,
};
