import React, { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../../services/apiClient';

const MAX_GROUNDS = 1500;
const MAX_RESOLUTION = 500;

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

function getDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const guildId = String(params.get('guild') || '').trim();
  const caseId = Number(params.get('case'));
  return {
    guildId: /^\d{16,20}$/.test(guildId) ? guildId : '',
    caseId: Number.isInteger(caseId) && caseId > 0 ? caseId : null,
  };
}

function currentReturnPath() {
  const deepLink = getDeepLink();
  const params = new URLSearchParams();
  if (deepLink.guildId) params.set('guild', deepLink.guildId);
  if (deepLink.caseId) params.set('case', String(deepLink.caseId));
  const query = params.toString();
  return query ? `/appeals?${query}` : '/appeals';
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
  const [deepLinkNotice, setDeepLinkNotice] = useState('');
  const appealFormRef = useRef(null);

  async function load({ preserveSuccess = true } = {}) {
    setLoading(true);
    setError('');
    if (!preserveSuccess) setSuccess('');
    try {
      const auth = await api.getAuthMe();
      if (!auth?.authenticated || !auth?.user) throw Object.assign(new Error('Authentication required.'), { status: 401 });
      setAuthenticated(true);
      setUser(auth.user);
      const payload = await api.request('/api/cases/appeals/me');
      const nextCases = Array.isArray(payload?.cases) ? payload.cases : [];
      setCases(nextCases);

      const deepLink = getDeepLink();
      setSelected((current) => {
        if (deepLink.guildId && deepLink.caseId) {
          const linked = nextCases.find((item) => item.guildId === deepLink.guildId && item.caseId === deepLink.caseId) || null;
          if (linked) {
            setDeepLinkNotice(linked.eligible ? '' : cleanEligibilityMessage(linked.eligibilityMessage || 'This case is not currently appealable.'));
            return linked.eligible ? linked : null;
          }
          setDeepLinkNotice('That appeal reference is not available for this Discord account.');
          return null;
        }
        if (current) return nextCases.find((item) => item.guildId === current.guildId && item.caseId === current.caseId) || null;
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

  useEffect(() => {
    if (selected && appealFormRef.current) {
      appealFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const textarea = appealFormRef.current.querySelector('textarea');
      if (textarea) window.setTimeout(() => textarea.focus(), 250);
    }
  }, [selected?.guildId, selected?.caseId]);

  const pendingCount = useMemo(() => cases.reduce((total, item) => total + item.appeals.filter((appeal) => appeal.status === 'pending').length, 0), [cases]);

  async function submitAppeal(event) {
    event.preventDefault();
    if (!selected || submitting) return;
    const trimmedGrounds = grounds.trim();
    if (!trimmedGrounds) {
      setError('Appeal grounds are required.');
      return;
    }
    if (grounds.length > MAX_GROUNDS || resolution.length > MAX_RESOLUTION) {
      setError('Your appeal text is over the allowed character limit.');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const result = await api.request(`/api/cases/appeals/${encodeURIComponent(selected.guildId)}/${encodeURIComponent(selected.caseId)}`, {
        method: 'POST',
        body: JSON.stringify({ grounds: trimmedGrounds, requestedResolution: resolution.trim() }),
      });
      setSuccess(`Appeal ${result?.appeal?.id || ''} submitted successfully. You can return here at any time to track its outcome.`.trim());
      setGrounds('');
      setResolution('');
      setSelected(null);
      await load({ preserveSuccess: true });
    } catch (submitError) {
      setError(cleanEligibilityMessage(submitError?.message || 'Could not submit your appeal.'));
    } finally {
      setSubmitting(false);
    }
  }

  function chooseCase(item) {
    if (!item?.eligible || submitting) return;
    setSelected(item);
    setGrounds('');
    setResolution('');
    setError('');
    setSuccess('');
    setDeepLinkNotice('');
    const params = new URLSearchParams();
    params.set('guild', item.guildId);
    params.set('case', String(item.caseId));
    window.history.replaceState({}, '', `/appeals?${params.toString()}`);
  }

  function cancelSelection() {
    setSelected(null);
    setGrounds('');
    setResolution('');
    window.history.replaceState({}, '', '/appeals');
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
    return <main aria-busy="true" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#050b16', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>Loading appeals…</main>;
  }

  if (!authenticated) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: 'radial-gradient(circle at top, #13213d, #050b16 58%)', color: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <section style={{ ...card, width: 'min(520px, 100%)', textAlign: 'center' }}>
          <div style={{ fontSize: 38 }}>⚖️</div>
          <h1 style={{ margin: '10px 0 8px' }}>Goliath Appeals</h1>
          <p style={{ margin: '0 0 20px', color: '#94a3b8', lineHeight: 1.6 }}>Sign in with Discord to securely view your eligible moderation records, submit an appeal, or check an existing appeal outcome. You can still use this portal if you are no longer in the server.</p>
          <button style={button} onClick={() => { window.location.href = `/api/auth/login?next=${encodeURIComponent(currentReturnPath())}`; }}>Sign in with Discord</button>
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
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: '#94a3b8', fontWeight: 700 }}>{pendingCount} pending</span>
            <button style={{ ...button, background: '#334155' }} onClick={async () => { await api.logout().catch(() => null); window.location.reload(); }}>Sign out</button>
          </div>
        </header>

        {error ? <div role="alert" style={{ ...card, borderColor: 'rgba(239,68,68,.45)', color: '#fecaca' }}>{error}</div> : null}
        {success ? <div role="status" style={{ ...card, borderColor: 'rgba(34,197,94,.45)', color: '#bbf7d0' }}>{success}</div> : null}
        {deepLinkNotice ? <div role="status" style={{ ...card, borderColor: 'rgba(245,158,11,.4)', color: '#fde68a' }}>{deepLinkNotice}</div> : null}

        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Your appeal records</h2>
          <p style={{ color: '#94a3b8', marginTop: -6, lineHeight: 1.55 }}>Only records belonging to your Discord account are shown here. Internal staff notes, draft or rejected evidence, raw scans, unpublished information, and internal discussion are never exposed.</p>
          {!cases.length ? (
            <div style={{ padding: '22px 0 6px', color: '#94a3b8' }}>You do not currently have any appealable or previously appealed cases.</div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {cases.map((item) => (
                <article key={`${item.guildId}:${item.caseId}`} style={{ border: selected?.guildId === item.guildId && selected?.caseId === item.caseId ? '1px solid rgba(96,165,250,.75)' : '1px solid rgba(148,163,184,.18)', borderRadius: 14, padding: 16, background: 'rgba(2,6,23,.48)', overflowWrap: 'anywhere' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <strong>{item.guildName || 'Discord Server'} · Case #{item.caseId}</strong>
                      <div style={{ marginTop: 5, color: '#94a3b8', fontSize: 14 }}>{item.actionLabel} · Decision {formatDate(item.decisionAt || item.createdAt)}</div>
                    </div>
                    <span style={{ color: item.eligible ? '#86efac' : '#cbd5e1', fontWeight: 800 }}>{item.eligible ? 'Appealable' : 'Not currently appealable'}</span>
                  </div>
                  <p style={{ lineHeight: 1.55, marginBottom: 12 }}>{item.publicSummary || 'No additional public summary is available.'}</p>
                  {!item.eligible && item.eligibilityMessage ? <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>{cleanEligibilityMessage(item.eligibilityMessage)}</p> : null}
                  {item.appeals.length ? (
                    <div style={{ display: 'grid', gap: 10, margin: '12px 0' }}>
                      {item.appeals.map((appeal) => (
                        <div key={appeal.id} style={{ borderLeft: `3px solid ${statusTone(appeal.status)}`, paddingLeft: 10, lineHeight: 1.45 }}>
                          <strong style={{ color: statusTone(appeal.status), textTransform: 'capitalize' }}>{appeal.status}</strong> · Submitted {formatDate(appeal.submittedAt)}
                          {appeal.reviewedAt ? <div style={{ color: '#94a3b8', marginTop: 3 }}>Reviewed {formatDate(appeal.reviewedAt)}</div> : null}
                          {appeal.reviewNote ? <div style={{ color: '#cbd5e1', marginTop: 3 }}>Review: {appeal.reviewNote}</div> : null}
                          {appeal.remedyDetail ? <div style={{ color: '#cbd5e1', marginTop: 3 }}>Outcome: {appeal.remedyDetail}</div> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {item.eligible ? <button style={button} onClick={() => chooseCase(item)} disabled={submitting}>Appeal this case</button> : null}
                </article>
              ))}
            </div>
          )}
        </section>

        {selected ? (
          <section ref={appealFormRef} style={card}>
            <h2 style={{ marginTop: 0 }}>Appeal Case #{selected.caseId}</h2>
            <p style={{ color: '#94a3b8' }}>{selected.guildName} · {selected.actionLabel} · Decision {formatDate(selected.decisionAt || selected.createdAt)}</p>
            <form onSubmit={submitAppeal} style={{ display: 'grid', gap: 14 }}>
              <label htmlFor="appeal-grounds" style={{ display: 'grid', gap: 7, fontWeight: 800 }}>
                Why should this decision be reconsidered?
                <textarea id="appeal-grounds" style={input} rows={7} maxLength={MAX_GROUNDS} required value={grounds} onChange={(event) => setGrounds(event.target.value)} placeholder="Explain the grounds for your appeal clearly and factually." disabled={submitting} />
                <span style={{ color: grounds.length >= MAX_GROUNDS ? '#fca5a5' : '#94a3b8', fontWeight: 500, fontSize: 12 }}>{grounds.length}/{MAX_GROUNDS}</span>
              </label>
              <label htmlFor="appeal-resolution" style={{ display: 'grid', gap: 7, fontWeight: 800 }}>
                Requested resolution <span style={{ color: '#94a3b8', fontWeight: 500 }}>(optional)</span>
                <textarea id="appeal-resolution" style={input} rows={3} maxLength={MAX_RESOLUTION} value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="For example: remove the warning, lift the ban, or reconsider the finding." disabled={submitting} />
                <span style={{ color: resolution.length >= MAX_RESOLUTION ? '#fca5a5' : '#94a3b8', fontWeight: 500, fontSize: 12 }}>{resolution.length}/{MAX_RESOLUTION}</span>
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button style={{ ...button, opacity: submitting || !grounds.trim() ? .65 : 1, cursor: submitting || !grounds.trim() ? 'not-allowed' : 'pointer' }} type="submit" disabled={submitting || !grounds.trim()}>{submitting ? 'Submitting…' : 'Submit appeal'}</button>
                <button style={{ ...button, background: '#334155' }} type="button" onClick={cancelSelection} disabled={submitting}>Cancel</button>
              </div>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}
