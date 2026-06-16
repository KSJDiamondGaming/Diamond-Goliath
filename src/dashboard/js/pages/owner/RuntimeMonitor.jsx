import React from 'react';

export default function RuntimeMonitor({ theme }) {
  const card = {
    border: '1px solid ' + theme.cardBorder,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 20,
    padding: 18,
    boxShadow: theme.shadow,
  };

  const environments = [
    { name: 'DEV', status: 'Online', tone: '#22c55e' },
    { name: 'BETA', status: 'Online', tone: '#eab308' },
    { name: 'PRODUCTION', status: 'Online', tone: '#ef4444' },
  ];

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={card}>
        <p style={{ margin: 0, color: '#93c5fd', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Owner Runtime
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 34 }}>Runtime Monitor</h1>
        <p style={{ margin: '8px 0 0', color: theme.mutedText }}>
          Monitor DEV, BETA and PRODUCTION runtime health from one owner-only page.
        </p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {environments.map((env) => (
          <div key={env.name} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{env.name}</strong>
              <span style={{ color: env.tone, fontWeight: 900 }}>{env.status}</span>
            </div>

            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              <RuntimeRow label="Hostname" value="Pending API" theme={theme} />
              <RuntimeRow label="Node Version" value="Pending API" theme={theme} />
              <RuntimeRow label="CPU Usage" value="Pending API" theme={theme} />
              <RuntimeRow label="Memory Usage" value="Pending API" theme={theme} />
              <RuntimeRow label="Uptime" value="Pending API" theme={theme} />
              <RuntimeRow label="Commit SHA" value="Pending API" theme={theme} />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function RuntimeRow({ label, value, theme }) {
  return (
    <div
      style={{
        border: '1px solid ' + theme.cardBorder,
        background: 'rgba(15,23,42,0.38)',
        borderRadius: 14,
        padding: 12,
      }}
    >
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 900 }}>{value}</div>
    </div>
  );
}
