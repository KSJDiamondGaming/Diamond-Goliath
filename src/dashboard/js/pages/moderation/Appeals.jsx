import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function statusTone(status) {
  if (status === 'approved') return '#22c55e';
  if (status === 'denied') return '#ef4444';
  if (status === 'pending') return '#f59e0b';
  return '#60a5fa';
}

function cleanEligibilityMessage(value) {
  return String(value || '')
    .replace(/<t:(\d+):F>/g, (_match, seconds) => new Date(Number(seconds) * 1000).toLocaleString());
}

export default function Appeals() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [cases, setCases] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [grounds, setGrounds] = useState('');
  const [resolution, setResolution] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const auth = await api.getAuthMe();
      if (!auth?.authenticated || !auth?.user) throw Object.assign(new Error('Authentication required.'), { status: 401 });
      setAuthenticated(true);
      setUser(auth.user);
      const payload = await api.request('/api/cases/appeals/me');
      setCases(Array.isArray(payload?.cases) ? payload.cases : []);
      setSelected((current) => {
        if (current) return (payload?.cases || []).find((item) => item.guildId === current.guildId && item.caseId === current.caseId) || null;
        return null;
      });
    } catch (loadError) {
      if (loadError?.status === 401) {
        setAuthenticated(false);
        setUser(null);
        setCases([]);
      } else {
        setError(loadError?.message || 'Could not load your appeal records.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const pendingCount = useMemo(() => cases.reduce((total, item) => total + item.appeals.filter((appeal) => appeal.status === 'pending').length, 0), [cases]);

  async function submitAppeal(event) {
    event.preventDefault();
    if (!selected || submitting) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const result = await api.request(`/api/cases/appeals/${encodeURIComponent(selected.guildId)}/${encodeURIComponent(selected.caseId)}`, {
        method: 'POST',
        body: JSON.stringify({ grounds, requestedResolution: resolution }),
      });
      setSuccess(`Appeal ${result?.appeal?.id || ''} submitted successfully.`.trim());
      setGrounds('');
      setResolution('');
      await load();
    } catch (submitError) {
      setError(cleanEligibilityMessage(submitError?.message || 'Could not submit your appeal.'));
    } finally {
      setSubmitting(false);
    }
  }

  const card = {
    background: 'rgba(15, 23, 42, 0.92)',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    borderRadius: 18,
    padding: 20,
    boxShadow: '0 18px 45px rgba(0,0,0,0.25)',
  };
  const input = {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    background: '#0b1220',
    color: '#f8fafc',
    padding: '12px 13px',
    font: 'inherit',
    resize: 'vertical',
  };
  const button = {
    border: 0,
    borderRadius: 12,
    background: '#2563eb',
    color: '#fff',
    padding: '11px 16px',
    fontWeight: 800,
    cursor: 'pointer',
  };

  if (loading) {
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#050b16', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>Loading appeals…</main>;
  }

  if (!authenticated) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: 'radial-gradient(circle at top, #13213d, #050b16 58%)', color: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <section style={{ ...card, width: 'min(520px, 100%)', textAlign: 'center' }}>
          <div style={{ fontSize: 38 }}>⚖️</div>
          <h1 style={{ margin: '10px 0 8px' }}>Goliath Appeals</h1>
          <p style={{ margin: '0 0 20px', color: '#94a3b8', lineHeight: 1.6 }}>Sign in with Discord to securely view your eligible moderation records, submit an appeal, or check an existing appeal outcome.</p>
          <button style={button} onClick={() => { window.location.href = '/api/auth/login?next=/appeals'; }}>Sign in with Discord</button>
        </section>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: 'radial-gradient(circle at top, #13213d, #050b16 55%)', color: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif', padding: '28px 16px 48px' }}>
      <div style={{ width: 'min(980px, 100%)', margin: '0 auto', display: 'grid', gap: 18 }}>
        <header style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#60a5fa', fontWeight: 900, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase' }}>Member Portal</div>
            <h1 style={{ margin: '5px 0 4px' }}>⚖️ Goliath Appeals</h1>
            <p style={{ margin: 0, color: '#94a3b8' }}>Signed in as {user?.global_name || user?.globalName || user?.username || 'Discord user'}.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ color: '#94a3b8', fontWeight: 700 }}>{pendingCount} pending</span>
            <button style={{ ...button, background: '#334155' }} onClick={async () => { await api.logout().catch(() => null); window.location.reload(); }}>Sign out</button>
          </div>
        </header>

        {error ? <div style={{ ...card, borderColor: 'rgba(239,68,68,.45)', color: '#fecaca' }}>{error}</div> : null}
        {success ? <div style={{ ...card, borderColor: 'rgba(34,197,94,.45)', color: '#bbf7d0' }}>{success}</div> : null}

        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Your appeal records</h2>
          <p style={{ color: '#94a3b8', marginTop: -6 }}>Only records belonging to your Discord account are shown here. Internal staff notes and unpublished evidence are never exposed.</p>
          {!cases.length ? (
            <div style={{ padding: '22px 0 6px', color: '#94a3b8' }}>You do not currently have any appealable or previously appealed cases.</div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {cases.map((item) => (
                <article key={`${item.guildId}:${item.caseId}`} style={{ border: '1px solid rgba(148,163,184,.18)', borderRadius: 14, padding: 16, background: 'rgba(2,6,23,.48)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <strong>{item.guildName || 'Discord Server'} · Case #{item.caseId}</strong>
                      <div style={{ marginTop: 5, color: '#94a3b8', fontSize: 14 }}>{item.actionLabel} · {formatDate(item.createdAt)}</div>
                    </div>
                    <span style={{ color: item.eligible ? '#86efac' : '#cbd5e1', fontWeight: 800 }}>{item.eligible ? 'Appealable' : 'Not currently appealable'}</span>
                  </div>
                  <p style={{ lineHeight: 1.55, marginBottom: 12 }}>{item.publicSummary || 'No additional public summary is available.'}</p>
                  {!item.eligible && item.eligibilityMessage ? <p style={{ color: '#94a3b8', fontSize: 13 }}>{cleanEligibilityMessage(item.eligibilityMessage)}</p> : null}
                  {item.appeals.length ? (
                    <div style={{ display: 'grid', gap: 8, margin: '12px 0' }}>
                      {item.appeals.map((appeal) => (
                        <div key={appeal.id} style={{ borderLeft: `3px solid ${statusTone(appeal.status)}`, paddingLeft: 10 }}>
                          <strong style={{ color: statusTone(appeal.status), textTransform: 'capitalize' }}>{appeal.status}</strong> · {formatDate(appeal.submittedAt)}
                          {appeal.reviewNote ? <div style={{ color: '#cbd5e1', marginTop: 3 }}>Review: {appeal.reviewNote}</div> : null}
                          {appeal.remedyDetail ? <div style={{ color: '#cbd5e1', marginTop: 3 }}>Outcome: {appeal.remedyDetail}</div> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {item.eligible ? <button style={button} onClick={() => { setSelected(item); setError(''); setSuccess(''); }}>Appeal this case</button> : null}
                </article>
              ))}
            </div>
          )}
        </section>

        {selected ? (
          <section style={card}>
            <h2 style={{ marginTop: 0 }}>Appeal Case #{selected.caseId}</h2>
            <p style={{ color: '#94a3b8' }}>{selected.guildName} · {selected.actionLabel}</p>
            <form onSubmit={submitAppeal} style={{ display: 'grid', gap: 14 }}>
              <label style={{ display: 'grid', gap: 7, fontWeight: 800 }}>
                Why should this decision be reconsidered?
                <textarea style={input} rows={7} maxLength={1500} required value={grounds} onChange={(event) => setGrounds(event.target.value)} placeholder="Explain the grounds for your appeal clearly and factually." />
              </label>
              <label style={{ display: 'grid', gap: 7, fontWeight: 800 }}>
                Requested resolution <span style={{ color: '#94a3b8', fontWeight: 500 }}>(optional)</span>
                <textarea style={input} rows={3} maxLength={500} value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="For example: remove the warning, lift the ban, or reconsider the finding." />
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button style={{ ...button, opacity: submitting ? .65 : 1 }} type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit appeal'}</button>
                <button style={{ ...button, background: '#334155' }} type="button" onClick={() => setSelected(null)}>Cancel</button>
              </div>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}
