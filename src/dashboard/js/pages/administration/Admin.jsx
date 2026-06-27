import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient';
import PageShell, { EmptyState, LoadingPanel, Notice, SectionCard, StatGrid, SummaryStat } from '../../shared/PageShell';
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

const FULL_ACCESS_ACTIONS = ['view', 'edit', 'configure', 'deploy', 'delete', 'manage'];
const CUSTOM_ACCESS_ACTIONS = ['edit'];
const DASHBOARD_CUSTOM_OPTIONS = [
  ['view', 'Can view'],
  ['configure', 'Can configure'],
  ['deploy', 'Can deploy'],
  ['delete', 'Can delete'],
];
const DISCORD_CUSTOM_OPTIONS = [
  ['use', 'Can use'],
  ['create', 'Can create'],
  ['sync', 'Can sync'],
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

const DISCORD_PERMISSION_GROUPS = [
  ['General Server Permissions', [
    ['ViewChannel', 'View Channels'],
    ['ManageChannels', 'Manage Channels'],
    ['ManageRoles', 'Manage Roles'],
    ['CreateGuildExpressions', 'Create Expressions'],
    ['ManageGuildExpressions', 'Manage Expressions'],
    ['ViewAuditLog', 'View Audit Log'],
    ['ManageWebhooks', 'Manage Webhooks'],
    ['ManageGuild', 'Manage Server'],
  ]],
  ['Membership Permissions', [
    ['CreateInstantInvite', 'Create Invite'],
    ['ChangeNickname', 'Change Nickname'],
    ['ManageNicknames', 'Manage Nicknames'],
    ['KickMembers', 'Kick Members'],
    ['BanMembers', 'Ban Members'],
    ['ModerateMembers', 'Timeout Members'],
  ]],
  ['Text Channel Permissions', [
    ['SendMessages', 'Send Messages'],
    ['SendMessagesInThreads', 'Send Messages in Threads'],
    ['CreatePublicThreads', 'Create Public Threads'],
    ['CreatePrivateThreads', 'Create Private Threads'],
    ['EmbedLinks', 'Embed Links'],
    ['AttachFiles', 'Attach Files'],
    ['AddReactions', 'Add Reactions'],
    ['UseExternalEmojis', 'Use External Emoji'],
    ['UseExternalStickers', 'Use External Stickers'],
    ['MentionEveryone', 'Mention @everyone'],
    ['ManageMessages', 'Manage Messages'],
    ['ManageThreads', 'Manage Threads'],
    ['ReadMessageHistory', 'Read Message History'],
    ['SendTTSMessages', 'Send TTS Messages'],
    ['UseApplicationCommands', 'Use App Commands'],
  ]],
  ['Voice Channel Permissions', [
    ['Connect', 'Connect'],
    ['Speak', 'Speak'],
    ['Stream', 'Video / Stream'],
    ['UseVAD', 'Use Voice Activity'],
    ['PrioritySpeaker', 'Priority Speaker'],
    ['MuteMembers', 'Mute Members'],
    ['DeafenMembers', 'Deafen Members'],
    ['MoveMembers', 'Move Members'],
    ['UseEmbeddedActivities', 'Use Activities'],
    ['RequestToSpeak', 'Request to Speak'],
  ]],
  ['Events & Advanced', [
    ['CreateEvents', 'Create Events'],
    ['ManageEvents', 'Manage Events'],
    ['Administrator', 'Administrator'],
  ]],
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
  return { enabled: true, syncDiscordRoles: false, managerRoleIds: [], roleOrder: [], roleAccess: {}, moduleAccess: {}, discordAccess: {} };
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
    soft: ['rgba(148,163,184,0.10)', theme.cardBorder, theme.cardText],
  };
  const [background, border, color] = tones[tone] || tones.primary;
  return { border: `1px solid ${border}`, background, color, borderRadius: 12, padding: '10px 12px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, fontWeight: 950 };
}

function accessButton(theme, active, label, onClick) {
  return <button type="button" onClick={onClick} style={button(theme, active ? 'success' : 'soft')}>{label}</button>;
}

function Field({ theme, label, children }) {
  return <label style={{ display: 'grid', gap: 7, minWidth: 0 }}><span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>{children}</label>;
}

function OptionCheckbox({ theme, checked, label, onChange }) {
  return <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${checked ? 'rgba(34,197,94,0.35)' : theme.cardBorder}`, background: checked ? 'rgba(34,197,94,0.10)' : 'rgba(15,23,42,0.22)', borderRadius: 999, padding: '7px 10px', color: checked ? '#86efac' : theme.mutedText, fontWeight: 900, fontSize: 12 }}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function roleName(roles, roleId) {
  return roles.find((role) => role.id === roleId)?.name || roleId;
}

function Panel({ theme, title, subtitle, action, children, onHeaderClick }) {
  return <SectionCard theme={theme}><div role={onHeaderClick ? 'button' : undefined} tabIndex={onHeaderClick ? 0 : undefined} onClick={onHeaderClick} onKeyDown={(event) => { if (onHeaderClick && (event.key === 'Enter' || event.key === ' ')) onHeaderClick(); }} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', marginBottom: 16, cursor: onHeaderClick ? 'pointer' : 'default' }}><div><h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>{subtitle ? <p style={{ margin: '7px 0 0', color: theme.mutedText, lineHeight: 1.55 }}>{subtitle}</p> : null}</div>{action ? <div onClick={(event) => event.stopPropagation()} style={{ flexShrink: 0 }}>{action}</div> : null}</div>{children}</SectionCard>;
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
  const [newRolePermissions, setNewRolePermissions] = useState(['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'UseApplicationCommands']);
  const [openSections, setOpenSections] = useState({ creator: true, access: true, dashboard: true, discord: false });
  const [customOpen, setCustomOpen] = useState({});

  const permissions = general.dashboardPermissions || defaultPermissions();
  const fullAccessRoleIds = permissions.managerRoleIds || [];
  const configuredDashboardCount = Object.keys(permissions.moduleAccess || {}).filter((controlKey) => Object.values(permissions.moduleAccess?.[controlKey] || {}).some((items) => items?.length)).length;
  const configuredDiscordCount = Object.keys(permissions.discordAccess || {}).filter((controlKey) => Object.values(permissions.discordAccess?.[controlKey] || {}).some((items) => items?.length)).length;

  const orderedRoles = useMemo(() => {
    const order = permissions.roleOrder || [];
    return [...roles].sort((a, b) => {
      const aIndex = order.indexOf(a.id);
      const bIndex = order.indexOf(b.id);
      if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 9999 : aIndex) - (bIndex === -1 ? 9999 : bIndex);
      return (b.position || 0) - (a.position || 0);
    });
  }, [roles, permissions.roleOrder]);

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

  function moveRole(roleId, direction) {
    const ids = orderedRoles.map((role) => role.id);
    const index = ids.indexOf(roleId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    const next = [...ids];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    updatePermissions((current) => ({ ...current, roleOrder: next }));
  }

  function setFullAccessRole(roleId, enabled) {
    if (!roleId) return;
    updatePermissions((current) => ({ ...current, managerRoleIds: enabled ? [...new Set([...(current.managerRoleIds || []), roleId])] : (current.managerRoleIds || []).filter((id) => id !== roleId) }));
  }

  function setRoleAccessMode(roleId, mode) {
    updatePermissions((current) => {
      const next = { ...(current.roleAccess || {}) };
      if (mode === 'full') next[roleId] = [...FULL_ACCESS_ACTIONS];
      else if (mode === 'custom') next[roleId] = [...CUSTOM_ACCESS_ACTIONS];
      else next[roleId] = [];
      return { ...current, roleAccess: next };
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

  function setControlAccessMode(bucket, controlKey, roleId, mode) {
    const fullActions = bucket === 'discordAccess' ? ['use', 'manage', 'sync', 'create', 'admin'] : FULL_ACCESS_ACTIONS;
    const customActions = bucket === 'discordAccess' ? ['use'] : CUSTOM_ACCESS_ACTIONS;
    updatePermissions((current) => {
      const parent = { ...(current[bucket] || {}) };
      parent[controlKey] = { ...(parent[controlKey] || {}), [roleId]: mode === 'full' ? fullActions : mode === 'custom' ? customActions : [] };
      return { ...current, [bucket]: parent };
    });
    if (mode === 'custom') setCustomOpen((current) => ({ ...current, [`${bucket}:${controlKey}:${roleId}`]: true }));
  }

  function toggleSection(section) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function setRolePermission(permission, enabled) {
    setNewRolePermissions((current) => enabled ? [...new Set([...current, permission])] : current.filter((item) => item !== permission));
  }

  async function createRole() {
    try {
      setCreatingRole(true); setError('');
      const response = await api.createGuildRole(guildId, { name: newRoleName, color: newRoleColor, hoist: newRoleHoist, mentionable: newRoleMentionable, permissions: newRolePermissions });
      const role = response?.role;
      if (!role?.id) throw new Error('Discord did not return the created role.');
      setRoles((current) => [role, ...current.filter((item) => item.id !== role.id)]);
      setDashboardRoleId(role.id);
      setDiscordRoleId(role.id);
      setFullAccessRole(role.id, true);
      setRoleAccessMode(role.id, 'full');
      setNotice(`✅ Created Discord role ${role.name}. Save Goliath Dashboard Access to persist access/order.`);
    } catch (err) { console.error(err); setError(err.message || 'Failed to create Discord role.'); }
    finally { setCreatingRole(false); }
  }

  async function refreshGuildRoles() {
    try {
      setLoading(true); setError('');
      const rolesRes = await api.getGuildRoles(guildId);
      const nextRoles = normalizeArray(rolesRes, 'roles');
      setRoles(nextRoles);
      setNotice('✅ Synced latest roles from Discord.');
    } catch (err) { console.error(err); setError(err.message || 'Failed to sync roles from Discord.'); }
    finally { setLoading(false); }
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

  function renderCustomOptions(bucket, controlKey, selectedRoleId) {
    const options = bucket === 'discordAccess' ? DISCORD_CUSTOM_OPTIONS : DASHBOARD_CUSTOM_OPTIONS;
    return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10 }}>{options.map(([key, label]) => <OptionCheckbox key={key} theme={theme} label={label} checked={(permissions[bucket]?.[controlKey]?.[selectedRoleId] || []).includes(key)} onChange={(checked) => setNestedPermission(bucket, controlKey, selectedRoleId, key, checked)} />)}</div>;
  }

  function renderControlRows(items, bucket, selectedRoleId) {
    return <div style={{ display: 'grid', gap: 8 }}>{items.map(([controlKey, label]) => {
      const access = permissions[bucket]?.[controlKey]?.[selectedRoleId] || [];
      const isFull = access.includes('manage') || access.includes('admin');
      const isCustom = access.length > 0 && !isFull;
      const customKey = `${bucket}:${controlKey}:${selectedRoleId}`;
      return <div key={controlKey} style={{ border: `1px solid ${isFull || isCustom ? 'rgba(34,197,94,0.28)' : theme.cardBorder}`, background: isFull ? 'rgba(34,197,94,0.08)' : 'rgba(15,23,42,0.18)', borderRadius: 14, padding: 12 }}><div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) auto auto', gap: 10, alignItems: 'center' }}><strong>{label}</strong>{accessButton(theme, isFull, 'Full Access', () => setControlAccessMode(bucket, controlKey, selectedRoleId, isFull ? 'none' : 'full'))}{accessButton(theme, isCustom, 'Custom Access', () => setControlAccessMode(bucket, controlKey, selectedRoleId, isCustom ? 'none' : 'custom'))}</div>{isCustom && customOpen[customKey] !== false ? renderCustomOptions(bucket, controlKey, selectedRoleId) : null}</div>;
    })}</div>;
  }

  function CollapsiblePanel({ sectionKey, title, subtitle, children }) {
    const open = openSections[sectionKey] !== false;
    return <Panel theme={theme} title={title} subtitle={subtitle} onHeaderClick={() => toggleSection(sectionKey)} action={<div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={saveControlPanels} disabled={saving} style={button(theme, 'success', saving)}>{saving ? 'Saving...' : 'Save'}</button><button type="button" onClick={() => toggleSection(sectionKey)} style={button(theme, 'soft')}>{open ? 'Collapse' : 'Expand'}</button></div>}>{open ? children : null}</Panel>;
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
              <div><h2 style={{ margin: 0, fontSize: 'clamp(26px,3vw,38px)' }}>Admin Control Panel</h2><p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6 }}>Control dashboard access, Discord commands and guild-side permissions.</p></div>
              <StatGrid min="min(170px,100%)"><SummaryStat theme={theme} label="Guild Roles" value={roles.length} accent="#c084fc" description="Available Discord roles" /><SummaryStat theme={theme} label="Full Access" value={fullAccessRoleIds.length} accent="#60a5fa" description="Goliath full access roles" /><SummaryStat theme={theme} label="Dashboard Rules" value={configuredDashboardCount} accent="#34d399" description="Dashboard controls configured" /><SummaryStat theme={theme} label="Discord Rules" value={configuredDiscordCount} accent="#facc15" description="Discord controls configured" /></StatGrid>
            </div>
          </SectionCard>

          <Panel theme={theme} title="Role Creator" subtitle="Create new Discord roles and choose Discord permissions before syncing to the guild." onHeaderClick={() => toggleSection('creator')} action={<div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={refreshGuildRoles} style={button(theme, 'soft')}>Sync from Discord</button><button type="button" onClick={createRole} disabled={creatingRole || !newRoleName.trim()} style={button(theme, 'success', creatingRole || !newRoleName.trim())}>{creatingRole ? 'Creating...' : 'Create Role'}</button></div>}>
            {openSections.creator !== false ? <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1.5fr) minmax(160px,0.8fr) minmax(130px,0.6fr)', gap: 10 }}>
                <Field theme={theme} label="Role Name"><input value={newRoleName} onChange={(event) => setNewRoleName(event.target.value)} placeholder="Goliath Dashboard Access" style={input(theme)} /></Field>
                <Field theme={theme} label="Colour Preset"><select value={newRoleColor} onChange={(event) => setNewRoleColor(event.target.value)} style={input(theme)}>{ROLE_COLORS.map(([hex, label]) => <option key={hex} value={hex}>{label} — {hex}</option>)}</select></Field>
                <Field theme={theme} label="Hex Colour"><input value={newRoleColor} onChange={(event) => setNewRoleColor(event.target.value)} placeholder="#3b82f6" style={input(theme)} /></Field>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <OptionCheckbox theme={theme} label="Show role separately" checked={newRoleHoist} onChange={setNewRoleHoist} />
                <OptionCheckbox theme={theme} label="Allow mentions" checked={newRoleMentionable} onChange={setNewRoleMentionable} />
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {DISCORD_PERMISSION_GROUPS.map(([group, items]) => <div key={group} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12 }}><strong>{group}</strong><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{items.map(([key, label]) => <OptionCheckbox key={key} theme={theme} label={label} checked={newRolePermissions.includes(key)} onChange={(checked) => setRolePermission(key, checked)} />)}</div></div>)}
              </div>
            </div> : null}
          </Panel>

          <Panel theme={theme} title="Goliath Dashboard Access" subtitle="Select full dashboard access roles. Use the arrows to reorder how roles appear inside Goliath." onHeaderClick={() => toggleSection('access')} action={<button type="button" onClick={saveControlPanels} disabled={saving} style={button(theme, 'success', saving)}>{saving ? 'Saving...' : 'Save'}</button>}>
            {openSections.access !== false ? <div style={{ display: 'grid', gap: 10 }}>
              {orderedRoles.length ? orderedRoles.map((role, index) => <label key={role.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', gap: 10, alignItems: 'center', border: `1px solid ${fullAccessRoleIds.includes(role.id) ? 'rgba(34,197,94,0.35)' : theme.cardBorder}`, background: fullAccessRoleIds.includes(role.id) ? 'rgba(34,197,94,0.08)' : 'rgba(15,23,42,0.18)', borderRadius: 14, padding: 12 }}><span style={{ width: 10, height: 10, borderRadius: 999, background: role.color || '#94a3b8', display: 'inline-block' }} /><strong>{role.name}</strong><button type="button" disabled={index === 0} onClick={(event) => { event.preventDefault(); moveRole(role.id, -1); }} style={button(theme, 'soft', index === 0)}>↑</button><button type="button" disabled={index === orderedRoles.length - 1} onClick={(event) => { event.preventDefault(); moveRole(role.id, 1); }} style={button(theme, 'soft', index === orderedRoles.length - 1)}>↓</button><input type="checkbox" checked={fullAccessRoleIds.includes(role.id)} onChange={(event) => setFullAccessRole(role.id, event.target.checked)} /></label>) : <div style={{ color: theme.mutedText }}>No Discord roles found.</div>}
            </div> : null}
          </Panel>

          <CollapsiblePanel sectionKey="dashboard" title="Dashboard Control Panel" subtitle="Set full access quickly, or use custom access for selected dashboard areas.">
            <div style={{ display: 'grid', gap: 14 }}>
              <Field theme={theme} label="Dashboard Role / ID to Configure"><select value={dashboardRoleId} onChange={(event) => setDashboardRoleId(event.target.value)} style={input(theme)}>{orderedRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>
              {dashboardRoleId ? <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 14, display: 'grid', gap: 12 }}><strong>Global dashboard access for {roleName(roles, dashboardRoleId)}</strong><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{accessButton(theme, (permissions.roleAccess?.[dashboardRoleId] || []).includes('manage'), 'Full Access', () => setRoleAccessMode(dashboardRoleId, (permissions.roleAccess?.[dashboardRoleId] || []).includes('manage') ? 'none' : 'full'))}{accessButton(theme, (permissions.roleAccess?.[dashboardRoleId] || []).includes('edit') && !(permissions.roleAccess?.[dashboardRoleId] || []).includes('manage'), 'Custom Access', () => setRoleAccessMode(dashboardRoleId, (permissions.roleAccess?.[dashboardRoleId] || []).includes('edit') ? 'none' : 'custom'))}</div></div> : null}
              {renderControlRows(DASHBOARD_CONTROLS, 'moduleAccess', dashboardRoleId)}
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel sectionKey="discord" title="Discord Control Panel" subtitle="Set full access quickly, or use custom access for command and guild-side controls.">
            <div style={{ display: 'grid', gap: 14 }}>
              <Field theme={theme} label="Discord Role / ID to Configure"><select value={discordRoleId} onChange={(event) => setDiscordRoleId(event.target.value)} style={input(theme)}>{orderedRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>
              {renderControlRows(DISCORD_CONTROLS, 'discordAccess', discordRoleId)}
            </div>
          </CollapsiblePanel>
        </> : null}
      </div> : null}
    </PageShell>
  );
}
