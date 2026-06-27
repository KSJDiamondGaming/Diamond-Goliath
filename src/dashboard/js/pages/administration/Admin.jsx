import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient';
import PageShell, { EmptyState, LoadingPanel, Notice, PrimaryButton, SectionCard, StatGrid, SummaryStat } from '../../shared/PageShell';
import { PAGE_LAYOUTS } from '../../ui/layout';
import { createSharedComponentStyles } from '../../ui/components';

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
  const tones = { primary: ['rgba(59,130,246,0.16)', 'rgba(59,130,246,0.35)', '#bfdbfe'], success: ['rgba(34,197,94,0.13)', 'rgba(34,197,94,0.32)', '#86efac'], soft: ['rgba(148,163,184,0.10)', theme.cardBorder, theme.cardText] };
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
  const [roles, setRoles] = useState([]);
  const [general, setGeneral] = useState(normalizeGeneral());
  const [selectedRoleId, setSelectedRoleId] = useState('');

  const permissions = general.dashboardPermissions || defaultPermissions();
  const selectedRole = roles.find((role) => role.id === selectedRoleId);
  const configuredRoleCount = Object.keys(permissions.roleAccess || {}).filter((roleId) => (permissions.roleAccess?.[roleId] || []).length).length;
  const configuredModuleCount = Object.keys(permissions.moduleAccess || {}).filter((moduleKey) => Object.values(permissions.moduleAccess?.[moduleKey] || {}).some((items) => items?.length)).length;

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
        setSelectedRoleId(nextRoles[0]?.id || '');
      } catch (err) {
        console.error(err); if (mounted) setError('Failed to load admin access controls.');
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
      setNotice('✅ Dashboard access settings saved.');
    } catch (err) { console.error(err); setError('Failed to save dashboard access settings.'); }
    finally { setSaving(false); }
  }

  return (
    <PageShell title={page.title} subtitle={selectedGuild ? 'Control dashboard access, role permissions and future Discord role sync.' : page.emptyDescription} theme={theme}>
      {!selectedGuild ? <EmptyState theme={theme} text="Select a server to manage admin settings." /> : null}
      {selectedGuild ? <div style={{ ...styles.futurePage, gap: 18 }}>
        {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
        {notice ? <Notice theme={theme} tone="success">{notice}</Notice> : null}
        {loading ? <LoadingPanel theme={theme} text="Loading admin access controls..." /> : null}
        {!loading ? <>
          <SectionCard theme={theme}>
            <div style={{ display: 'grid', gap: 18, padding: 'clamp(18px,2.6vw,24px)', border: `1px solid ${theme.primaryBorder || theme.cardBorder}`, borderRadius: 18, background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.10) 55%, rgba(168,85,247,0.14))' }}>
              <div><p style={{ margin: '0 0 8px', color: '#93c5fd', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 12 }}>Goliath Administration</p><h2 style={{ margin: 0, fontSize: 'clamp(24px,3vw,34px)' }}>🛠️ Admin Access Control</h2><p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6 }}>This page now focuses only on who can access dashboard areas and what they can do. Logs, modules, auto roles and recovery stay on their own dedicated pages.</p></div>
              <StatGrid min="min(170px,100%)"><SummaryStat theme={theme} label="Guild Roles" value={roles.length} accent="#c084fc" description="Available Discord roles" /><SummaryStat theme={theme} label="Configured Roles" value={configuredRoleCount} accent="#60a5fa" description="Roles with dashboard access" /><SummaryStat theme={theme} label="Module Rules" value={configuredModuleCount} accent="#34d399" description="Modules with custom access" /><SummaryStat theme={theme} label="Sync Mode" value={permissions.syncDiscordRoles ? 'On' : 'Off'} accent="#facc15" description="Dashboard to Discord sync preference" /></StatGrid>
            </div>
          </SectionCard>

          <SectionCard theme={theme} title="🔐 Dashboard Access Matrix" subtitle="Per-role and per-module access. Guild owners can map their own Discord roles instead of relying on hard-coded role names.">
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 12 }}>
                <Field theme={theme} label="Discord Role to Configure"><select value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)} style={input(theme)}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>
                <ToggleRow theme={theme} title="Sync dashboard permissions to Discord roles" description="Saved as a preference. The next build will add the guarded Create Role / Sync Role action." enabled={permissions.syncDiscordRoles === true} onClick={() => updatePermissions((current) => ({ ...current, syncDiscordRoles: !current.syncDiscordRoles }))} />
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

          <SectionCard theme={theme} title="🧩 Discord Role Sync" subtitle="Next build: create or map Discord roles from here, then apply dashboard access rules safely.">
            <div style={{ display: 'grid', gap: 12 }}>
              <button type="button" disabled style={button(theme, 'primary', true)}>Create Discord Role</button>
              <button type="button" disabled style={button(theme, 'success', true)}>Sync Selected Role</button>
              <div style={{ color: theme.mutedText, lineHeight: 1.55 }}>Role creation and Discord permission sync will be guarded with hierarchy checks, confirmation, and audit logging before it changes anything in the guild.</div>
            </div>
          </SectionCard>
        </> : null}
      </div> : null}
    </PageShell>
  );
}
