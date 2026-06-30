'use strict';

function normaliseStatus(record = {}) {
  return String(record.status || 'pending').trim().toLowerCase();
}

function getWorkflow(record = {}) {
  return record.workflow && typeof record.workflow === 'object' ? record.workflow : {};
}

function getReviewerId(record = {}) {
  const workflow = getWorkflow(record);
  return workflow.reviewerId || workflow.assignedTo || record.reviewedBy || null;
}

function getNotes(record = {}) {
  const notes = getWorkflow(record).internalNotes;
  return Array.isArray(notes) ? notes : [];
}

function getWorkflowState(record = {}) {
  const workflow = getWorkflow(record);
  return String(workflow.reviewState || workflow.status || normaliseStatus(record)).trim().toLowerCase();
}

function getNextAction(record = {}) {
  const status = normaliseStatus(record);
  if (['approved', 'denied', 'closed'].includes(status)) return 'No action required';
  if (status === 'request_info' || getWorkflowState(record) === 'request_info') return 'Waiting for more information';
  if (!getReviewerId(record)) return 'Assign reviewer';
  return 'Review submission';
}

function buildReviewSnapshot(record = {}) {
  const reviewerId = getReviewerId(record);
  const notes = getNotes(record);

  return {
    status: normaliseStatus(record),
    workflowState: getWorkflowState(record),
    nextAction: getNextAction(record),
    reviewerId,
    assigned: Boolean(reviewerId),
    noteCount: notes.length,
    lastNoteAt: notes.at(-1)?.createdAt || null,
  };
}

module.exports = {
  normaliseStatus,
  getWorkflow,
  getReviewerId,
  getNotes,
  getWorkflowState,
  getNextAction,
  buildReviewSnapshot,
};
