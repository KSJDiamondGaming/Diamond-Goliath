import React from 'react';

import useOwnerGuilds from '../../hooks/useOwnerGuilds.js';

const TICKET_AREAS = [
  {
    title: 'Ticket Panels',
    description: 'Manage deployed panels, redeploy status, appearance, role access and per-panel limits.',
    status: 'UI Foundation',
  },
  {
    title: 'Tickets',
    description: 'View open, claimed, archived, reopened and closed tickets across connected guilds.',
    status: 'Pending API',
  },
  {
    title: 'Transcripts',
    description: 'Browse generated transcripts and prepare for transcript channel/user copy delivery.',
    status: 'Pending API',
  },
  {
    title: 'Analytics',
    description: 'Track ticket volume, closure rate, claim activity, response time and panel usage.',
    status: 'Pending API',
  },
  {
    title: 'Settings',
    description: 'Configure cooldowns, one-active rules, logs, transcripts and form-to-ticket workflows.',
    status: 'UI Foundation',
  },
];

const TICKET_WORKFLOWS = [
  'Support Ticket',
  'Appeal Ticket',
  'Application Ticket',
  'Report Ticket',
  'Custom Ticket',
];

const PANEL_CONTROLS = [
  'Deploy Panel',
  'Redeploy Panel',
  'Undeploy Panel',
  'Refresh Panel',
  'Appearance',
  'Role Access',
  'Ticket Limits',
  'Cooldowns',
  'Transcripts',
  'Logs',
];

export default function TicketsHub({ theme }) {
  const { guilds, loading, error } = useOwnerGuilds();

  const card = {
    border: '1px solid ' + theme.cardBorder,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 20,
    padding: 18,
    boxShadow: theme.shadow,
  };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={card}>
        <p style={{ margin: 0, color: '#f59e0b', fontWeight: 900, textTransform: 'uppercase' }}>
          Global Tickets
        </p>

        <h1 style={{ margin: '8px 0 0', fontSize: 34 }}>
          Tickets Hub
        </h1>

        <p style={{ marginTop: 8, color: theme.mutedText }}>
          Universal ticket dashboard foundation for panels, tickets, transcripts, analytics and settings.
        </p>
      </section>

      {error ? (
        <section style={{ ...card, color: '#fca5a5' }}>
          {error}
        </section>
      ) : null}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
          gap: 14,
        }}
      >
        <StatCard title="Connected Guilds" value={loading ? 'Loading' : String(guilds.length)} theme={theme} />
        <StatCard title="Open Tickets" value="Pending API" theme={theme} />
        <StatCard title="Claimed Tickets" value="Pending API" theme={theme} />
        <StatCard title="Closed Today" value="Pending API" theme={theme} />
        <StatCard title="Transcripts" value="Pending API" theme={theme} />
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
        {TICKET_AREAS.map((area) => (
          <FeatureCard key={area.title} item={area} theme={theme} />
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Universal Ticket Workflows</h3>
          <p style={{ marginTop: 0, color: theme.mutedText }}>
            All ticket types use the same universal ticket engine. No hardcoded support, appeal or report systems.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {TICKET_WORKFLOWS.map((workflow) => (
              <Pill key={workflow} label={workflow} theme={theme} />
            ))}
          </div>
        </section>

        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Panel Controls</h3>
          <p style={{ marginTop: 0, color: theme.mutedText }}>
            Dashboard-ready control list for panel management and ticket configuration.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PANEL_CONTROLS.map((control) => (
              <Pill key={control} label={control} theme={theme} />
            ))}
          </div>
        </section>
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Recent Ticket Activity</h3>

        <div
          style={{
            border: '1px dashed ' + theme.cardBorder,
            borderRadius: 14,
            padding: 20,
            color: theme.mutedText,
          }}
        >
          Ticket activity feed coming soon. This panel is ready for ticket creation, claim, close, archive, reopen and transcript events.
        </div>
      </section>
    </div>
  );
}

function StatCard({ title, value, theme }) {
  return (
    <div
      style={{
        border: '1px solid ' + theme.cardBorder,
        background: theme.cardBg,
        borderRadius: 18,
        padding: 18,
      }}
    >
      <div style={{ color: theme.mutedText }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8 }}>{value}</div>
    </div>
  );
}

function FeatureCard({ item, theme }) {
  return (
    <div
      style={{
        border: '1px solid ' + theme.cardBorder,
        background: theme.cardBg,
        borderRadius: 18,
        padding: 18,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <strong>{item.title}</strong>
        <span style={{ color: '#fde68a', fontSize: 12, fontWeight: 900 }}>{item.status}</span>
      </div>
      <p style={{ marginBottom: 0, color: theme.mutedText, lineHeight: 1.5 }}>{item.description}</p>
    </div>
  );
}

function Pill({ label, theme }) {
  return (
    <span
      style={{
        border: '1px solid ' + theme.cardBorder,
        background: 'rgba(245,158,11,0.12)',
        color: '#fde68a',
        borderRadius: 999,
        padding: '7px 10px',
        fontSize: 12,
        fontWeight: 850,
      }}
    >
      {label}
    </span>
  );
}
