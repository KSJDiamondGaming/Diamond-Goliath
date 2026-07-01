import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient.js';

const fallback = { cardBorder: 'rgba(148,163,184,0.22)', cardBg: 'rgba(15,23,42,0.42)', cardText: '#e5e7eb', mutedText: '#94a3b8', shadow: '0 18px 50px rgba(0,0,0,0.25)' };
function t(theme) { return { ...fallback, ...(theme || {}) }; }
function gid(selectedGuild, selectedGuildData) { return String(selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '').split(':').pop().trim(); }
function card(theme, extra = {}) { const x = t(theme); return { border: `1px solid ${x.cardBorder}`, background: x.cardBg, color: x.cardText, borderRadius: 20, padding: 18, boxShadow: x.shadow, ...extra }; }
function button(theme, disabled = false) { const x = t(theme); return { border: `1px solid ${x.cardBorder}`, background: 'rgba(15,23,42,0.35)', color: x.cardText, borderRadius: 12, padding: '9px 11px', fontWeight: 950, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1 }; }
function field(theme) { const x = t(theme); return { border: `1px solid ${x.cardBorder}`, background: 'rgba(15,23,42,0.42)', color: x.cardText, borderRadius: 12, padding: '9px 11px', fontWeight: 850, outline: 'none' }; }
function tone(severity) { return severity === 'danger' ? '#fca5a5' : severity === 'warning' ? '#fcd34d' : severity === 'success' ? '#86efac' : '#93c5fd'; }

export default function Timeline({ theme, selectedGuild, selectedGuildData }) {
  const x = t(theme);
  const guildId = gid(selectedGuild, selectedGuildData);
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({ total: 0, warning: 0, danger: 0, modules: [] });
  const [moduleFilter, setModuleFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const modules = useMemo(() => summary.modules || [...new Set(entries.map((entry) => entry.module))], [summary.modules, entries]);

  const load = useCallback(async () => {
    if (!guildId) return;
    setBusy(true); setError('');
    try {
      const query = api.buildQuery({ module: moduleFilter, severity: severityFilter, search, limit: 150 });
      const payload = await api.request(`/api/activity/${guildId}${query ? `?${query}` : ''}`);
      setEntries(payload.entries || []); setSummary(payload.summary || {});
    } catch (err) { setError(err.message || 'Failed to load timeline.'); }
    finally { setBusy(false); }
  }, [guildId, moduleFilter, severityFilter, search]);

  useEffect(() => { load(); }, [load]);

  async function createTest() {
    if (!guildId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = await api.request(`/api/activity/${guildId}/test`, { method: 'POST' });
      setEntries(payload.entries || []); setSummary(payload.summary || {}); setNotice('Test activity entry created.');
    } catch (err) { setError(err.message || 'Failed to create test activity.'); }
    finally { setBusy(false); }
  }

  async function clearTimeline() {
    if (!guildId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = await api.request(`/api/activity/${guildId}`, { method: 'DELETE' });
      setEntries(payload.entries || []); setSummary(payload.summary || {}); setNotice('Timeline cleared.');
    } catch (err) { setError(err.message || 'Failed to clear timeline.'); }
    finally { setBusy(false); }
  }

  if (!guildId) return <section style={card(x)}><h2>Select a server</h2><p style={{ color: x.mutedText }}>Select a server to view the activity timeline.</p></section>;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{ ...card(x), background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.08), rgba(168,85,247,0.12))' }}>
        <p style={{ margin: 0, color: '#93c5fd', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Global Activity Timeline</p>
        <h1 style={{ margin: '8px 0 0', fontSize: 'clamp(28px, 4vw, 42px)' }}>Platform History</h1>
        <p style={{ margin: '8px 0 0', color: x.mutedText }}>A central record of what happened across tickets, forms, automation, security, deployments and backups.</p>
      </section>

      {(error || notice || busy) ? <section style={{ ...card(x), color: error ? '#fca5a5' : notice ? '#86efac' : x.mutedText, fontWeight: 850 }}>{error || notice || 'Loading timeline...'}</section> : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: 12 }}>
        <Stat theme={x} label="Events" value={summary.total || 0} />
        <Stat theme={x} label="Modules" value={modules.length || 0} />
        <Stat theme={x} label="Warnings" value={summary.warning || 0} />
        <Stat theme={x} label="Critical" value={summary.danger || 0} />
      </section>

      <section style={{ ...card(x), display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} style={field(x)}><option value="">All modules</option>{modules.map((module) => <option key={module} value={module}>{module}</option>)}</select>
        <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)} style={field(x)}><option value="">All severities</option>{['info', 'success', 'warning', 'danger'].map((severity) => <option key={severity} value={severity}>{severity}</option>)}</select>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search timeline" style={{ ...field(x), minWidth: 220 }} />
        <button type="button" onClick={load} disabled={busy} style={button(x, busy)}>Refresh</button>
        <button type="button" onClick={createTest} disabled={busy} style={button(x, busy)}>Create test</button>
        <button type="button" onClick={clearTimeline} disabled={busy} style={button(x, busy)}>Clear</button>
      </section>

      <section style={{ ...card(x), display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0 }}>Activity</h3>
        {entries.length ? entries.map((entry) => (
          <article key={entry.id} style={{ border: `1px solid ${tone(entry.severity)}66`, borderRadius: 14, padding: 12, display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ color: tone(entry.severity) }}>{entry.title}</strong>
              <span style={{ color: x.mutedText, fontSize: 12 }}>{entry.module} · {entry.event} · {entry.createdAt}</span>
            </div>
            <p style={{ margin: 0, color: x.mutedText }}>{entry.message || 'No details.'}</p>
            {entry.route ? <button type="button" onClick={() => window.location.assign(entry.route)} style={{ ...button(x), justifySelf: 'start' }}>Open</button> : null}
          </article>
        )) : <span style={{ color: x.mutedText }}>No activity entries yet.</span>}
      </section>
    </div>
  );
}

function Stat({ theme, label, value }) {
  return <div style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, borderRadius: 18, padding: 16 }}><div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{label}</div><div style={{ marginTop: 8, fontSize: 28, fontWeight: 950 }}>{value}</div></div>;
}
