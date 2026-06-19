import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient.js';

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

function SelectField({ theme, label, value, onChange, children }) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <select value={value || ''} onChange={(event) => onChange(event.target.value)} style={{ width: '100%', border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.55)', color: theme.cardText, borderRadius: 14, padding: '12px 14px', fontWeight: 800 }}>
        {children}
      </select>
    </label>
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

export default function Verification({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [config, setConfig] = useState(null);
  const [overview, setOverview] = useState({});
  const [roles, setRoles] = useState([]);
  const [channels, setChannels] = useState([]);
  const [panel, setPanel] = useState({ channelId: '', title: 'Verify to access the server', description: 'Press the button below to complete verification.', buttonLabel: 'Verify' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const settings = config?.settings || {};
  const panels = Object.values(config?.panels || {});
  const analytics = overview.analytics || config?.analytics || {};

  const cardStyle = useMemo(() => ({
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 22,
    boxShadow: theme.shadow,
  }), [theme]);

  async function load() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const [verification, rolePayload, channelPayload] = await Promise.all([
        api.getVerification(guildId),
        api.getGuildRoles(guildId),
        api.getGuildChannels(guildId),
      ]);
      setConfig(verification.config || {});
      setOverview(verification.overview || {});
      setRoles(normalizeList(rolePayload, 'roles'));
      setChannels(normalizeList(channelPayload, 'channels'));
    } catch (loadError) {
      setError(loadError.message || 'Failed to load verification dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [guildId]);

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
    const nextConfig = { ...(config || {}), settings: { ...settings, ...nextSettings } };
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

  async function deployPanel() {
    if (!guildId || !panel.channelId) {
      setError('Choose a channel before deploying the panel.');
      return;
    }
    setSaving('panel');
    setError('');
    setNotice('');
    try {
      const result = await api.deployVerificationPanel(guildId, panel);
      setNotice(`Verification panel deployed${result.panel?.messageId ? `: ${result.panel.messageId}` : '.'}`);
      await load();
    } catch (deployError) {
      setError(deployError.message || 'Failed to deploy verification panel.');
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
        <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 840 }}>Configure member verification, role assignment and deploy the verification panel for this guild.</p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
        <StatCard theme={theme} label="Status" value={overview.enabled || config?.enabled ? 'Enabled' : 'Disabled'} hint={loading ? 'Loading...' : 'Saved to guild JSON'} />
        <StatCard theme={theme} label="Panels" value={overview.panelCount ?? panels.length} hint="Configured panels" />
        <StatCard theme={theme} label="Verified Role" value={roleName(roles, overview.verifiedRoleId || settings.verifiedRoleId)} hint="Assigned on verify" />
        <StatCard theme={theme} label="Verifications" value={analytics.totalVerified ?? analytics.verified ?? 0} hint="Analytics counter" />
      </section>

      {(error || notice) ? <section style={{ ...cardStyle, padding: 16, color: error ? '#fca5a5' : '#86efac', fontWeight: 850 }}>{error || notice}</section> : null}

      <section style={{ ...cardStyle, padding: 22, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>Status Overview</h2>
            <p style={{ margin: '6px 0 0', color: theme.mutedText }}>Turn verification on or off without touching other module data.</p>
          </div>
          <button type="button" onClick={toggleEnabled} disabled={saving === 'enabled'} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(37,99,235,0.22)', color: theme.cardText, borderRadius: 14, padding: '11px 14px', fontWeight: 950, cursor: 'pointer' }}>{saving === 'enabled' ? 'Saving...' : overview.enabled || config?.enabled ? 'Disable' : 'Enable'}</button>
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 22, display: 'grid', gap: 16 }}>
        <h2 style={{ margin: 0 }}>Role Picker</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 14 }}>
          <SelectField theme={theme} label="Verified Role" value={settings.verifiedRoleId || ''} onChange={(value) => saveSettings({ verifiedRoleId: value || null })}>
            <option value="">No verified role</option>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </SelectField>
          <SelectField theme={theme} label="Unverified Role" value={settings.unverifiedRoleId || ''} onChange={(value) => saveSettings({ unverifiedRoleId: value || null })}>
            <option value="">No unverified role</option>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </SelectField>
        </div>
        {saving === 'settings' ? <div style={{ color: theme.mutedText, fontSize: 13 }}>Saving role settings...</div> : null}
      </section>

      <section style={{ ...cardStyle, padding: 22, display: 'grid', gap: 16 }}>
        <h2 style={{ margin: 0 }}>Deploy Panel</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 14 }}>
          <SelectField theme={theme} label="Channel" value={panel.channelId} onChange={(value) => setPanel((current) => ({ ...current, channelId: value }))}>
            <option value="">Choose a channel</option>
            {channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name || channel.id}</option>)}
          </SelectField>
          <TextField theme={theme} label="Panel Title" value={panel.title} onChange={(value) => setPanel((current) => ({ ...current, title: value }))} />
          <TextField theme={theme} label="Button Label" value={panel.buttonLabel} onChange={(value) => setPanel((current) => ({ ...current, buttonLabel: value }))} />
        </div>
        <TextField theme={theme} label="Description" value={panel.description} onChange={(value) => setPanel((current) => ({ ...current, description: value }))} />
        <button type="button" onClick={deployPanel} disabled={saving === 'panel'} style={{ justifySelf: 'start', border: `1px solid ${theme.cardBorder}`, background: 'rgba(22,163,74,0.22)', color: theme.cardText, borderRadius: 14, padding: '11px 14px', fontWeight: 950, cursor: 'pointer' }}>{saving === 'panel' ? 'Deploying...' : 'Deploy Verification Panel'}</button>
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
