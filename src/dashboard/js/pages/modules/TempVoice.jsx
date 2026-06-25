import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient';
import PageShell, { EmptyState, LoadingPanel, Notice, PrimaryButton, StatGrid, SummaryStat } from '../../shared/PageShell';

function getGuildId(selectedGuild, selectedGuildData) {
  return String(selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '').split(':').pop().trim();
}

function Card({ theme, children }) {
  return <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 22, boxShadow: theme.shadow, padding: 18 }}>{children}</section>;
}

function fieldStyle(theme) {
  return { width: '100%', border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.9)', color: theme.cardText, borderRadius: 12, padding: '12px 13px', outline: 'none', fontWeight: 850 };
}

function Toggle({ checked, onChange, disabled }) {
  return <button type="button" disabled={disabled} onClick={() => onChange(!checked)} style={{ border: checked ? '1px solid rgba(34,197,94,0.45)' : '1px solid rgba(239,68,68,0.45)', background: checked ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)', color: checked ? '#86efac' : '#fca5a5', borderRadius: 999, padding: '9px 13px', fontWeight: 950, cursor: disabled ? 'not-allowed' : 'pointer' }}>{checked ? 'Enabled' : 'Disabled'}</button>;
}

function ChannelSelect({ theme, label, value, onChange, channels, empty = 'Select channel' }) {
  return <label style={{ display: 'grid', gap: 8, fontWeight: 900 }}>{label}<select value={value || ''} onChange={(event) => onChange(event.target.value)} style={fieldStyle(theme)}><option value="">{empty}</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.type === 4 ? '📁' : '🔊'} {channel.name}</option>)}</select></label>;
}

export default function TempVoice({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [voiceChannels, setVoiceChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [config, setConfig] = useState(null);
  const [overview, setOverview] = useState(null);
  const [hubDraft, setHubDraft] = useState({ joinChannelId: '', categoryId: '', nameTemplate: "{username}'s Channel", userLimit: 0, bitrate: 0, enabled: true });
  const [settingsDraft, setSettingsDraft] = useState({ defaultUserLimit: 0, deleteWhenEmpty: true });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const hubs = useMemo(() => Object.values(config?.hubs || {}).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))), [config]);
  const trackedChannels = useMemo(() => Object.values(config?.channels || {}).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), [config]);

  async function load() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    try {
      const [data, resources] = await Promise.all([
        api.request(`/api/temp-voice/${guildId}`),
        api.request(`/api/discord/${guildId}/resources`).catch(() => ({ channels: [], categories: [] })),
      ]);

      const nextConfig = data.config || {};
      setConfig(nextConfig);
      setOverview(data.overview || {});
      setSettingsDraft({
        defaultUserLimit: nextConfig.settings?.defaultUserLimit || 0,
        deleteWhenEmpty: nextConfig.settings?.deleteWhenEmpty !== false,
      });
      setVoiceChannels((resources.channels || []).filter((channel) => channel.type === 2 || channel.type === 13 || channel.type === 'GuildVoice' || channel.type === 'GuildStageVoice'));
      setCategories((resources.categories || []).filter((category) => category.id && category.name));
    } catch (loadError) {
      setError(loadError.message || 'Failed to load Temp Voice.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [guildId]);

  async function setEnabled(enabled) {
    setSaving(true);
    setError('');
    try {
      const result = await api.request(`/api/temp-voice/${guildId}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
      setConfig(result.config || null);
      setOverview(result.overview || null);
      setMessage(`✅ Temp Voice ${enabled ? 'enabled' : 'disabled'}.`);
    } catch (saveError) {
      setError(saveError.message || 'Failed to update Temp Voice state.');
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setError('');
    try {
      const result = await api.request(`/api/temp-voice/${guildId}/settings`, { method: 'PATCH', body: JSON.stringify({ settings: settingsDraft }) });
      setConfig(result.config || null);
      setOverview(result.overview || null);
      setMessage('✅ Temp Voice settings saved.');
    } catch (saveError) {
      setError(saveError.message || 'Failed to save Temp Voice settings.');
    } finally {
      setSaving(false);
    }
  }

  async function saveHub(hub = hubDraft) {
    setSaving(true);
    setError('');
    try {
      await api.request(hub.hubId ? `/api/temp-voice/${guildId}/hubs/${hub.hubId}` : `/api/temp-voice/${guildId}/hubs`, { method: hub.hubId ? 'PUT' : 'POST', body: JSON.stringify(hub) });
      setHubDraft({ joinChannelId: '', categoryId: '', nameTemplate: "{username}'s Channel", userLimit: settingsDraft.defaultUserLimit || 0, bitrate: 0, enabled: true });
      setMessage('✅ Temp Voice hub saved.');
      await load();
    } catch (saveError) {
      setError(saveError.message || 'Failed to save hub.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteHub(hubId) {
    setSaving(true);
    setError('');
    try {
      await api.request(`/api/temp-voice/${guildId}/hubs/${hubId}`, { method: 'DELETE' });
      setMessage('✅ Temp Voice hub deleted.');
      await load();
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete hub.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTrackedChannel(channelId) {
    setSaving(true);
    setError('');
    try {
      await api.request(`/api/temp-voice/${guildId}/channels/${channelId}`, { method: 'DELETE' });
      setMessage('✅ Temp Voice channel removed.');
      await load();
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to remove channel.');
    } finally {
      setSaving(false);
    }
  }

  if (!guildId) return <EmptyState theme={theme} title="Select a guild" text="Select a guild to manage Temp Voice." />;
  if (loading && !config) return <LoadingPanel theme={theme} text="Loading Temp Voice..." />;

  return (
    <PageShell title="Temp Voice" subtitle="Join-to-create voice hubs, temporary channel tracking and cleanup." theme={theme} guild={{ id: guildId, name: selectedGuildData?.name || selectedGuildData?.guildName || 'Temp Voice' }} actions={<><Toggle checked={overview?.enabled !== false} onChange={setEnabled} disabled={saving} /><PrimaryButton onClick={load} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</PrimaryButton></>}>
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {message ? <Notice theme={theme} tone="success">{message}</Notice> : null}

      <StatGrid min="160px">
        <SummaryStat theme={theme} label="Status" value={overview?.enabled ? 'Enabled' : 'Disabled'} accent={overview?.enabled ? '#22c55e' : '#ef4444'} description="Module state" />
        <SummaryStat theme={theme} label="Hubs" value={`${overview?.enabledHubs || 0}/${overview?.hubs || 0}`} accent="#60a5fa" description="Enabled hubs" />
        <SummaryStat theme={theme} label="Live Channels" value={overview?.liveChannels || 0} accent="#a78bfa" description="Tracked and present" />
        <SummaryStat theme={theme} label="Tracked" value={overview?.trackedChannels || 0} accent="#f59e0b" description="Stored temp channels" />
      </StatGrid>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16 }}>
        <Card theme={theme}>
          <h2 style={{ margin: '0 0 14px' }}>Create Hub</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <ChannelSelect theme={theme} label="Join/Create Voice Channel" value={hubDraft.joinChannelId} onChange={(value) => setHubDraft({ ...hubDraft, joinChannelId: value })} channels={voiceChannels} empty="Select voice channel" />
            <ChannelSelect theme={theme} label="Temp Channel Category" value={hubDraft.categoryId} onChange={(value) => setHubDraft({ ...hubDraft, categoryId: value })} channels={categories} empty="Use join channel category" />
            <label style={{ display: 'grid', gap: 8, fontWeight: 900 }}>Name Template<input value={hubDraft.nameTemplate} onChange={(event) => setHubDraft({ ...hubDraft, nameTemplate: event.target.value })} style={fieldStyle(theme)} /></label>
            <label style={{ display: 'grid', gap: 8, fontWeight: 900 }}>User Limit<input type="number" min="0" value={hubDraft.userLimit} onChange={(event) => setHubDraft({ ...hubDraft, userLimit: event.target.value })} style={fieldStyle(theme)} /></label>
            <PrimaryButton onClick={() => saveHub()} disabled={saving || !hubDraft.joinChannelId}>{saving ? 'Saving...' : 'Save Hub'}</PrimaryButton>
          </div>
        </Card>

        <Card theme={theme}>
          <h2 style={{ margin: '0 0 14px' }}>Settings</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 8, fontWeight: 900 }}>Default User Limit<input type="number" min="0" value={settingsDraft.defaultUserLimit} onChange={(event) => setSettingsDraft({ ...settingsDraft, defaultUserLimit: event.target.value })} style={fieldStyle(theme)} /></label>
            <label style={{ color: theme.mutedText, fontWeight: 850 }}><input type="checkbox" checked={settingsDraft.deleteWhenEmpty} onChange={(event) => setSettingsDraft({ ...settingsDraft, deleteWhenEmpty: event.target.checked })} /> Delete temporary channels when empty</label>
            <PrimaryButton onClick={saveSettings} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</PrimaryButton>
          </div>
        </Card>
      </div>

      <Card theme={theme}>
        <h2 style={{ margin: '0 0 14px' }}>Configured Hubs</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {hubs.length ? hubs.map((hub) => <div key={hub.hubId} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.5)', borderRadius: 14, padding: 12, display: 'grid', gap: 8 }}><strong>{voiceChannels.find((channel) => channel.id === hub.joinChannelId)?.name || hub.joinChannelId}</strong><span style={{ color: theme.mutedText, fontSize: 13 }}>Template: {hub.nameTemplate} · Limit: {hub.userLimit || 'None'} · Category: {categories.find((category) => category.id === hub.categoryId)?.name || 'Auto'}</span><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" onClick={() => setHubDraft(hub)} style={{ border: `1px solid ${theme.cardBorder}`, background: theme.softBg, color: theme.cardText, borderRadius: 10, padding: '9px 11px', fontWeight: 900 }}>Edit</button><button type="button" onClick={() => deleteHub(hub.hubId)} style={{ border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.12)', color: '#fca5a5', borderRadius: 10, padding: '9px 11px', fontWeight: 900 }}>Delete</button></div></div>) : <EmptyState theme={theme} title="No hubs configured" text="Select a voice channel to create your first join-to-create hub." />}
        </div>
      </Card>

      <Card theme={theme}>
        <h2 style={{ margin: '0 0 14px' }}>Tracked Temporary Channels</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {trackedChannels.length ? trackedChannels.map((channel) => <div key={channel.channelId} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.5)', borderRadius: 14, padding: 12, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><span><strong>{channel.channelId}</strong><br /><small style={{ color: theme.mutedText }}>Owner: {channel.ownerId} · Hub: {channel.hubId || 'Unknown'}</small></span><button type="button" onClick={() => deleteTrackedChannel(channel.channelId)} style={{ border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.12)', color: '#fca5a5', borderRadius: 10, padding: '9px 11px', fontWeight: 900 }}>Delete</button></div>) : <EmptyState theme={theme} title="No active temporary channels" text="Created temporary channels will appear here." />}
        </div>
      </Card>
    </PageShell>
  );
}
