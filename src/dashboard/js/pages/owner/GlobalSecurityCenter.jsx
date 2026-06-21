import React, { useEffect, useState } from 'react';

import { api } from '../../services/apiClient.js';

const ENVIRONMENT_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'DEV', label: 'DEV' },
  { key: 'BETA', label: 'BETA' },
  { key: 'PRODUCTION', label: 'PROD' },
];

function formatNumber(value = 0) {
  return Number(value || 0).toLocaleString();
}

function formatTime(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString();
}

function environmentBadge(environment = '') {
  const mode = String(environment || '').toUpperCase();
  if (mode === 'DEV') return '🔵 DEV';
  if (mode === 'BETA') return '🟡 BETA';
  if (mode === 'PRODUCTION') return '🟢 PROD';
  return '⚪ UNKNOWN';
}

function card(theme, extra = {}) {
  return {
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 20,
    boxShadow: theme.shadow,
    minWidth: 0,
    overflow: 'hidden',
    ...extra,
  };
}

function Metric({ theme, label, value, accent = '#93c5fd' }) {
  return (
    <div style={card(theme, { padding: 14, background: 'rgba(15,23,42,0.18)' })}>
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ color: accent, fontSize: 24, fontWeight: 950, marginTop: 7 }}>{formatNumber(value)}</div>
    </div>
  );
}

function IncidentRow({ theme, incident }) {
  const severity = String(incident.severity || '').toLowerCase();
  const accent = severity === 'critical' ? '#fca5a5' : '#fcd34d';
  const title = String(incident.type || 'security_event').replace(/_/g, ' ');

  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12, background: 'rgba(15,23,42,0.18)', display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ color: accent, textTransform: 'capitalize' }}>{title}</strong>
        <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 850 }}>{environmentBadge(incident.environment)}</span>
      </div>
      <div style={{ color: theme.cardText, fontSize: 13, fontWeight: 850 }}>{incident.guildName || 'Unknown Guild'}</div>
      <div style={{ color: theme.mutedText, fontSize: 13 }}>{formatTime(incident.timestamp)}</div>
    </div>
  );
}

export default function GlobalSecurityCenter({ theme }) {
  const [environment, setEnvironment] = useState('all');
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadSecurity() {
    try {
      setLoading(true);
      setError('');

      const query = environment && environment !== 'all'
        ? `?environment=${encodeURIComponent(environment)}`
        : '';

      const response = await api.request(`/api/owner/security/all${query}`);
      setPayload(response);
    } catch (loadError) {
      console.error(loadError);
      setPayload(null);
      setError(loadError.message || 'Failed to load global security overview.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSecurity();
  }, [environment]);

  const totals = payload?.totals || {};
  const incidents = payload?.recentIncidents || [];
  const guilds = payload?.guilds || [];

  return (
    <section style={card(theme, { padding: 18, display: 'grid', gap: 16 })}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, color: '#93c5fd', fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Owner Security</p>
          <h2 style={{ margin: '7px 0 0', fontSize: 22 }}>🛡️ Global Security Center</h2>
          <p style={{ margin: '8px 0 0', color: theme.mutedText, lineHeight: 1.55 }}>Cross-environment security snapshot covering incidents, lockdowns, quarantines and webhook events.</p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ENVIRONMENT_OPTIONS.map((option) => {
            const active = environment === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setEnvironment(option.key)}
                style={{
                  border: `1px solid ${active ? '#93c5fd' : theme.cardBorder}`,
                  background: active ? 'rgba(59,130,246,0.16)' : 'rgba(15,23,42,0.18)',
                  color: theme.cardText,
                  borderRadius: 999,
                  padding: '7px 11px',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: 12,
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {error ? <div style={{ color: '#fca5a5' }}>{error}</div> : null}
      {loading ? <div style={{ color: theme.mutedText }}>Loading global security overview...</div> : null}

      {!loading ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,145px),1fr))', gap: 10 }}>
            <Metric theme={theme} label="Guilds" value={totals.guilds || guilds.length} accent="#93c5fd" />
            <Metric theme={theme} label="Incidents" value={totals.incidents} accent="#f87171" />
            <Metric theme={theme} label="Critical" value={totals.critical} accent="#fb7185" />
            <Metric theme={theme} label="Lockdowns" value={totals.lockdowns} accent="#facc15" />
            <Metric theme={theme} label="Quarantined" value={totals.quarantinedUsers} accent="#a78bfa" />
            <Metric theme={theme} label="Webhooks" value={totals.webhookIncidents} accent="#38bdf8" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 14 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <strong>Recent Security Activity</strong>
              {incidents.length ? incidents.slice(0, 8).map((incident, index) => (
                <IncidentRow key={`${incident.guildId || 'guild'}-${incident.timestamp || index}`} theme={theme} incident={incident} />
              )) : <div style={{ color: theme.mutedText }}>No recent security activity found.</div>}
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <strong>Guild Security Health</strong>
              {guilds.length ? guilds.slice(0, 8).map((guild) => (
                <div key={`${guild.environment}-${guild.guildId}`} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12, background: 'rgba(15,23,42,0.18)', display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <strong>{guild.guildName}</strong>
                    <span style={{ color: theme.mutedText, fontSize: 12 }}>{environmentBadge(guild.environment)}</span>
                  </div>
                  <div style={{ color: theme.mutedText, fontSize: 13 }}>Threat: {guild.threatLevel || 'low'} • Incidents: {formatNumber(guild.incidentCount)} • Quarantined: {formatNumber(guild.quarantinedCount)}</div>
                </div>
              )) : <div style={{ color: theme.mutedText }}>No guild security records found.</div>}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
