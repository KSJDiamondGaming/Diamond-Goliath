import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient.js';
import { ChannelSelect, RoleSelect } from '../../ui/DiscordResourceSelects.jsx';

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
}

function normalizeList(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function roleName(roles, roleId) {
  if (!roleId) return 'Not set';
  return roles.find((role) => String(role.id) === String(roleId))?.name || roleId;
}

function StatCard({ theme, label, value, hint }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.34)', borderRadius: 18, padding: 16 }}>
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950, color: theme.cardText }}>{value}</div>
      {hint ? <div style={{ marginTop: 4, color: theme.mutedText, fontSize: 12 }}>{hint}</div> : null}
    </div>
  );
}

function TextField({ theme, label, value, onChange, placeholder }) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <input value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} style={{ width: '100%', border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.55)', color: theme.cardText, borderRadius: 14, padding: '12px 14px', fontWeight: 800 }} />
    </label>
  );
}

function PanelSelect({ theme, panels, value, onChange }) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Current Panel</span>
      <select value={value || ''} onChange={(event) => onChange(event.target.value)} style={{ width: '100%', border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.55)', color: theme.cardText, borderRadius: 14, padding: '12px 14px', fontWeight: 800 }}>
        <option value="">Create new panel</option>
        {panels.map((item) => (
          <option key={item.panelId || item.id} value={item.panelId || item.id}>{item.title || item.panelId || item.id}</option>
        ))}
      </select>
    </label>
  );
}

export default function Verification({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [config, setConfig] = useState(null);
  const [overview, setOverview] = useState({});
  const [roles, setRoles] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedPanelId, setSelectedPanelId] = useState('');
  const [panel, setPanel] = useState({ panelId: '', channelId: '', title: 'Verify to access the server', description: 'Press the button below to complete verification.', buttonLabel: '✅' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const settings = config?.settings || {};
  const panels = Object.values(config?.panels || {});
  const analytics = overview.analytics || config?.analytics || {};
  const usableRoles = roles.filter((role) => String(role.id) !== String(guildId));

  const cardStyle = useMemo(() => ({
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 22,
    boxShadow: theme.shadow,
  }), [theme]);

  async function loadRoles() {
    const rolePayload = await api.getGuildRoles(guildId);
    const cachedRoles = normalizeList(rolePayload, 'roles');
    if (cachedRoles.length > 0) return cachedRoles;

    const syncedResources = await api.request(`/api/discord/${guildId}/resources/sync`, { method: 'POST' });
    return normalizeList(syncedResources, 'roles');
  }

  async function loadChannels() {
    const channelPayload = await api.getGuildChannels(guildId);
    const cachedChannels = normalizeList(channelPayload, 'channels');
    if (cachedChannels.length > 0) return cachedChannels;

    const syncedResources = await api.request(`/api/discord/${guildId}/resources/sync`, { method: 'POST' });
    return normalizeList(syncedResources, 'channels');
  }

  async function load() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const [verification, roleList, channelList] = await Promise.all([
        api.getVerification(guildId),
        loadRoles(),
        loadChannels(),
      ]);
      const nextConfig = verification.config || {};
      const nextPanels = Object.values(nextConfig.panels || {});
      setConfig(nextConfig);
      setOverview(verification.overview || {});
      setRoles(roleList);
      setChannels(channelList);

      if (!selectedPanelId && nextPanels.length > 0) {
        const latestPanel = nextPanels[0];
        setSelectedPanelId(latestPanel.panelId || latestPanel.id || '');
        setPanel({
          panelId: latestPanel.panelId || latestPanel.id || '',
          channelId: latestPanel.channelId || '',
          title: latestPanel.title || 'Verify to access the server',
          description: latestPanel.description || 'Press the button below to complete verification.',
          buttonLabel: latestPanel.buttonLabel || '✅',
        });
      }
    } catch (loadError) {
      setError(loadError.message || 'Failed to load verification dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [guildId]);

  function selectPanel(panelId) {
    setSelectedPanelId(panelId);
    const selected = panels.find((item) => String(item.panelId || item.id) === String(panelId));

    if (!selected) {
      setPanel({ panelId: '', channelId: '', title: 'Verify to access the server', description: 'Press the button below to complete verification.', buttonLabel: '✅' });
      return;
    }

    setPanel({
      panelId: selected.panelId || selected.id || '',
      channelId: selected.channelId || '',
      title: selected.title || 'Verify to access the server',
      description: selected.description || 'Press the button below to complete verification.',
      buttonLabel: selected.buttonLabel || '✅',
    });
  }

  async function refreshDiscordResources() {
    if (!guildId) return;
    setSaving('resources');
    setError('');
    setNotice('');
    try {
      const resources = await api.request(`/api/discord/${guildId}/resources/sync`, { method: 'POST' });
      setRoles(normalizeList(resources, 'roles'));
      setChannels(normalizeList(resources, 'channels'));
      setNotice('Discord roles and channels refreshed from the shared resource cache.');
    } catch (syncError) {
      setError(syncError.message || 'Failed to refresh Discord resources.');
    } finally {
      setSaving('');
    }
  }

  async function toggleEnabled() {
    if (!guildId) return;
    setSaving('enabled');
    setError('');
    setNotice('');
    try {
      const nextEnabled = !(overview.enabled === true || config?.enabled === true);
      const result = await api.setVerificationEnabled(guildId, nextEnabled);
      setConfig(result.config || {});
      setOverview((current) => ({ ...current, enabled: nextEnabled }));
      setNotice(`Verification ${nextEnabled ? 'enabled' : 'disabled'}.`);
    } catch (saveError) {
      setError(saveError.message || 'Failed to update verification status.');
    } finally {
      setSaving('');
    }
  }

  async function saveSettings(nextSettings) {
    if (!guildId) return;
    const safeSettings = {
      ...nextSettings,
      verifiedRoleId: nextSettings.verifiedRoleId === guildId ? null : nextSettings.verifiedRoleId,
      unverifiedRoleId: nextSettings.unverifiedRoleId === guildId ? null : nextSettings.unverifiedRoleId,
    };
    const nextConfig = { ...(config || {}), settings: { ...settings, ...safeSettings } };
    setConfig(nextConfig);
    setSaving('settings');
    setError('');
    setNotice('');
    try {
      const result = await api.saveVerificationSettings(guildId, nextConfig.settings);
      setConfig(result.config || nextConfig);
      setNotice('Verification settings saved.');
    } catch (saveError) {
      setError(saveError.message || 'Failed to save verification settings.');
      load();
    } finally {
      setSaving('');
    }
  }

  async function deployOrRefreshPanel() {
    if (!guildId || !panel.channelId) {
      setError('Choose a channel before deploying the panel.');
      return;
    }
    setSaving('panel');
    setError('');
    setNotice('');
    try {
      const payload = { ...panel, panelId: selectedPanelId || panel.panelId || undefined };
      const result = selectedPanelId
        ? await api.refreshVerificationPanel(guildId, selectedPanelId, payload)
        : await api.deployVerificationPanel(guildId, payload);
      const nextPanel = result.panel || {};
      setSelectedPanelId(nextPanel.panelId || nextPanel.id || selectedPanelId);
      setPanel({
        panelId: nextPanel.panelId || nextPanel.id || '',
        channelId: nextPanel.channelId || payload.channelId,
        title: nextPanel.title || payload.title,
        description: nextPanel.description || payload.description,
        buttonLabel: nextPanel.buttonLabel || payload.buttonLabel,
      });
      setNotice(selectedPanelId ? 'Verification panel refreshed.' : 'Verification panel deployed.');
      await load();
    } catch (deployError) {
      setError(deployError.message || 'Failed to deploy or refresh verification panel.');
    } finally {
      setSaving('');
    }
  }

  if (!guildId) {
    return <div style={{ ...cardStyle, padding: 24 }}>Select a server from the navbar to manage verification.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{ ...cardStyle, padding: 24, background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.08) 46%, rgba(52,211,153,0.14))' }}>
        <p style={{ margin: '0 0 8px', color: '#93c5fd', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Goliath Protection</p>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: '-0.04em' }}>Verification</h1>
        <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 840 }}>Configure member verification, role assignment and refresh existing verification panels from one dashboard page.</p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
        <StatCard theme={theme} label="Status" value={overview.enabled || config?.enabled ? 'Enabled' : 'Disabled'} hint={loading ? 'Loading...' : 'Saved to guild JSON'} />
        <StatCard theme={theme} label="Panels" value={overview.panelCount ?? panels.length} hint="Configured panels" />
        <StatCard theme={theme} label="Verified Role" value={roleName(roles, overview.verifiedRoleId || settings.verifiedRoleId)} hint="Assigned on verify" />
        <StatCard theme={theme} label="Discord Roles" value={usableRoles.length} hint="Resource cache" />
      </section>

      {(error || notice) ? <section style={{ ...cardStyle, padding: 16, color: error ? '#fca5a5' : '#86efac', fontWeight: 850 }}>{error || notice}</section> : null}

      <section style={{ ...cardStyle, padding: 22, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>Status Overview</h2>
            <p style={{ margin: '6px 0 0', color: theme.mutedText }}>Turn verification on or off without touching other module data.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={refreshDiscordResources} disabled={saving === 'resources'} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(52,211,153,0.16)', color: theme.cardText, borderRadius: 14, padding: '11px 14px', fontWeight: 950, cursor: 'pointer' }}>{saving === 'resources' ? 'Refreshing...' : 'Refresh Roles'}</button>
            <button type="button" onClick={toggleEnabled} disabled={saving === 'enabled'} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(37,99,235,0.22)', color: theme.cardText, borderRadius: 14, padding: '11px 14px', fontWeight: 950, cursor: 'pointer' }}>{saving === 'enabled' ? 'Saving...' : overview.enabled || config?.enabled ? 'Disable' : 'Enable'}</button>
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 22, display: 'grid', gap: 16 }}>
        <h2 style={{ margin: 0 }}>Role Picker</h2>
        <p style={{ margin: 0, color: theme.mutedText }}>Only real Discord roles are shown. @everyone is ignored because it cannot be added or removed.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 14 }}>
          <RoleSelect theme={theme} resources={usableRoles} value={settings.verifiedRoleId || ''} onChange={(value) => saveSettings({ verifiedRoleId: value || null })} label="Verified Role" placeholder="No verified role" disabled={usableRoles.length === 0} />
          <RoleSelect theme={theme} resources={usableRoles} value={settings.unverifiedRoleId || ''} onChange={(value) => saveSettings({ unverifiedRoleId: value || null })} label="Unverified Role" placeholder="No unverified role" disabled={usableRoles.length === 0} />
        </div>
        {saving === 'settings' ? <div style={{ color: theme.mutedText, fontSize: 13 }}>Saving role settings...</div> : null}
      </section>

      <section style={{ ...cardStyle, padding: 22, display: 'grid', gap: 16 }}>
        <h2 style={{ margin: 0 }}>Panel Editor</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 14 }}>
          <PanelSelect theme={theme} panels={panels} value={selectedPanelId} onChange={selectPanel} />
          <ChannelSelect theme={theme} resources={channels} value={panel.channelId} onChange={(value) => setPanel((current) => ({ ...current, channelId: value }))} label="Channel" disabled={channels.length === 0} />
          <TextField theme={theme} label="Panel Title" value={panel.title} onChange={(value) => setPanel((current) => ({ ...current, title: value }))} />
          <TextField theme={theme} label="Button Label" value={panel.buttonLabel} onChange={(value) => setPanel((current) => ({ ...current, buttonLabel: value }))} />
        </div>
        <TextField theme={theme} label="Description" value={panel.description} onChange={(value) => setPanel((current) => ({ ...current, description: value }))} />
        <button type="button" onClick={deployOrRefreshPanel} disabled={saving === 'panel'} style={{ justifySelf: 'start', border: `1px solid ${theme.cardBorder}`, background: 'rgba(22,163,74,0.22)', color: theme.cardText, borderRadius: 14, padding: '11px 14px', fontWeight: 950, cursor: 'pointer' }}>{saving === 'panel' ? 'Saving...' : selectedPanelId ? 'Refresh Existing Panel' : 'Deploy New Verification Panel'}</button>
      </section>

      <section style={{ ...cardStyle, padding: 22 }}>
        <h2 style={{ margin: 0 }}>Analytics</h2>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12 }}>
          <StatCard theme={theme} label="Total Verified" value={analytics.totalVerified ?? analytics.verified ?? 0} />
          <StatCard theme={theme} label="Failed Attempts" value={analytics.failedAttempts ?? analytics.failed ?? 0} />
          <StatCard theme={theme} label="Recent" value={analytics.recentVerifications ?? analytics.recent ?? 0} />
        </div>
      </section>
    </div>
  );
}
