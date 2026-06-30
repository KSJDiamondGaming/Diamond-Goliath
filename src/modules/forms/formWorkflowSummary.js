'use strict';

/**
 * GOLIATH FORM WORKFLOW SUMMARY
 *
 * Small shared formatter for Forms -> Tickets dashboard/API surfaces.
 * Keeps workflow metadata consistent without coupling dashboard routes to
 * raw submission storage shape.
 */

const workflowHelpers = require('./formWorkflowHelpers');

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

function formCreatesTicket(form = {}) {
  const actions = form.actions || form.workflowActions || {};
  return form.action === 'create_ticket' || actions.createTicket === true;
}

function formReadiness(form = {}) {
  const issues = [];
  const fields = Array.isArray(form.fields) ? form.fields : [];

  if (form.enabled === false) issues.push('Form is disabled.');
  if (!fields.length) issues.push('Form has no questions configured.');

  if (formCreatesTicket(form)) {
    if (!form.ticketType) issues.push('Ticket type is missing.');
    if (!form.outputCategoryId) issues.push('Output category is missing.');
  }

  fields.forEach((field, index) => {
    if (!field.id) issues.push(`Question ${index + 1} is missing an ID.`);
    if (!field.label) issues.push(`Question ${index + 1} is missing a label.`);
    if ((field.type === 'select' || field.type === 'checkbox') && (!Array.isArray(field.options) || !field.options.length)) {
      issues.push(`${field.label || `Question ${index + 1}`} needs options.`);
    }
  });

  return {
    ready: issues.length === 0,
    issueCount: issues.length,
    issues,
  };
}

function buildSubmissionWorkflowSummary(form = null, submission = {}) {
  const ticketId = getTicketId(submission);
  const ticketChannelId = getTicketChannelId(submission);
  const ticketControlMessageId = getTicketControlMessageId(submission);
  const workflow = submission.workflow || {};
  const review = workflowHelpers.buildReviewSnapshot(submission);

  return {
    form: form ? {
      formId: form.formId,
      name: form.name || form.formId,
      action: form.action || 'create_ticket',
      ticketType: form.ticketType || form.formId,
      outputCategoryId: form.outputCategoryId || null,
      logChannelId: form.logChannelId || null,
      staffRoleIds: Array.isArray(form.staffRoleIds) ? form.staffRoleIds : [],
      readiness: formReadiness(form),
    } : null,

    submission: {
      submissionId: submission.submissionId || null,
      formId: submission.formId || form?.formId || null,
      status: normaliseStatus(submission),
      workflowState: review.workflowState,
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

    review,

    workflow: {
      ...workflow,
      ticketLinked: Boolean(ticketId),
      ticketChannelLinked: Boolean(ticketChannelId),
      ticketControlMessageLinked: Boolean(ticketControlMessageId),
      missingTicketChannel: Boolean(ticketId && !ticketChannelId),
      reviewState: review.workflowState,
      nextAction: review.nextAction,
    },

    answers: submission.answers || {},
    notes: workflowHelpers.getNotes(submission),
    timeline: workflowHelpers.buildWorkflowTimeline(submission),
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
  const assignedSubmissionCount = submissions.filter((submission) => Boolean(workflowHelpers.getReviewerId(submission))).length;
  const unassignedSubmissionCount = submissions.filter((submission) => workflowHelpers.isOpenReview(submission) && !workflowHelpers.getReviewerId(submission)).length;
  const noteCount = submissions.reduce((total, submission) => total + workflowHelpers.getNotes(submission).length, 0);

  const formBreakdown = forms.map((form) => {
    const formSubmissions = submissions.filter((submission) => submission.formId === form.formId);
    const formStatusCounts = formSubmissions.reduce((counts, submission) => {
      const status = normaliseStatus(submission);
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {});
    const readiness = formReadiness(form);

    return {
      formId: form.formId,
      name: form.name || form.formId,
      enabled: form.enabled !== false,
      ready: readiness.ready,
      readiness,
      action: form.action || 'create_ticket',
      createsTicket: formCreatesTicket(form),
      ticketType: form.ticketType || form.formId,
      outputCategoryId: form.outputCategoryId || null,
      fieldCount: Array.isArray(form.fields) ? form.fields.length : 0,
      submissionCount: formSubmissions.length,
      pendingCount: formStatusCounts.pending || 0,
      requestInfoCount: formStatusCounts.request_info || 0,
      approvedCount: formStatusCounts.approved || 0,
      deniedCount: formStatusCounts.denied || 0,
      assignedCount: formSubmissions.filter((submission) => Boolean(workflowHelpers.getReviewerId(submission))).length,
      unassignedCount: formSubmissions.filter((submission) => workflowHelpers.isOpenReview(submission) && !workflowHelpers.getReviewerId(submission)).length,
      ticketLinkedCount: formSubmissions.filter(isTicketLinked).length,
      missingTicketChannelCount: formSubmissions.filter(isMissingTicketChannel).length,
    };
  });

  const readyFormCount = formBreakdown.filter((form) => form.ready).length;
  const ticketFormCount = formBreakdown.filter((form) => form.createsTicket).length;
  const notReadyFormCount = formBreakdown.length - readyFormCount;

  const recentSubmissions = [...submissions]
    .sort((a, b) => (Date.parse(b.createdAt || b.updatedAt || 0) || 0) - (Date.parse(a.createdAt || a.updatedAt || 0) || 0))
    .slice(0, 10)
    .map((submission) => {
      const review = workflowHelpers.buildReviewSnapshot(submission);
      return {
        submissionId: submission.submissionId || null,
        formId: submission.formId || null,
        status: normaliseStatus(submission),
        workflowState: review.workflowState,
        nextAction: review.nextAction,
        reviewerId: review.reviewerId,
        userId: submission.userId || null,
        userTag: submission.userTag || null,
        ticketId: getTicketId(submission),
        ticketChannelId: getTicketChannelId(submission),
        ticketControlMessageId: getTicketControlMessageId(submission),
        missingTicketChannel: isMissingTicketChannel(submission),
        noteCount: review.noteCount,
        createdAt: submission.createdAt || null,
        reviewedAt: submission.reviewedAt || null,
      };
    });

  return {
    statusCounts,
    pendingSubmissionCount: statusCounts.pending || 0,
    approvedSubmissionCount: statusCounts.approved || 0,
    deniedSubmissionCount: statusCounts.denied || 0,
    closedSubmissionCount: statusCounts.closed || 0,
    requestInfoSubmissionCount: statusCounts.request_info || 0,
    assignedSubmissionCount,
    unassignedSubmissionCount,
    noteCount,
    ticketLinkedSubmissionCount,
    ticketChannelLinkedSubmissionCount,
    missingTicketChannelCount,
    readyFormCount,
    notReadyFormCount,
    ticketFormCount,
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
  formCreatesTicket,
  formReadiness,
  buildSubmissionWorkflowSummary,
  buildFormsWorkflowOverview,
};
