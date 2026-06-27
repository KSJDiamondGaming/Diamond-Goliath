import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient';
import PageShell, { EmptyState, LoadingPanel, Notice, PrimaryButton, SectionCard, StatGrid, SummaryStat } from '../../shared/PageShell';
import { PAGE_LAYOUTS } from '../../ui/layout';
import { createSharedComponentStyles } from '../../ui/components';

const DASHBOARD_CONTROLS = [
  ['overview', '📊 Overview'],
  ['admin', '🛠️ Admin'],
  ['automod', '🤖 AutoMod'],
  ['general-settings', '⚙️ General Settings'],
  ['moderation', '🛡️ Moderation'],
  ['cases', '📁 Cases'],
  ['warnings', '⚠️ Warnings'],
  ['modules', '🧩 Modules'],
  ['logs', '📋 Logs'],
  ['security', '🔐 Security'],
  ['restore', '♻️ Restore'],
  ['welcome', '👋 Welcome Messages'],
  ['sticky-messages', '📌 Sticky Messages'],
  ['embed-studio', '🎨 Embed Studio'],
  ['tickets', '🎟️ Tickets'],
  ['forms', '📝 Forms'],
  ['translation', '🌍 Translation'],
  ['verification', '✅ Verification'],
  ['auto-roles', '🎭 Auto Roles'],
  ['reaction-roles', '🔁 Reaction Roles'],
  ['giveaways', '🎉 Giveaways'],
  ['starboard', '⭐ Starboard'],
  ['temp-voice', '🎙️ Temp Voice'],
  ['polls', '📊 Polls'],
  ['stats', '📈 Stats'],
];

const DISCORD_CONTROLS = [
  ['slash-commands', '⌨️ Slash Commands'],
  ['moderation-commands', '🛡️ Moderation Commands'],
  ['ticket-commands', '🎟️ Ticket Commands'],
  ['form-commands', '📝 Form Commands'],
  ['security-commands', '🔐 Security Commands'],
  ['role-sync', '🎭 Role Creation & Sync'],
  ['channel-permissions', '📺 Channel Permissions'],
  ['module-permissions', '🧩 Module Discord Permissions'],
  ['backup-restore-commands', '♻️ Backup / Restore Commands'],
];

const DASHBOARD_ACTIONS = [
  ['view', 'View'],
  ['edit', 'Edit'],
  ['configure', 'Configure'],
  ['deploy', 'Deploy'],
  ['delete', 'Delete'],
  ['manage', 'Manage'],
];

const DISCORD_ACTIONS = [
  ['use', 'Use'],
  ['manage', 'Manage'],
  ['sync', 'Sync'],
  ['create', 'Create'],
  ['admin', 'Advanced'],
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

function defaultPermissions() {
  return { enabled: true, syncDiscordRoles: false, managerRoleIds: [], roleAccess: {}, moduleAccess: {}, discordAccess: {} };
}

function normalizeGeneral(config = {}) {
  return { ...config, dashboardPermissions: { ...defaultPermissions(), ...(config.dashboardPermissions || {}), syncDiscordRoles: false } };
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

function PermissionCheckbox({ theme, checked, label, onChange }) {
  return <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${checked ? 'rgba(34,197,94,0.35)' : theme.cardBorder}`, background: checked ? 'rgba(34,197,94,0.10)' : 'rgba(15,23,42,0.22)', borderRadius: 999, padding: '7px 10px', color: checked ? '#86efac' : theme.mutedText, fontWeight: 900, fontSize: 12 }}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function roleName(roles, roleId) {
  return roles.find((role) => role.id === roleId)?.name || roleId;
}

export default function Admin({ selectedGuild, theme }) {
  const styles = useMemo(() => createSharedComponentStyles(theme), [theme]);
  const guildId = getGuildId(selectedGuild);
  const page = PAGE_LAYOUTS.admin || { title: 'Admin', emptyDescription: 'Select a server to manage admin settings.' };

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [roles, setRoles] = useState([]);
  const [general, setGeneral] = useState(normalizeGeneral());
  const [dashboardRoleId, setDashboardRoleId] = useState('');
  const [discordRoleId, setDiscordRoleId] = useState('');
  const [managerRoleId, setManagerRoleId] = useState('');
  const [newRoleName, setNewRoleName] = useState('Goliath Dashboard Access');
  const [newRoleColor, setNewRoleColor] = useState('#3b82f6');
  const [openSections, setOpenSections] = useState({ dashboard: true, discord: false });

  const permissions = general.dashboardPermissions || defaultPermissions();
  const managerRoleIds = permissions.managerRoleIds || [];
  const configuredDashboardCount = Object.keys(permissions.moduleAccess || {}).filter((controlKey) => Object.values(permissions.moduleAccess?.[controlKey] || {}).some((items) => items?.length)).length;
  const configuredDiscordCount = Object.keys(permissions.discordAccess || {}).filter((controlKey) => Object.values(permissions.discordAccess?.[controlKey] || {}).some((items) => items?.length)).length;

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!guildId) return;
      try {
        setLoading(true); setError(''); setNotice('');
        const [rolesRes, generalRes] = await Promise.all([
          api.getGuildRoles(guildId).catch(() => []),
          api.getGeneralSettings(guildId).catch(() => ({})),
        ]);
        if (!mounted) return;
        const nextRoles = normalizeArray(rolesRes, 'roles');
        setRoles(nextRoles);
        setGeneral(normalizeGeneral(generalRes?.config || generalRes || {}));
        setDashboardRoleId(nextRoles[0]?.id || '');
        setDiscordRoleId(nextRoles[0]?.id || '');
        setManagerRoleId(nextRoles[0]?.id || '');
      } catch (err) {
        console.error(err); if (mounted) setError('Failed to load admin control panels.');
      } finally { if (mounted) setLoading(false); }
    }
    load();
    return () => { mounted = false; };
  }, [guildId]);

  function updatePermissions(updater) {
    setGeneral((current) => ({ ...current, dashboardPermissions: { ...updater(current.dashboardPermissions || defaultPermissions()), syncDiscordRoles: false } }));
  }

  function setGlobalRolePermission(roleId, permission, enabled) {
    updatePermissions((current) => {
      const existing = new Set(current.roleAccess?.[roleId] || []);
      if (enabled) existing.add(permission); else existing.delete(permission);
      return { ...current, roleAccess: { ...(current.roleAccess || {}), [roleId]: [...existing] } };
    });
  }

  function setNestedPermission(bucket, controlKey, roleId, permission, enabled) {
    updatePermissions((current) => {
      const parent = { ...(current[bucket] || {}) };
      const perRole = { ...(parent[controlKey] || {}) };
      const existing = new Set(perRole[roleId] || []);
      if (enabled) existing.add(permission); else existing.delete(permission);
      perRole[roleId] = [...existing];
      parent[controlKey] = perRole;
      return { ...current, [bucket]: parent };
    });
  }

  function addManagerRole(roleId = managerRoleId) {
    if (!roleId) return;
    updatePermissions((current) => ({ ...current, managerRoleIds: [...new Set([...(current.managerRoleIds || []), roleId])] }));
  }

  function removeManagerRole(roleId) {
    updatePermissions((current) => ({ ...current, managerRoleIds: (current.managerRoleIds || []).filter((id) => id !== roleId) }));
  }

  function toggleSection(section) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

  async function createFullAccessRole() {
    try {
      setCreatingRole(true); setError('');
      const response = await api.createGuildRole(guildId, { name: newRoleName, color: newRoleColor });
      const role = response?.role;
      if (!role?.id) throw new Error('Discord did not return the created role.');
      setRoles((current) => [role, ...current.filter((item) => item.id !== role.id)]);
      setManagerRoleId(role.id);
      setDashboardRoleId(role.id);
      setDiscordRoleId(role.id);
      addManagerRole(role.id);
      ['view', 'edit', 'configure', 'deploy', 'manage'].forEach((action) => setGlobalRolePermission(role.id, action, true));
      setNotice(`✅ Created Discord role ${role.name}. Save Admin Control Panels to persist access.`);
    } catch (err) { console.error(err); setError(err.message || 'Failed to create Discord role.'); }
    finally { setCreatingRole(false); }
  }

  async function saveControlPanels() {
    try {
      setSaving(true); setError('');
      const saved = await api.saveGeneralSettings(guildId, { ...general, dashboardPermissions: { ...permissions, syncDiscordRoles: false } });
      setGeneral(normalizeGeneral(saved?.config || general));
      setNotice('✅ Admin control panel access saved.');
    } catch (err) { console.error(err); setError(err.message || 'Failed to save admin control panel access.'); }
    finally { setSaving(false); }
  }

  function renderControlRows(items, bucket, actions, selectedRoleId) {
    return <div style={{ overflowX: 'auto' }}><div style={{ display: 'grid', gap: 8, minWidth: 760 }}>{items.map(([controlKey, label]) => <div key={controlKey} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12, display: 'grid', gridTemplateColumns: '240px 1fr', gap: 12, alignItems: 'center' }}><strong>{label}</strong><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions.map(([key, actionLabel]) => <PermissionCheckbox key={key} theme={theme} label={actionLabel} checked={(permissions[bucket]?.[controlKey]?.[selectedRoleId] || []).includes(key)} onChange={(checked) => setNestedPermission(bucket, controlKey, selectedRoleId, key, checked)} />)}</div></div>)}</div></div>;
  }

  function CollapsiblePanel({ sectionKey, title, subtitle, children }) {
    const open = openSections[sectionKey] !== false;
    return <SectionCard theme={theme}><button type="button" onClick={() => toggleSection(sectionKey)} style={{ width: '100%', border: 0, background: 'transparent', color: theme.cardText, textAlign: 'left', cursor: 'pointer', padding: 0, display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center' }}><span><strong style={{ fontSize: 20 }}>{title}</strong><span style={{ display: 'block', color: theme.mutedText, fontSize: 13, marginTop: 5, lineHeight: 1.45 }}>{subtitle}</span></span><span style={{ color: theme.mutedText, fontWeight: 950 }}>{open ? 'Collapse ▲' : 'Expand ▼'}</span></button>{open ? <div style={{ marginTop: 16 }}>{children}</div> : null}</SectionCard>;
  }

  return (
    <PageShell title={page.title} subtitle={selectedGuild ? 'Control dashboard access, Discord commands and guild permissions.' : page.emptyDescription} theme={theme}>
      {!selectedGuild ? <EmptyState theme={theme} text="Select a server to manage admin settings." /> : null}
      {selectedGuild ? <div style={{ ...styles.futurePage, gap: 18 }}>
        {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
        {notice ? <Notice theme={theme} tone="success">{notice}</Notice> : null}
        {loading ? <LoadingPanel theme={theme} text="Loading admin control panels..." /> : null}
        {!loading ? <>
          <SectionCard theme={theme}>
            <div style={{ display: 'grid', gap: 18, padding: 'clamp(18px,2.6vw,24px)', border: `1px solid ${theme.primaryBorder || theme.cardBorder}`, borderRadius: 18, background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.10) 55%, rgba(168,85,247,0.14))' }}>
              <div><p style={{ margin: '0 0 8px', color: '#93c5fd', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 12 }}>Goliath Administration</p><h2 style={{ margin: 0, fontSize: 'clamp(24px,3vw,34px)' }}>🛠️ Admin Control Panel</h2><p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6 }}>Control who can see and manage dashboard pages, then separately control Discord commands and guild-side permissions.</p></div>
              <StatGrid min="min(170px,100%)"><SummaryStat theme={theme} label="Guild Roles" value={roles.length} accent="#c084fc" description="Available Discord roles" /><SummaryStat theme={theme} label="Full Access" value={managerRoleIds.length} accent="#60a5fa" description="Goliath full access roles" /><SummaryStat theme={theme} label="Dashboard Rules" value={configuredDashboardCount} accent="#34d399" description="Dashboard controls configured" /><SummaryStat theme={theme} label="Discord Rules" value={configuredDiscordCount} accent="#facc15" description="Discord controls configured" /></StatGrid>
            </div>
          </SectionCard>

          <SectionCard theme={theme} title="👑 Goliath Full Dashboard Access" subtitle="Roles added here can fully manage Goliath. Create a new Discord role or map an existing guild role. Goliath can only create roles when its bot role has Manage Roles and the guild hierarchy allows it.">
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {managerRoleIds.length ? managerRoleIds.map((roleId) => <button key={roleId} type="button" onClick={() => removeManagerRole(roleId)} title="Remove full dashboard access" style={{ ...button(theme, 'soft'), padding: '7px 10px', borderRadius: 8 }}>● {roleName(roles, roleId)} ×</button>) : <span style={{ color: theme.mutedText }}>No Goliath full dashboard access roles configured.</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr)) auto', gap: 10 }}>
                <select value={managerRoleId} onChange={(event) => setManagerRoleId(event.target.value)} style={input(theme)}><option value="">Map existing Discord role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
                <button type="button" onClick={() => addManagerRole()} disabled={!managerRoleId || managerRoleIds.includes(managerRoleId)} style={button(theme, 'primary', !managerRoleId || managerRoleIds.includes(managerRoleId))}>Add Existing</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) 140px auto', gap: 10 }}>
                <input value={newRoleName} onChange={(event) => setNewRoleName(event.target.value)} placeholder="New Discord role name" style={input(theme)} />
                <input value={newRoleColor} onChange={(event) => setNewRoleColor(event.target.value)} placeholder="#3b82f6" style={input(theme)} />
                <button type="button" onClick={createFullAccessRole} disabled={creatingRole || !newRoleName.trim()} style={button(theme, 'success', creatingRole || !newRoleName.trim())}>{creatingRole ? 'Creating...' : 'Create Role'}</button>
              </div>
            </div>
          </SectionCard>

          <CollapsiblePanel sectionKey="dashboard" title="🖥️ Dashboard Control Panel" subtitle="Choose a dashboard role here and define exactly what dashboard pages and controls it can use.">
            <div style={{ display: 'grid', gap: 14 }}>
              <Field theme={theme} label="Dashboard Role / ID to Configure"><select value={dashboardRoleId} onChange={(event) => setDashboardRoleId(event.target.value)} style={input(theme)}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>
              {dashboardRoleId ? <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 14, display: 'grid', gap: 12 }}><strong>Global dashboard access for {roleName(roles, dashboardRoleId)}</strong><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{DASHBOARD_ACTIONS.map(([key, label]) => <PermissionCheckbox key={key} theme={theme} label={label} checked={(permissions.roleAccess?.[dashboardRoleId] || []).includes(key)} onChange={(checked) => setGlobalRolePermission(dashboardRoleId, key, checked)} />)}</div></div> : null}
              {renderControlRows(DASHBOARD_CONTROLS, 'moduleAccess', DASHBOARD_ACTIONS, dashboardRoleId)}
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel sectionKey="discord" title="🤖 Discord Control Panel" subtitle="Choose a Discord role here. This controls commands, guild permissions and module Discord actions.">
            <div style={{ display: 'grid', gap: 14 }}>
              <Field theme={theme} label="Discord Role / ID to Configure"><select value={discordRoleId} onChange={(event) => setDiscordRoleId(event.target.value)} style={input(theme)}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>
              {renderControlRows(DISCORD_CONTROLS, 'discordAccess', DISCORD_ACTIONS, discordRoleId)}
            </div>
          </CollapsiblePanel>

          <PrimaryButton onClick={saveControlPanels} disabled={saving}>{saving ? 'Saving...' : 'Save Admin Control Panels'}</PrimaryButton>
        </> : null}
      </div> : null}
    </PageShell>
  );
}
