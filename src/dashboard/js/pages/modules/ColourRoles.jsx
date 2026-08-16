import React, { useEffect, useMemo, useState } from 'react';

import EmptyState from '../../shared/EmptyState.jsx';
import { api } from '../../services/apiClient.js';
import { ChannelSelect, RoleSelect } from '../../ui/DiscordResourceSelects.jsx';

function getGuildId(selectedGuild, selectedGuildData) {
  return String(selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '').split(':').pop().trim();
}

function normalizeList(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function cardStyle(theme) {
  return { border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 22, boxShadow: theme.shadow, padding: 22 };
}

function buttonStyle(theme, tone = 'default') {
  const background = tone === 'primary' ? 'rgba(37,99,235,0.22)' : tone === 'danger' ? 'rgba(220,38,38,0.22)' : 'rgba(15,23,42,0.45)';
  return { border: `1px solid ${theme.cardBorder}`, background, color: theme.cardText, borderRadius: 14, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' };
}

export default function ColourRoles({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [data, setData] = useState(null);
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const card = useMemo(() => cardStyle(theme), [theme]);

  async function load() {
    if (!guildId) return;
    setBusy('load'); setError('');
    try {
      const [overview, channelPayload, rolePayload] = await Promise.all([
        api.request(`/api/colour-roles/${guildId}/overview`),
        api.getGuildChannels(guildId),
        api.getGuildRoles(guildId),
      ]);
      setData(overview);
      setChannels(normalizeList(channelPayload, 'channels'));
      setRoles(normalizeList(rolePayload, 'roles'));
    } catch (err) { setError(err.message || 'Failed to load Colour Roles.'); }
    finally { setBusy(''); }
  }

  useEffect(() => { load(); }, [guildId]);

  async function save(patch, message = 'Colour Roles saved.') {
    setBusy('save'); setError(''); setNotice('');
    try {
      const result = await api.request(`/api/colour-roles/${guildId}/config`, { method: 'PUT', body: JSON.stringify(patch) });
      setData(result); setNotice(message);
    } catch (err) { setError(err.message || 'Failed to save Colour Roles.'); }
    finally { setBusy(''); }
  }

  if (!guildId) return <EmptyState theme={theme} icon="🌈" title="Select a server" description="Select a server to manage Colour Roles." />;
  if (!data) return <div style={card}>{error || 'Loading Colour Roles...'}</div>;

  const config = data.config || {};
  const usage = data.usage || { rows: [], totalUsing: 0, totalMembers: 0 };
  const health = data.health || {};
  const max = Math.max(1, ...usage.rows.map((item) => item.count || 0));

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{ ...card, background: 'linear-gradient(135deg, rgba(239,68,68,0.14), rgba(34,197,94,0.10), rgba(59,130,246,0.14), rgba(168,85,247,0.14))' }}>
        <div style={{ color: '#c4b5fd', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Role Studio</div>
        <h1 style={{ margin: '8px 0 0', fontSize: 'clamp(28px,4vw,42px)' }}>🌈 Colour Roles</h1>
        <p style={{ color: theme.mutedText, lineHeight: 1.6 }}>Goliath stores the palette, creates only colours actually used, keeps managed roles grouped around your chosen divider, and never intentionally reorders unrelated roles.</p>
      </section>

      {(error || notice) ? <section style={{ ...card, color: error ? '#fca5a5' : '#86efac', fontWeight: 850 }}>{error || notice}</section> : null}

      <section style={{ ...card, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div><h2 style={{ margin: 0 }}>Module Settings</h2><div style={{ color: theme.mutedText, marginTop: 6 }}>Current members using colours: {usage.totalUsing}/{usage.totalMembers}</div></div>
          <button disabled={busy} onClick={() => save({ enabled: !data.enabled }, data.enabled ? 'Colour Roles disabled.' : 'Colour Roles enabled.')} style={buttonStyle(theme, 'primary')}>{data.enabled ? 'Disable' : 'Enable'}</button>
        </div>

        <label style={{ color: theme.mutedText, fontWeight: 850 }}><input type="checkbox" checked={config.customHexEnabled !== false} onChange={(e) => save({ customHexEnabled: e.target.checked })} /> Allow custom HEX colours</label>
        <label style={{ color: theme.mutedText, fontWeight: 850 }}><input type="checkbox" checked={config.allowRemoveColour !== false} onChange={(e) => save({ allowRemoveColour: e.target.checked })} /> Allow members to remove their colour</label>

        <label style={{ display: 'grid', gap: 7 }}><span style={{ color: theme.mutedText, fontWeight: 900 }}>Role name format</span><input value={config.style?.format || ''} onChange={(e) => setData({ ...data, config: { ...config, style: { ...config.style, format: e.target.value } } })} onBlur={() => save({ style: config.style })} style={{ padding: 11, borderRadius: 12, border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,.45)', color: theme.cardText }} /></label>

        <RoleSelect theme={theme} resources={roles} value={config.style?.anchorRoleId || ''} onChange={(value) => save({ style: { ...config.style, anchorRoleId: value || null } }, 'Colour-role anchor saved.')} label="Divider / Anchor Role" />
        <select value={config.style?.placement || 'below'} onChange={(e) => save({ style: { ...config.style, placement: e.target.value } })} style={{ padding: 11, borderRadius: 12, border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,.45)', color: theme.cardText }}><option value="below">Place below anchor</option><option value="above">Place above anchor</option></select>

        <ChannelSelect theme={theme} resources={channels} value={config.deployment?.channelId || ''} onChange={(value) => save({ deployment: { ...config.deployment, channelId: value || null } }, 'Colour picker channel saved.')} label="Member Picker Channel" />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button disabled={busy} onClick={async () => { setBusy('scan'); try { const result = await api.request(`/api/colour-roles/${guildId}/scan-style`, { method: 'POST' }); setData(result); setNotice('Guild role style detected and applied.'); } catch (err) { setError(err.message); } finally { setBusy(''); } }} style={buttonStyle(theme)}>Scan Guild Style</button>
          <button disabled={busy} onClick={async () => { setBusy('repair'); try { const result = await api.request(`/api/colour-roles/${guildId}/repair`, { method: 'POST' }); setData(result); setNotice('Colour Roles repaired.'); } catch (err) { setError(err.message); } finally { setBusy(''); } }} style={buttonStyle(theme)}>Health / Repair</button>
          <button disabled={busy} onClick={load} style={buttonStyle(theme)}>Refresh</button>
        </div>
      </section>

      <section style={{ ...card, display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Default Palette</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
          {(config.palette || []).map((item) => <div key={item.key} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12 }}><strong>{item.emoji} {item.label}</strong><div style={{ color: theme.mutedText, marginTop: 4 }}>{item.hex}</div></div>)}
        </div>
      </section>

      <section style={{ ...card, display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0 }}>📊 Colour Leaderboard</h2>
        {usage.rows.length ? usage.rows.map((item, index) => (
          <div key={item.hex} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,180px) 1fr 42px', gap: 10, alignItems: 'center' }}>
            <strong>{index + 1}. {item.label}</strong>
            <div style={{ height: 12, borderRadius: 999, background: 'rgba(148,163,184,.15)', overflow: 'hidden' }}><div style={{ width: `${Math.max(3, (item.count / max) * 100)}%`, height: '100%', background: item.hex }} /></div>
            <strong>{item.count}</strong>
            {item.members?.length ? <div style={{ gridColumn: '1 / -1', color: theme.mutedText, fontSize: 12 }}>{item.members.slice(0, 25).map((member) => member.name).join(', ')}{item.members.length > 25 ? ` +${item.members.length - 25} more` : ''}</div> : null}
          </div>
        )) : <div style={{ color: theme.mutedText }}>No colours are currently in use.</div>}
      </section>

      <section style={{ ...card, display: 'grid', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Health</h2>
        <div style={{ color: health.healthy ? '#86efac' : '#fbbf24', fontWeight: 900 }}>{health.healthy ? '✅ Healthy' : '⚠️ Needs attention'}</div>
        {(health.issues || []).map((item) => <div key={item} style={{ color: '#fca5a5' }}>• {item}</div>)}
        {(health.warnings || []).slice(0, 12).map((item) => <div key={item} style={{ color: '#fbbf24' }}>• {item}</div>)}
      </section>
    </div>
  );
}
