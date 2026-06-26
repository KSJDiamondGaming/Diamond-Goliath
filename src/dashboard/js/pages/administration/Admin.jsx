import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient';
import PageShell, { EmptyState, LoadingPanel, Notice, PrimaryButton, SectionCard, StatGrid, SummaryStat } from '../../shared/PageShell';
import { PAGE_LAYOUTS } from '../../ui/layout';
import { createSharedComponentStyles } from '../../ui/components';

const LOG_CHANNELS = [
  ['admin', '👑 Admin Log', 'Admin panel actions, setting changes and server configuration updates.'],
  ['moderation', '📌 Mod Log', 'Warns, mutes, kicks, bans, purges and case updates.'],
  ['automod', '🤖 AutoMod Log', 'Blocked links, spam actions, warnings and AutoMod triggers.'],
  ['member', '👥 Member Log', 'Member joins, leaves, kicks, bans and account tracking.'],
  ['general', '📋 General Logs', 'General server activity, roles, channels and message events.'],
];

const MODULE_CONTROLS = [
  ['welcome', '👋 Welcome Messages'],
  ['sticky-messages', '📌 Sticky Messages'],
  ['embed-studio', '🎨 Embed Studio'],
  ['tickets', '🎟️ Tickets'],
  ['forms', '📝 Forms'],
  ['translation', '🌍 Translation'],
  ['verification', '✅ Verification'],
  ['auto-roles', '🎭 Auto Roles'],
  ['giveaways', '🎉 Giveaways'],
  ['starboard', '⭐ Starboard'],
  ['temp-voice', '🎙️ Temp Voice'],
  ['polls', '📊 Polls'],
  ['stats', '📈 Stats'],
];

const PERMISSIONS = [
  ['view', 'View'],
  ['edit', 'Edit'],
  ['deploy', 'Deploy'],
  ['delete', 'Delete'],
  ['sync', 'Sync'],
  ['admin', 'Admin'],
];

function getGuildId(selectedGuild) {
  if (!selectedGuild) return '';
  if (typeof selectedGuild === 'string') return selectedGuild;
  return selectedGuild.id || selectedGuild.guildId || '';
}

function normalizeArray(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeLogs(config = {}) {
  return {
    enabled: config.enabled !== false,
    channels: { admin: null, moderation: null, automod: null, member: null, general: null, ...(config.channels || {}) },
    events: { ...(config.events || {}) },
  };
}

function normalizeModules(payload = {}) {
  if (Array.isArray(payload)) return payload.reduce((acc, item) => ({ ...acc, [item.key || item.id || item.name]: item.enabled !== false }), {});
  const source = payload.modules || payload || {};
  return Object.entries(source).reduce((acc, [key, value]) => ({ ...acc, [key]: typeof value === 'boolean' ? value : value?.enabled !== false }), {});
}

function defaultPermissions() {
  return { enabled: true, syncDiscordRoles: false, managerRoleIds: [], roleAccess: {}, moduleAccess: {} };
}

function normalizeGeneral(config = {}) {
  return { ...config, dashboardPermissions: { ...defaultPermissions(), ...(config.dashboardPermissions || {}) } };
}

function input(theme) {
  return { width: '100%', border: `1px solid ${theme.inputBorder || theme.cardBorder}`, background: theme.inputBg || 'rgba(10,18,35,0.96)', color: theme.inputText || theme.cardText, borderRadius: 12, padding: '10px 12px', outline: 'none', fontWeight: 800, minWidth: 0 };
}

function button(theme, tone = 'primary', disabled = false) {
  const tones = { primary: ['rgba(59,130,246,0.16)', 'rgba(59,130,246,0.35)', '#bfdbfe'], success: ['rgba(34,197,94,0.13)', 'rgba(34,197,94,0.32)', '#86efac'], danger: ['rgba(239,68,68,0.13)', 'rgba(239,68,68,0.32)', '#fca5a5'], soft: ['rgba(148,163,184,0.10)', theme.cardBorder, theme.cardText] };
  const [background, border, color] = tones[tone] || tones.primary;
  return { border: `1px solid ${border}`, background, color, borderRadius: 12, padding: '10px 12px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, fontWeight: 950 };
}

function Field({ theme, label, children }) {
  return <label style={{ display: 'grid', gap: 7, minWidth: 0 }}><span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>{children}</label>;
}

function ToggleRow({ theme, title, description, enabled, onClick, disabled }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.18)', borderRadius: 14, padding: 12 }}><div style={{ minWidth: 0 }}><strong>{title}</strong>{description ? <div style={{ color: theme.mutedText, fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>{description}</div> : null}</div><button type="button" disabled={disabled} onClick={onClick} style={button(theme, enabled ? 'success' : 'soft', disabled)}>{enabled ? 'Enabled' : 'Disabled'}</button></div>;
}

function PermissionCheckbox({ theme, checked, label, onChange }) {
  return <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${checked ? 'rgba(34,197,94,0.35)' : theme.cardBorder}`, background: checked ? 'rgba(34,197,94,0.10)' : 'rgba(15,23,42,0.22)', borderRadius: 999, padding: '7px 10px', color: checked ? '#86efac' : theme.mutedText, fontWeight: 900, fontSize: 12 }}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

export default function Admin({ selectedGuild, theme }) {
  const styles = useMemo(() => createSharedComponentStyles(theme), [theme]);
  const guildId = getGuildId(selectedGuild);
  const page = PAGE_LAYOUTS.admin || { title: 'Admin', emptyDescription: 'Select a server to manage admin settings.' };

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);
  const [logs, setLogs] = useState(normalizeLogs());
  const [modules, setModules] = useState({});
  const [autoRoles, setAutoRoles] = useState({ enabled: false, roleIds: [] });
  const [general, setGeneral] = useState(normalizeGeneral());
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [joinRoleId, setJoinRoleId] = useState('');

  const permissions = general.dashboardPermissions || defaultPermissions();
  const selectedRole = roles.find((role) => role.id === selectedRoleId);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!guildId) return;
      try {
        setLoading(true); setError(''); setNotice('');
        const [channelsRes, rolesRes, logsRes, modulesRes, autoRolesRes, generalRes] = await Promise.all([
          api.getGuildChannels(guildId).catch(() => []),
          api.getGuildRoles(guildId).catch(() => []),
          api.getLogConfig(guildId).catch(() => ({})),
          api.getGuildModules(guildId).catch(() => ({})),
          api.getAutoRoles(guildId).catch(() => ({})),
          api.getGeneralSettings(guildId).catch(() => ({})),
        ]);
        if (!mounted) return;
        const nextRoles = normalizeArray(rolesRes, 'roles');
        setChannels(normalizeArray(channelsRes, 'channels'));
        setRoles(nextRoles);
        setLogs(normalizeLogs(logsRes?.config || logsRes || {}));
        setModules(normalizeModules(modulesRes));
        setAutoRoles({ enabled: Boolean(autoRolesRes?.enabled || autoRolesRes?.config?.enabled), roleIds: autoRolesRes?.roleIds || autoRolesRes?.config?.roleIds || autoRolesRes?.joinRoleIds || [] });
        setGeneral(normalizeGeneral(generalRes?.config || generalRes || {}));
        setSelectedRoleId(nextRoles[0]?.id || '');
      } catch (err) {
        console.error(err); if (mounted) setError('Failed to load admin controls.');
      } finally { if (mounted) setLoading(false); }
    }
    load();
    return () => { mounted = false; };
  }, [guildId]);

  function updatePermissions(updater) {
    setGeneral((current) => ({ ...current, dashboardPermissions: updater(current.dashboardPermissions || defaultPermissions()) }));
  }

  function setRolePermission(roleId, permission, enabled) {
    updatePermissions((current) => {
      const existing = new Set(current.roleAccess?.[roleId] || []);
      if (enabled) existing.add(permission); else existing.delete(permission);
      return { ...current, roleAccess: { ...(current.roleAccess || {}), [roleId]: [...existing] } };
    });
  }

  function setModulePermission(moduleKey, roleId, permission, enabled) {
    updatePermissions((current) => {
      const moduleAccess = { ...(current.moduleAccess || {}) };
      const perRole = { ...(moduleAccess[moduleKey] || {}) };
      const existing = new Set(perRole[roleId] || []);
      if (enabled) existing.add(permission); else existing.delete(permission);
      perRole[roleId] = [...existing];
      moduleAccess[moduleKey] = perRole;
      return { ...current, moduleAccess };
    });
  }

  async function savePermissionMatrix() {
    try {
      setSaving(true); setError('');
      const saved = await api.saveGeneralSettings(guildId, general);
      setGeneral(normalizeGeneral(saved?.config || general));
      setNotice('✅ Dashboard permission matrix saved. Discord sync is stored separately and can be applied later.');
    } catch (err) { console.error(err); setError('Failed to save permission matrix.'); }
    finally { setSaving(false); }
  }

  async function saveLogs() {
    try { setSaving(true); setError(''); const saved = await api.saveLogConfig(guildId, logs); setLogs(normalizeLogs(saved?.config || saved || logs)); setNotice('✅ Log channel controls saved.'); }
    catch (err) { console.error(err); setError('Failed to save log controls.'); }
    finally { setSaving(false); }
  }

  async function toggleModule(moduleKey) {
    const next = !modules[moduleKey];
    try { setModules((current) => ({ ...current, [moduleKey]: next })); await api.setGuildModuleEnabled(guildId, moduleKey, next); setNotice(`✅ ${moduleKey} ${next ? 'enabled' : 'disabled'}.`); }
    catch (err) { console.error(err); setModules((current) => ({ ...current, [moduleKey]: !next })); setError(`Failed to update ${moduleKey}.`); }
  }

  async function toggleAutoRoles() {
    const next = !autoRoles.enabled;
    try { setAutoRoles((current) => ({ ...current, enabled: next })); await api.setAutoRolesEnabled(guildId, next); setNotice(`✅ Auto roles ${next ? 'enabled' : 'disabled'}.`); }
    catch (err) { console.error(err); setAutoRoles((current) => ({ ...current, enabled: !next })); setError('Failed to update auto roles.'); }
  }

  async function addJoinRole() {
    if (!joinRoleId) return;
    try { await api.addJoinAutoRole(guildId, joinRoleId); setAutoRoles((current) => ({ ...current, roleIds: [...new Set([...(current.roleIds || []), joinRoleId])] })); setJoinRoleId(''); setNotice('✅ Join role added.'); }
    catch (err) { console.error(err); setError('Failed to add join role.'); }
  }

  async function removeJoinRole(roleId) {
    try { await api.removeJoinAutoRole(guildId, roleId); setAutoRoles((current) => ({ ...current, roleIds: (current.roleIds || []).filter((id) => id !== roleId) })); setNotice('✅ Join role removed.'); }
    catch (err) { console.error(err); setError('Failed to remove join role.'); }
  }

  async function runRecovery(createMissingChannels = false) {
    try { setSaving(true); setError(''); await api.runTicketRecovery(guildId, createMissingChannels); setNotice(createMissingChannels ? '✅ Ticket recovery ran and recreated missing channels.' : '✅ Ticket recovery scan completed.'); }
    catch (err) { console.error(err); setError('Ticket recovery failed.'); }
    finally { setSaving(false); }
  }

  function setLogChannel(type, channelId) {
    setLogs((current) => normalizeLogs({ ...current, channels: { ...current.channels, [type]: channelId || null } }));
  }

  const configuredLogCount = Object.values(logs.channels || {}).filter(Boolean).length;
  const enabledModuleCount = Object.values(modules || {}).filter(Boolean).length;

  return (
    <PageShell title={page.title} subtitle={selectedGuild ? 'Manage dashboard access, Discord roles, modules, logs and safety actions.' : page.emptyDescription} theme={theme}>
      {!selectedGuild ? <EmptyState theme={theme} text="Select a server to manage admin settings." /> : null}
      {selectedGuild ? <div style={{ ...styles.futurePage, gap: 18 }}>
        {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
        {notice ? <Notice theme={theme} tone="success">{notice}</Notice> : null}
        {loading ? <LoadingPanel theme={theme} text="Loading admin controls..." /> : null}
        {!loading ? <>
          <SectionCard theme={theme}>
            <div style={{ display: 'grid', gap: 18, padding: 'clamp(18px,2.6vw,24px)', border: `1px solid ${theme.primaryBorder || theme.cardBorder}`, borderRadius: 18, background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.10) 55%, rgba(168,85,247,0.14))' }}>
              <div><p style={{ margin: '0 0 8px', color: '#93c5fd', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 12 }}>Goliath Administration</p><h2 style={{ margin: 0, fontSize: 'clamp(24px,3vw,34px)' }}>🛠️ Server Control Panel</h2><p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6 }}>Control who can access dashboard areas, what each role can do per module, and which Discord permissions stay separate or sync later.</p></div>
              <StatGrid min="min(170px,100%)"><SummaryStat theme={theme} label="Channels" value={channels.length} accent="#60a5fa" description="Available Discord channels" /><SummaryStat theme={theme} label="Roles" value={roles.length} accent="#c084fc" description="Available Discord roles" /><SummaryStat theme={theme} label="Logs" value={`${configuredLogCount}/5`} accent="#34d399" description="Configured log channels" /><SummaryStat theme={theme} label="Modules" value={enabledModuleCount} accent="#facc15" description="Enabled modules" /></StatGrid>
            </div>
          </SectionCard>

          <SectionCard theme={theme} title="🔐 Dashboard Access Matrix" subtitle="Per-role and per-module access. Discord role permissions remain separate unless you choose to sync later.">
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 12 }}>
                <Field theme={theme} label="Role to configure"><select value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)} style={input(theme)}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>
                <ToggleRow theme={theme} title="Sync dashboard permissions to Discord roles" description="Stored now as a preference. The destructive Discord sync button will be added with confirmation in the next pass." enabled={permissions.syncDiscordRoles === true} onClick={() => updatePermissions((current) => ({ ...current, syncDiscordRoles: !current.syncDiscordRoles }))} />
              </div>

              {selectedRole ? <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 14, display: 'grid', gap: 12 }}>
                <strong>Global dashboard access for {selectedRole.name}</strong>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{PERMISSIONS.map(([key, label]) => <PermissionCheckbox key={key} theme={theme} label={label} checked={(permissions.roleAccess?.[selectedRole.id] || []).includes(key)} onChange={(checked) => setRolePermission(selectedRole.id, key, checked)} />)}</div>
              </div> : null}

              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gap: 8, minWidth: 680 }}>
                  {MODULE_CONTROLS.map(([moduleKey, label]) => <div key={moduleKey} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12, display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12, alignItems: 'center' }}><strong>{label}</strong><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{PERMISSIONS.slice(0, 5).map(([key, permLabel]) => <PermissionCheckbox key={key} theme={theme} label={permLabel} checked={(permissions.moduleAccess?.[moduleKey]?.[selectedRoleId] || []).includes(key)} onChange={(checked) => setModulePermission(moduleKey, selectedRoleId, key, checked)} />)}</div></div>)}
                </div>
              </div>

              <PrimaryButton onClick={savePermissionMatrix} disabled={saving}>{saving ? 'Saving...' : 'Save Permission Matrix'}</PrimaryButton>
            </div>
          </SectionCard>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))', gap: 16 }}>
            <SectionCard theme={theme} title="📋 Log Channel Controls" subtitle="Set the same log channels exposed in the Discord admin panel."><div style={{ display: 'grid', gap: 12 }}>{LOG_CHANNELS.map(([key, label, description]) => <Field key={key} theme={theme} label={label}><select value={logs.channels?.[key] || ''} onChange={(event) => setLogChannel(key, event.target.value)} style={input(theme)}><option value="">Not set</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select><span style={{ color: theme.mutedText, fontSize: 12 }}>{description}</span></Field>)}<PrimaryButton onClick={saveLogs} disabled={saving}>{saving ? 'Saving...' : 'Save Log Channels'}</PrimaryButton></div></SectionCard>
            <SectionCard theme={theme} title="🧩 Module Controls" subtitle="Enable or disable core systems."><div style={{ display: 'grid', gap: 10 }}>{MODULE_CONTROLS.slice(2).map(([key, label]) => <ToggleRow key={key} theme={theme} title={label} enabled={Boolean(modules[key])} onClick={() => toggleModule(key)} />)}</div></SectionCard>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))', gap: 16 }}>
            <SectionCard theme={theme} title="🎭 Join Roles" subtitle="Enable auto roles and manage join roles."><div style={{ display: 'grid', gap: 12 }}><ToggleRow theme={theme} title="Auto Roles" description="Automatically apply selected roles when members join." enabled={autoRoles.enabled} onClick={toggleAutoRoles} /><Field theme={theme} label="Add Join Role"><div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}><select value={joinRoleId} onChange={(event) => setJoinRoleId(event.target.value)} style={input(theme)}><option value="">Select role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><button type="button" onClick={addJoinRole} disabled={!joinRoleId} style={button(theme, 'success', !joinRoleId)}>Add</button></div></Field>{(autoRoles.roleIds || []).length ? autoRoles.roleIds.map((roleId) => { const role = roles.find((item) => item.id === roleId); return <div key={roleId} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 10 }}><strong>{role?.name || roleId}</strong><button type="button" onClick={() => removeJoinRole(roleId)} style={button(theme, 'danger')}>Remove</button></div>; }) : <div style={{ color: theme.mutedText }}>No join roles configured.</div>}</div></SectionCard>
            <SectionCard theme={theme} title="🧱 Safety & Recovery Controls" subtitle="Protected operational controls."><div style={{ display: 'grid', gap: 12 }}><button type="button" onClick={() => runRecovery(false)} style={button(theme, 'primary', saving)}>Scan Ticket Recovery</button><button type="button" onClick={() => runRecovery(true)} style={button(theme, 'success', saving)}>Recreate Ticket Channels</button><button type="button" disabled style={button(theme, 'soft', true)}>Create Server Backup</button><button type="button" disabled style={button(theme, 'danger', true)}>Request Restore</button></div></SectionCard>
          </div>
        </> : null}
      </div> : null}
    </PageShell>
  );
}
