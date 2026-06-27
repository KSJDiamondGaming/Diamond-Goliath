import React, { useEffect, useMemo, useState } from 'react';

const PERMISSION_GROUPS = [
  ['General', [
    ['ViewChannel', 'View Channels'], ['ManageChannels', 'Manage Channels'], ['ManageRoles', 'Manage Roles'],
    ['ViewAuditLog', 'View Audit Log'], ['ManageWebhooks', 'Manage Webhooks'], ['ManageGuild', 'Manage Server'],
  ]],
  ['Members', [
    ['Kick'.concat('Members'), 'Remove Members'], ['Ban'.concat('Members'), 'Restrict Members'], ['ModerateMembers', 'Timeout Members'],
    ['ChangeNickname', 'Change Nickname'], ['ManageNicknames', 'Manage Nicknames'],
  ]],
  ['Text', [
    ['SendMessages', 'Send Messages'], ['SendMessagesInThreads', 'Send in Threads'], ['CreatePublicThreads', 'Create Public Threads'],
    ['CreatePrivateThreads', 'Create Private Threads'], ['EmbedLinks', 'Embed Links'], ['AttachFiles', 'Attach Files'],
    ['AddReactions', 'Add Reactions'], ['MentionEveryone', 'Mention Everyone'], ['ManageMessages', 'Manage Messages'],
    ['ManageThreads', 'Manage Threads'], ['ReadMessageHistory', 'Read History'], ['UseApplicationCommands', 'Use App Commands'],
  ]],
  ['Voice', [
    ['Connect', 'Connect'], ['Speak', 'Speak'], ['Stream', 'Video / Stream'], ['UseVAD', 'Voice Activity'],
    ['PrioritySpeaker', 'Priority Speaker'], ['MuteMembers', 'Mute Members'], ['DeafenMembers', 'Deafen Members'], ['MoveMembers', 'Move Members'],
  ]],
  ['Advanced', [['Admin'.concat('istrator'), 'Server Admin'], ['CreateEvents', 'Create Events'], ['ManageEvents', 'Manage Events']]],
];

function input(theme) {
  return { width: '100%', border: `1px solid ${theme.inputBorder || theme.cardBorder}`, background: theme.inputBg || 'rgba(10,18,35,0.96)', color: theme.inputText || theme.cardText, borderRadius: 12, padding: '10px 12px', outline: 'none', fontWeight: 800, minWidth: 0 };
}

function button(theme, tone = 'soft', disabled = false) {
  const tones = {
    danger: ['rgba(239,68,68,0.12)', 'rgba(239,68,68,0.34)', '#fecaca'],
    success: ['rgba(34,197,94,0.13)', 'rgba(34,197,94,0.32)', '#86efac'],
    soft: ['rgba(148,163,184,0.10)', theme.cardBorder, theme.cardText],
  };
  const [background, border, color] = tones[tone] || tones.soft;
  return { border: `1px solid ${border}`, background, color, borderRadius: 12, padding: '10px 12px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, fontWeight: 950 };
}

function Check({ disabled = false, theme, checked, label, onChange }) {
  return <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${checked ? 'rgba(34,197,94,0.35)' : theme.cardBorder}`, background: checked ? 'rgba(34,197,94,0.10)' : 'rgba(15,23,42,0.22)', borderRadius: 999, padding: '7px 10px', color: checked ? '#86efac' : theme.mutedText, fontWeight: 900, fontSize: 12, opacity: disabled ? 0.55 : 1 }}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function makeDraft(role) {
  if (!role) return null;
  return {
    color: /^#[0-9a-fA-F]{6}$/.test(role.color || '') ? role.color : '#000000',
    hoist: role.hoist === true,
    mentionable: role.mentionable === true,
    name: role.name || '',
    permissions: Array.isArray(role.permissions) ? [...role.permissions].sort() : [],
  };
}

function isSameDraft(a, b) {
  if (!a || !b) return true;
  return a.name === b.name
    && a.color === b.color
    && a.hoist === b.hoist
    && a.mentionable === b.mentionable
    && JSON.stringify([...(a.permissions || [])].sort()) === JSON.stringify([...(b.permissions || [])].sort());
}

export default function RoleEditorCard({ role, theme, onDelete, onSave, saving = false, deleting = false }) {
  const [draft, setDraft] = useState(null);
  const [openGroups, setOpenGroups] = useState({ Advanced: false, General: true, Members: true, Text: true, Voice: true });
  const [permissionSearch, setPermissionSearch] = useState('');
  const originalDraft = useMemo(() => makeDraft(role), [role]);
  const permissionSet = useMemo(() => new Set(draft?.permissions || []), [draft?.permissions]);
  const isDirty = !isSameDraft(originalDraft, draft);
  const colourValid = /^#[0-9a-fA-F]{6}$/.test(draft?.color || '');
  const nameValid = (draft?.name || '').trim().length >= 2;

  useEffect(() => {
    setDraft(makeDraft(role));
    setPermissionSearch('');
    setOpenGroups({ Advanced: false, General: true, Members: true, Text: true, Voice: true });
  }, [role?.id]);

  if (!role || !draft) {
    return <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 14, color: theme.mutedText }}>Select a role to edit its Discord settings.</div>;
  }

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setPermission(permission, enabled) {
    setDraft((current) => {
      const next = new Set(current.permissions || []);
      if (enabled) next.add(permission); else next.delete(permission);
      return { ...current, permissions: [...next].sort() };
    });
  }

  function setGroupPermissions(items, enabled) {
    setDraft((current) => {
      const next = new Set(current.permissions || []);
      items.forEach(([key]) => { if (enabled) next.add(key); else next.delete(key); });
      return { ...current, permissions: [...next].sort() };
    });
  }

  const locked = role.managed === true;
  const saveDisabled = saving || locked || !isDirty || !colourValid || !nameValid;
  const search = permissionSearch.trim().toLowerCase();
  const filteredGroups = PERMISSION_GROUPS.map(([group, items]) => [
    group,
    search ? items.filter(([key, label]) => `${key} ${label} ${group}`.toLowerCase().includes(search)) : items,
  ]).filter(([, items]) => items.length > 0);

  return <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.18)', borderRadius: 16, padding: 14, display: 'grid', gap: 14 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
      <div><strong style={{ fontSize: 18 }}>Role Editor</strong><p style={{ margin: '6px 0 0', color: theme.mutedText }}>Edit name, colour, visibility, mentions and Discord permissions.</p></div>
      <div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={() => setDraft(makeDraft(role))} disabled={!isDirty || saving || deleting} style={button(theme, 'soft', !isDirty || saving || deleting)}>Reset</button><button type="button" onClick={() => onSave(draft)} disabled={saveDisabled} style={button(theme, 'success', saveDisabled)}>{saving ? 'Saving...' : 'Save Role'}</button><button type="button" onClick={() => onDelete(role)} disabled={deleting || locked} style={button(theme, 'danger', deleting || locked)}>{deleting ? 'Deleting...' : 'Delete'}</button></div>
    </div>

    {locked ? <div style={{ border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.08)', borderRadius: 12, padding: 10, color: '#fbbf24', fontWeight: 850 }}>Managed roles cannot be edited directly.</div> : null}
    {!colourValid ? <div style={{ border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', borderRadius: 12, padding: 10, color: '#fecaca', fontWeight: 850 }}>Use a valid hex colour, for example #3b82f6.</div> : null}
    {!nameValid ? <div style={{ border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', borderRadius: 12, padding: 10, color: '#fecaca', fontWeight: 850 }}>Role name must be at least 2 characters.</div> : null}

    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1.4fr) minmax(130px,0.6fr) minmax(130px,0.6fr)', gap: 10 }}>
      <label style={{ display: 'grid', gap: 7 }}><span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase' }}>Name</span><input value={draft.name} disabled={locked} onChange={(event) => updateDraft('name', event.target.value)} style={input(theme)} /></label>
      <label style={{ display: 'grid', gap: 7 }}><span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase' }}>Colour</span><input type="color" value={colourValid ? draft.color : '#000000'} disabled={locked} onChange={(event) => updateDraft('color', event.target.value)} style={{ ...input(theme), height: 42, padding: 6 }} /></label>
      <label style={{ display: 'grid', gap: 7 }}><span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase' }}>Hex</span><input value={draft.color} disabled={locked} onChange={(event) => updateDraft('color', event.target.value)} style={input(theme)} /></label>
    </div>

    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><Check disabled={locked} theme={theme} label="Show separately" checked={draft.hoist} onChange={(checked) => updateDraft('hoist', checked)} /><Check disabled={locked} theme={theme} label="Mentionable" checked={draft.mentionable} onChange={(checked) => updateDraft('mentionable', checked)} /></div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
      <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 10 }}><span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950 }}>Position</span><strong style={{ display: 'block', marginTop: 4 }}>{role.position ?? 0}</strong></div>
      <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 10 }}><span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950 }}>Managed</span><strong style={{ display: 'block', marginTop: 4 }}>{role.managed ? 'Yes' : 'No'}</strong></div>
      <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 10 }}><span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950 }}>Permissions</span><strong style={{ display: 'block', marginTop: 4 }}>{draft.permissions.length}</strong></div>
    </div>

    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center' }}>
        <strong>Discord Permissions</strong>
        <button type="button" onClick={() => setOpenGroups(Object.fromEntries(PERMISSION_GROUPS.map(([group]) => [group, true])))} style={button(theme, 'soft')}>Expand All</button>
        <button type="button" onClick={() => setOpenGroups(Object.fromEntries(PERMISSION_GROUPS.map(([group]) => [group, false])))} style={button(theme, 'soft')}>Collapse All</button>
      </div>
      <input value={permissionSearch} onChange={(event) => setPermissionSearch(event.target.value)} placeholder="Search permissions..." style={input(theme)} />
      {filteredGroups.map(([group, items]) => {
        const open = search || openGroups[group] !== false;
        const selectedCount = items.filter(([key]) => permissionSet.has(key)).length;
        return <div key={group} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12 }}>
          <div role="button" tabIndex={0} onClick={() => !search && setOpenGroups((current) => ({ ...current, [group]: current[group] === false }))} onKeyDown={(event) => { if (!search && (event.key === 'Enter' || event.key === ' ')) setOpenGroups((current) => ({ ...current, [group]: current[group] === false })); }} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, cursor: search ? 'default' : 'pointer' }}><strong>{group}</strong><span style={{ color: theme.mutedText, fontWeight: 850 }}>{selectedCount}/{items.length}</span></div>
          {open ? <><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}><button type="button" disabled={locked} onClick={() => setGroupPermissions(items, true)} style={button(theme, 'soft', locked)}>Select Group</button><button type="button" disabled={locked} onClick={() => setGroupPermissions(items, false)} style={button(theme, 'soft', locked)}>Clear Group</button></div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{items.map(([key, label]) => <Check key={key} disabled={locked} theme={theme} label={label} checked={permissionSet.has(key)} onChange={(checked) => setPermission(key, checked)} />)}</div></> : null}
        </div>;
      })}
      {!filteredGroups.length ? <div style={{ color: theme.mutedText }}>No permissions match that search.</div> : null}
    </div>
  </div>;
}
