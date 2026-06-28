import React from 'react';

import OwnerDiagnosticsPanel from './OwnerDiagnosticsPanel.jsx';

const ENVIRONMENTS = [
  { key: 'DEV', label: 'DEV', icon: '🔵', branch: 'dev', port: 3001 },
  { key: 'BETA', label: 'BETA', icon: '🟡', branch: 'beta', port: 3011 },
  { key: 'PRODUCTION', label: 'PRODUCTION', icon: '🟢', branch: 'main', port: 3021 },
];

function formatMemory(bytes) {
  if (!bytes) return 'Loading...';
  return `${(Number(bytes) / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatUptime(seconds) {
  if (!seconds) return 'Loading...';
  const total = Math.floor(Number(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function box(theme, extra = {}) {
  return {
    border: `1px solid ${theme.cardBorder}`,
    background: 'rgba(15,23,42,0.22)',
    color: theme.cardText,
    borderRadius: 16,
    padding: 14,
    minWidth: 0,
    ...extra,
  };
}

function Metric({ theme, label, value }) {
  return (
    <div style={box(theme)}>
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 950 }}>{value}</div>
    </div>
  );
}

export default function OwnerOperationsPanel({ theme, runtime = {}, ownerPayload = {}, stats = {} }) {
  const mode = String(runtime.mode || ownerPayload.runtimeMode || ownerPayload.mode || 'UNKNOWN').toUpperCase();
  const counts = {
    DEV: ownerPayload?.environments?.dev?.guilds ?? stats.DEV ?? 0,
    BETA: ownerPayload?.environments?.beta?.guilds ?? stats.BETA ?? 0,
    PRODUCTION: ownerPayload?.environments?.production?.guilds ?? stats.PRODUCTION ?? 0,
  };

  return (
    <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 20, padding: 18, boxShadow: theme.shadow, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>📊 Owner Operations</h3>
          <p style={{ margin: '8px 0 0', color: theme.mutedText }}>Runtime Monitor, Deployment Centre, Service Health and Owner Diagnostics.</p>
        </div>
        <span style={{ border: '1px solid rgba(134,239,172,0.5)', color: '#86efac', background: 'rgba(34,197,94,0.10)', borderRadius: 999, padding: '7px 11px', fontWeight: 950 }}>{mode}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
        <Metric theme={theme} label="Hostname" value={runtime.hostname || 'Loading...'} />
        <Metric theme={theme} label="Node" value={runtime.nodeVersion || 'Loading...'} />
        <Metric theme={theme} label="CPU" value={runtime.cpuCount || 0} />
        <Metric theme={theme} label="Memory" value={formatMemory(runtime?.memory?.used)} />
        <Metric theme={theme} label="Uptime" value={formatUptime(runtime.uptime)} />
      </div>

      <div style={{ overflowX: 'auto', border: `1px solid ${theme.cardBorder}`, borderRadius: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
          <thead>
            <tr style={{ color: theme.mutedText, textAlign: 'left', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(15,23,42,0.28)' }}>
              <th style={{ padding: '12px 14px' }}>Environment</th>
              <th style={{ padding: '12px 14px' }}>Branch</th>
              <th style={{ padding: '12px 14px' }}>Port</th>
              <th style={{ padding: '12px 14px' }}>Guilds</th>
              <th style={{ padding: '12px 14px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {ENVIRONMENTS.map((environment) => (
              <tr key={environment.key} style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
                <td style={{ padding: '12px 14px', fontWeight: 900 }}>{environment.icon} {environment.label}</td>
                <td style={{ padding: '12px 14px', color: theme.mutedText }}>{environment.branch}</td>
                <td style={{ padding: '12px 14px', color: theme.mutedText }}>{environment.port}</td>
                <td style={{ padding: '12px 14px', color: theme.mutedText }}>{counts[environment.key] || 0}</td>
                <td style={{ padding: '12px 14px' }}>{mode === environment.key ? 'Current Runtime' : 'Workflow Ready'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <OwnerDiagnosticsPanel theme={theme} />
    </section>
  );
}
