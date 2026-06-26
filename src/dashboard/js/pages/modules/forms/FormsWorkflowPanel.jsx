import React from 'react';

import { api } from '../../../services/apiClient.js';
import { FormsWorkflowBreakdown, FormsWorkflowCards } from './FormsWorkflowCards.jsx';

function getNumber(value = 0) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function text(value, fallback = 'Unknown') {
  return String(value || fallback).trim();
}

function formatDate(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString();
}

function getSubmissionStatus(submission = {}) {
  return String(submission.status || submission.reviewState || 'pending').toLowerCase();
}

function isActiveSubmission(submission = {}) {
  return ['pending', 'request_info', 'reviewing', 'under_review'].includes(getSubmissionStatus(submission));
}

function statusTone(status = '') {
  const value = String(status || '').toLowerCase();
  if (value === 'approved') return '#86efac';
  if (value === 'denied' || value === 'missing') return '#fca5a5';
  if (value === 'request_info' || value === 'pending' || value === 'reviewing' || value === 'under_review') return '#fcd34d';
  return '#93c5fd';
}

function StatusPill({ label }) {
  const tone = statusTone(label);
  return (
    <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: 999, padding: '4px 8px', fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {String(label || 'pending').replace(/_/g, ' ')}
    </span>
  );
}

function QueueButton({ children, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: '1px solid rgba(148,163,184,0.26)',
        background: disabled ? 'rgba(15,23,42,0.20)' : 'rgba(15,23,42,0.42)',
        color: disabled ? '#64748b' : '#e5e7eb',
        borderRadius: 10,
        padding: '7px 9px',
        fontSize: 12,
        fontWeight: 900,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function WorkflowStep({ theme, index, title, detail, status = 'ready' }) {
  const mutedText = theme?.mutedText || '#94a3b8';
  const cardText = theme?.cardText || '#e5e7eb';
  const cardBorder = theme?.cardBorder || 'rgba(148,163,184,0.22)';
  const tones = {
    ready: '#86efac',
    warning: '#fcd34d',
    danger: '#fca5a5',
    info: '#93c5fd',
  };
  const tone = tones[status] || tones.ready;

  return (
    <div style={{ border: `1px solid ${cardBorder}`, background: 'rgba(15,23,42,0.24)', borderRadius: 16, padding: 14, display: 'grid', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ width: 28, height: 28, display: 'inline-grid', placeItems: 'center', borderRadius: 999, border: `1px solid ${tone}`, color: tone, fontWeight: 950, fontSize: 12 }}>{index}</span>
        <strong style={{ color: cardText }}>{title}</strong>
      </div>
      <span style={{ color: mutedText, fontSize: 13, lineHeight: 1.45 }}>{detail}</span>
    </div>
  );
}

function WorkflowActionHints({ theme, overview = {} }) {
  const pending = getNumber(overview.pendingSubmissionCount);
  const requestInfo = getNumber(overview.requestInfoSubmissionCount);
  const missingChannels = getNumber(overview.missingTicketChannelCount);
  const ticketLinked = getNumber(overview.ticketLinkedSubmissionCount);
  const submissions = getNumber(overview.submissionCount);
  const hints = [];

  if (pending) hints.push(`${pending} submission${pending === 1 ? '' : 's'} need staff review.`);
  if (requestInfo) hints.push(`${requestInfo} submission${requestInfo === 1 ? '' : 's'} are waiting on more user information.`);
  if (missingChannels) hints.push(`${missingChannels} linked ticket${missingChannels === 1 ? '' : 's'} are missing channel references and may need ticket recovery.`);
  if (submissions && !ticketLinked) hints.push('Submissions exist but no tickets are linked yet. Check form actions and output categories.');
  if (!hints.length) hints.push('Workflow looks healthy. New submissions should create linked tickets when forms are configured to create tickets.');

  return (
    <div style={{ border: `1px solid ${theme?.cardBorder || 'rgba(148,163,184,0.22)'}`, background: 'rgba(15,23,42,0.24)', borderRadius: 16, padding: 14, display: 'grid', gap: 8 }}>
      <strong style={{ color: theme?.cardText || '#e5e7eb' }}>Staff Action Hints</strong>
      {hints.map((hint) => (
        <span key={hint} style={{ color: theme?.mutedText || '#94a3b8', lineHeight: 1.45 }}>• {hint}</span>
      ))}
    </div>
  );
}

function FormsReviewQueue({ theme, overview = {}, guildId = '', onRefresh }) {
  const cardBorder = theme?.cardBorder || 'rgba(148,163,184,0.22)';
  const cardText = theme?.cardText || '#e5e7eb';
  const mutedText = theme?.mutedText || '#94a3b8';
  const recent = Array.isArray(overview.recentSubmissions) ? overview.recentSubmissions : [];
  const queue = recent.filter(isActiveSubmission).slice(0, 8);
  const [busyId, setBusyId] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [error, setError] = React.useState('');
  const [noteDrafts, setNoteDrafts] = React.useState({});

  async function runAction(submissionId, label, request) {
    if (!guildId || !submissionId) return;
    try {
      setBusyId(`${submissionId}:${label}`);
      setNotice('');
      setError('');
      await request();
      setNotice(`${label} saved.`);
      if (typeof onRefresh === 'function') await onRefresh();
    } catch (err) {
      setError(err.message || `${label} failed.`);
    } finally {
      setBusyId('');
    }
  }

  const buttonBusy = (submissionId, label) => busyId === `${submissionId}:${label}`;

  return (
    <div style={{ border: `1px solid ${cardBorder}`, background: 'rgba(15,23,42,0.24)', borderRadius: 16, padding: 14, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: cardText }}>Review Queue</strong>
          <p style={{ margin: '5px 0 0', color: mutedText, fontSize: 13, lineHeight: 1.45 }}>Staff workflow controls for active form submissions.</p>
        </div>
        <StatusPill label={queue.length ? 'active' : 'clear'} />
      </div>

      {notice ? <div style={{ color: '#86efac', fontSize: 13, fontWeight: 850 }}>{notice}</div> : null}
      {error ? <div style={{ color: '#fca5a5', fontSize: 13, fontWeight: 850 }}>{error}</div> : null}

      {!queue.length ? (
        <div style={{ border: `1px dashed ${cardBorder}`, borderRadius: 14, padding: 14, color: mutedText }}>No active submissions in the recent queue.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {queue.map((submission) => {
            const status = getSubmissionStatus(submission);
            const missing = submission.missingTicketChannel === true;
            const submissionId = submission.submissionId;
            const noteValue = noteDrafts[submissionId] || '';
            return (
              <div key={submission.submissionId || `${submission.formId}-${submission.createdAt}`} style={{ border: `1px solid ${missing ? '#fca5a5' : cardBorder}`, borderRadius: 14, padding: 12, background: 'rgba(2,6,23,0.22)', display: 'grid', gap: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <strong style={{ color: cardText }}>{text(submission.formId, 'Unknown Form')}</strong>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <StatusPill label={status} />
                    {submission.ticketId ? <StatusPill label="ticket" /> : null}
                    {missing ? <StatusPill label="missing" /> : null}
                  </div>
                </div>
                <div style={{ color: mutedText, fontSize: 13, lineHeight: 1.45 }}>
                  User: {text(submission.userTag || submission.userId, 'Unknown')} · Created: {formatDate(submission.createdAt)}
                </div>
                <div style={{ color: mutedText, fontSize: 12, overflowWrap: 'anywhere' }}>
                  Submission: {submission.submissionId || 'unknown'}{submission.ticketId ? ` · Ticket: ${submission.ticketId}` : ''}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <QueueButton disabled={!guildId || !submissionId || buttonBusy(submissionId, 'Assign')} onClick={() => runAction(submissionId, 'Assign', () => api.request(`/api/forms/${guildId}/submissions/${submissionId}/workflow/reviewer`, { method: 'PATCH', body: JSON.stringify({}) }))}>Assign to me</QueueButton>
                  <QueueButton disabled={!guildId || !submissionId || buttonBusy(submissionId, 'Reviewing')} onClick={() => runAction(submissionId, 'Reviewing', () => api.request(`/api/forms/${guildId}/submissions/${submissionId}/workflow/state`, { method: 'PATCH', body: JSON.stringify({ state: 'reviewing' }) }))}>Mark reviewing</QueueButton>
                  <QueueButton disabled={!guildId || !submissionId || buttonBusy(submissionId, 'Request info')} onClick={() => runAction(submissionId, 'Request info', () => api.request(`/api/forms/${guildId}/submissions/${submissionId}/workflow/state`, { method: 'PATCH', body: JSON.stringify({ state: 'request_info' }) }))}>Request info</QueueButton>
                  <QueueButton disabled={!guildId || !submissionId || buttonBusy(submissionId, 'Close')} onClick={() => runAction(submissionId, 'Close', () => api.request(`/api/forms/${guildId}/submissions/${submissionId}/workflow/state`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) }))}>Close</QueueButton>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8 }}>
                  <input
                    value={noteValue}
                    onChange={(event) => setNoteDrafts((current) => ({ ...current, [submissionId]: event.target.value }))}
                    placeholder="Add private staff note..."
                    style={{ border: `1px solid ${cardBorder}`, background: 'rgba(15,23,42,0.55)', color: cardText, borderRadius: 10, padding: '8px 10px', minWidth: 0 }}
                  />
                  <QueueButton
                    disabled={!guildId || !submissionId || !noteValue.trim() || buttonBusy(submissionId, 'Note')}
                    onClick={() => runAction(submissionId, 'Note', async () => {
                      await api.request(`/api/forms/${guildId}/submissions/${submissionId}/workflow/notes`, { method: 'POST', body: JSON.stringify({ note: noteValue }) });
                      setNoteDrafts((current) => ({ ...current, [submissionId]: '' }));
                    })}
                  >
                    Add note
                  </QueueButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FormsWorkflowPanel({ theme, overview = {}, guildId = '', onRefresh }) {
  const cardBorder = theme?.cardBorder || 'rgba(148,163,184,0.22)';
  const cardBg = theme?.cardBg || 'rgba(15,23,42,0.40)';
  const cardText = theme?.cardText || '#e5e7eb';
  const mutedText = theme?.mutedText || '#94a3b8';
  const pending = getNumber(overview.pendingSubmissionCount);
  const missingChannels = getNumber(overview.missingTicketChannelCount);
  const ticketLinked = getNumber(overview.ticketLinkedSubmissionCount);

  return (
    <section style={{
      border: `1px solid ${cardBorder}`,
      background: cardBg,
      color: cardText,
      borderRadius: 22,
      padding: 20,
      display: 'grid',
      gap: 16,
      boxShadow: theme?.shadow || 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ color: mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Forms Workflow
          </span>
          <h3 style={{ margin: 0, color: cardText }}>Forms → Tickets Health</h3>
          <p style={{ margin: 0, color: mutedText, lineHeight: 1.55 }}>
            Review submission workload, ticket linking, ticket channel health and per-form workflow activity.
          </p>
        </div>

        {missingChannels ? (
          <span style={{
            border: '1px solid rgba(239,68,68,0.42)',
            color: '#fca5a5',
            borderRadius: 999,
            padding: '7px 10px',
            fontSize: 12,
            fontWeight: 950,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Recovery Needed
          </span>
        ) : pending ? (
          <span style={{
            border: '1px solid rgba(245,158,11,0.42)',
            color: '#fcd34d',
            borderRadius: 999,
            padding: '7px 10px',
            fontSize: 12,
            fontWeight: 950,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Review Queue Active
          </span>
        ) : (
          <span style={{
            border: '1px solid rgba(34,197,94,0.38)',
            color: '#86efac',
            borderRadius: 999,
            padding: '7px 10px',
            fontSize: 12,
            fontWeight: 950,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Healthy
          </span>
        )}
      </div>

      <FormsWorkflowCards theme={theme} overview={overview} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,210px),1fr))', gap: 12 }}>
        <WorkflowStep theme={theme} index="1" title="Submit" detail="User opens a Discord form modal and answers configured questions." status="info" />
        <WorkflowStep theme={theme} index="2" title="Capture" detail="Submission is stored in guild.json with answers, submitter, timeline and review status." status="ready" />
        <WorkflowStep theme={theme} index="3" title="Ticket" detail={ticketLinked ? 'A linked staff ticket has been created for at least one submission.' : 'Ticket creation depends on form action and output category setup.'} status={ticketLinked ? 'ready' : 'warning'} />
        <WorkflowStep theme={theme} index="4" title="Review" detail="Staff approve, deny, request information or close submissions from the dashboard." status={pending ? 'warning' : 'ready'} />
        <WorkflowStep theme={theme} index="5" title="Archive" detail="Linked tickets carry workflow metadata for transcript, recovery and analytics visibility." status={missingChannels ? 'danger' : 'ready'} />
      </div>

      <FormsReviewQueue theme={theme} overview={overview} guildId={guildId} onRefresh={onRefresh} />
      <WorkflowActionHints theme={theme} overview={overview} />
      <FormsWorkflowBreakdown theme={theme} overview={overview} />
    </section>
  );
}
