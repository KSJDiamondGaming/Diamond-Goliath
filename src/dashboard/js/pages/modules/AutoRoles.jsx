import React, { useEffect, useMemo, useState } from 'react';

import EmptyState from '../../shared/EmptyState.jsx';
import { api } from '../../services/apiClient.js';
import { RoleSelect } from '../../ui/DiscordResourceSelects.jsx';

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

function RoleList({ theme, title, roles, selectedRoles, onRemove, removingRole, type = 'join' }) {
  return (
    <section style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.28)', borderRadius: 18, padding: 16, display: 'grid', gap: 12 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {selectedRoles.length === 0 ? (
        <EmptyState
          theme={theme}
          icon={type === 'bot' ? '🤖' : '👥'}
          title={type === 'bot' ? 'No bot roles configured' : 'No join roles configured'}
          description={type === 'bot' ? 'Add roles here when bots should receive automatic roles on join.' : 'Add roles here when new members should receive automatic roles on join.'}
        />
      ) : selectedRoles.map((roleId) => (
        <div key={roleId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: '10px 12px' }}>
          <span style={{ fontWeight: 900 }}>{roleName(roles, roleId)}</span>
          <button type="button" onClick={() => onRemove(roleId)} disabled={removingRole === roleId} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(239,68,68,0.16)', color: '#fecaca', borderRadius: 12, padding: '8px 10px', fontWeight: 900, cursor: 'pointer' }}>{removingRole === roleId ? 'Removing...' : 'Remove'}</button>
        </div>
      ))}
    </section>
  );
}

export default function AutoRoles({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [config, setConfig] = useState(null);
  const [overview, setOverview] = useState({});
  const [roles, setRoles] = useState([]);
  const [joinRoleId, setJoinRoleId] = useState('');
  const [botRoleId, setBotRoleId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');
  const [removingRole, setRemovingRole] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const settings = config?.settings || {};
  const joinRoles = config?.joinRoles || [];
  const botRoles = config?.botRoles || [];
  const analytics = overview.analytics || config?.analytics || {};

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

  async function load() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const [autoRoles, roleList] = await Promise.all([
        api.getAutoRoles(guildId),
        loadRoles(),
      ]);
      setConfig(autoRoles.config || {});
      setOverview(autoRoles.overview || {});
      setRoles(roleList);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load auto roles dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [guildId]);

  async function refreshDiscordResources() {
    if (!guildId) return;
    setSaving('resources');
    setError('');
    setNotice('');
    try {
      const resources = await api.request(`/api/discord/${guildId}/resources/sync`, { method: 'POST' });
      setRoles(normalizeList(resources, 'roles'));
      setNotice('Discord roles refreshed from the shared resource cache.');
    } catch (syncError) {
      setError(syncError.message || 'Failed to refresh Discord roles.');
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
      const result = await api.setAutoRolesEnabled(guildId, nextEnabled);
      setConfig(result.config || {});
      setOverview((current) => ({ ...current, enabled: nextEnabled }));
      setNotice(`Auto Roles ${nextEnabled ? 'enabled' : 'disabled'}.`);
    } catch (saveError) {
      setError(saveError.message || 'Failed to update Auto Roles status.');
    } finally {
      setSaving('');
    }
  }

  async function setApplyToBots(applyToBots) {
    if (!guildId) return;
    const nextSettings = { ...settings, applyToBots };
    setConfig((current) => ({ ...(current || {}), settings: nextSettings }));
    setSaving('settings');
    setError('');
    setNotice('');
    try {
      const result = await api.saveAutoRolesSettings(guildId, nextSettings);
      setConfig(result.config || { ...(config || {}), settings: nextSettings });
      setNotice('Auto Roles settings saved.');
    } catch (saveError) {
      setError(saveError.message || 'Failed to save Auto Roles settings.');
      load();
    } finally {
      setSaving('');
    }
  }

  async function addRole(type) {
    const roleId = type === 'bot' ? botRoleId : joinRoleId;
    if (!guildId || !roleId) return;
    setSaving(type);
    setError('');
    setNotice('');
    try {
      const result = type === 'bot'
        ? await api.addBotAutoRole(guildId, roleId)
        : await api.addJoinAutoRole(guildId, roleId);
      setConfig(result.config || result.section || config);
      if (type === 'bot') setBotRoleId('');
      if (type === 'join') setJoinRoleId('');
      setNotice(`${type === 'bot' ? 'Bot' : 'Join'} role added.`);
      await load();
    } catch (saveError) {
      setError(saveError.message || 'Failed to add role.');
    } finally {
      setSaving('');
    }
  }

  async function removeRole(type, roleId) {
    if (!guildId || !roleId) return;
    setRemovingRole(roleId);
    setError('');
    setNotice('');
    try {
      const result = type === 'bot'
        ? await api.removeBotAutoRole(guildId, roleId)
        : await api.removeJoinAutoRole(guildId, roleId);
      setConfig(result.config || config);
      setNotice(`${type === 'bot' ? 'Bot' : 'Join'} role removed.`);
      await load();
    } catch (saveError) {
      setError(saveError.message || 'Failed to remove role.');
    } finally {
      setRemovingRole('');
    }
  }

  if (!guildId) {
    return <EmptyState theme={theme} icon="👥" title="Select a server" description="Select a server from the navbar to manage Auto Roles." />;
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{ ...cardStyle, padding: 24, background: 'linear-gradient(135deg, rgba(52,211,153,0.18), rgba(15,23,42,0.08) 46%, rgba(59,130,246,0.14))' }}>
        <p style={{ margin: '0 0 8px', color: '#86efac', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Goliath Automation</p>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: '-0.04em' }}>Auto Roles</h1>
        <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 840 }}>Assign join roles and bot roles automatically, then track assignment analytics from one dashboard page.</p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
        <StatCard theme={theme} label="Status" value={overview.enabled || config?.enabled ? 'Enabled' : 'Disabled'} hint={loading ? 'Loading...' : 'Saved to guild JSON'} />
        <StatCard theme={theme} label="Join Roles" value={overview.joinRoleCount ?? joinRoles.length} hint="Members" />
        <StatCard theme={theme} label="Bot Roles" value={overview.botRoleCount ?? botRoles.length} hint="Bots" />
        <StatCard theme={theme} label="Available Roles" value={roles.length} hint="Discord cache" />
      </section>

      {(error || notice) ? <section style={{ ...cardStyle, padding: 16, color: error ? '#fca5a5' : '#86efac', fontWeight: 850 }}>{error || notice}</section> : null}

      <section style={{ ...cardStyle, padding: 22, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>Module Status</h2>
            <p style={{ margin: '6px 0 0', color: theme.mutedText }}>Turn Auto Roles on or off while preserving role configuration.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={refreshDiscordResources} disabled={saving === 'resources'} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(52,211,153,0.16)', color: theme.cardText, borderRadius: 14, padding: '11px 14px', fontWeight: 950, cursor: 'pointer' }}>{saving === 'resources' ? 'Refreshing...' : 'Refresh Roles'}</button>
            <button type="button" onClick={toggleEnabled} disabled={saving === 'enabled'} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(37,99,235,0.22)', color: theme.cardText, borderRadius: 14, padding: '11px 14px', fontWeight: 950, cursor: 'pointer' }}>{saving === 'enabled' ? 'Saving...' : overview.enabled || config?.enabled ? 'Disable' : 'Enable'}</button>
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 22, display: 'grid', gap: 16 }}>
        <h2 style={{ margin: 0 }}>Join Roles</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'end' }}>
          <RoleSelect theme={theme} resources={roles} value={joinRoleId} onChange={setJoinRoleId} label="Add Join Role" disabled={roles.length === 0} />
          <button type="button" onClick={() => addRole('join')} disabled={saving === 'join' || !joinRoleId} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(22,163,74,0.22)', color: theme.cardText, borderRadius: 14, padding: '12px 14px', fontWeight: 950, cursor: 'pointer' }}>{saving === 'join' ? 'Adding...' : 'Add'}</button>
        </div>
        <RoleList theme={theme} title="Current Join Roles" roles={roles} selectedRoles={joinRoles} removingRole={removingRole} onRemove={(roleId) => removeRole('join', roleId)} type="join" />
      </section>

      <section style={{ ...cardStyle, padding: 22, display: 'grid', gap: 16 }}>
        <h2 style={{ margin: 0 }}>Bot Roles</h2>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: theme.mutedText, fontWeight: 850 }}>
          <input type="checkbox" checked={settings.applyToBots === true} onChange={(event) => setApplyToBots(event.target.checked)} /> Apply configured roles to bots when they join
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'end' }}>
          <RoleSelect theme={theme} resources={roles} value={botRoleId} onChange={setBotRoleId} label="Add Bot Role" disabled={roles.length === 0} />
          <button type="button" onClick={() => addRole('bot')} disabled={saving === 'bot' || !botRoleId} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(22,163,74,0.22)', color: theme.cardText, borderRadius: 14, padding: '12px 14px', fontWeight: 950, cursor: 'pointer' }}>{saving === 'bot' ? 'Adding...' : 'Add'}</button>
        </div>
        <RoleList theme={theme} title="Current Bot Roles" roles={roles} selectedRoles={botRoles} removingRole={removingRole} onRemove={(roleId) => removeRole('bot', roleId)} type="bot" />
      </section>

      <section style={{ ...cardStyle, padding: 22 }}>
        <h2 style={{ margin: 0 }}>Analytics</h2>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12 }}>
          <StatCard theme={theme} label="Total Assigned" value={analytics.totalAssigned ?? analytics.assignments ?? 0} />
          <StatCard theme={theme} label="Join Assignments" value={analytics.joinAssignments ?? 0} />
          <StatCard theme={theme} label="Bot Assignments" value={analytics.botAssignments ?? 0} />
        </div>
      </section>
    </div>
  );
}
