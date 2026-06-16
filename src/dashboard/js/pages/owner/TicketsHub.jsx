import React from 'react';

import useOwnerGuilds from '../../hooks/useOwnerGuilds.js';

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
          Monitor ticket activity, claims, transcripts and closures across every guild and environment.
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
          gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))',
          gap: 14,
        }}
      >
        <StatCard title="Connected Guilds" value={loading ? 'Loading' : String(guilds.length)} theme={theme} />
        <StatCard title="Open Tickets" value="Pending API" theme={theme} />
        <StatCard title="Claimed Tickets" value="Pending API" theme={theme} />
        <StatCard title="Closed Today" value="Pending API" theme={theme} />
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
          Ticket activity feed coming soon.
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
