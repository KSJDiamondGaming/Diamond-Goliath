import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import EmptyState from '../../shared/EmptyState.jsx';
import { api } from '../../services/apiClient.js';

const ALERT_TYPES = ['live', 'upload', 'short', 'post'];
const PLATFORMS = ['twitch', 'youtube', 'tiktok', 'kick', 'facebook', 'instagram', 'x'];
const TABS = [
  ['overview', 'Overview'],
  ['accounts', 'Accounts'],
  ['hub', 'Creator Hub'],
  ['studio', 'Alert Studio'],
  ['providers', 'Providers'],
  ['operations', 'Operations'],
  ['health', 'Health'],
];

function getGuildId(selectedGuild, selectedGuildData) {
  return String(selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '').split(':').pop().trim();
}

function field(theme) {
  return {
    border: `1px solid ${theme.cardBorder}`,
    background: 'rgba(15,23,42,.35)',
    color: theme.cardText,
    borderRadius: 12,
    padding: 11,
    minHeight: 44,
    outline: 'none',
  };
}

function btn(theme, extra = {}) {
  return {
    border: `1px solid ${extra.border || theme.cardBorder}`,
    background: extra.background || 'rgba(15,23,42,.35)',
    color: extra.color || theme.cardText,
    borderRadius: 999,
    padding: '9px 13px',
    fontWeight: 900,
    cursor: extra.disabled ? 'not-allowed' : 'pointer',
    opacity: extra.disabled ? 0.55 : 1,
  };
}

function Card({ theme, children, style = {} }) {
  return <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 20, boxShadow: theme.shadow, padding: 18, ...style }}>{children}</section>;
}

function Stat({ theme, label, value, hint }) {
  return <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 14 }}><small style={{ color: theme.mutedText, fontWeight: 900 }}>{label}</small><div style={{ fontSize: 27, fontWeight: 950 }}>{value}</div><small style={{ color: theme.mutedText }}>{hint}</small></div>;
}

function accountsOf(config) {
  return Array.isArray(config?.accounts) ? config.accounts : Object.values(config?.accounts || {});
}

function defaultAccount(account = {}) {
  return {
    platform: account.platform || 'twitch',
    displayName: account.displayName || '',
    username: account.username || account.url || '',
    alertChannelId: account.alertChannelId || '',
    mentionRoleId: account.mentionRoleId || '',
    mentionMode: account.mentionMode || 'none',
    alertTypes: account.alertTypes?.length ? account.alertTypes : ['live'],
    enabled: account.enabled !== false,
    metadata: { ...(account.metadata || {}), routing: { ...(account.metadata?.routing || {}) } },
  };
}

function defaultProfile(profile = {}) {
  return {
    creatorId: profile.creatorId || '',
    displayName: profile.displayName || '',
    group: profile.group || '',
    tags: (profile.tags || []).join(', '),
    notes: profile.notes || '',
    enabled: profile.enabled !== false,
    accountIds: profile.accountIds || [],
  };
}

function defaultOperations(settings = {}) {
  return {
    checkIntervalMs: Number(settings.checkIntervalMs || 300000),
    retryIntervalMs: Number(settings.retryIntervalMs || 60000),
    retryDeliveries: settings.retryDeliveries !== false,
    maxDeliveryAttempts: Number(settings.maxDeliveryAttempts || 5),
    cooldownMs: Number(settings.cooldownMs || 300000),
    suppressDuplicates: settings.suppressDuplicates !== false,
    editLiveNotifications: settings.editLiveNotifications === true,
    deleteEndedNotifications: settings.deleteEndedNotifications === true,
    includeViewerCount: settings.includeViewerCount !== false,
    includeLiveDuration: settings.includeLiveDuration !== false,
    thumbnailPreference: settings.thumbnailPreference || 'stream',
    platformPriority: Array.isArray(settings.platformPriority) ? settings.platformPriority : PLATFORMS,
  };
}

function Toggle({ theme, label, checked, onChange, hint }) {
  return <label style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12, display: 'grid', gap: 5 }}><span style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 900 }}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</span>{hint && <small style={{ color: theme.mutedText }}>{hint}</small>}</label>;
}

export default function Social({ theme, selectedGuild, selectedGuildData }) {
  const navigate = useNavigate();
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [active, setActive] = useState('overview');
  const [config, setConfig] = useState({});
  const [overview, setOverview] = useState({});
  const [providers, setProviders] = useState([]);
  const [channels, setChannels] = useState([]);
  const [history, setHistory] = useState([]);
  const [queue, setQueue] = useState([]);
  const [health, setHealth] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [accountForm, setAccountForm] = useState(defaultAccount());
  const [profileForm, setProfileForm] = useState(defaultProfile());
  const [selectedCreatorId, setSelectedCreatorId] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [simulationType, setSimulationType] = useState('live');
  const [simulation, setSimulation] = useState(null);
  const [templateType, setTemplateType] = useState('live');
  const [template, setTemplate] = useState({ title: '{creator} is now live', description: '{title}', buttonLabel: 'Watch now' });
  const [quiet, setQuiet] = useState({ enabled: false, start: '23:00', end: '08:00', timezone: 'Europe/London' });
  const [operations, setOperations] = useState(defaultOperations());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const accounts = useMemo(() => accountsOf(config), [config]);
  const selectedProfile = profiles.find((item) => item.creatorId === selectedCreatorId) || null;
  const selectedAccount = accounts.find((item) => item.accountId === selectedAccountId) || null;

  async function load() {
    if (!guildId) return;
    setBusy(true);
    setError('');
    try {
      const [c, o, p, ch, h, q, hub] = await Promise.all([
        api.request(`/api/social/${guildId}`),
        api.request(`/api/social/${guildId}/overview`),
        api.request(`/api/social/${guildId}/providers`),
        api.request(`/api/discord/${guildId}/channels`),
        api.request(`/api/social/${guildId}/history?limit=100`),
        api.request(`/api/social/${guildId}/queue?limit=100`),
        api.request(`/api/social/${guildId}/creator-hub`),
      ]);
      const next = c.config || {};
      setConfig(next);
      setOverview(o.overview || {});
      setProviders(p.providers || []);
      setChannels(Array.isArray(ch) ? ch : ch.channels || []);
      setHistory(h.history || []);
      setQueue(q.queue || []);
      setProfiles(hub.creators || hub.profiles || []);
      setQuiet({ enabled: false, start: '23:00', end: '08:00', timezone: 'Europe/London', ...(next.settings?.quietHours || {}) });
      setOperations(defaultOperations(next.settings || {}));
      setTemplate(next.templates?.[templateType] || template);
      if (!selectedCreatorId && (hub.creators || hub.profiles)?.[0]) setSelectedCreatorId((hub.creators || hub.profiles)[0].creatorId);
      if (!selectedAccountId && accountsOf(next)[0]) setSelectedAccountId(accountsOf(next)[0].accountId);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load Social Studio.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, [guildId]);
  useEffect(() => { setTemplate(config.templates?.[templateType] || { title: '{creator} alert', description: '{title}', buttonLabel: 'Watch now' }); }, [templateType, config]);
  useEffect(() => { if (selectedProfile) setProfileForm(defaultProfile(selectedProfile)); }, [selectedCreatorId, profiles]);

  async function request(path, options = {}, success = 'Saved.') {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await api.request(path, options);
      setMessage(success);
      await load();
      return result;
    } catch (requestError) {
      setError(requestError.message || 'Action failed.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveAccount(event) {
    event.preventDefault();
    await request(`/api/social/${guildId}/accounts`, { method: 'POST', body: JSON.stringify(accountForm) }, 'Creator account saved.');
    setAccountForm(defaultAccount());
  }

  async function saveProfile(event) {
    event.preventDefault();
    const payload = { ...profileForm, tags: profileForm.tags.split(',').map((value) => value.trim()).filter(Boolean) };
    const path = profileForm.creatorId ? `/api/social/${guildId}/creator-hub/${profileForm.creatorId}` : `/api/social/${guildId}/creator-hub`;
    await request(path, { method: profileForm.creatorId ? 'PATCH' : 'POST', body: JSON.stringify(payload) }, 'Creator profile saved.');
  }

  async function simulate(send = false) {
    if (!selectedAccountId) return;
    const result = await request(`/api/social/${guildId}/creator-hub/accounts/${selectedAccountId}/simulate`, { method: 'POST', body: JSON.stringify({ alertType: simulationType, send }) }, send ? 'Simulation sent.' : 'Simulation preview ready.');
    if (result) setSimulation(result);
  }

  async function saveOperations() {
    await request(`/api/social/${guildId}/config`, {
      method: 'PATCH',
      body: JSON.stringify({ settings: { ...operations, quietHours: quiet } }),
    }, 'Social monitoring settings saved.');
  }

  function movePriority(platform, direction) {
    const current = [...operations.platformPriority];
    const index = current.indexOf(platform);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    setOperations({ ...operations, platformPriority: current });
  }

  if (!guildId) return <EmptyState theme={theme} icon="📣" title="Select a server" description="Select a server to open Social Studio." />;

  const channelOptions = channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>);

  return <div style={{ display: 'grid', gap: 16 }}>
    <Card theme={theme} style={{ background: 'linear-gradient(135deg,rgba(37,99,235,.18),rgba(15,23,42,.08),rgba(236,72,153,.13))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}><button onClick={() => navigate('/modules')} style={btn(theme)}>Back to Modules</button><span style={{ color: theme.mutedText, fontWeight: 900 }}>Modules / Social Studio</span></div>
      <h1 style={{ marginBottom: 4 }}>Social Studio</h1>
      <p style={{ color: theme.mutedText }}>Persistent creator monitoring, automated live notifications, routing, simulation and recovery.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{TABS.map(([id, label]) => <button key={id} onClick={() => { setActive(id); if (id === 'health') api.request(`/api/social/${guildId}/health`).then((result) => setHealth(result.health)).catch((healthError) => setError(healthError.message)); }} style={btn(theme, active === id ? { background: 'rgba(37,99,235,.28)', border: '#60a5fa' } : {})}>{label}</button>)}</div>
    </Card>

    {(error || message) && <Card theme={theme} style={{ padding: 12, color: error ? '#fca5a5' : '#86efac' }}>{error || message}</Card>}

    {active === 'overview' && <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
        <Stat theme={theme} label="Profiles" value={profiles.length} hint="Unified creators" />
        <Stat theme={theme} label="Accounts" value={overview.accountCount || accounts.length} hint="Platform monitors" />
        <Stat theme={theme} label="Alerts" value={overview.analytics?.alertsSent || 0} hint="Delivered" />
        <Stat theme={theme} label="Queue" value={overview.queue?.total || queue.length} hint="Pending/retry" />
        <Stat theme={theme} label="History" value={overview.history?.total || history.length} hint="Operational events" />
      </div>
      <Card theme={theme}><button onClick={() => setActive('hub')} style={btn(theme, { background: 'rgba(22,163,74,.23)' })}>Open Creator Hub</button> <button onClick={() => request(`/api/social/${guildId}/check`, { method: 'POST' }, 'All creators checked.')} style={btn(theme)}>Check All</button></Card>
    </div>}

    {active === 'accounts' && <div style={{ display: 'grid', gap: 12 }}>
      <Card theme={theme}>
        <h2>Add Platform Account</h2>
        <form onSubmit={saveAccount} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
          <select value={accountForm.platform} onChange={(event) => setAccountForm({ ...accountForm, platform: event.target.value })} style={field(theme)}>{PLATFORMS.map((platform) => <option key={platform}>{platform}</option>)}</select>
          <input required placeholder="Username, handle, channel ID or URL" value={accountForm.username} onChange={(event) => setAccountForm({ ...accountForm, username: event.target.value })} style={field(theme)} />
          <input placeholder="Display name" value={accountForm.displayName} onChange={(event) => setAccountForm({ ...accountForm, displayName: event.target.value })} style={field(theme)} />
          <select value={accountForm.alertChannelId} onChange={(event) => setAccountForm({ ...accountForm, alertChannelId: event.target.value })} style={field(theme)}><option value="">Default channel</option>{channelOptions}</select>
          <button disabled={busy} style={btn(theme, { background: 'rgba(22,163,74,.23)', disabled: busy })}>Save Account</button>
        </form>
      </Card>
      <Card theme={theme}><h2>Platform Accounts</h2>{accounts.map((account) => <div key={account.accountId} style={{ borderTop: `1px solid ${theme.cardBorder}`, padding: '12px 0', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><div><strong>{account.displayName || account.username}</strong><div style={{ color: theme.mutedText }}>{account.platform} · {account.username || account.externalId}</div></div><div><button onClick={() => request(`/api/social/${guildId}/accounts/${account.accountId}/check`, { method: 'POST' }, 'Account checked.')} style={btn(theme)}>Check</button> <button onClick={() => { setSelectedAccountId(account.accountId); setActive('hub'); }} style={btn(theme)}>Open in Hub</button> <button onClick={() => window.confirm('Remove this account?') && request(`/api/social/${guildId}/accounts/${account.accountId}`, { method: 'DELETE' }, 'Account removed.')} style={btn(theme, { background: 'rgba(220,38,38,.2)' })}>Remove</button></div></div>)}</Card>
    </div>}

    {active === 'hub' && <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,.75fr) minmax(0,1.25fr)', gap: 12 }}>
      <Card theme={theme}><h2>Creator Profiles</h2><button onClick={() => setProfileForm(defaultProfile())} style={btn(theme, { background: 'rgba(22,163,74,.23)' })}>New Profile</button> <button onClick={() => request(`/api/social/${guildId}/creator-hub/rebuild`, { method: 'POST' }, 'Profiles rebuilt.')} style={btn(theme)}>Rebuild</button><div style={{ marginTop: 12 }}>{profiles.map((profile) => <button key={profile.creatorId} onClick={() => setSelectedCreatorId(profile.creatorId)} style={{ ...btn(theme, profile.creatorId === selectedCreatorId ? { background: 'rgba(37,99,235,.25)', border: '#60a5fa' } : {}), width: '100%', marginBottom: 7, textAlign: 'left' }}>{profile.displayName} · {profile.accountIds?.length || 0} platform(s)</button>)}</div></Card>
      <div style={{ display: 'grid', gap: 12 }}>
        <Card theme={theme}><h2>{profileForm.creatorId ? 'Edit Creator Profile' : 'Create Creator Profile'}</h2><form onSubmit={saveProfile} style={{ display: 'grid', gap: 10 }}><input required placeholder="Creator display name" value={profileForm.displayName} onChange={(event) => setProfileForm({ ...profileForm, displayName: event.target.value })} style={field(theme)} /><input placeholder="Group" value={profileForm.group} onChange={(event) => setProfileForm({ ...profileForm, group: event.target.value })} style={field(theme)} /><input placeholder="Tags, comma separated" value={profileForm.tags} onChange={(event) => setProfileForm({ ...profileForm, tags: event.target.value })} style={field(theme)} /><textarea placeholder="Notes" rows={5} value={profileForm.notes} onChange={(event) => setProfileForm({ ...profileForm, notes: event.target.value })} style={field(theme)} /><button disabled={busy} style={btn(theme, { background: 'rgba(22,163,74,.23)', disabled: busy })}>Save Profile</button></form></Card>
        <Card theme={theme}><h2>Linked Platforms & Simulator</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}><select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)} style={field(theme)}><option value="">Select account</option>{accounts.map((account) => <option key={account.accountId} value={account.accountId}>{account.platform} · {account.displayName || account.username}</option>)}</select><select value={simulationType} onChange={(event) => setSimulationType(event.target.value)} style={field(theme)}>{ALERT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></div><div style={{ marginTop: 10 }}><button disabled={!selectedProfile || !selectedAccount} onClick={() => request(`/api/social/${guildId}/creator-hub/${selectedProfile.creatorId}/accounts/${selectedAccount.accountId}`, { method: selectedProfile?.accountIds?.includes(selectedAccountId) ? 'DELETE' : 'POST' }, selectedProfile?.accountIds?.includes(selectedAccountId) ? 'Account unlinked.' : 'Account linked.')} style={btn(theme, { disabled: !selectedProfile || !selectedAccount })}>{selectedProfile?.accountIds?.includes(selectedAccountId) ? 'Unlink Account' : 'Link Account'}</button> <button disabled={!selectedAccount} onClick={() => simulate(false)} style={btn(theme, { disabled: !selectedAccount })}>Preview</button> <button disabled={!selectedAccount} onClick={() => simulate(true)} style={btn(theme, { background: 'rgba(37,99,235,.24)', disabled: !selectedAccount })}>Send Simulation</button></div>{simulation?.preview && <div style={{ marginTop: 14, borderLeft: '4px solid #5865f2', padding: 12, background: 'rgba(15,23,42,.35)' }}><strong>{simulation.preview.title}</strong><p>{simulation.preview.description}</p></div>}</Card>
      </div>
    </div>}

    {active === 'studio' && <Card theme={theme}><h2>Alert Studio</h2><div>{ALERT_TYPES.map((type) => <button key={type} onClick={() => setTemplateType(type)} style={btn(theme, type === templateType ? { background: 'rgba(37,99,235,.25)' } : {})}>{type}</button>)}</div><div style={{ display: 'grid', gap: 10, marginTop: 12 }}><input value={template.title || ''} onChange={(event) => setTemplate({ ...template, title: event.target.value })} style={field(theme)} /><textarea rows={6} value={template.description || ''} onChange={(event) => setTemplate({ ...template, description: event.target.value })} style={field(theme)} /><input value={template.buttonLabel || ''} onChange={(event) => setTemplate({ ...template, buttonLabel: event.target.value })} style={field(theme)} /><button onClick={() => request(`/api/social/${guildId}/config`, { method: 'PATCH', body: JSON.stringify({ templates: { [templateType]: template } }) }, 'Template saved.')} style={btn(theme)}>Save Template</button></div></Card>}

    {active === 'providers' && <Card theme={theme}><h2>Provider Centre</h2><p style={{ color: theme.mutedText }}>Credentials and platform authorization are managed centrally by Goliath.</p>{providers.map((provider) => <div key={provider.id} style={{ borderTop: `1px solid ${theme.cardBorder}`, padding: '12px 0', display: 'grid', gap: 4 }}><strong>{provider.label}</strong><span>Status: {provider.status}</span><small style={{ color: theme.mutedText }}>{provider.productionSupported === false ? 'Provider integration is not production ready.' : provider.authorizationRequired ? 'Creator or platform authorization is required.' : provider.status === 'ready' ? 'Ready for monitoring.' : 'Configuration or credentials are required.'}</small><small style={{ color: theme.mutedText }}>Alerts: {(provider.supportedAlertTypes || []).join(', ') || 'None'}</small></div>)}</Card>}

    {active === 'operations' && <div style={{ display: 'grid', gap: 12 }}>
      <Card theme={theme}><h2>Monitoring & Retry</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}><label>Check interval (seconds)<input type="number" min="60" value={Math.round(operations.checkIntervalMs / 1000)} onChange={(event) => setOperations({ ...operations, checkIntervalMs: Number(event.target.value) * 1000 })} style={{ ...field(theme), width: '100%' }} /></label><label>Retry interval (seconds)<input type="number" min="10" value={Math.round(operations.retryIntervalMs / 1000)} onChange={(event) => setOperations({ ...operations, retryIntervalMs: Number(event.target.value) * 1000 })} style={{ ...field(theme), width: '100%' }} /></label><label>Maximum attempts<input type="number" min="1" max="25" value={operations.maxDeliveryAttempts} onChange={(event) => setOperations({ ...operations, maxDeliveryAttempts: Number(event.target.value) })} style={{ ...field(theme), width: '100%' }} /></label><label>Cooldown (seconds)<input type="number" min="0" value={Math.round(operations.cooldownMs / 1000)} onChange={(event) => setOperations({ ...operations, cooldownMs: Number(event.target.value) * 1000 })} style={{ ...field(theme), width: '100%' }} /></label></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginTop: 12 }}><Toggle theme={theme} label="Retry failed deliveries" checked={operations.retryDeliveries} onChange={(value) => setOperations({ ...operations, retryDeliveries: value })} /><Toggle theme={theme} label="Suppress duplicates" checked={operations.suppressDuplicates} onChange={(value) => setOperations({ ...operations, suppressDuplicates: value })} /></div></Card>

      <Card theme={theme}><h2>Live Notification Lifecycle</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}><Toggle theme={theme} label="Edit active notifications" checked={operations.editLiveNotifications} onChange={(value) => setOperations({ ...operations, editLiveNotifications: value })} hint="Refresh title, category, viewers and thumbnail during a live session." /><Toggle theme={theme} label="Delete notifications when ended" checked={operations.deleteEndedNotifications} onChange={(value) => setOperations({ ...operations, deleteEndedNotifications: value })} hint="Otherwise the notification is converted to a stream-ended message." /><Toggle theme={theme} label="Show viewer count" checked={operations.includeViewerCount} onChange={(value) => setOperations({ ...operations, includeViewerCount: value })} /><Toggle theme={theme} label="Show live duration" checked={operations.includeLiveDuration} onChange={(value) => setOperations({ ...operations, includeLiveDuration: value })} /></div><label style={{ display: 'grid', gap: 5, marginTop: 12 }}>Thumbnail preference<select value={operations.thumbnailPreference} onChange={(event) => setOperations({ ...operations, thumbnailPreference: event.target.value })} style={field(theme)}><option value="stream">Stream thumbnail</option><option value="creator">Creator avatar</option><option value="none">No thumbnail</option></select></label></Card>

      <Card theme={theme}><h2>Platform Priority</h2><p style={{ color: theme.mutedText }}>Controls the preferred platform order when creators have multiple linked accounts.</p>{operations.platformPriority.map((platform, index) => <div key={platform} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${theme.cardBorder}`, padding: '9px 0' }}><strong>{index + 1}. {platform}</strong><span><button onClick={() => movePriority(platform, -1)} disabled={index === 0} style={btn(theme, { disabled: index === 0 })}>Up</button> <button onClick={() => movePriority(platform, 1)} disabled={index === operations.platformPriority.length - 1} style={btn(theme, { disabled: index === operations.platformPriority.length - 1 })}>Down</button></span></div>)}</Card>

      <Card theme={theme}><h2>Quiet Hours</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}><select value={quiet.enabled ? 'yes' : 'no'} onChange={(event) => setQuiet({ ...quiet, enabled: event.target.value === 'yes' })} style={field(theme)}><option value="no">Disabled</option><option value="yes">Enabled</option></select><input type="time" value={quiet.start} onChange={(event) => setQuiet({ ...quiet, start: event.target.value })} style={field(theme)} /><input type="time" value={quiet.end} onChange={(event) => setQuiet({ ...quiet, end: event.target.value })} style={field(theme)} /><input value={quiet.timezone || quiet.timeZone || 'Europe/London'} onChange={(event) => setQuiet({ ...quiet, timezone: event.target.value })} style={field(theme)} /></div><button onClick={saveOperations} disabled={busy} style={btn(theme, { background: 'rgba(22,163,74,.23)', disabled: busy })}>Save Operations</button></Card>

      <Card theme={theme}><h2>Delivery Queue</h2><button onClick={() => request(`/api/social/${guildId}/queue/process`, { method: 'POST' }, 'Queue processed.')} style={btn(theme)}>Process</button>{queue.map((item) => <div key={item.id} style={{ borderTop: `1px solid ${theme.cardBorder}`, padding: '10px 0' }}>{item.platform} · {item.alertType} · {item.status} <button onClick={() => request(`/api/social/${guildId}/queue/${item.id}/retry`, { method: 'POST' }, 'Retry scheduled.')} style={btn(theme)}>Retry</button></div>)}</Card>
      <Card theme={theme}><h2>History</h2>{history.slice(0, 50).map((item) => <div key={item.id} style={{ borderTop: `1px solid ${theme.cardBorder}`, padding: '10px 0' }}>{item.status} · {item.creator || item.accountId || 'System'} · {item.alertType}</div>)}</Card>
    </div>}

    {active === 'health' && <Card theme={theme}><h2>Social Health</h2><button onClick={() => api.request(`/api/social/${guildId}/health`).then((result) => setHealth(result.health)).catch((healthError) => setError(healthError.message))} style={btn(theme)}>Refresh</button> <button onClick={() => request(`/api/social/${guildId}/repair`, { method: 'POST' }, 'Repair completed.')} style={btn(theme)}>Repair</button>{health ? <div><h3>{health.healthy ? 'Healthy' : 'Needs attention'} · {health.grade || 'N/A'}</h3><p style={{ color: theme.mutedText }}>Score: {health.score ?? 'N/A'} · Checked {health.checkedAt || 'now'}</p>{(health.issues || []).map((issue, index) => <div key={`${issue.code}-${index}`} style={{ borderTop: `1px solid ${theme.cardBorder}`, padding: '9px 0' }}><strong>{issue.severity || 'warning'}:</strong> {issue.code}{issue.accountId ? ` · ${issue.accountId}` : ''}</div>)}</div> : <p style={{ color: theme.mutedText }}>Run a health check.</p>}</Card>}
  </div>;
}
