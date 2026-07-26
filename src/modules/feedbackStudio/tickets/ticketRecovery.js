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
const forms = require('../forms/forms');

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

function getTicketChannelId(ticket = {}) {
  return ticket.discordChannelId || ticket.channelId || null;
}

function getTicketControlMessageId(ticket = {}) {
  return ticket.discordMessageId || ticket.messageId || null;
}

function getFormSubmission(guildId, ticket = {}) {
  const submissionId = getFormSubmissionId(ticket);
  if (!guildId || !submissionId) return null;

  const section = forms.getFormsSection(guildId);
  return section.submissions?.[forms.cleanKey(submissionId)] || null;
}

function updateSubmissionRecoveryState(guildId, submission, updates = {}, guild = null) {
  if (!guildId || !submission?.submissionId) return null;

  return forms.updateSubmission(
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
  if (!guild || !channel?.send || !ticket) {
    return {
      message: null,
      ticket,
    };
  }

  const existingMessageId = getTicketControlMessageId(ticket);

  if (existingMessageId) {
    const existing = await channel.messages
      ?.fetch(existingMessageId)
      .catch(() => null);

    if (existing) {
      return {
        message: existing,
        ticket,
      };
    }
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

  if (!message?.id) {
    return {
      message: null,
      ticket,
    };
  }

  const updatedTicket = ticketStore.updateTicket(guild.id, ticket.ticketId, {
    discordMessageId: message.id,
    messageId: message.id,
    updatedAt: now(),
  }) || {
    ...ticket,
    discordMessageId: message.id,
    messageId: message.id,
  };

  return {
    message,
    ticket: updatedTicket,
  };
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
    ? forms.getForm(guild.id, getFormId(ticket))
    : null;

  if (!submission) {
    return {
      ticketId: ticket.ticketId,
      displayId: ticket.displayId,
      recovered: false,
      reason: 'No linked form submission found.',
    };
  }

  const channelId = getTicketChannelId(ticket) || submission.ticketChannelId;
  let channel = await fetchChannel(guild, channelId);

  if (channel) {
    const control = await ensureControlMessage({
      guild,
      channel,
      ticket,
      form,
    });

    const recoveredTicket = control?.ticket || ticket;
    const controlMessageId =
      control?.message?.id ||
      getTicketControlMessageId(recoveredTicket);

    const updatedSubmission = updateSubmissionRecoveryState(
      guild.id,
      submission,
      {
        ticketId: recoveredTicket.ticketId,
        ticketChannelId: channel.id,
        workflow: {
          ticketCreated: true,
          ticketId: recoveredTicket.ticketId,
          ticketDisplayId: recoveredTicket.displayId,
          ticketChannelId: channel.id,
          ticketControlMessageId: controlMessageId || null,
          channelRecovered: true,
        },
      },
      guild
    );

    forms.addSubmissionTimeline(guild.id, submission.submissionId, {
      type: 'ticket_channel_relinked',
      label: 'Ticket channel relinked during recovery',
      metadata: {
        ticketId: recoveredTicket.ticketId,
        channelId: channel.id,
        controlMessageId: controlMessageId || null,
      },
    }, guild);

    return {
      ticketId: recoveredTicket.ticketId,
      displayId: recoveredTicket.displayId,
      submissionId: submission.submissionId,
      channelId: channel.id,
      controlMessageId: controlMessageId || null,
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

  const control = await ensureControlMessage({
    guild,
    channel,
    ticket,
    form,
  });

  const recoveredTicket = control?.ticket || ticket;
  const controlMessageId =
    control?.message?.id ||
    getTicketControlMessageId(recoveredTicket);

  const updatedSubmission = updateSubmissionRecoveryState(
    guild.id,
    submission,
    {
      ticketId: recoveredTicket.ticketId,
      ticketChannelId: channel?.id || null,
      workflow: {
        ticketCreated: true,
        ticketId: recoveredTicket.ticketId,
        ticketDisplayId: recoveredTicket.displayId,
        ticketChannelId: channel?.id || null,
        ticketControlMessageId: controlMessageId || null,
        channelRecreated: true,
      },
    },
    guild
  );

  forms.addSubmissionTimeline(guild.id, submission.submissionId, {
    type: 'ticket_channel_recreated',
    label: 'Missing ticket channel recreated during recovery',
    metadata: {
      ticketId: recoveredTicket.ticketId,
      channelId: channel?.id || null,
      controlMessageId: controlMessageId || null,
    },
  }, guild);

  return {
    ticketId: recoveredTicket.ticketId,
    displayId: recoveredTicket.displayId,
    submissionId: submission.submissionId,
    channelId: channel?.id || null,
    controlMessageId: controlMessageId || null,
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
    const currentChannelId = getTicketChannelId(ticket);
    const channel = await fetchChannel(guild, currentChannelId);

    if (!channel) {
      results.missingChannels.push({
        ticketId: ticket.ticketId,
        displayId: ticket.displayId,
        discordChannelId: currentChannelId,
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
