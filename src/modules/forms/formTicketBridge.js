'use strict';

// src/modules/forms/formTicketBridge.js

const { EmbedBuilder } = require('discord.js');

const formStore = require('./formStore');
const ticketManager = require('../tickets/ticketManager');
const ticketChannelManager = require('../tickets/ticketChannelManager');

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

function buildSubmissionTicketEmbed(form, submission, ticket) {
  const answerLines = buildAnswerLines(form, submission);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📝 ${form.name || 'Form Submission'}`)
    .setDescription([
      `**Submission ID:** \`${submission.submissionId}\``,
      `**Ticket:** \`${ticket.displayId || ticket.ticketId}\``,
      `**User:** ${submission.userId ? `<@${submission.userId}>` : submission.userTag || 'Unknown'}`,
      `**Form:** \`${form.formId}\``,
      '',
      answerLines.length ? answerLines.join('\n\n') : '_No answers captured._',
    ].join('\n'))
    .setFooter({ text: 'Goliath Forms → Tickets' })
    .setTimestamp(new Date());

  return embed;
}

async function createTicketForSubmission({
  interaction,
  form,
  submission,
} = {}) {
  if (!interaction?.guild || !form || !submission) {
    return {
      ok: false,
      ticket: null,
      channel: null,
      error: 'Missing guild, form, or submission.',
    };
  }

  if (form.action !== formStore.FORM_ACTIONS.CREATE_TICKET) {
    return {
      ok: true,
      skipped: true,
      ticket: null,
      channel: null,
      reason: 'Form action does not create tickets.',
    };
  }

  try {
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
      tags: ['form', form.formId].filter(Boolean),
      metadata: {
        formId: form.formId,
        formName: form.name,
        submissionId: submission.submissionId,
        submitterTag: submission.userTag,
        creatorUsername: interaction.user?.username,
        creatorTag: interaction.user?.tag,
      },
    });

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
    }

    if (channel?.send) {
      await channel.send({
        content: submission.userId ? `<@${submission.userId}>` : undefined,
        embeds: [buildSubmissionTicketEmbed(form, submission, ticket)],
        allowedMentions: { users: submission.userId ? [submission.userId] : [] },
      }).catch((error) => {
        console.error('[Forms] Failed to post submission embed in ticket channel:', error);
      });
    }

    const updatedSubmission = formStore.updateSubmission(interaction.guildId, submission.submissionId, {
      ticketId: ticket.ticketId,
      ticketChannelId: channel?.id || null,
      status: 'pending',
    }, interaction.guild);

    formStore.incrementAnalytics(interaction.guildId, {
      ticketsCreated: 1,
    }, interaction.guild);

    return {
      ok: true,
      ticket,
      channel,
      submission: updatedSubmission,
    };
  } catch (error) {
    console.error('[Forms] Ticket bridge failed:', error);

    return {
      ok: false,
      ticket: null,
      channel: null,
      error: error.message || 'Ticket bridge failed.',
    };
  }
}

module.exports = {
  buildSubmissionTicketEmbed,
  createTicketForSubmission,
};
