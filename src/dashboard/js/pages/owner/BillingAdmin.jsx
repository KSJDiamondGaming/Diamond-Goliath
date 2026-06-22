import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient.js';

function card(theme, extra = {}) {
  return {
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 20,
    padding: 18,
    boxShadow: theme.shadow,
    minWidth: 0,
    overflow: 'hidden',
    ...extra,
  };
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function formatDuration(value) {
  if (!value) return 'Lifetime';
  if (Number(value) === 30) return '1 Month';
  if (Number(value) === 90) return '3 Months';
  if (Number(value) === 180) return '6 Months';
  return `${value} Days`;
}

function statusFor(code) {
  if (code.revoked) return 'Revoked';
  if (code.used) return 'Redeemed';
  return 'Active';
}

function StatCard({ theme, label, value, detail, accent = '#93c5fd' }) {
  return (
    <section style={card(theme, { minHeight: 112, display: 'grid', gap: 8, alignContent: 'space-between' })}>
      <div style={{ color: theme.mutedText, fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ color: accent, fontSize: 30, fontWeight: 950, lineHeight: 1 }}>{value}</div>
      <div style={{ color: theme.mutedText, fontSize: 13 }}>{detail}</div>
    </section>
  );
}

function CodeRow({ theme, code, onRevoke, busy }) {
  const status = statusFor(code);
  const canRevoke = !code.used && !code.revoked;

  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12, background: 'rgba(15,23,42,0.22)', display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ wordBreak: 'break-all' }}>{code.code}</strong>
        <span style={{ color: status === 'Active' ? '#86efac' : status === 'Redeemed' ? '#93c5fd' : '#fca5a5', fontWeight: 950, fontSize: 12 }}>{status}</span>
      </div>
      <div style={{ color: theme.mutedText, fontSize: 13, lineHeight: 1.5 }}>
        Plan: <strong style={{ color: theme.cardText }}>{code.plan}</strong> • Duration: <strong style={{ color: theme.cardText }}>{formatDuration(code.duration)}</strong> • Created: {formatDate(code.createdAt)}
        {code.guildId ? <> • Guild: <strong style={{ color: theme.cardText }}>{code.guildId}</strong></> : null}
        {code.redeemedAt ? <> • Redeemed: {formatDate(code.redeemedAt)}</> : null}
      </div>
      {canRevoke ? (
        <button type="button" disabled={busy} onClick={() => onRevoke(code.code)} style={{ justifySelf: 'start', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.12)', color: '#fecaca', borderRadius: 10, padding: '8px 10px', fontWeight: 900, cursor: busy ? 'not-allowed' : 'pointer' }}>
          Revoke
        </button>
      ) : null}
    </div>
  );
}

export default function BillingAdmin({ theme }) {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ plan: 'plus', duration: '1m', quantity: 1 });

  const activeCodes = useMemo(() => codes.filter((code) => !code.used && !code.revoked), [codes]);
  const redeemedCodes = useMemo(() => codes.filter((code) => code.used), [codes]);
  const revokedCodes = useMemo(() => codes.filter((code) => code.revoked), [codes]);

  async function loadCodes() {
    setLoading(true);
    setError('');

    try {
      const payload = await api.request('/api/billing/codes');
      setCodes(Array.isArray(payload.codes) ? payload.codes : []);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load billing codes.');
      setCodes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCodes();
  }, []);

  async function generateCodes(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const payload = await api.request('/api/billing/codes/generate', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setNotice(`Generated ${payload.codes?.length || 0} billing code(s).`);
      await loadCodes();
    } catch (generateError) {
      setError(generateError.message || 'Failed to generate codes.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeCode(code) {
    setBusy(true);
    setError('');
    setNotice('');

    try {
      await api.request(`/api/billing/codes/${encodeURIComponent(code)}/revoke`, { method: 'POST' });
      setNotice('Code revoked.');
      await loadCodes();
    } catch (revokeError) {
      setError(revokeError.message || 'Failed to revoke code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
      <section style={card(theme, { background: 'linear-gradient(135deg, rgba(250,204,21,0.14), rgba(15,23,42,0.08) 48%, rgba(59,130,246,0.12))', padding: 'clamp(18px, 2.4vw, 24px)' })}>
        <p style={{ margin: 0, color: '#fde68a', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Owner Billing</p>
        <h1 style={{ margin: '8px 0 0', fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: '-0.04em', lineHeight: 1 }}>💎 Billing Admin</h1>
        <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 860 }}>
          Generate, review and revoke Goliath access codes for Plus, Pro and hidden Lifetime subscriptions.
        </p>
      </section>

      {error ? <section style={{ ...card(theme), color: '#fca5a5' }}>{error}</section> : null}
      {notice ? <section style={{ ...card(theme), color: '#86efac' }}>{notice}</section> : null}
      {loading ? <section style={card(theme)}>Loading billing admin...</section> : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,170px),1fr))', gap: 12 }}>
        <StatCard theme={theme} label="Total Codes" value={codes.length} detail="All generated codes" />
        <StatCard theme={theme} label="Active" value={activeCodes.length} detail="Unused and available" accent="#86efac" />
        <StatCard theme={theme} label="Redeemed" value={redeemedCodes.length} detail="Applied to guilds" accent="#93c5fd" />
        <StatCard theme={theme} label="Revoked" value={revokedCodes.length} detail="Disabled by owner" accent="#fca5a5" />
      </section>

      <section style={card(theme)}>
        <h2 style={{ margin: '0 0 12px' }}>Generate Codes</h2>
        <form onSubmit={generateCodes} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,170px),1fr))', gap: 12, alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 6, color: theme.mutedText, fontWeight: 900 }}>Plan
            <select value={form.plan} onChange={(event) => setForm((current) => ({ ...current, plan: event.target.value, duration: event.target.value === 'lifetime' ? 'lifetime' : current.duration }))} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.48)', color: theme.cardText, borderRadius: 12, padding: '11px 12px', fontWeight: 900 }}>
              <option value="plus">Plus</option>
              <option value="pro">Pro</option>
              <option value="lifetime">Lifetime</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6, color: theme.mutedText, fontWeight: 900 }}>Duration
            <select value={form.duration} disabled={form.plan === 'lifetime'} onChange={(event) => setForm((current) => ({ ...current, duration: event.target.value }))} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.48)', color: theme.cardText, borderRadius: 12, padding: '11px 12px', fontWeight: 900 }}>
              <option value="1m">1 Month</option>
              <option value="3m">3 Months</option>
              <option value="6m">6 Months</option>
              <option value="lifetime">Lifetime</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6, color: theme.mutedText, fontWeight: 900 }}>Quantity
            <select value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: Number(event.target.value) }))} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.48)', color: theme.cardText, borderRadius: 12, padding: '11px 12px', fontWeight: 900 }}>
              {[1, 5, 10, 25, 100].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <button type="submit" disabled={busy} style={{ border: '1px solid rgba(34,197,94,0.42)', background: busy ? 'rgba(34,197,94,0.10)' : 'rgba(34,197,94,0.18)', color: '#bbf7d0', borderRadius: 12, padding: '12px 14px', fontWeight: 950, cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Working...' : 'Generate'}
          </button>
        </form>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 14 }}>
        <section style={card(theme)}>
          <h2 style={{ marginTop: 0 }}>Active Codes</h2>
          <div style={{ display: 'grid', gap: 10 }}>{activeCodes.length ? activeCodes.map((code) => <CodeRow key={code.code} theme={theme} code={code} onRevoke={revokeCode} busy={busy} />) : <p style={{ color: theme.mutedText }}>No active codes.</p>}</div>
        </section>
        <section style={card(theme)}>
          <h2 style={{ marginTop: 0 }}>Redeemed Codes</h2>
          <div style={{ display: 'grid', gap: 10 }}>{redeemedCodes.length ? redeemedCodes.map((code) => <CodeRow key={code.code} theme={theme} code={code} onRevoke={revokeCode} busy={busy} />) : <p style={{ color: theme.mutedText }}>No redeemed codes.</p>}</div>
        </section>
        <section style={card(theme)}>
          <h2 style={{ marginTop: 0 }}>Revoked Codes</h2>
          <div style={{ display: 'grid', gap: 10 }}>{revokedCodes.length ? revokedCodes.map((code) => <CodeRow key={code.code} theme={theme} code={code} onRevoke={revokeCode} busy={busy} />) : <p style={{ color: theme.mutedText }}>No revoked codes.</p>}</div>
        </section>
      </section>
    </div>
  );
}
