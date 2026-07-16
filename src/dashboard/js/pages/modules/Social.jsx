import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import EmptyState from '../../shared/EmptyState.jsx';
import { api } from '../../services/apiClient.js';

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'kick', label: 'Kick' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'twitch', label: 'Twitch' },
  { value: 'x', label: 'X' },
  { value: 'youtube', label: 'YouTube' },
];
const ALERT_TYPES = ['live', 'upload', 'short', 'post'];
const TEMPLATE_TYPES = ['live', 'upload', 'short', 'post'];
const VARIABLES = ['{creator}', '{platform}', '{title}', '{game}', '{viewers}', '{thumbnail}', '{streamUrl}', '{videoUrl}', '{uploadTime}', '{duration}', '{category}'];

function getGuildId(selectedGuild, selectedGuildData) {
  return String(selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '').split(':').pop().trim();
}

function normalizeAccounts(config) {
  if (Array.isArray(config?.accounts)) return config.accounts;
  return config?.accounts && typeof config.accounts === 'object' ? Object.values(config.accounts) : [];
}

function defaultAlertType(platform) {
  if (platform === 'youtube') return 'upload';
  if (platform === 'twitch' || platform === 'kick') return 'live';
  return 'post';
}

function makeAccount(account = {}) {
  const platform = account.platform || 'twitch';
  return {
    platform,
    displayName: account.displayName || '',
    username: account.username || account.url || '',
    alertChannelId: account.alertChannelId || '',
    mentionRoleId: account.mentionRoleId || '',
    mentionMode: account.mentionMode || 'role',
    alertTypes: Array.isArray(account.alertTypes) && account.alertTypes.length ? account.alertTypes : [defaultAlertType(platform)],
    enabled: account.enabled !== false,
  };
}

function field(theme) {
  return { border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.35)', color: theme.cardText, borderRadius: 14, padding: 12, minHeight: 46, outline: 'none', fontWeight: 800 };
}

function btn(theme, options = {}) {
  return { border: `1px solid ${options.border || theme.cardBorder}`, background: options.background || 'rgba(15,23,42,0.35)', color: options.color || theme.cardText, borderRadius: 999, padding: '9px 13px', fontWeight: 900, cursor: options.disabled ? 'not-allowed' : 'pointer', opacity: options.disabled ? 0.55 : 1 };
}

function Card({ theme, children, style = {} }) {
  return <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 22, boxShadow: theme.shadow, padding: 20, ...style }}>{children}</section>;
}

function Tabs({ theme, active, setActive }) {
  const tabs = [['overview', 'Overview'], ['creators', 'Creators'], ['studio', 'Alert Studio'], ['providers', 'Providers'], ['health', 'Health']];
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{tabs.map(([id, label]) => <button key={id} type="button" onClick={() => setActive(id)} style={btn(theme, active === id ? { background: 'rgba(37,99,235,0.28)', border: '#60a5fa', color: '#dbeafe' } : {})}>{label}</button>)}</div>;
}

function Stat({ theme, label, value, hint }) {
  return <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.3)', borderRadius: 18, padding: 16 }}><div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{label}</div><div style={{ fontSize: 28, fontWeight: 950, marginTop: 7 }}>{value}</div><div style={{ color: theme.mutedText, fontSize: 12, marginTop: 4 }}>{hint}</div></div>;
}

function AccountEditor({ theme, value, channels, roles, onChange, onSave, onCancel, saving }) {
  const toggleType = (type) => {
    const current = value.alertTypes || [];
    const next = current.includes(type) ? current.filter((item) => item !== type) : [...current, type];
    onChange({ ...value, alertTypes: next.length ? next : [defaultAlertType(value.platform)] });
  };
  return <form onSubmit={onSave} style={{ display: 'grid', gap: 12 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12 }}>
      <label style={{ display: 'grid', gap: 6 }}><span>Platform</span><select value={value.platform} onChange={(e) => onChange({ ...value, platform: e.target.value, alertTypes: [defaultAlertType(e.target.value)] })} style={field(theme)}>{PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
      <label style={{ display: 'grid', gap: 6 }}><span>Creator / Channel Name</span><input value={value.displayName} onChange={(e) => onChange({ ...value, displayName: e.target.value })} placeholder="KSJ Diamond Gaming" style={field(theme)} /></label>
      <label style={{ display: 'grid', gap: 6 }}><span>Username, Handle, Channel ID or Public URL</span><input required value={value.username} onChange={(e) => onChange({ ...value, username: e.target.value })} placeholder="@creator or https://..." style={field(theme)} /></label>
      <label style={{ display: 'grid', gap: 6 }}><span>Alert Channel</span><select value={value.alertChannelId} onChange={(e) => onChange({ ...value, alertChannelId: e.target.value })} style={field(theme)}><option value="">Select channel</option>{channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}</select></label>
      <label style={{ display: 'grid', gap: 6 }}><span>Mention Role</span><select value={value.mentionRoleId} onChange={(e) => onChange({ ...value, mentionRoleId: e.target.value, mentionMode: e.target.value ? 'role' : 'none' })} style={field(theme)}><option value="">No role mention</option>{roles.map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}</select></label>
    </div>
    <div><div style={{ marginBottom: 7, fontWeight: 900 }}>Alert Types</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{ALERT_TYPES.map((type) => <button type="button" key={type} onClick={() => toggleType(type)} style={btn(theme, value.alertTypes?.includes(type) ? { background: 'rgba(37,99,235,0.25)', border: '#60a5fa' } : {})}>{type}</button>)}</div></div>
    <div style={{ display: 'flex', gap: 8 }}><button disabled={saving} style={btn(theme, { background: 'rgba(22,163,74,0.24)', disabled: saving })}>{saving ? 'Saving...' : 'Save Creator'}</button>{onCancel ? <button type="button" onClick={onCancel} style={btn(theme)}>Cancel</button> : null}</div>
  </form>;
}

export default function Social({ theme, selectedGuild, selectedGuildData }) {
  const navigate = useNavigate();
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [active, setActive] = useState('overview');
  const [config, setConfig] = useState({});
  const [overview, setOverview] = useState({});
  const [providers, setProviders] = useState([]);
  const [health, setHealth] = useState(null);
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [editing, setEditing] = useState('');
  const [form, setForm] = useState(makeAccount());
  const [editForm, setEditForm] = useState(null);
  const [templateType, setTemplateType] = useState('live');
  const [template, setTemplate] = useState({ title: '{creator} is now live', description: '{title}', buttonLabel: 'Watch now' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const card = useMemo(() => ({ display: 'grid', gap: 14 }), []);

  async function load() {
    if (!guildId) return;
    setBusy(true); setError('');
    try {
      const [configPayload, overviewPayload, providerPayload, channelPayload, rolePayload] = await Promise.all([
        api.request(`/api/social/${guildId}`), api.request(`/api/social/${guildId}/overview`), api.request(`/api/social/${guildId}/providers`), api.request(`/api/discord/${guildId}/channels`), api.request(`/api/discord/${guildId}/roles`),
      ]);
      const nextConfig = configPayload.config || {};
      setConfig(nextConfig);
      setOverview(overviewPayload.overview || {});
      setProviders(providerPayload.providers || []);
      setAccounts(normalizeAccounts(nextConfig));
      setChannels(Array.isArray(channelPayload) ? channelPayload : channelPayload.channels || []);
      setRoles(Array.isArray(rolePayload) ? rolePayload : rolePayload.roles || []);
      const templates = nextConfig.templates || {};
      setTemplate(templates[templateType] || template);
    } catch (e) { setError(e.message || 'Failed to load Social Studio.'); }
    finally { setBusy(false); }
  }

  useEffect(() => { load(); }, [guildId]);
  useEffect(() => { setTemplate((config.templates || {})[templateType] || { title: `{creator} ${templateType === 'live' ? 'is now live' : 'posted new content'}`, description: '{title}', buttonLabel: 'Watch now' }); }, [templateType, config]);

  async function request(path, options, success) {
    setBusy(true); setError(''); setMessage('');
    try { const result = await api.request(path, options); setMessage(success || 'Saved.'); await load(); return result; }
    catch (e) { setError(e.message || 'Action failed.'); return null; }
    finally { setBusy(false); }
  }

  async function createAccount(event) {
    event.preventDefault();
    const result = await request(`/api/social/${guildId}/accounts`, { method: 'POST', body: JSON.stringify(form) }, 'Creator added.');
    if (result) setForm(makeAccount());
  }

  async function saveAccount(event, account) {
    event.preventDefault();
    const result = await request(`/api/social/${guildId}/accounts/${account.accountId}`, { method: 'PATCH', body: JSON.stringify(editForm) }, 'Creator updated.');
    if (result) { setEditing(''); setEditForm(null); }
  }

  async function loadHealth() {
    setBusy(true); setError('');
    try { const payload = await api.request(`/api/social/${guildId}/health`); setHealth(payload.health); }
    catch (e) { setError(e.message || 'Failed to load health.'); }
    finally { setBusy(false); }
  }

  async function exportConfig() {
    const payload = await api.request(`/api/social/${guildId}/export`);
    const blob = new Blob([JSON.stringify(payload.export, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `social-${guildId}.json`; link.click(); URL.revokeObjectURL(url);
  }

  async function saveTemplate() {
    await request(`/api/social/${guildId}/config`, { method: 'PATCH', body: JSON.stringify({ templates: { [templateType]: template } }) }, `${templateType} template saved.`);
  }

  async function toggleProvider(provider) {
    await request(`/api/social/${guildId}/config`, { method: 'PATCH', body: JSON.stringify({ providers: { [provider.id]: { ...(config.providers?.[provider.id] || {}), enabled: config.providers?.[provider.id]?.enabled === false } } }) }, `${provider.label} updated.`);
  }

  if (!guildId) return <EmptyState theme={theme} icon="📣" title="Select a server" description="Select a server to open Social Studio." />;

  return <div style={{ display: 'grid', gap: 18 }}>
    <Card theme={theme} style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.18), rgba(15,23,42,0.08) 50%, rgba(236,72,153,0.13))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><button onClick={() => navigate('/modules')} style={btn(theme)}>Back to Modules</button><span style={{ color: theme.mutedText, fontWeight: 900 }}>Modules / Social Studio</span></div>
      <div><div style={{ color: '#93c5fd', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '.08em' }}>Goliath Creator Suite</div><h1 style={{ margin: '8px 0 0', fontSize: 'clamp(30px,4vw,44px)' }}>Social Studio</h1><p style={{ color: theme.mutedText, maxWidth: 900, lineHeight: 1.6 }}>Add creators using only a public username, channel name, channel ID, handle or profile URL. Goliath manages provider credentials centrally.</p></div>
      <Tabs theme={theme} active={active} setActive={(tab) => { setActive(tab); if (tab === 'health') loadHealth(); }} />
    </Card>

    {(error || message) ? <Card theme={theme} style={{ color: error ? '#fca5a5' : '#86efac', padding: 14 }}>{error || message}</Card> : null}

    {active === 'overview' ? <div style={card}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}><Stat theme={theme} label="Status" value={overview.enabled === false ? 'Disabled' : 'Enabled'} hint="Module state" /><Stat theme={theme} label="Creators" value={overview.accountCount || 0} hint="Tracked accounts" /><Stat theme={theme} label="Enabled" value={overview.enabledAccountCount || 0} hint="Active monitors" /><Stat theme={theme} label="Alerts" value={overview.analytics?.alertsSent || 0} hint="Delivered" /><Stat theme={theme} label="Errors" value={overview.analytics?.errors || 0} hint="Provider/delivery" /></div>
      <Card theme={theme}><h2 style={{ margin: 0 }}>Quick Actions</h2><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button onClick={() => setActive('creators')} style={btn(theme, { background: 'rgba(22,163,74,.23)' })}>Add Creator</button><button onClick={() => request(`/api/social/${guildId}/check`, { method: 'POST' }, 'All enabled creators checked.')} style={btn(theme)}>Check All</button><button onClick={() => request(`/api/social/${guildId}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled: overview.enabled === false }) }, 'Module state updated.')} style={btn(theme)}>{overview.enabled === false ? 'Enable' : 'Disable'}</button><button onClick={exportConfig} style={btn(theme)}>Export</button></div></Card>
    </div> : null}

    {active === 'creators' ? <div style={card}>
      <Card theme={theme}><h2 style={{ marginTop: 0 }}>Add Creator</h2><p style={{ color: theme.mutedText }}>No keys or private access required. Enter a public username, handle, channel ID or profile URL.</p><AccountEditor theme={theme} value={form} channels={channels} roles={roles} onChange={setForm} onSave={createAccount} saving={busy} /></Card>
      <Card theme={theme}><h2 style={{ marginTop: 0 }}>Creator Library</h2>{accounts.length === 0 ? <EmptyState theme={theme} icon="📣" title="No creators yet" description="Add your first creator above." /> : accounts.map((account) => <article key={account.accountId} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 18, padding: 16, marginTop: 12, display: 'grid', gap: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><div><div style={{ fontSize: 12, color: theme.mutedText, textTransform: 'uppercase', fontWeight: 900 }}>{account.platform}</div><h3 style={{ margin: '5px 0' }}>{account.displayName || account.username}</h3><div style={{ color: theme.mutedText }}>{account.username || account.externalId}</div></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button onClick={() => request(`/api/social/${guildId}/accounts/${account.accountId}/check`, { method: 'POST' }, 'Provider checked.')} style={btn(theme)}>Check</button><button onClick={() => request(`/api/social/${guildId}/accounts/${account.accountId}/test`, { method: 'POST' }, 'Test alert sent.')} style={btn(theme)}>Test</button><button onClick={() => request(`/api/social/${guildId}/accounts/${account.accountId}`, { method: 'PATCH', body: JSON.stringify({ enabled: account.enabled === false }) }, 'Creator state updated.')} style={btn(theme)}>{account.enabled === false ? 'Enable' : 'Disable'}</button><button onClick={() => { setEditing(account.accountId); setEditForm(makeAccount(account)); }} style={btn(theme)}>Edit</button><button onClick={() => window.confirm('Remove this creator?') && request(`/api/social/${guildId}/accounts/${account.accountId}`, { method: 'DELETE' }, 'Creator removed.')} style={btn(theme, { background: 'rgba(220,38,38,.2)' })}>Remove</button></div></div><div style={{ color: theme.mutedText, fontSize: 13 }}>Status: {account.lastSeen?.lastProviderStatus || 'not checked'} · Last alert: {account.lastSeen?.lastAlertAt || 'never'} · Channel: {account.alertChannelId ? `#${channels.find((c) => c.id === account.alertChannelId)?.name || account.alertChannelId}` : 'not set'}</div>{editing === account.accountId && editForm ? <AccountEditor theme={theme} value={editForm} channels={channels} roles={roles} onChange={setEditForm} onSave={(e) => saveAccount(e, account)} onCancel={() => { setEditing(''); setEditForm(null); }} saving={busy} /> : null}</article>)}</Card>
    </div> : null}

    {active === 'studio' ? <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(280px,.8fr)', gap: 16 }}>
      <Card theme={theme}><h2 style={{ marginTop: 0 }}>Alert Studio</h2><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>{TEMPLATE_TYPES.map((type) => <button key={type} onClick={() => setTemplateType(type)} style={btn(theme, templateType === type ? { background: 'rgba(37,99,235,.25)', border: '#60a5fa' } : {})}>{type}</button>)}</div><div style={{ display: 'grid', gap: 12 }}><label style={{ display: 'grid', gap: 6 }}>Title<input value={template.title || ''} onChange={(e) => setTemplate({ ...template, title: e.target.value })} style={field(theme)} /></label><label style={{ display: 'grid', gap: 6 }}>Description<textarea value={template.description || ''} onChange={(e) => setTemplate({ ...template, description: e.target.value })} rows={7} style={field(theme)} /></label><label style={{ display: 'grid', gap: 6 }}>Button Label<input value={template.buttonLabel || ''} onChange={(e) => setTemplate({ ...template, buttonLabel: e.target.value })} style={field(theme)} /></label><button onClick={saveTemplate} style={btn(theme, { background: 'rgba(22,163,74,.23)' })}>Save Template</button><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{VARIABLES.map((v) => <code key={v} style={{ padding: '5px 8px', borderRadius: 8, background: 'rgba(15,23,42,.45)', color: '#bfdbfe' }}>{v}</code>)}</div></div></Card>
      <Card theme={theme}><h2 style={{ marginTop: 0 }}>Live Preview</h2><div style={{ borderLeft: '4px solid #5865F2', background: 'rgba(15,23,42,.42)', borderRadius: 12, padding: 16 }}><h3 style={{ marginTop: 0 }}>{(template.title || '').replaceAll('{creator}', 'Creator').replaceAll('{platform}', 'Twitch')}</h3><p style={{ whiteSpace: 'pre-wrap', color: theme.mutedText }}>{(template.description || '').replaceAll('{title}', 'Example content title').replaceAll('{creator}', 'Creator').replaceAll('{game}', 'Gaming')}</p><button style={btn(theme)}>{template.buttonLabel || 'Watch now'}</button></div></Card>
    </div> : null}

    {active === 'providers' ? <Card theme={theme}><h2 style={{ marginTop: 0 }}>Provider Centre</h2><p style={{ color: theme.mutedText }}>Credentials are owned by Goliath. Server admins never enter API keys or tokens.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>{providers.map((provider) => { const enabled = config.providers?.[provider.id]?.enabled !== false; return <div key={provider.id} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 15 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{provider.label}</strong><span style={{ color: provider.status === 'ready' ? '#86efac' : '#fcd34d' }}>{provider.status}</span></div><p style={{ color: theme.mutedText, fontSize: 13 }}>Supports: {(provider.supportedAlertTypes || []).join(', ') || 'None'}</p><button onClick={() => toggleProvider(provider)} style={btn(theme)}>{enabled ? 'Disable Provider' : 'Enable Provider'}</button></div>; })}</div></Card> : null}

    {active === 'health' ? <div style={card}><Card theme={theme}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><h2 style={{ margin: 0 }}>Social Health</h2><div style={{ display: 'flex', gap: 8 }}><button onClick={loadHealth} style={btn(theme)}>Refresh</button><button onClick={() => request(`/api/social/${guildId}/repair`, { method: 'POST' }, 'Repair completed.').then(loadHealth)} style={btn(theme)}>Repair</button><button onClick={exportConfig} style={btn(theme)}>Export</button><button onClick={() => window.confirm('Reset Social Alerts for this server?') && request(`/api/social/${guildId}/reset`, { method: 'POST' }, 'Social Alerts reset.')} style={btn(theme, { background: 'rgba(220,38,38,.2)' })}>Reset</button></div></div>{health ? <div style={{ marginTop: 14 }}><div style={{ fontSize: 26, fontWeight: 950, color: health.healthy ? '#86efac' : '#fcd34d' }}>{health.healthy ? 'Healthy' : 'Needs attention'}</div><div style={{ color: theme.mutedText, marginTop: 6 }}>{health.enabledAccountCount} enabled creators · {health.issues?.length || 0} issues</div><div style={{ display: 'grid', gap: 8, marginTop: 14 }}>{(health.issues || []).map((issue, index) => <div key={`${issue.code}-${index}`} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 11 }}><strong>{issue.code}</strong>{issue.accountId ? <span style={{ color: theme.mutedText }}> · {issue.accountId}</span> : null}</div>)}</div></div> : <p style={{ color: theme.mutedText }}>Run a health check to inspect provider readiness, identifiers, channels and prior errors.</p>}</Card></div> : null}
  </div>;
}
