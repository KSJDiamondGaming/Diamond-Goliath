import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient';
import PageShell, { EmptyState, LoadingPanel, Notice, PrimaryButton, SectionCard, StatGrid, SummaryStat } from '../../shared/PageShell';
import { PAGE_LAYOUTS } from '../../ui/layout';
import { createSharedComponentStyles } from '../../ui/components';

const DASHBOARD_CONTROLS = [
  ['overview', 'Overview'],
  ['admin', 'Admin'],
  ['automod', 'AutoMod'],
  ['general-settings', 'General Settings'],
  ['moderation', 'Moderation'],
  ['cases', 'Cases'],
  ['warnings', 'Warnings'],
  ['modules', 'Modules'],
  ['logs', 'Logs'],
  ['security', 'Security'],
  ['restore', 'Restore'],
  ['welcome', 'Welcome Messages'],
  ['sticky-messages', 'Sticky Messages'],
  ['embed-studio', 'Embed Studio'],
  ['tickets', 'Tickets'],
  ['forms', 'Forms'],
  ['translation', 'Translation'],
  ['verification', 'Verification'],
  ['auto-roles', 'Auto Roles'],
  ['reaction-roles', 'Reaction Roles'],
  ['giveaways', 'Giveaways'],
  ['starboard', 'Starboard'],
  ['temp-voice', 'Temp Voice'],
  ['polls', 'Polls'],
  ['stats', 'Stats'],
];

const DISCORD_CONTROLS = [
  ['slash-commands', 'Slash Commands'],
  ['moderation-commands', 'Moderation Commands'],
  ['ticket-commands', 'Ticket Commands'],
  ['form-commands', 'Form Commands'],
  ['security-commands', 'Security Commands'],
  ['role-sync', 'Role Creation & Sync'],
  ['channel-permissions', 'Channel Permissions'],
  ['module-permissions', 'Module Discord Permissions'],
  ['backup-restore-commands', 'Backup / Restore Commands'],
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

const ROLE_COLORS = [
  ['#3b82f6', 'Blue'],
  ['#22c55e', 'Green'],
  ['#a855f7', 'Purple'],
  ['#f59e0b', 'Amber'],
  ['#ef4444', 'Red'],
  ['#14b8a6', 'Teal'],
  ['#e5e7eb', 'Silver'],
  ['#111827', 'Dark'],
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
  const tones = {
    primary: ['rgba(59,130,246,0.16)', 'rgba(59,130,246,0.35)', '#bfdbfe'],
    success: ['rgba(34,197,94,0.13)', 'rgba(34,197,94,0.32)', '#86efac'],
    danger: ['rgba(239,68,68,0.13)', 'rgba(239,68,68,0.32)', '#fca5a5'],
    soft: ['rgba(148,163,184,0.10)', theme.cardBorder, theme.cardText],
  };
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

function Panel({ theme, title, subtitle, action, children }) {
  return <SectionCard theme={theme}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', marginBottom: 16 }}><div><h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>{subtitle ? <p style={{ margin: '7px 0 0', color: theme.mutedText, lineHeight: 1.55 }}>{subtitle}</p> : null}</div>{action ? <div style={{ flexShrink: 0 }}>{action}</div> : null}</div>{children}</SectionCard>;
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
  const [newRoleName, setNewRoleName] = useState('Goliath Dashboard Access');
  const [newRoleColor, setNewRoleColor] = useState('#3b82f6');
  const [newRoleHoist, setNewRoleHoist] = useState(false);
  const [newRoleMentionable, setNewRoleMentionable] = useState(false);
  const [openSections, setOpenSections] = useState({ dashboard: true, discord: false });

  const permissions = general.dashboardPermissions || defaultPermissions();
  const fullAccessRoleIds = permissions.managerRoleIds || [];
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

  function setFullAccessRole(roleId, enabled) {
    if (!roleId) return;
    updatePermissions((current) => ({ ...current, managerRoleIds: enabled ? [...new Set([...(current.managerRoleIds || []), roleId])] : (current.managerRoleIds || []).filter((id) => id !== roleId) }));
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

  function toggleSection(section) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

  async function createRole() {
    try {
      setCreatingRole(true); setError('');
      const response = await api.createGuildRole(guildId, { name: newRoleName, color: newRoleColor, hoist: newRoleHoist, mentionable: newRoleMentionable });
      const role = response?.role;
      if (!role?.id) throw new Error('Discord did not return the created role.');
      setRoles((current) => [role, ...current.filter((item) => item.id !== role.id)]);
      setDashboardRoleId(role.id);
      setDiscordRoleId(role.id);
      setFullAccessRole(role.id, true);
      ['view', 'edit', 'configure', 'deploy', 'manage'].forEach((action) => setGlobalRolePermission(role.id, action, true));
      setNotice(`✅ Created Discord role ${role.name}. Save Goliath Dashboard Access to persist access.`);
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
    return <Panel theme={theme} title={title} subtitle={subtitle} action={<div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={saveControlPanels} disabled={saving} style={button(theme, 'success', saving)}>{saving ? 'Saving...' : 'Save'}</button><button type="button" onClick={() => toggleSection(sectionKey)} style={button(theme, 'soft')}>{open ? 'Collapse' : 'Expand'}</button></div>}>{open ? children : null}</Panel>;
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
              <div><h2 style={{ margin: 0, fontSize: 'clamp(26px,3vw,38px)' }}>🛠️ Admin Control Panel</h2><p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6 }}>Control dashboard access, Discord commands and guild-side permissions.</p></div>
              <StatGrid min="min(170px,100%)"><SummaryStat theme={theme} label="Guild Roles" value={roles.length} accent="#c084fc" description="Available Discord roles" /><SummaryStat theme={theme} label="Full Access" value={fullAccessRoleIds.length} accent="#60a5fa" description="Goliath full access roles" /><SummaryStat theme={theme} label="Dashboard Rules" value={configuredDashboardCount} accent="#34d399" description="Dashboard controls configured" /><SummaryStat theme={theme} label="Discord Rules" value={configuredDiscordCount} accent="#facc15" description="Discord controls configured" /></StatGrid>
            </div>
          </SectionCard>

          <Panel theme={theme} title="Role Creator" subtitle="Create new Discord roles for this guild. Name, colour and visibility settings sync directly to Discord." action={<button type="button" onClick={createRole} disabled={creatingRole || !newRoleName.trim()} style={button(theme, 'success', creatingRole || !newRoleName.trim())}>{creatingRole ? 'Creating...' : 'Create Role'}</button>}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1.5fr) minmax(160px,0.8fr) minmax(130px,0.6fr)', gap: 10 }}>
                <Field theme={theme} label="Role Name"><input value={newRoleName} onChange={(event) => setNewRoleName(event.target.value)} placeholder="Goliath Dashboard Access" style={input(theme)} /></Field>
                <Field theme={theme} label="Colour Preset"><select value={newRoleColor} onChange={(event) => setNewRoleColor(event.target.value)} style={input(theme)}>{ROLE_COLORS.map(([hex, label]) => <option key={hex} value={hex}>{label} — {hex}</option>)}</select></Field>
                <Field theme={theme} label="Hex Colour"><input value={newRoleColor} onChange={(event) => setNewRoleColor(event.target.value)} placeholder="#3b82f6" style={input(theme)} /></Field>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <PermissionCheckbox theme={theme} label="Show role separately" checked={newRoleHoist} onChange={setNewRoleHoist} />
                <PermissionCheckbox theme={theme} label="Allow mentions" checked={newRoleMentionable} onChange={setNewRoleMentionable} />
              </div>
            </div>
          </Panel>

          <Panel theme={theme} title="Goliath Dashboard Access" subtitle="Select one or more existing roles that should have full Goliath dashboard access. This does not rename or copy another bot's structure." action={<button type="button" onClick={saveControlPanels} disabled={saving} style={button(theme, 'success', saving)}>{saving ? 'Saving...' : 'Save'}</button>}>
            <div style={{ display: 'grid', gap: 12 }}>
              {roles.length ? roles.map((role) => <label key={role.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', border: `1px solid ${fullAccessRoleIds.includes(role.id) ? 'rgba(34,197,94,0.35)' : theme.cardBorder}`, background: fullAccessRoleIds.includes(role.id) ? 'rgba(34,197,94,0.08)' : 'rgba(15,23,42,0.18)', borderRadius: 14, padding: 12 }}><span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 10, height: 10, borderRadius: 999, background: role.color || '#94a3b8', display: 'inline-block' }} /> <strong>{role.name}</strong></span><input type="checkbox" checked={fullAccessRoleIds.includes(role.id)} onChange={(event) => setFullAccessRole(role.id, event.target.checked)} /></label>) : <div style={{ color: theme.mutedText }}>No Discord roles found.</div>}
            </div>
          </Panel>

          <CollapsiblePanel sectionKey="dashboard" title="Dashboard Control Panel" subtitle="Choose a dashboard role and define exactly what dashboard pages and controls it can use.">
            <div style={{ display: 'grid', gap: 14 }}>
              <Field theme={theme} label="Dashboard Role / ID to Configure"><select value={dashboardRoleId} onChange={(event) => setDashboardRoleId(event.target.value)} style={input(theme)}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>
              {dashboardRoleId ? <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 14, display: 'grid', gap: 12 }}><strong>Global dashboard access for {roleName(roles, dashboardRoleId)}</strong><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{DASHBOARD_ACTIONS.map(([key, label]) => <PermissionCheckbox key={key} theme={theme} label={label} checked={(permissions.roleAccess?.[dashboardRoleId] || []).includes(key)} onChange={(checked) => setGlobalRolePermission(dashboardRoleId, key, checked)} />)}</div></div> : null}
              {renderControlRows(DASHBOARD_CONTROLS, 'moduleAccess', DASHBOARD_ACTIONS, dashboardRoleId)}
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel sectionKey="discord" title="Discord Control Panel" subtitle="Choose a Discord role. This controls commands, guild permissions and module Discord actions.">
            <div style={{ display: 'grid', gap: 14 }}>
              <Field theme={theme} label="Discord Role / ID to Configure"><select value={discordRoleId} onChange={(event) => setDiscordRoleId(event.target.value)} style={input(theme)}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>
              {renderControlRows(DISCORD_CONTROLS, 'discordAccess', DISCORD_ACTIONS, discordRoleId)}
            </div>
          </CollapsiblePanel>
        </> : null}
      </div> : null}
    </PageShell>
  );
}
