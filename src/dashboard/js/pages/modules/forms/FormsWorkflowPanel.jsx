import React from 'react';

import { FormsWorkflowBreakdown, FormsWorkflowCards } from './FormsWorkflowCards.jsx';

function getNumber(value = 0) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
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

export default function FormsWorkflowPanel({ theme, overview = {} }) {
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

      <WorkflowActionHints theme={theme} overview={overview} />
      <FormsWorkflowBreakdown theme={theme} overview={overview} />
    </section>
  );
}
