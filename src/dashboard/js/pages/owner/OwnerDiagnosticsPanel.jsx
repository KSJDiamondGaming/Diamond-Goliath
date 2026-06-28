import React, { useCallback, useEffect, useState } from 'react';

import { api } from '../../services/apiClient.js';

function statusTone(value) {
  if (value === true || value === 'ok' || value === 'online') return '#86efac';
  if (value === false || value === 'error' || value === 'offline') return '#fca5a5';
  return '#fcd34d';
}

function boolLabel(value) {
  return value ? 'YES' : 'NO';
}

function safeValue(value) {
  if (value === null || value === undefined || value === '') return 'unset';
  if (typeof value === 'boolean') return boolLabel(value);
  return String(value);
}

function MiniStatus({ theme, label, value, toneValue }) {
  const tone = statusTone(toneValue ?? value);
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.24)', borderRadius: 14, padding: 12, minWidth: 0 }}>
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ marginTop: 6, color: tone, fontWeight: 950, overflowWrap: 'anywhere' }}>{safeValue(value)}</div>
    </div>
  );
}

function OwnerKeyRow({ theme, name, count }) {
  const configured = Number(count || 0) > 0;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', borderTop: `1px solid ${theme.cardBorder}`, padding: '9px 0' }}>
      <span style={{ color: theme.cardText, fontWeight: 800 }}>{name}</span>
      <span style={{ color: configured ? '#86efac' : theme.mutedText, fontWeight: 950 }}>{configured ? `${count} configured` : 'not set'}</span>
    </div>
  );
}

export default function OwnerDiagnosticsPanel({ theme }) {
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadDiagnostics = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.getOwnerDiagnostics();
      setDiagnostics(response);
    } catch (loadError) {
      setDiagnostics(null);
      setError(loadError.message || 'Failed to load owner diagnostics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiagnostics();
  }, [loadDiagnostics]);

  const auth = diagnostics?.auth || {};
  const discord = diagnostics?.discord || {};
  const runtime = diagnostics?.runtime || {};
  const environment = diagnostics?.environment || {};
  const ownerKeys = auth.configuredOwnerKeys || {};

  return (
    <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 20, padding: 18, boxShadow: theme.shadow, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, color: '#38bdf8', fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Owner Diagnostics</p>
          <h3 style={{ margin: '7px 0 0' }}>Access & API Health</h3>
          <p style={{ margin: '8px 0 0', color: theme.mutedText, lineHeight: 1.55 }}>
            Safe checks for session ownership, owner environment variables, Discord client state and mounted owner API routes.
          </p>
        </div>
        <button type="button" onClick={loadDiagnostics} disabled={loading} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.35)', color: theme.cardText, borderRadius: 12, padding: '9px 12px', fontWeight: 900, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Checking...' : 'Recheck'}
        </button>
      </div>

      {error ? <div style={{ color: '#fca5a5', border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12 }}>{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,170px),1fr))', gap: 10 }}>
        <MiniStatus theme={theme} label="Authenticated" value={auth.authenticated} />
        <MiniStatus theme={theme} label="Owner Match" value={auth.ownerMatch} />
        <MiniStatus theme={theme} label="Session Owner Flag" value={auth.sessionOwnerFlag} />
        <MiniStatus theme={theme} label="Owner ID Count" value={auth.ownerIdCount ?? 0} toneValue={(auth.ownerIdCount || 0) > 0} />
        <MiniStatus theme={theme} label="Runtime Mode" value={diagnostics?.mode || 'unknown'} toneValue="ok" />
        <MiniStatus theme={theme} label="Discord Ready" value={discord.ready} />
        <MiniStatus theme={theme} label="Guild Count" value={discord.guildCount ?? 0} toneValue="ok" />
        <MiniStatus theme={theme} label="Websocket Ping" value={discord.wsPing == null ? 'unknown' : `${discord.wsPing}ms`} toneValue="ok" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 14 }}>
        <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.20)', borderRadius: 16, padding: 14 }}>
          <strong>Owner ID Sources</strong>
          <p style={{ margin: '6px 0 8px', color: theme.mutedText, fontSize: 13 }}>Only counts are shown. No owner IDs or secrets are exposed.</p>
          <OwnerKeyRow theme={theme} name="OWNER_ID" count={ownerKeys.OWNER_ID || 0} />
          <OwnerKeyRow theme={theme} name="OWNER_IDS" count={ownerKeys.OWNER_IDS || 0} />
          <OwnerKeyRow theme={theme} name="BOT_OWNER_ID" count={ownerKeys.BOT_OWNER_ID || 0} />
          <OwnerKeyRow theme={theme} name="BOT_OWNER_IDS" count={ownerKeys.BOT_OWNER_IDS || 0} />
        </div>

        <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.20)', borderRadius: 16, padding: 14 }}>
          <strong>Environment Health</strong>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {Object.entries(environment).map(([key, value]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: `1px solid ${theme.cardBorder}`, paddingTop: 8 }}>
                <span style={{ color: theme.mutedText }}>{key}</span>
                <span style={{ color: typeof value === 'boolean' ? statusTone(value) : theme.cardText, fontWeight: 900 }}>{safeValue(value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.20)', borderRadius: 16, padding: 14 }}>
          <strong>Runtime</strong>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            <div style={{ color: theme.mutedText }}>Node: <strong style={{ color: theme.cardText }}>{runtime.nodeVersion || 'unknown'}</strong></div>
            <div style={{ color: theme.mutedText }}>PID: <strong style={{ color: theme.cardText }}>{runtime.pid || 'unknown'}</strong></div>
            <div style={{ color: theme.mutedText }}>Uptime: <strong style={{ color: theme.cardText }}>{runtime.uptimeSeconds || 0}s</strong></div>
            <div style={{ color: theme.mutedText }}>Host: <strong style={{ color: theme.cardText }}>{runtime.hostname || 'unknown'}</strong></div>
            <div style={{ color: theme.mutedText }}>Discord User: <strong style={{ color: theme.cardText }}>{discord.username || 'unknown'}</strong></div>
          </div>
        </div>
      </div>

      <div style={{ color: theme.mutedText, fontSize: 12 }}>
        Last checked: {diagnostics?.checkedAt ? new Date(diagnostics.checkedAt).toLocaleString() : 'not checked'}
      </div>
    </section>
  );
}
