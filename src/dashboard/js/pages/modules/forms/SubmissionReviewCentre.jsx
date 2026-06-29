import React, { useMemo, useState } from 'react';

import { EmptyState, Notice } from '../../../shared/PageShell';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Never' : date.toLocaleString();
}

function buttonStyle(theme, variant = 'default') {
  const variants = {
    default: { background: 'linear-gradient(135deg, rgba(59,130,246,0.92), rgba(37,99,235,0.92))', color: '#fff', border: '1px solid rgba(147,197,253,0.25)' },
    soft: { background: theme.softBg, color: theme.cardText, border: `1px solid ${theme.cardBorder}` },
    danger: { background: 'rgba(239,68,68,0.12)', color: theme.dangerText || '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' },
    success: { background: 'rgba(34,197,94,0.12)', color: theme.successText || '#86efac', border: '1px solid rgba(34,197,94,0.25)' },
    warning: { background: 'rgba(245,158,11,0.13)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.28)' },
  };

  return {
    ...variants[variant],
    borderRadius: 12,
    padding: '10px 13px',
    fontWeight: 900,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

function statusTone(status = '') {
  const clean = String(status || 'pending').toLowerCase();
  if (clean === 'approved') return '#86efac';
  if (clean === 'denied') return '#fca5a5';
  if (clean === 'closed') return '#93c5fd';
  if (clean === 'request_info') return '#fcd34d';
  return '#fde68a';
}

function StatusPill({ status }) {
  const color = statusTone(status);
  return <span style={{ border: `1px solid ${color}`, color, borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{String(status || 'pending').replace(/_/g, ' ')}</span>;
}

function DetailCard({ theme, label, value, hint }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.26)', borderRadius: 14, padding: 13, display: 'grid', gap: 4 }}>
      <span style={{ color: theme.mutedText, fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <strong style={{ color: theme.cardText, overflowWrap: 'anywhere' }}>{value || 'None'}</strong>
      {hint ? <span style={{ color: theme.mutedText, fontSize: 12, overflowWrap: 'anywhere' }}>{hint}</span> : null}
    </div>
  );
}

function buildReviewSnapshot(submission = {}) {
  const workflow = asObject(submission.workflow);
  const status = String(submission.status || 'pending').toLowerCase();
  const workflowState = String(workflow.reviewState || workflow.status || status).toLowerCase();
  const reviewerId = workflow.reviewerId || workflow.assignedTo || submission.reviewedBy || '';
  const notes = safeArray(workflow.internalNotes);
  const ticketId = submission.ticketId || workflow.ticketId || '';
  const ticketChannelId = submission.ticketChannelId || workflow.ticketChannelId || '';
  const isClosed = ['approved', 'denied', 'closed'].includes(status);
  let nextAction = 'Review submission';

  if (isClosed) nextAction = 'No action required';
  else if (workflowState === 'request_info' || status === 'request_info') nextAction = 'Waiting for more information';
  else if (!reviewerId) nextAction = 'Assign reviewer';
  else if (ticketId && !ticketChannelId) nextAction = 'Recover ticket channel';

  return {
    status,
    workflowState,
    reviewerId,
    notes,
    ticketId,
    ticketChannelId,
    nextAction,
    assignedAt: workflow.assignedAt || '',
    assignedBy: workflow.assignedBy || '',
    ticketDisplayId: submission.ticketDisplayId || workflow.ticketDisplayId || '',
    ticketControlMessageId: submission.ticketControlMessageId || workflow.ticketControlMessageId || '',
  };
}

function buildTimeline(submission = {}) {
  const workflow = asObject(submission.workflow);
  const timeline = safeArray(submission.timeline);
  const synthetic = [];

  if (submission.createdAt) synthetic.push({ type: 'submitted', label: 'Submission received', createdAt: submission.createdAt, actorId: submission.userId });
  if (workflow.ticketCreatedAt || submission.ticketId || workflow.ticketId) synthetic.push({ type: 'ticket_created', label: 'Linked ticket created', createdAt: workflow.ticketCreatedAt || submission.updatedAt || submission.createdAt, actorId: null });
  if (workflow.assignedAt || workflow.reviewerId || workflow.assignedTo) synthetic.push({ type: 'reviewer_assigned', label: 'Reviewer assigned', createdAt: workflow.assignedAt || submission.updatedAt, actorId: workflow.assignedBy });
  if (submission.reviewedAt) synthetic.push({ type: 'decision', label: `Decision: ${submission.status || 'reviewed'}`, createdAt: submission.reviewedAt, actorId: submission.reviewedBy });

  safeArray(workflow.internalNotes).forEach((note) => synthetic.push({ type: 'note', label: 'Internal note added', createdAt: note.createdAt, actorId: note.actorId }));

  const seen = new Set();
  return [...timeline, ...synthetic]
    .filter(Boolean)
    .sort((a, b) => (Date.parse(a.createdAt || 0) || 0) - (Date.parse(b.createdAt || 0) || 0))
    .filter((event) => {
      const key = `${event.type}:${event.label}:${event.createdAt}:${event.actorId || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export default function SubmissionReviewCentre({ theme, submissions = [], forms = [], roles = [], onStatus, onAssignReviewer, onAddNote, onWorkflowState }) {
  const [selectedId, setSelectedId] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const selected = submissions.find((submission) => submission.submissionId === selectedId) || submissions[0] || null;
  const formName = (formId) => forms.find((form) => form.formId === formId)?.name || formId || 'Unknown form';
  const review = useMemo(() => buildReviewSnapshot(selected || {}), [selected]);
  const timeline = useMemo(() => buildTimeline(selected || {}), [selected]);

  async function assignReviewer() {
    if (!selected || !reviewerId || !onAssignReviewer) return;
    await onAssignReviewer(selected, reviewerId);
    setNotice('Reviewer assigned.');
    setReviewerId('');
  }

  async function addNote() {
    if (!selected || !note.trim() || !onAddNote) return;
    await onAddNote(selected, note.trim());
    setNotice('Internal note added.');
    setNote('');
  }

  async function setRequestInfo() {
    if (!selected) return;
    if (onWorkflowState) await onWorkflowState(selected, 'request_info');
    else await onStatus?.(selected, 'request_info');
    setNotice('Submission marked as requesting information.');
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(min(100%, 360px), 0.8fr) minmax(0, 1.2fr)', gap: 14, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 10 }}>
        {submissions.length ? submissions.map((submission) => {
          const snapshot = buildReviewSnapshot(submission);
          return (
            <button key={submission.submissionId} type="button" onClick={() => setSelectedId(submission.submissionId)} style={{ textAlign: 'left', border: `1px solid ${selected?.submissionId === submission.submissionId ? '#93c5fd' : theme.cardBorder}`, background: selected?.submissionId === submission.submissionId ? 'rgba(59,130,246,0.13)' : theme.softBg, color: theme.cardText, borderRadius: 16, padding: 13, display: 'grid', gap: 7, cursor: 'pointer' }}>
              <strong>{formName(submission.formId)}</strong>
              <span style={{ color: theme.mutedText, fontSize: 12 }}>User: {submission.userTag || submission.userId || 'Unknown'} • {formatDate(submission.createdAt)}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusPill status={submission.status || 'pending'} />
                <span style={{ color: theme.mutedText, fontSize: 12 }}>{snapshot.nextAction}</span>
              </div>
            </button>
          );
        }) : <EmptyState theme={theme} title="No submissions found" text="Submitted forms will appear here for staff review." />}
      </div>

      <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 18, padding: 16, background: 'rgba(15,23,42,0.24)', display: 'grid', gap: 14 }}>
        {selected ? (
          <>
            {notice ? <Notice theme={theme} tone="success">{notice}</Notice> : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ color: theme.cardText, fontSize: 18 }}>{formName(selected.formId)}</strong>
                <div style={{ color: theme.mutedText, marginTop: 5, fontSize: 13 }}>Ref: {selected.submissionId}</div>
              </div>
              <StatusPill status={selected.status || 'pending'} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 10 }}>
              <DetailCard theme={theme} label="Next Action" value={review.nextAction} />
              <DetailCard theme={theme} label="Workflow State" value={review.workflowState.replace(/_/g, ' ')} />
              <DetailCard theme={theme} label="Reviewer" value={review.reviewerId ? `<@${review.reviewerId}>` : 'Unassigned'} hint={review.assignedAt ? `Assigned ${formatDate(review.assignedAt)}` : ''} />
              <DetailCard theme={theme} label="Linked Ticket" value={review.ticketDisplayId || review.ticketId || 'No ticket'} hint={review.ticketChannelId ? `Channel ${review.ticketChannelId}` : review.ticketId ? 'Ticket record exists, channel missing' : ''} />
              <DetailCard theme={theme} label="Notes" value={review.notes.length} hint="Internal staff notes" />
              <DetailCard theme={theme} label="Submitted" value={formatDate(selected.createdAt)} />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <strong style={{ color: theme.cardText }}>Review Actions</strong>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={buttonStyle(theme, 'success')} onClick={() => onStatus?.(selected, 'approved')}>Approve</button>
                <button type="button" style={buttonStyle(theme, 'danger')} onClick={() => onStatus?.(selected, 'denied')}>Deny</button>
                <button type="button" style={buttonStyle(theme, 'warning')} onClick={setRequestInfo}>Request Info</button>
                <button type="button" style={buttonStyle(theme, 'soft')} onClick={() => onStatus?.(selected, 'closed')}>Close</button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10, padding: 13, border: `1px solid ${theme.cardBorder}`, borderRadius: 14, background: theme.softBg }}>
              <strong style={{ color: theme.cardText }}>Assign Reviewer</strong>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} style={{ flex: '1 1 220px', border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.72)', color: theme.cardText, borderRadius: 12, padding: '10px 11px', fontWeight: 900 }}>
                  <option value="">Select reviewer role/member ID</option>
                  {roles.map((role) => <option key={role.id} value={role.id}>{role.name || role.id}</option>)}
                </select>
                <button type="button" style={buttonStyle(theme)} onClick={assignReviewer} disabled={!reviewerId || !onAssignReviewer}>Assign</button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <strong style={{ color: theme.cardText }}>Answers</strong>
              {Object.entries(asObject(selected.answers)).length ? Object.entries(asObject(selected.answers)).map(([key, value]) => (
                <div key={key} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 11, background: theme.softBg }}>
                  <strong style={{ color: theme.cardText }}>{key}</strong>
                  <p style={{ margin: '6px 0 0', color: theme.mutedText, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{String(value || '')}</p>
                </div>
              )) : <EmptyState theme={theme} text="No answers stored for this submission." />}
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <strong style={{ color: theme.cardText }}>Internal Notes</strong>
              {review.notes.length ? review.notes.map((entry) => (
                <div key={entry.id || entry.createdAt} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 11, background: theme.softBg }}>
                  <span style={{ color: theme.mutedText, fontSize: 12 }}>{formatDate(entry.createdAt)} • {entry.actorId || 'Staff'}</span>
                  <p style={{ margin: '6px 0 0', color: theme.cardText, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{entry.note || entry.content || ''}</p>
                </div>
              )) : <EmptyState theme={theme} text="No internal notes yet." />}
              <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add an internal staff note..." style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.72)', color: theme.cardText, borderRadius: 12, padding: '10px 11px', fontWeight: 800 }} />
              <button type="button" style={{ ...buttonStyle(theme, 'soft'), justifySelf: 'start' }} onClick={addNote} disabled={!note.trim() || !onAddNote}>Add Note</button>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <strong style={{ color: theme.cardText }}>Timeline</strong>
              {timeline.length ? timeline.map((event, index) => (
                <div key={`${event.type}-${event.createdAt}-${index}`} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, marginTop: 5, background: '#93c5fd', boxShadow: '0 0 16px rgba(147,197,253,0.45)' }} />
                  <div style={{ borderBottom: `1px solid ${theme.cardBorder}`, paddingBottom: 10 }}>
                    <strong style={{ color: theme.cardText }}>{event.label || event.type}</strong>
                    <div style={{ color: theme.mutedText, fontSize: 12, marginTop: 3 }}>{formatDate(event.createdAt)}{event.actorId ? ` • ${event.actorId}` : ''}</div>
                  </div>
                </div>
              )) : <EmptyState theme={theme} text="No timeline events yet." />}
            </div>
          </>
        ) : <EmptyState theme={theme} title="Select a submission" text="Choose a submission to review answers, workflow state and timeline." />}
      </div>
    </div>
  );
}
