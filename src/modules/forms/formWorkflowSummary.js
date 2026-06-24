'use strict';

/**
 * GOLIATH FORM WORKFLOW SUMMARY
 *
 * Small shared formatter for Forms -> Tickets dashboard/API surfaces.
 * Keeps workflow metadata consistent without coupling dashboard routes to
 * raw submission storage shape.
 */

function normaliseStatus(submission = {}) {
  return String(submission.status || 'pending').toLowerCase();
}

function getTicketId(submission = {}) {
  return submission.ticketId || submission.workflow?.ticketId || null;
}

function getTicketDisplayId(submission = {}) {
  return submission.ticketDisplayId || submission.workflow?.ticketDisplayId || null;
}

function getTicketChannelId(submission = {}) {
  return submission.ticketChannelId || submission.workflow?.ticketChannelId || null;
}

function getTicketControlMessageId(submission = {}) {
  return (
    submission.ticketControlMessageId ||
    submission.workflow?.ticketControlMessageId ||
    submission.discordMessageId ||
    null
  );
}

function isTicketLinked(submission = {}) {
  return Boolean(getTicketId(submission));
}

function isTicketChannelLinked(submission = {}) {
  return Boolean(getTicketChannelId(submission));
}

function isMissingTicketChannel(submission = {}) {
  return isTicketLinked(submission) && !isTicketChannelLinked(submission);
}

function buildSubmissionWorkflowSummary(form = null, submission = {}) {
  const ticketId = getTicketId(submission);
  const ticketChannelId = getTicketChannelId(submission);
  const ticketControlMessageId = getTicketControlMessageId(submission);
  const workflow = submission.workflow || {};

  return {
    form: form ? {
      formId: form.formId,
      name: form.name || form.formId,
      action: form.action || 'create_ticket',
      ticketType: form.ticketType || form.formId,
      outputCategoryId: form.outputCategoryId || null,
      logChannelId: form.logChannelId || null,
      staffRoleIds: Array.isArray(form.staffRoleIds) ? form.staffRoleIds : [],
    } : null,

    submission: {
      submissionId: submission.submissionId || null,
      formId: submission.formId || form?.formId || null,
      status: normaliseStatus(submission),
      userId: submission.userId || null,
      userTag: submission.userTag || null,
      createdAt: submission.createdAt || null,
      updatedAt: submission.updatedAt || null,
      reviewedAt: submission.reviewedAt || null,
      reviewedBy: submission.reviewedBy || null,
    },

    ticket: {
      ticketId,
      displayId: getTicketDisplayId(submission),
      channelId: ticketChannelId,
      controlMessageId: ticketControlMessageId,
      created: Boolean(ticketId),
      channelLinked: Boolean(ticketChannelId),
      controlMessageLinked: Boolean(ticketControlMessageId),
      missingChannel: Boolean(ticketId && !ticketChannelId),
    },

    workflow: {
      ...workflow,
      ticketLinked: Boolean(ticketId),
      ticketChannelLinked: Boolean(ticketChannelId),
      ticketControlMessageLinked: Boolean(ticketControlMessageId),
      missingTicketChannel: Boolean(ticketId && !ticketChannelId),
    },

    answers: submission.answers || {},
    timeline: Array.isArray(submission.timeline) ? submission.timeline : [],
  };
}

function buildFormsWorkflowOverview(forms = [], submissions = []) {
  const statusCounts = submissions.reduce((counts, submission) => {
    const status = normaliseStatus(submission);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});

  const ticketLinkedSubmissionCount = submissions.filter(isTicketLinked).length;
  const ticketChannelLinkedSubmissionCount = submissions.filter(isTicketChannelLinked).length;
  const missingTicketChannelCount = submissions.filter(isMissingTicketChannel).length;

  const formBreakdown = forms.map((form) => {
    const formSubmissions = submissions.filter((submission) => submission.formId === form.formId);
    const formStatusCounts = formSubmissions.reduce((counts, submission) => {
      const status = normaliseStatus(submission);
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {});

    return {
      formId: form.formId,
      name: form.name || form.formId,
      enabled: form.enabled !== false,
      action: form.action || 'create_ticket',
      ticketType: form.ticketType || form.formId,
      submissionCount: formSubmissions.length,
      pendingCount: formStatusCounts.pending || 0,
      approvedCount: formStatusCounts.approved || 0,
      deniedCount: formStatusCounts.denied || 0,
      ticketLinkedCount: formSubmissions.filter(isTicketLinked).length,
      missingTicketChannelCount: formSubmissions.filter(isMissingTicketChannel).length,
    };
  });

  const recentSubmissions = [...submissions]
    .sort((a, b) => (Date.parse(b.createdAt || b.updatedAt || 0) || 0) - (Date.parse(a.createdAt || a.updatedAt || 0) || 0))
    .slice(0, 10)
    .map((submission) => ({
      submissionId: submission.submissionId || null,
      formId: submission.formId || null,
      status: normaliseStatus(submission),
      userId: submission.userId || null,
      userTag: submission.userTag || null,
      ticketId: getTicketId(submission),
      ticketChannelId: getTicketChannelId(submission),
      ticketControlMessageId: getTicketControlMessageId(submission),
      missingTicketChannel: isMissingTicketChannel(submission),
      createdAt: submission.createdAt || null,
      reviewedAt: submission.reviewedAt || null,
    }));

  return {
    statusCounts,
    pendingSubmissionCount: statusCounts.pending || 0,
    approvedSubmissionCount: statusCounts.approved || 0,
    deniedSubmissionCount: statusCounts.denied || 0,
    closedSubmissionCount: statusCounts.closed || 0,
    requestInfoSubmissionCount: statusCounts.request_info || 0,
    ticketLinkedSubmissionCount,
    ticketChannelLinkedSubmissionCount,
    missingTicketChannelCount,
    formBreakdown,
    recentSubmissions,
  };
}

module.exports = {
  normaliseStatus,
  getTicketId,
  getTicketDisplayId,
  getTicketChannelId,
  getTicketControlMessageId,
  isTicketLinked,
  isTicketChannelLinked,
  isMissingTicketChannel,
  buildSubmissionWorkflowSummary,
  buildFormsWorkflowOverview,
};
