import React from 'react';

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toneColor(tone, theme) {
  if (tone === 'success') return '#86efac';
  if (tone === 'warning') return '#fcd34d';
  if (tone === 'danger') return '#fca5a5';
  if (tone === 'purple') return '#c4b5fd';
  return theme?.mutedText || '#94a3b8';
}

function SummaryItem({ theme, label, value, hint, tone = 'default' }) {
  const color = toneColor(tone, theme);

  return (
    <div style={{
      border: `1px solid ${tone === 'default' ? theme.cardBorder : color}`,
      background: 'rgba(15,23,42,0.28)',
      borderRadius: 14,
      padding: 13,
      display: 'grid',
      gap: 4,
      minWidth: 0,
    }}>
      <div style={{ color: theme.mutedText, fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ color, fontSize: 24, fontWeight: 950, lineHeight: 1 }}>{value}</div>
      {hint ? <div style={{ color: theme.mutedText, fontSize: 12, lineHeight: 1.35 }}>{hint}</div> : null}
    </div>
  );
}

export default function TicketWorkflowSummary({ theme, overview = {}, tickets = [] }) {
  const formTickets = toNumber(overview.formTicketCount, tickets.filter((ticket) => ticket.source === 'form' || ticket.formSubmissionId || ticket.metadata?.submissionId).length);
  const missingChannels = toNumber(overview.missingChannelRecordCount, tickets.filter((ticket) => {
    const status = String(ticket.status || 'open').toLowerCase();
    if (['closed', 'archived', 'deleted'].includes(status)) return false;
    return !ticket.discordChannelId && !ticket.channelId;
  }).length);
  const deleted = toNumber(overview.deletedCount, tickets.filter((ticket) => String(ticket.status || '').toLowerCase() === 'deleted' || ticket.deletedAt).length);
  const archivedToday = toNumber(overview.archivedTodayCount, 0);
  const deletedToday = toNumber(overview.deletedTodayCount, 0);
  const transcriptCount = toNumber(overview.transcriptCount, tickets.filter((ticket) => ticket.transcript || ticket.transcriptId || ticket.transcriptUrl).length);
  const active = toNumber(overview.activeCount, 0);
  const panels = toNumber(overview.panelCount, 0);

  return (
    <section style={{
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      color: theme.cardText,
      borderRadius: 22,
      padding: 20,
      boxShadow: theme.shadow,
      display: 'grid',
      gap: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ticket Workflow</div>
          <h3 style={{ margin: '6px 0 0' }}>Operational Health</h3>
          <p style={{ margin: '8px 0 0', color: theme.mutedText, lineHeight: 1.5 }}>
            High-signal ticket metrics for Forms integration, channel recovery, deletions, transcripts and panels.
          </p>
        </div>
        <span style={{
          border: `1px solid ${missingChannels ? '#fca5a5' : '#86efac'}`,
          color: missingChannels ? '#fca5a5' : '#86efac',
          borderRadius: 999,
          padding: '7px 10px',
          fontSize: 12,
          fontWeight: 950,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          {missingChannels ? 'Recovery Needed' : 'Healthy'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 155px), 1fr))', gap: 10 }}>
        <SummaryItem theme={theme} label="Active" value={active} hint="Open + claimed" tone="success" />
        <SummaryItem theme={theme} label="Form Tickets" value={formTickets} hint="Forms bridge" tone="purple" />
        <SummaryItem theme={theme} label="Missing Channels" value={missingChannels} hint="Recovery queue" tone={missingChannels ? 'danger' : 'success'} />
        <SummaryItem theme={theme} label="Deleted" value={deleted} hint={`${deletedToday} today`} tone={deleted ? 'danger' : 'default'} />
        <SummaryItem theme={theme} label="Archived Today" value={archivedToday} hint="Closed workflow" tone="purple" />
        <SummaryItem theme={theme} label="Transcripts" value={transcriptCount} hint="Saved records" tone="default" />
        <SummaryItem theme={theme} label="Panels" value={panels} hint="Ticket entry points" tone="default" />
      </div>
    </section>
  );
}
