'use strict';

// src/modules/forms/formTicketBridge.js

const { EmbedBuilder } = require('discord.js');

const formStore = require('./formStore');
const ticketManager = require('../tickets/ticketManager');
const ticketChannelManager = require('../tickets/ticketChannelManager');
const {
  TICKET_CHANNEL_PERMISSIONS,
  guardCategoryAccess,
  isGoliathPermissionError,
} = require('../../helpers/goliathPermissionGuard');

function now() {
  return new Date().toISOString();
}

function formatAnswerValue(value) {
  const text = String(value ?? '').trim();
  return text || '_No answer provided._';
}

function buildAnswerLines(form, submission) {
  const fields = Array.isArray(form.fields) && form.fields.length
    ? form.fields
    : Object.keys(submission.answers || {}).map((id) => ({ id, label: id }));

  return fields.map((field) => {
    const answer = formatAnswerValue(submission.answers?.[field.id]);
    return `**${field.label || field.id}**\n${answer}`;
  });
}

function buildUserMention(userId) {
  return userId ? '<@' + userId + '>' : null;
}

function getWorkflowActions(form = {}) {
  return formStore.normalizeWorkflowActions(form.actions || form.workflowActions || {}, form.action);
}

function shouldCreateTicket(form = {}) {
  const actions = getWorkflowActions(form);
  return form.action === formStore.FORM_ACTIONS.CREATE_TICKET || actions.createTicket === true;
}

function buildSubmissionTicketEmbed(form, submission, ticket) {
  const answerLines = buildAnswerLines(form, submission);

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📝 ${form.name || 'Form Submission'}`)
    .setDescription([
      `**Submission ID:** \`${submission.submissionId}\``,
      `**Ticket:** \`${ticket.displayId || ticket.ticketId}\``,
      `**User:** ${buildUserMention(submission.userId) || submission.userTag || 'Unknown'}`,
      `**Form:** \`${form.formId}\``,
      '',
      answerLines.length ? answerLines.join('\n\n') : '_No answers captured._',
    ].join('\n'))
    .setFooter({ text: 'Goliath Forms → Tickets Workflow' })
    .setTimestamp(new Date());
}

function buildStaffPingContent(form, submission) {
  const actions = getWorkflowActions(form);
  const roleMentions = actions.notifyStaff !== false
    ? actions.pingRoleIds.map((roleId) => `<@&${roleId}>`)
    : [];
  const userMention = buildUserMention(submission.userId);
  return [
    roleMentions.length ? roleMentions.join(' ') : null,
    userMention || null,
  ].filter(Boolean).join(' ') || undefined;
}

async function sendConfirmationDm(interaction, form, submission, bridgeResult) {
  const actions = getWorkflowActions(form);
  if (actions.sendDm === false || !submission.userId) return false;

  try {
    const user = interaction.user || await interaction.client.users.fetch(submission.userId).catch(() => null);
    if (!user?.send) return false;

    const lines = [
      `Your **${form.name}** submission has been received.`,
      `Reference: ${submission.submissionId}`,
    ];

    if (bridgeResult?.ticket) {
      lines.push(`Ticket: ${bridgeResult.ticket.displayId || bridgeResult.ticket.ticketId}`);
    }

    if (bridgeResult?.channel?.id) {
      lines.push(`Channel: <#${bridgeResult.channel.id}>`);
    }

    await user.send({ content: lines.join('\n') });
    formStore.incrementAnalytics(interaction.guildId, { dmSent: 1 }, interaction.guild);
    formStore.addSubmissionTimeline(interaction.guildId, submission.submissionId, {
      type: 'dm_sent',
      label: 'Confirmation DM sent',
      metadata: { ticketId: bridgeResult?.ticket?.ticketId || null },
    }, interaction.guild);
    return true;
  } catch (error) {
    formStore.addSubmissionTimeline(interaction.guildId, submission.submissionId, {
      type: 'dm_failed',
      label: 'Confirmation DM failed',
      metadata: { error: error.message },
    }, interaction.guild);
    return false;
  }
}

async function validateFormTicketTarget(interaction, form) {
  if (!interaction?.guild || !form?.outputCategoryId) return null;

  return guardCategoryAccess(
    interaction.guild,
    form.outputCategoryId,
    TICKET_CHANNEL_PERMISSIONS,
    {
      scope: 'forms.ticket_bridge',
      autoFix: true,
      throwOnFail: true,
      reason: 'Goliath forms to ticket category validation',
    }
  );
}

async function createTicketForSubmission({ interaction, form, submission } = {}) {
  if (!interaction?.guild || !form || !submission) {
    return { ok: false, ticket: null, channel: null, error: 'Missing guild, form, or submission.' };
  }

  const actions = getWorkflowActions(form);

  formStore.addSubmissionTimeline(interaction.guildId, submission.submissionId, {
    type: 'submitted',
    label: 'Submission received',
    actorId: submission.userId || interaction.user?.id,
    metadata: { formId: form.formId, action: form.action, actions },
  }, interaction.guild);

  if (!shouldCreateTicket(form)) {
    const skipped = { ok: true, skipped: true, ticket: null, channel: null, reason: 'Workflow does not create tickets.' };
    await sendConfirmationDm(interaction, form, submission, skipped);
    return skipped;
  }

  try {
    await validateFormTicketTarget(interaction, form);

    const answerSummary = buildAnswerLines(form, submission).join('\n\n').slice(0, 3500);

    const ticket = await ticketManager.createNewTicket({
      guildId: interaction.guildId,
      creatorId: submission.userId || interaction.user.id,
      type: form.ticketType || form.formId || 'form',
      title: `${form.name || 'Form'} Submission`,
      description: answerSummary || 'Form submission received.',
      priority: 'normal',
      source: 'form',
      sourceId: form.formId,
      formSubmissionId: submission.submissionId,
      tags: ['form', form.formId, form.ticketType].filter(Boolean),
      metadata: {
        formId: form.formId,
        formName: form.name,
        submissionId: submission.submissionId,
        submitterTag: submission.userTag,
        creatorUsername: interaction.user?.username,
        creatorTag: interaction.user?.tag,
        workflow: {
          actions,
          createdAt: now(),
        },
      },
    });

    formStore.addSubmissionTimeline(interaction.guildId, submission.submissionId, {
      type: 'ticket_created',
      label: 'Ticket created',
      actorId: interaction.client?.user?.id || null,
      metadata: { ticketId: ticket.ticketId, displayId: ticket.displayId },
    }, interaction.guild);

    let channel = null;
    try {
      channel = await ticketChannelManager.createTicketChannel({
        client: interaction.client,
        guild: interaction.guild,
        ticket,
        panel: {
          staffRoleIds: form.staffRoleIds || [],
          outputCategoryId: form.outputCategoryId || null,
        },
      });
    } catch (channelError) {
      console.error('[Forms] Failed to create ticket channel for submission:', channelError);
      formStore.addSubmissionTimeline(interaction.guildId, submission.submissionId, {
        type: 'ticket_channel_failed',
        label: 'Ticket channel creation failed',
        metadata: { error: channelError.message },
      }, interaction.guild);
      if (isGoliathPermissionError(channelError)) throw channelError;
    }

    if (channel?.send) {
      await channel.send({
        content: buildStaffPingContent(form, submission),
        embeds: [buildSubmissionTicketEmbed(form, submission, ticket)],
        allowedMentions: {
          users: submission.userId ? [submission.userId] : [],
          roles: actions.pingRoleIds || [],
        },
      }).catch((error) => {
        console.error('[Forms] Failed to post submission embed in ticket channel:', error);
      });

      if (actions.notifyStaff !== false && actions.pingRoleIds?.length) {
        formStore.incrementAnalytics(interaction.guildId, { staffNotified: 1 }, interaction.guild);
      }
    }

    const updatedSubmission = formStore.updateSubmission(interaction.guildId, submission.submissionId, {
      ticketId: ticket.ticketId,
      ticketChannelId: channel?.id || null,
      status: 'pending',
      workflow: {
        ...(submission.workflow || {}),
        ticketCreated: true,
        ticketId: ticket.ticketId,
        ticketDisplayId: ticket.displayId,
        ticketChannelId: channel?.id || null,
        ticketCreatedAt: now(),
      },
    }, interaction.guild);

    formStore.incrementAnalytics(interaction.guildId, { ticketsCreated: 1 }, interaction.guild);

    const result = { ok: true, ticket, channel, submission: updatedSubmission };
    await sendConfirmationDm(interaction, form, updatedSubmission || submission, result);

    return result;
  } catch (error) {
    console.error('[Forms] Ticket bridge failed:', error);
    formStore.addSubmissionTimeline(interaction.guildId, submission.submissionId, {
      type: 'workflow_failed',
      label: 'Forms → Tickets workflow failed',
      metadata: { error: error.message || 'Ticket bridge failed.' },
    }, interaction.guild);

    return {
      ok: false,
      ticket: null,
      channel: null,
      error: error.message || 'Ticket bridge failed.',
      guard: isGoliathPermissionError(error) ? error.details : null,
    };
  }
}

module.exports = {
  buildSubmissionTicketEmbed,
  createTicketForSubmission,
  getWorkflowActions,
  shouldCreateTicket,
};
