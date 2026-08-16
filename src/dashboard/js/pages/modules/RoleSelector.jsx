import React, { useEffect, useMemo, useState } from 'react';

import EmptyState from '../../shared/EmptyState.jsx';
import { api } from '../../services/apiClient.js';
import { ChannelSelect, RoleSelect } from '../../ui/DiscordResourceSelects.jsx';

const baseApi = (guildId) => `/api/colour-roles/${guildId}`; // compatibility mount; canonical server router is Role Selector.
function guildIdFrom(selectedGuild, selectedGuildData) { return String(selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '').split(':').pop().trim(); }
function normalizeList(payload, key) { if (Array.isArray(payload)) return payload; if (Array.isArray(payload?.[key])) return payload[key]; if (Array.isArray(payload?.data)) return payload.data; return []; }
function cardStyle(theme) { return { border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 22, boxShadow: theme.shadow, padding: 22 }; }
function buttonStyle(theme, tone = 'default') { const background = tone === 'primary' ? 'rgba(37,99,235,.22)' : tone === 'danger' ? 'rgba(220,38,38,.22)' : 'rgba(15,23,42,.45)'; return { border: `1px solid ${theme.cardBorder}`, background, color: theme.cardText, borderRadius: 14, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' }; }
const Input = ({ theme, ...props }) => <input {...props} style={{ width: '100%', padding: 11, borderRadius: 12, border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,.45)', color: theme.cardText, ...(props.style || {}) }} />;

export default function RoleSelector({ theme, selectedGuild, selectedGuildData }) {
  const guildId = guildIdFrom(selectedGuild, selectedGuildData);
  const [data, setData] = useState(null);
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('colours');
  const [draftGroup, setDraftGroup] = useState({ name: '', emoji: '🏷️', description: '', selectionMode: 'single', allowRemove: true, optionsText: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const card = useMemo(() => cardStyle(theme), [theme]);

  async function load() {
    if (!guildId) return;
    setBusy('load'); setError('');
    try {
      const [overview, channelPayload, rolePayload] = await Promise.all([
        api.request(`${baseApi(guildId)}/overview`), api.getGuildChannels(guildId), api.getGuildRoles(guildId),
      ]);
      setData(overview); setChannels(normalizeList(channelPayload, 'channels')); setRoles(normalizeList(rolePayload, 'roles'));
      const first = overview.groups?.find((g) => g.id === selectedGroupId) || overview.groups?.[0]; if (first) setSelectedGroupId(first.id);
    } catch (err) { setError(err.message || 'Failed to load Role Selector.'); } finally { setBusy(''); }
  }
  useEffect(() => { load(); }, [guildId]);

  async function run(action, message) {
    setBusy('save'); setError(''); setNotice('');
    try { const result = await action(); setData(result); setNotice(message); return result; }
    catch (err) { setError(err.message || 'Role Selector action failed.'); return null; }
    finally { setBusy(''); }
  }
  const saveConfig = (patch, message = 'Role Selector saved.') => run(() => api.request(`${baseApi(guildId)}/config`, { method: 'PUT', body: JSON.stringify(patch) }), message);

  if (!guildId) return <EmptyState theme={theme} icon="🎭" title="Select a server" description="Select a server to manage Role Selector." />;
  if (!data) return <div style={card}>{error || 'Loading Role Selector...'}</div>;

  const config = data.config || {}; const groups = data.groups || []; const selectedGroup = groups.find((g) => g.id === selectedGroupId) || groups[0]; const colours = groups.find((g) => g.id === 'colours'); const usage = data.usage || { groups: [], totalUsing: 0, totalMembers: 0 }; const health = data.health || {};
  const selectedUsage = usage.groups?.find((g) => g.groupId === selectedGroupId);

  function loadGroupDraft(group) {
    setSelectedGroupId(group.id);
    setDraftGroup({ name: group.name || '', emoji: group.emoji || '🏷️', description: group.description || '', selectionMode: group.selectionMode || 'single', allowRemove: group.allowRemove !== false, optionsText: (group.options || []).map((o) => `${o.emoji || ''} | ${o.label} | ${o.description || ''}`).join('\n') });
  }
  function parsedOptions() {
    return draftGroup.optionsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 25).map((line, index) => { const [emoji, label, ...description] = line.split('|').map((x) => x.trim()); return { id: selectedGroup?.options?.[index]?.id, roleId: selectedGroup?.options?.[index]?.roleId, managed: selectedGroup?.options?.[index]?.managed, emoji, label: label || emoji, description: description.join(' | '), enabled: true, order: (index + 1) * 10 }; });
  }

  return <div style={{ display: 'grid', gap: 18 }}>
    <section style={{ ...card, background: 'linear-gradient(135deg, rgba(139,92,246,.17), rgba(59,130,246,.12), rgba(34,197,94,.10))' }}>
      <div style={{ color: '#c4b5fd', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '.08em' }}>Role Studio</div>
      <h1 style={{ margin: '8px 0 0', fontSize: 'clamp(28px,4vw,42px)' }}>🎭 Role Selector</h1>
      <p style={{ color: theme.mutedText, lineHeight: 1.6 }}>Universal self-role categories with Colours built in. Add platforms, regions, interests, games, notification roles or any choices your community needs.</p>
    </section>

    {(error || notice) ? <section style={{ ...card, color: error ? '#fca5a5' : '#86efac', fontWeight: 850 }}>{error || notice}</section> : null}

    <section style={{ ...card, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><h2 style={{ margin: 0 }}>Module Settings</h2><div style={{ color: theme.mutedText }}>Using selectors: {usage.totalUsing}/{usage.totalMembers} · Groups: {groups.length}</div></div><button disabled={busy} onClick={() => saveConfig({ enabled: !data.enabled }, data.enabled ? 'Role Selector disabled.' : 'Role Selector enabled.')} style={buttonStyle(theme, 'primary')}>{data.enabled ? 'Disable' : 'Enable'}</button></div>
      <label style={{ display: 'grid', gap: 7 }}><span style={{ color: theme.mutedText, fontWeight: 900 }}>Role name format</span><Input theme={theme} value={config.style?.format || ''} onChange={(e) => setData({ ...data, config: { ...config, style: { ...config.style, format: e.target.value } } })} onBlur={() => saveConfig({ style: config.style })} placeholder="🎭 | {role}" /></label>
      <RoleSelect theme={theme} resources={roles} value={config.style?.anchorRoleId || ''} onChange={(value) => saveConfig({ style: { ...config.style, anchorRoleId: value || null } }, 'Role Selector anchor saved.')} label="Divider / Anchor Role" />
      <select value={config.style?.placement || 'below'} onChange={(e) => saveConfig({ style: { ...config.style, placement: e.target.value } })} style={{ padding: 11, borderRadius: 12, border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,.45)', color: theme.cardText }}><option value="below">Place below anchor</option><option value="above">Place above anchor</option></select>
      <ChannelSelect theme={theme} resources={channels} value={config.deployment?.channelId || ''} onChange={(value) => saveConfig({ deployment: { ...config.deployment, channelId: value || null } }, 'Selector channel saved.')} label="Member Selector Channel" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button disabled={busy || !config.deployment?.channelId} onClick={() => run(() => api.request(`${baseApi(guildId)}/deploy`, { method: 'POST', body: JSON.stringify({ channelId: config.deployment.channelId }) }), 'Role Selector deployed.')} style={buttonStyle(theme, 'primary')}>Deploy / Update Selector</button><button disabled={busy} onClick={() => run(() => api.request(`${baseApi(guildId)}/scan-style`, { method: 'POST' }), 'Guild role style scanned.')} style={buttonStyle(theme)}>Scan Guild Style</button>{config.style?.detectedFormat ? <button disabled={busy} onClick={() => run(() => api.request(`${baseApi(guildId)}/apply-style`, { method: 'POST' }), 'Suggested role style applied.')} style={buttonStyle(theme)}>Apply Suggestion</button> : null}<button disabled={busy} onClick={() => run(() => api.request(`${baseApi(guildId)}/repair`, { method: 'POST' }), 'Role Selector repaired.')} style={buttonStyle(theme)}>Health / Repair</button></div>
    </section>

    <section style={{ ...card, display: 'grid', gap: 14 }}>
      <div><h2 style={{ margin: 0 }}>🏷️ Selector Groups</h2><div style={{ color: theme.mutedText, marginTop: 5 }}>Colours is protected. Custom groups can be single-choice or multi-choice.</div></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{groups.map((group) => <button key={group.id} onClick={() => loadGroupDraft(group)} style={buttonStyle(theme, group.id === selectedGroupId ? 'primary' : 'default')}>{group.emoji || '🏷️'} {group.name}</button>)}</div>
      {selectedGroup?.id === 'colours' ? <div style={{ display: 'grid', gap: 10 }}>
        <strong>🌈 Built-in Colours</strong><label style={{ color: theme.mutedText, fontWeight: 850 }}><input type="checkbox" checked={colours?.customHexEnabled !== false} onChange={(e) => run(() => api.request(`${baseApi(guildId)}/colours`, { method: 'PUT', body: JSON.stringify({ customHexEnabled: e.target.checked }) }), 'Colour settings saved.')} /> Allow custom HEX colours</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>{(colours?.palette || []).map((item) => <label key={item.id} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 10 }}><input type="checkbox" checked={item.enabled !== false} onChange={(e) => run(() => api.request(`${baseApi(guildId)}/colours`, { method: 'PUT', body: JSON.stringify({ palette: colours.palette.map((c) => c.id === item.id ? { ...c, enabled: e.target.checked } : c) }) }), 'Colour palette saved.')} /> {item.emoji} <strong>{item.label}</strong><div style={{ color: theme.mutedText, fontSize: 12 }}>{item.hex}</div></label>)}</div>
      </div> : selectedGroup ? <div style={{ display: 'grid', gap: 10 }}>
        <Input theme={theme} value={draftGroup.name} onChange={(e) => setDraftGroup({ ...draftGroup, name: e.target.value })} placeholder="Group name" /><Input theme={theme} value={draftGroup.emoji} onChange={(e) => setDraftGroup({ ...draftGroup, emoji: e.target.value })} placeholder="Emoji" /><Input theme={theme} value={draftGroup.description} onChange={(e) => setDraftGroup({ ...draftGroup, description: e.target.value })} placeholder="Description" />
        <select value={draftGroup.selectionMode} onChange={(e) => setDraftGroup({ ...draftGroup, selectionMode: e.target.value })} style={{ padding: 11, borderRadius: 12, border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,.45)', color: theme.cardText }}><option value="single">Single choice</option><option value="multiple">Multiple choices</option></select>
        <label style={{ color: theme.mutedText, fontWeight: 850 }}><input type="checkbox" checked={draftGroup.allowRemove} onChange={(e) => setDraftGroup({ ...draftGroup, allowRemove: e.target.checked })} /> Allow members to clear this category</label>
        <textarea value={draftGroup.optionsText} onChange={(e) => setDraftGroup({ ...draftGroup, optionsText: e.target.value })} rows={8} placeholder={'🎮 | Xbox | Xbox players\n🕹️ | PlayStation | PlayStation players\n💻 | PC | PC players'} style={{ padding: 11, borderRadius: 12, border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,.45)', color: theme.cardText }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button disabled={busy || !draftGroup.name.trim()} onClick={() => run(() => api.request(`${baseApi(guildId)}/groups`, { method: 'POST', body: JSON.stringify({ ...selectedGroup, ...draftGroup, options: parsedOptions() }) }), 'Selector group saved.')} style={buttonStyle(theme, 'primary')}>Save Group</button><button disabled={busy} onClick={() => { if (window.confirm(`Delete ${selectedGroup.name}?`)) run(() => api.request(`${baseApi(guildId)}/groups/${encodeURIComponent(selectedGroup.id)}`, { method: 'DELETE' }), 'Selector group deleted.'); }} style={buttonStyle(theme, 'danger')}>Delete Group</button></div>
      </div> : null}
      <div style={{ borderTop: `1px solid ${theme.cardBorder}`, paddingTop: 14, display: 'grid', gap: 8 }}><strong>➕ New Custom Group</strong><Input theme={theme} value={draftGroup.name} onChange={(e) => setDraftGroup({ ...draftGroup, name: e.target.value })} placeholder="Gaming Platform / Region / Interests" /><button disabled={busy || !draftGroup.name.trim()} onClick={async () => { const result = await run(() => api.request(`${baseApi(guildId)}/groups`, { method: 'POST', body: JSON.stringify({ name: draftGroup.name, emoji: draftGroup.emoji || '🏷️', description: draftGroup.description, selectionMode: draftGroup.selectionMode, allowRemove: true, options: parsedOptions() }) }), 'Custom selector created.'); if (result?.group) setSelectedGroupId(result.group.id); }} style={buttonStyle(theme, 'primary')}>Create Custom Group</button></div>
    </section>

    <section style={{ ...card, display: 'grid', gap: 12 }}><h2 style={{ margin: 0 }}>📊 Selector Stats</h2><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{(usage.groups || []).map((group) => <button key={group.groupId} onClick={() => setSelectedGroupId(group.groupId)} style={buttonStyle(theme, group.groupId === selectedGroupId ? 'primary' : 'default')}>{group.emoji} {group.name}</button>)}</div>{selectedUsage?.rows?.length ? selectedUsage.rows.map((item, index) => <div key={item.id} style={{ borderTop: index ? `1px solid ${theme.cardBorder}` : 'none', paddingTop: index ? 10 : 0 }}><strong>{index + 1}. {item.label} — {item.count}</strong>{item.members?.length ? <div style={{ color: theme.mutedText, fontSize: 12, marginTop: 4 }}>{item.members.slice(0, 30).map((m) => m.name).join(', ')}{item.members.length > 30 ? ` +${item.members.length - 30} more` : ''}</div> : null}</div>) : <div style={{ color: theme.mutedText }}>No selections yet.</div>}</section>

    <section style={{ ...card, display: 'grid', gap: 8 }}><h2 style={{ margin: 0 }}>Health</h2><strong style={{ color: health.healthy ? '#86efac' : '#fbbf24' }}>{health.healthy ? '✅ Healthy' : '⚠️ Needs attention'}</strong>{(health.issues || []).map((item, i) => <div key={`i-${i}`} style={{ color: '#fca5a5' }}>• {item}</div>)}{(health.warnings || []).slice(0, 12).map((item, i) => <div key={`w-${i}`} style={{ color: '#fbbf24' }}>• {item}</div>)}</section>
  </div>;
}
