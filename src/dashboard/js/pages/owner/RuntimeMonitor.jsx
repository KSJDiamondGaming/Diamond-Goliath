import React from 'react';

import useOwnerRuntime from '../../hooks/useOwnerRuntime.js';

function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';

  const mb = bytes / 1024 / 1024;

  if (mb < 1024) {
    return Math.round(mb) + ' MB';
  }

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
  const usedMemory = formatBytes(memory.used);
  const totalMemory = formatBytes(memory.total);

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={card}>
        <p style={{ margin: 0, color: '#93c5fd', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Owner Runtime
        </p>

        <h1 style={{ margin: '8px 0 0', fontSize: 34 }}>
          Runtime Monitor
        </h1>

        <p style={{ margin: '8px 0 0', color: theme.mutedText }}>
          Live runtime health for the current owner API environment.
        </p>
      </section>

      {error ? (
        <section style={{ ...card, color: '#fca5a5' }}>
          {error}
        </section>
      ) : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{runtime?.mode || 'Runtime'}</strong>

            <span style={{ color: loading ? '#f59e0b' : '#22c55e', fontWeight: 900 }}>
              {loading ? 'Loading' : 'Online'}
            </span>
          </div>

          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            <RuntimeRow label="Hostname" value={runtime?.hostname || 'Unknown'} theme={theme} />
            <RuntimeRow label="Platform" value={runtime?.platform || 'Unknown'} theme={theme} />
            <RuntimeRow label="Node Version" value={runtime?.nodeVersion || 'Unknown'} theme={theme} />
            <RuntimeRow label="CPU Cores" value={String(runtime?.cpuCount ?? 'Unknown')} theme={theme} />
            <RuntimeRow label="Memory Usage" value={usedMemory + ' / ' + totalMemory} theme={theme} />
            <RuntimeRow label="Uptime" value={formatUptime(runtime?.uptime)} theme={theme} />
          </div>
        </div>
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
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 800 }}>
        {label}
      </div>

      <div style={{ marginTop: 4, fontWeight: 900 }}>
        {value}
      </div>
    </div>
  );
}
