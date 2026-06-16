import React from 'react';

import useOwnerRuntime from '../../hooks/useOwnerRuntime.js';

function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return Math.round(mb) + ' MB';
  return (mb / 1024).toFixed(2) + ' GB';
}

function formatUptime(seconds = 0) {
  const total = Math.floor(Number(seconds) || 0);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return days + 'd ' + hours + 'h';
  if (hours > 0) return hours + 'h ' + minutes + 'm';
  return minutes + 'm';
}

export default function RuntimeMonitor({ theme }) {
  const { runtime, loading, error } = useOwnerRuntime();

  const card = {
    border: '1px solid ' + theme.cardBorder,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 20,
    padding: 18,
    boxShadow: theme.shadow,
  };

  const memory = runtime?.memory || {};

  const statCards = [
    ['Environment', runtime?.mode || 'Unknown'],
    ['Hostname', runtime?.hostname || 'Unknown'],
    ['CPU Cores', String(runtime?.cpuCount ?? 'Unknown')],
    ['Uptime', formatUptime(runtime?.uptime)],
  ];

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={card}>
        <p style={{ margin: 0, color: '#93c5fd', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Owner Runtime
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 34 }}>Runtime Monitor</h1>
        <p style={{ margin: '8px 0 0', color: theme.mutedText }}>
          Runtime visibility for DEV, BETA and PRODUCTION infrastructure.
        </p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
        {statCards.map(([label, value]) => (
          <div key={label} style={card}>
            <div style={{ color: theme.mutedText, fontSize: 12, textTransform: 'uppercase' }}>{label}</div>
            <div style={{ marginTop: 8, fontSize: 24, fontWeight: 900 }}>{value}</div>
          </div>
        ))}
      </section>

      {error ? <section style={{ ...card, color: '#fca5a5' }}>{error}</section> : null}

      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <strong>Runtime Health</strong>
          <span style={{ color: loading ? '#f59e0b' : '#22c55e', fontWeight: 900 }}>{loading ? 'Loading' : 'Online'}</span>
        </div>

        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          <RuntimeRow label="Platform" value={runtime?.platform || 'Unknown'} theme={theme} />
          <RuntimeRow label="Node Version" value={runtime?.nodeVersion || 'Unknown'} theme={theme} />
          <RuntimeRow label="Memory Usage" value={formatBytes(memory.used) + ' / ' + formatBytes(memory.total)} theme={theme} />
          <RuntimeRow label="Commit SHA" value={runtime?.commitSha || 'Unavailable'} theme={theme} />
          <RuntimeRow label="Status" value={loading ? 'Loading Runtime Data' : 'Healthy'} theme={theme} />
        </div>
      </section>
    </div>
  );
}

function RuntimeRow({ label, value, theme }) {
  return <div style={{ border: '1px solid ' + theme.cardBorder, background: 'rgba(15,23,42,0.38)', borderRadius: 14, padding: 12 }}><div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 800 }}>{label}</div><div style={{ marginTop: 4, fontWeight: 900 }}>{value}</div></div>;
}
