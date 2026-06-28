import React from 'react';

function getMetric(overview = {}, key, fallback = 0) {
  const value = overview?.[key];
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function cardStyle(theme = {}, tone = 'default') {
  const tones = {
    default: theme.cardBorder || 'rgba(148,163,184,0.22)',
    success: 'rgba(34,197,94,0.38)',
    warning: 'rgba(245,158,11,0.42)',
    danger: 'rgba(239,68,68,0.42)',
    info: 'rgba(59,130,246,0.42)',
    purple: 'rgba(168,85,247,0.42)',
  };

  return {
    border: `1px solid ${tones[tone] || tones.default}`,
    background: theme.softBg || 'rgba(15,23,42,0.34)',
    borderRadius: 18,
    padding: 16,
    display: 'grid',
    gap: 7,
    minWidth: 0,
  };
}

function WorkflowMetricCard({ theme, label, value, hint, tone = 'default' }) {
  return (
    <div style={cardStyle(theme, tone)}>
      <span style={{
        color: theme.mutedText || '#94a3b8',
        fontSize: 11,
        fontWeight: 950,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        {label}
      </span>
      <strong style={{
        color: theme.cardText || '#e5e7eb',
        fontSize: 26,
        lineHeight: 1,
        overflowWrap: 'anywhere',
      }}>
        {value}
      </strong>
      {hint ? (
        <span style={{ color: theme.mutedText || '#94a3b8', fontSize: 12, lineHeight: 1.35 }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function FormsWorkflowCards({ theme, overview = {} }) {
  const pending = getMetric(overview, 'pendingSubmissionCount');
  const approved = getMetric(overview, 'approvedSubmissionCount');
  const denied = getMetric(overview, 'deniedSubmissionCount');
  const requestInfo = getMetric(overview, 'requestInfoSubmissionCount');
  const ticketLinked = getMetric(overview, 'ticketLinkedSubmissionCount');
  const channelLinked = getMetric(overview, 'ticketChannelLinkedSubmissionCount');
  const missingChannels = getMetric(overview, 'missingTicketChannelCount');
  const submissions = getMetric(overview, 'submissionCount');
  const reviewed = approved + denied;
  const approvalRate = reviewed > 0 ? `${Math.round((approved / reviewed) * 100)}%` : '0%';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12 }}>
      <WorkflowMetricCard theme={theme} label="Submissions" value={submissions} hint="Total captured" tone="info" />
      <WorkflowMetricCard theme={theme} label="Pending" value={pending} hint="Needs review" tone={pending ? 'warning' : 'success'} />
      <WorkflowMetricCard theme={theme} label="Approved" value={approved} hint={`Approval rate ${approvalRate}`} tone="success" />
      <WorkflowMetricCard theme={theme} label="Denied" value={denied} hint="Rejected submissions" tone={denied ? 'danger' : 'default'} />
      <WorkflowMetricCard theme={theme} label="Request Info" value={requestInfo} hint="Waiting on user" tone={requestInfo ? 'warning' : 'default'} />
      <WorkflowMetricCard theme={theme} label="Ticket Linked" value={ticketLinked} hint="Created tickets" tone="purple" />
      <WorkflowMetricCard theme={theme} label="Channel Linked" value={channelLinked} hint="Ticket channels" tone="info" />
      <WorkflowMetricCard theme={theme} label="Missing Channels" value={missingChannels} hint="Needs recovery" tone={missingChannels ? 'danger' : 'success'} />
    </div>
  );
}

export function FormsWorkflowBreakdown({ theme, overview = {} }) {
  const breakdown = Array.isArray(overview.formBreakdown) ? overview.formBreakdown : [];

  if (!breakdown.length) {
    return (
      <div style={{
        border: `1px solid ${theme.cardBorder || 'rgba(148,163,184,0.22)'}`,
        background: theme.softBg || 'rgba(15,23,42,0.34)',
        borderRadius: 18,
        padding: 16,
        color: theme.mutedText || '#94a3b8',
      }}>
        No form workflow activity yet.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {breakdown.map((form) => (
        <div key={form.formId} style={{
          border: `1px solid ${form.missingTicketChannelCount ? 'rgba(239,68,68,0.42)' : (theme.cardBorder || 'rgba(148,163,184,0.22)')}`,
          background: theme.softBg || 'rgba(15,23,42,0.34)',
          borderRadius: 16,
          padding: 14,
          display: 'grid',
          gap: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <strong style={{ color: theme.cardText || '#e5e7eb', overflowWrap: 'anywhere' }}>{form.name || form.formId}</strong>
            <span style={{ color: form.enabled === false ? '#fca5a5' : '#86efac', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' }}>
              {form.enabled === false ? 'Disabled' : 'Enabled'}
            </span>
          </div>
          <span style={{ color: theme.mutedText || '#94a3b8', fontSize: 13 }}>
            Submissions: {form.submissionCount || 0} • Pending: {form.pendingCount || 0} • Tickets: {form.ticketLinkedCount || 0} • Missing channels: {form.missingTicketChannelCount || 0}
          </span>
        </div>
      ))}
    </div>
  );
}

export default FormsWorkflowCards;
