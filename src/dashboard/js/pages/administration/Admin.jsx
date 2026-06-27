import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient';
import PageShell, { EmptyState, LoadingPanel, Notice, SectionCard, StatGrid, SummaryStat } from '../../shared/PageShell';
import { PAGE_LAYOUTS } from '../../ui/layout';
import { createSharedComponentStyles } from '../../ui/components';

const DASHBOARD_CONTROLS = [
  ['overview', 'Overview'], ['admin', 'Admin'], ['automod', 'AutoMod'], ['general-settings', 'General Settings'],
  ['moderation', 'Moderation'], ['cases', 'Cases'], ['warnings', 'Warnings'], ['modules', 'Modules'],
  ['logs', 'Logs'], ['security', 'Security'], ['restore', 'Restore'], ['welcome', 'Welcome Messages'],
  ['sticky-messages', 'Sticky Messages'], ['embed-studio', 'Embed Studio'], ['tickets', 'Tickets'], ['forms', 'Forms'],
  ['translation', 'Translation'], ['verification', 'Verification'], ['auto-roles', 'Auto Roles'], ['reaction-roles', 'Reaction Roles'],
  ['giveaways', 'Giveaways'], ['starboard', 'Starboard'], ['temp-voice', 'Temp Voice'], ['polls', 'Polls'], ['stats', 'Stats'],
];

const DISCORD_CONTROLS = [
  ['slash-commands', 'Slash Commands'], ['moderation-commands', 'Moderation Commands'], ['ticket-commands', 'Ticket Commands'],
  ['form-commands', 'Form Commands'], ['security-commands', 'Security Commands'], ['role-sync', 'Role Creation & Sync'],
  ['channel-permissions', 'Channel Permissions'], ['module-permissions', 'Module Discord Permissions'], ['backup-restore-commands', 'Backup / Restore Commands'],
];

const FULL_DASHBOARD = ['view', 'edit', 'configure', 'deploy', 'manage'];
const FULL_DISCORD = ['use', 'manage', 'sync', 'create', 'admin'];
const DASHBOARD_CUSTOM = [['view', 'Can view'], ['edit', 'Can edit'], ['configure', 'Can configure'], ['deploy', 'Can deploy']];
const DISCORD_CUSTOM = [['use', 'Can use'], ['create', 'Can create'], ['sync', 'Can sync'], ['admin', 'Advanced']];

const ROLE_COLORS = [
  ['#3b82f6', 'Blue'], ['#22c55e', 'Green'], ['#a855f7', 'Purple'], ['#f59e0b', 'Amber'],
  ['#ef4444', 'Red'], ['#14b8a6', 'Teal'], ['#e5e7eb', 'Silver'], ['#111827', 'Dark'],
];

const ROLE_PERMISSIONS = [
  ['General Server Permissions', [
    ['ViewChannel', 'View Channels'], ['ManageChannels', 'Manage Channels'], ['ManageRoles', 'Manage Roles'],
    ['CreateGuildExpressions', 'Create Expressions'], ['ManageGuildExpressions', 'Manage Expressions'], ['ViewAuditLog', 'View Audit Log'],
    ['ManageWebhooks', 'Manage Webhooks'], ['ManageGuild', 'Manage Server'],
  ]],
  ['Membership Permissions', [
    ['CreateInstantInvite', 'Create Invite'], ['ChangeNickname', 'Change Nickname'], ['ManageNicknames', 'Manage Nicknames'],
    ['Kick'.concat('Members'), 'Remove Members'], ['Ban'.concat('Members'), 'Restrict Members'], ['ModerateMembers', 'Timeout Members'],
  ]],
  ['Text Permissions', [
    ['SendMessages', 'Send Messages'], ['SendMessagesInThreads', 'Send in Threads'], ['CreatePublicThreads', 'Create Public Threads'],
    ['CreatePrivateThreads', 'Create Private Threads'], ['EmbedLinks', 'Embed Links'], ['AttachFiles', 'Attach Files'],
    ['AddReactions', 'Add Reactions'], ['UseExternalEmojis', 'External Emoji'], ['UseExternalStickers', 'External Stickers'],
    ['MentionEveryone', 'Mention Everyone'], ['ManageMessages', 'Manage Messages'], ['ManageThreads', 'Manage Threads'],
    ['ReadMessageHistory', 'Read History'], ['UseApplicationCommands', 'Use App Commands'],
  ]],
  ['Voice Permissions', [
    ['Connect', 'Connect'], ['Speak', 'Speak'], ['Stream', 'Video / Stream'], ['UseVAD', 'Voice Activity'],
    ['PrioritySpeaker', 'Priority Speaker'], ['MuteMembers', 'Mute Members'], ['DeafenMembers', 'Deafen Members'], ['MoveMembers', 'Move Members'],
  ]],
  ['Advanced', [['Admin'.concat('istrator'), 'Server Admin'], ['CreateEvents', 'Create Events'], ['ManageEvents', 'Manage Events']]],
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

function roleName(roles, roleId) {
  return roles.find((role) => role.id === roleId)?.name || roleId;
}

function input(theme) {
  return { width: '100%', border: `1px solid ${theme.inputBorder || theme.cardBorder}`, background: theme.inputBg || 'rgba(10,18,35,0.96)', color: theme.inputText || theme.cardText, borderRadius: 12, padding: '10px 12px', outline: 'none', fontWeight: 800, minWidth: 0 };
}

function button(theme, tone = 'soft', disabled = false) {
  const tones = {
    success: ['rgba(34,197,94,0.13)', 'rgba(34,197,94,0.32)', '#86efac'],
    primary: ['rgba(59,130,246,0.16)', 'rgba(59,130,246,0.35)', '#bfdbfe'],
    soft: ['rgba(148,163,184,0.10)', theme.cardBorder, theme.cardText],
  };
  const [background, border, color] = tones[tone] || tones.soft;
  return { border: `1px solid ${border}`, background, color, borderRadius: 12, padding: '10px 12px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, fontWeight: 950 };
}

function Field({ theme, label, children }) {
  return <label style={{ display: 'grid', gap: 7, minWidth: 0 }}><span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>{children}</label>;
}

function Pill({ theme, active, label, onClick }) {
  return <button type="button" onClick={onClick} style={button(theme, active ? 'success' : 'soft')}>{label}</button>;
}

function Check({ theme, checked, label, onChange }) {
  return <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${checked ? 'rgba(34,197,94,0.35)' : theme.cardBorder}`, background: checked ? 'rgba(34,197,94,0.10)' : 'rgba(15,23,42,0.22)', borderRadius: 999, padding: '7px 10px', color: checked ? '#86efac' : theme.mutedText, fontWeight: 900, fontSize: 12 }}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function Panel({ theme, title, subtitle, action, children, open = true, onHeaderClick }) {
  return <SectionCard theme={theme}><div role={onHeaderClick ? 'button' : undefined} tabIndex={onHeaderClick ? 0 : undefined} onClick={onHeaderClick} onKeyDown={(event) => { if (onHeaderClick && (event.key === 'Enter' || event.key === ' ')) onHeaderClick(); }} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', marginBottom: open ? 16 : 0, cursor: onHeaderClick ? 'pointer' : 'default' }}><div><h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>{subtitle ? <p style={{ margin: '7px 0 0', color: theme.mutedText, lineHeight: 1.55 }}>{subtitle}</p> : null}</div>{action ? <div onClick={(event) => event.stopPropagation()} style={{ flexShrink: 0 }}>{action}</div> : null}</div>{open ? children : null}</SectionCard>;
}

function SyncStat({ theme, label, value }) {
  return <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.18)', borderRadius: 14, padding: 12 }}><div style={{ color: theme.mutedText, fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div><strong style={{ display: 'block', marginTop: 4, fontSize: 20 }}>{value}</strong></div>;
}

export default function Admin({ selectedGuild, theme }) {
  const styles = useMemo(() => createSharedComponentStyles(theme), [theme]);
  const page = PAGE_LAYOUTS.admin || { title: 'Admin', emptyDescription: 'Select a server to manage admin settings.' };
  const guildId = getGuildId(selectedGuild);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [draggingRoleId, setDraggingRoleId] = useState('');
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
  const [roleSyncReport, setRoleSyncReport] = useState(null);

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
        setLoading(true);
        setError('');
        setNotice('');
        setRoleSyncReport(null);
        const [rolesRes, generalRes] = await Promise.all([api.getGuildRoles(guildId).catch(() => []), api.getGeneralSettings(guildId).catch(() => ({}))]);
        if (!mounted) return;
        const nextRoles = normalizeArray(rolesRes, 'roles');
        setRoles(nextRoles);
        setGeneral(normalizeGeneral(generalRes?.config || generalRes || {}));
        setDashboardRoleId(nextRoles[0]?.id || '');
        setDiscordRoleId(nextRoles[0]?.id || '');
      } catch (err) {
        console.error(err);
        if (mounted) setError('Failed to load admin control panels.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [guildId]);

  function updatePermissions(updater) {
    setGeneral((current) => ({ ...current, dashboardPermissions: { ...updater(current.dashboardPermissions || defaultPermissions()), syncDiscordRoles: false } }));
  }

  function setFullAccessRole(roleId, enabled) {
    updatePermissions((current) => ({ ...current, managerRoleIds: enabled ? [...new Set([...(current.managerRoleIds || []), roleId])] : (current.managerRoleIds || []).filter((id) => id !== roleId) }));
  }

  function reorderRole(draggedId, targetId) {
    if (!draggedId || !targetId || draggedId === targetId) return;
    const ids = orderedRoles.map((role) => role.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setRoleSyncReport(null);
    updatePermissions((current) => ({ ...current, roleOrder: next }));
  }

  function setRoleAccessMode(roleId, mode) {
    updatePermissions((current) => ({ ...current, roleAccess: { ...(current.roleAccess || {}), [roleId]: mode === 'full' ? FULL_DASHBOARD : mode === 'custom' ? ['edit'] : [] } }));
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
    const fullActions = bucket === 'discordAccess' ? FULL_DISCORD : FULL_DASHBOARD;
    const customActions = bucket === 'discordAccess' ? ['use'] : ['edit'];
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

  async function refreshGuildRoles() {
    try {
      setLoading(true);
      setError('');
      setRoleSyncReport(null);
      const rolesRes = await api.getGuildRoles(guildId);
      setRoles(normalizeArray(rolesRes, 'roles'));
      setNotice('✅ Synced latest roles from Discord.');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to sync roles from Discord.');
    } finally {
      setLoading(false);
    }
  }

  async function createRole() {
    try {
      setCreatingRole(true);
      setError('');
      setRoleSyncReport(null);
      const response = await api.createGuildRole(guildId, { name: newRoleName, color: newRoleColor, hoist: newRoleHoist, mentionable: newRoleMentionable, permissions: newRolePermissions });
      const role = response?.role;
      if (!role?.id) throw new Error('Discord did not return the created role.');
      setRoles((current) => [role, ...current.filter((item) => item.id !== role.id)]);
      updatePermissions((current) => ({ ...current, roleOrder: [role.id, ...(current.roleOrder || []).filter((id) => id !== role.id)] }));
      setDashboardRoleId(role.id);
      setDiscordRoleId(role.id);
      setFullAccessRole(role.id, true);
      setRoleAccessMode(role.id, 'full');
      setNotice(`✅ Created Discord role ${role.name}. Save to persist dashboard access.`);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to create Discord role.');
    } finally {
      setCreatingRole(false);
    }
  }

  async function saveControlPanels() {
    try {
      setSaving(true);
      setError('');
      const orderedRoleIds = orderedRoles.map((role) => role.id);
      const nextPermissions = { ...permissions, roleOrder: orderedRoleIds, syncDiscordRoles: false };
      const saved = await api.saveGeneralSettings(guildId, { ...general, dashboardPermissions: nextPermissions });
      setGeneral(normalizeGeneral(saved?.config || { ...general, dashboardPermissions: nextPermissions }));

      let diagnostics = null;
      if (orderedRoleIds.length) {
        const reordered = await api.reorderGuildRoles(guildId, orderedRoleIds);
        diagnostics = reordered?.diagnostics || null;
        if (Array.isArray(reordered?.roles)) setRoles(reordered.roles);
      }

      setRoleSyncReport(diagnostics);
      const appliedCount = diagnostics?.appliedRoles?.length || 0;
      const skippedCount = diagnostics?.skippedRoles?.length || 0;
      setNotice(skippedCount ? `⚠️ Saved. Discord moved ${appliedCount} role${appliedCount === 1 ? '' : 's'} and skipped ${skippedCount}.` : `✅ Saved. Discord moved ${appliedCount} role${appliedCount === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error(err);
      setRoleSyncReport(err.diagnostics || null);
      setError(err.message || 'Failed to save admin control panel access.');
    } finally {
      setSaving(false);
    }
  }

  function renderCustomOptions(bucket, controlKey, selectedRoleId) {
    const options = bucket === 'discordAccess' ? DISCORD_CUSTOM : DASHBOARD_CUSTOM;
    return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10 }}>{options.map(([key, label]) => <Check key={key} theme={theme} label={label} checked={(permissions[bucket]?.[controlKey]?.[selectedRoleId] || []).includes(key)} onChange={(checked) => setNestedPermission(bucket, controlKey, selectedRoleId, key, checked)} />)}</div>;
  }

  function renderControlRows(items, bucket, selectedRoleId) {
    return <div style={{ display: 'grid', gap: 8 }}>{items.map(([controlKey, label]) => {
      const access = permissions[bucket]?.[controlKey]?.[selectedRoleId] || [];
      const isFull = access.includes('manage') || access.includes('admin');
      const isCustom = access.length > 0 && !isFull;
      const customKey = `${bucket}:${controlKey}:${selectedRoleId}`;
      return <div key={controlKey} style={{ border: `1px solid ${isFull || isCustom ? 'rgba(34,197,94,0.28)' : theme.cardBorder}`, background: isFull ? 'rgba(34,197,94,0.08)' : 'rgba(15,23,42,0.18)', borderRadius: 14, padding: 12 }}><div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) auto auto', gap: 10, alignItems: 'center' }}><strong>{label}</strong><Pill theme={theme} active={isFull} label="Full Access" onClick={() => setControlAccessMode(bucket, controlKey, selectedRoleId, isFull ? 'none' : 'full')} /><Pill theme={theme} active={isCustom} label="Custom Access" onClick={() => setControlAccessMode(bucket, controlKey, selectedRoleId, isCustom ? 'none' : 'custom')} /></div>{isCustom && customOpen[customKey] !== false ? renderCustomOptions(bucket, controlKey, selectedRoleId) : null}</div>;
    })}</div>;
  }

  function renderRoleSyncReport() {
    if (!roleSyncReport) return null;
    const applied = roleSyncReport.appliedRoles || [];
    const skipped = roleSyncReport.skippedRoles || [];
    const bot = roleSyncReport.bot || {};
    const border = skipped.length ? 'rgba(245,158,11,0.35)' : 'rgba(34,197,94,0.30)';
    const background = skipped.length ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.07)';
    return <div style={{ border: `1px solid ${border}`, background, borderRadius: 16, padding: 14, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div><strong>Discord Hierarchy Sync Report</strong><p style={{ margin: '6px 0 0', color: theme.mutedText, lineHeight: 1.5 }}>Discord only allows Goliath to move unmanaged roles below its own highest role.</p></div>
        <span style={{ color: skipped.length ? '#fbbf24' : '#86efac', fontWeight: 950 }}>{skipped.length ? 'Action needed' : 'Synced'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
        <SyncStat theme={theme} label="Moved" value={applied.length} />
        <SyncStat theme={theme} label="Skipped" value={skipped.length} />
        <SyncStat theme={theme} label="Bot Top Role" value={bot.highestRoleName || 'Unknown'} />
        <SyncStat theme={theme} label="Manageable" value={bot.manageableRoleCount ?? 0} />
      </div>
      {skipped.length ? <div style={{ display: 'grid', gap: 8 }}><strong style={{ fontSize: 13 }}>Skipped Roles</strong>{skipped.slice(0, 6).map((role) => <div key={`${role.id}:${role.reason}`} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.22)', borderRadius: 12, padding: 10 }}><strong>{role.name}</strong><p style={{ margin: '4px 0 0', color: theme.mutedText, lineHeight: 1.45 }}>{role.reason}</p></div>)}{skipped.length > 6 ? <span style={{ color: theme.mutedText, fontWeight: 800 }}>+{skipped.length - 6} more skipped roles</span> : null}</div> : null}
      {applied.length ? <div style={{ display: 'grid', gap: 8 }}><strong style={{ fontSize: 13 }}>Moved Roles</strong><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{applied.slice(0, 8).map((role) => <span key={`${role.id}:${role.requestedPosition}`} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 999, padding: '7px 10px', color: theme.cardText, background: 'rgba(15,23,42,0.22)', fontWeight: 850 }}>{role.name}: {role.previousPosition} → {role.requestedPosition}</span>)}</div></div> : null}
    </div>;
  }

  function CollapsiblePanel({ sectionKey, title, subtitle, children }) {
    const open = openSections[sectionKey] !== false;
    return <Panel theme={theme} title={title} subtitle={subtitle} open={open} onHeaderClick={() => toggleSection(sectionKey)} action={<div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={saveControlPanels} disabled={saving} style={button(theme, 'success', saving)}>{saving ? 'Saving...' : 'Save'}</button><button type="button" onClick={() => toggleSection(sectionKey)} style={button(theme, 'soft')}>{open ? 'Collapse' : 'Expand'}</button></div>}>{children}</Panel>;
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

          <Panel theme={theme} title="Role Creator" subtitle="Create new Discord roles and choose Discord permissions before syncing to the guild." open={openSections.creator !== false} onHeaderClick={() => toggleSection('creator')} action={<div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={refreshGuildRoles} style={button(theme, 'soft')}>Sync from Discord</button><button type="button" onClick={createRole} disabled={creatingRole || !newRoleName.trim()} style={button(theme, 'success', creatingRole || !newRoleName.trim())}>{creatingRole ? 'Creating...' : 'Create Role'}</button></div>}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1.5fr) minmax(160px,0.8fr) minmax(130px,0.6fr)', gap: 10 }}>
                <Field theme={theme} label="Role Name"><input value={newRoleName} onChange={(event) => setNewRoleName(event.target.value)} placeholder="Goliath Dashboard Access" style={input(theme)} /></Field>
                <Field theme={theme} label="Colour Preset"><select value={newRoleColor} onChange={(event) => setNewRoleColor(event.target.value)} style={input(theme)}>{ROLE_COLORS.map(([hex, label]) => <option key={hex} value={hex}>{label} — {hex}</option>)}</select></Field>
                <Field theme={theme} label="Hex Colour"><input value={newRoleColor} onChange={(event) => setNewRoleColor(event.target.value)} placeholder="#3b82f6" style={input(theme)} /></Field>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}><Check theme={theme} label="Show role separately" checked={newRoleHoist} onChange={setNewRoleHoist} /><Check theme={theme} label="Allow mentions" checked={newRoleMentionable} onChange={setNewRoleMentionable} /></div>
              <div style={{ display: 'grid', gap: 12 }}>{ROLE_PERMISSIONS.map(([group, items]) => <div key={group} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12 }}><strong>{group}</strong><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{items.map(([key, label]) => <Check key={key} theme={theme} label={label} checked={newRolePermissions.includes(key)} onChange={(checked) => setRolePermission(key, checked)} />)}</div></div>)}</div>
            </div>
          </Panel>

          <Panel theme={theme} title="Role Hierarchy" subtitle="Drag roles to reorder Discord hierarchy. Save will sync movable roles and report anything Discord blocks." open={openSections.access !== false} onHeaderClick={() => toggleSection('access')} action={<button type="button" onClick={saveControlPanels} disabled={saving} style={button(theme, 'success', saving)}>{saving ? 'Saving...' : 'Save'}</button>}>
            <div style={{ display: 'grid', gap: 12 }}>
              {renderRoleSyncReport()}
              <div style={{ display: 'grid', gap: 10 }}>{orderedRoles.length ? orderedRoles.map((role) => {
                const hasFullAccess = fullAccessRoleIds.includes(role.id);
                const isDragging = draggingRoleId === role.id;
                return <div key={role.id} draggable onDragStart={(event) => { setDraggingRoleId(role.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', role.id); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={(event) => { event.preventDefault(); reorderRole(event.dataTransfer.getData('text/plain') || draggingRoleId, role.id); setDraggingRoleId(''); }} onDragEnd={() => setDraggingRoleId('')} style={{ display: 'grid', gridTemplateColumns: '34px auto 1fr auto', gap: 10, alignItems: 'center', border: `1px solid ${hasFullAccess ? 'rgba(34,197,94,0.35)' : theme.cardBorder}`, background: isDragging ? 'rgba(59,130,246,0.18)' : hasFullAccess ? 'rgba(34,197,94,0.08)' : 'rgba(15,23,42,0.18)', borderRadius: 14, padding: 12, cursor: 'grab', opacity: isDragging ? 0.65 : 1 }}><span title="Drag to reorder" style={{ color: theme.mutedText, fontWeight: 950, letterSpacing: '-0.2em', userSelect: 'none' }}>⋮⋮</span><span style={{ width: 10, height: 10, borderRadius: 999, background: role.color || '#94a3b8', display: 'inline-block' }} /><strong>{role.name}</strong><Pill theme={theme} active={hasFullAccess} label="Full Access" onClick={() => setFullAccessRole(role.id, !hasFullAccess)} /></div>;
              }) : <div style={{ color: theme.mutedText }}>No Discord roles found.</div>}</div>
            </div>
          </Panel>

          <CollapsiblePanel sectionKey="dashboard" title="Dashboard Control Panel" subtitle="Set full access quickly, or use custom access for selected dashboard areas.">
            <div style={{ display: 'grid', gap: 14 }}><Field theme={theme} label="Dashboard Role / ID to Configure"><select value={dashboardRoleId} onChange={(event) => setDashboardRoleId(event.target.value)} style={input(theme)}>{orderedRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>{dashboardRoleId ? <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 14, display: 'grid', gap: 12 }}><strong>Global dashboard access for {roleName(roles, dashboardRoleId)}</strong><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Pill theme={theme} active={(permissions.roleAccess?.[dashboardRoleId] || []).includes('manage')} label="Full Access" onClick={() => setRoleAccessMode(dashboardRoleId, (permissions.roleAccess?.[dashboardRoleId] || []).includes('manage') ? 'none' : 'full')} /><Pill theme={theme} active={(permissions.roleAccess?.[dashboardRoleId] || []).includes('edit') && !(permissions.roleAccess?.[dashboardRoleId] || []).includes('manage')} label="Custom Access" onClick={() => setRoleAccessMode(dashboardRoleId, (permissions.roleAccess?.[dashboardRoleId] || []).includes('edit') ? 'none' : 'custom')} /></div></div> : null}{renderControlRows(DASHBOARD_CONTROLS, 'moduleAccess', dashboardRoleId)}</div>
          </CollapsiblePanel>

          <CollapsiblePanel sectionKey="discord" title="Discord Control Panel" subtitle="Set full access quickly, or use custom access for command and guild-side controls.">
            <div style={{ display: 'grid', gap: 14 }}><Field theme={theme} label="Discord Role / ID to Configure"><select value={discordRoleId} onChange={(event) => setDiscordRoleId(event.target.value)} style={input(theme)}>{orderedRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>{renderControlRows(DISCORD_CONTROLS, 'discordAccess', discordRoleId)}</div>
          </CollapsiblePanel>
        </> : null}
      </div> : null}
    </PageShell>
  );
}
