import React from 'react';

import useOwnerGuilds from '../../hooks/useOwnerGuilds.js';

export default function FormsHub({ theme }) {
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
        <p style={{ margin: 0, color: '#8b5cf6', fontWeight: 900, textTransform: 'uppercase' }}>
          Global Forms
        </p>

        <h1 style={{ margin: '8px 0 0', fontSize: 34 }}>
          Forms Hub
        </h1>

        <p style={{ marginTop: 8, color: theme.mutedText }}>
          Monitor universal forms, submissions, analytics and form-to-ticket workflows.
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
        <StatCard title="Active Forms" value="Pending API" theme={theme} />
        <StatCard title="Submissions Today" value="Pending API" theme={theme} />
        <StatCard title="Tickets Created" value="Pending API" theme={theme} />
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Recent Form Activity</h3>

        <div
          style={{
            border: '1px dashed ' + theme.cardBorder,
            borderRadius: 14,
            padding: 20,
            color: theme.mutedText,
          }}
        >
          Global form analytics feed coming soon.
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
