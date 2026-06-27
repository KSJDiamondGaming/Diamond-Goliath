import React, { useMemo, useState } from 'react';

import { DEFAULT_ROLE_PERMISSIONS, DISCORD_ROLE_PERMISSION_GROUPS } from './rolePermissionGroups';

const ROLE_COLORS = [
  ['#3b82f6', 'Blue'], ['#22c55e', 'Green'], ['#a855f7', 'Purple'], ['#f59e0b', 'Amber'],
  ['#ef4444', 'Red'], ['#14b8a6', 'Teal'], ['#e5e7eb', 'Silver'], ['#111827', 'Dark'],
];

function input(theme) {
  return { width: '100%', border: `1px solid ${theme.inputBorder || theme.cardBorder}`, background: theme.inputBg || 'rgba(10,18,35,0.96)', color: theme.inputText || theme.cardText, borderRadius: 12, padding: '10px 12px', outline: 'none', fontWeight: 800, minWidth: 0 };
}

function actionButton(theme, tone = 'soft', disabled = false) {
  const tones = {
    save: ['rgba(34,197,94,0.13)', 'rgba(34,197,94,0.32)', '#86efac'],
    soft: ['rgba(148,163,184,0.10)', theme.cardBorder, theme.cardText],
  };
  const [background, border, color] = tones[tone] || tones.soft;
  return { border: `1px solid ${border}`, background, color, borderRadius: 12, padding: '10px 12px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, fontWeight: 950 };
}

function Field({ theme, label, children }) {
  return <label style={{ display: 'grid', gap: 7, minWidth: 0 }}><span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>{children}</label>;
}

function Toggle({ theme, checked, label, onChange }) {
  return <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${checked ? 'rgba(34,197,94,0.35)' : theme.cardBorder}`, background: checked ? 'rgba(34,197,94,0.10)' : 'rgba(15,23,42,0.22)', borderRadius: 999, padding: '7px 10px', color: checked ? '#86efac' : theme.mutedText, fontWeight: 900, fontSize: 12 }}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

export default function RoleCreatorFull({ creating = false, onCreate, onSync, theme }) {
  const [name, setName] = useState('Goliath Dashboard Access');
  const [color, setColor] = useState('#3b82f6');
  const [hoist, setHoist] = useState(false);
  const [mentionable, setMentionable] = useState(false);
  const [permissions, setPermissions] = useState(DEFAULT_ROLE_PERMISSIONS);
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState(Object.fromEntries(DISCORD_ROLE_PERMISSION_GROUPS.map(([group], index) => [group, index < 6])));
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const colourValid = /^#[0-9a-fA-F]{6}$/.test(color || '');
  const nameValid = name.trim().length >= 2;
  const canCreate = !creating && nameValid && colourValid;

  function setPermission(permission, enabled) {
    setPermissions((current) => {
      const next = new Set(current || []);
      if (enabled) next.add(permission); else next.delete(permission);
      return [...next].sort();
    });
  }

  function setGroup(items, enabled) {
    setPermissions((current) => {
      const next = new Set(current || []);
      items.forEach(([key]) => { if (enabled) next.add(key); else next.delete(key); });
      return [...next].sort();
    });
  }

  async function handleCreate() {
    if (!canCreate) return;
    await onCreate({ color, hoist, mentionable, name, permissions });
  }

  const needle = search.trim().toLowerCase();
  const groups = DISCORD_ROLE_PERMISSION_GROUPS
    .map(([group, items]) => [group, needle ? items.filter(([key, label]) => `${group} ${key} ${label}`.toLowerCase().includes(needle)) : items])
    .filter(([, items]) => items.length);

  return <div style={{ display: 'grid', gap: 14 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div><strong style={{ fontSize: 18 }}>Create Discord Role</strong><p style={{ margin: '6px 0 0', color: theme.mutedText }}>Create roles with the same full Discord permission matrix used by the editor.</p></div>
      <div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={onSync} style={actionButton(theme, 'soft')}>Sync from Discord</button><button type="button" onClick={handleCreate} disabled={!canCreate} style={actionButton(theme, 'save', !canCreate)}>{creating ? 'Creating...' : 'Create Role'}</button></div>
    </div>

    {!colourValid ? <div style={{ border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', borderRadius: 12, padding: 10, color: '#fecaca', fontWeight: 850 }}>Use a valid hex colour, for example #3b82f6.</div> : null}
    {!nameValid ? <div style={{ border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', borderRadius: 12, padding: 10, color: '#fecaca', fontWeight: 850 }}>Role name must be at least 2 characters.</div> : null}

    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1.5fr) minmax(160px,0.8fr) minmax(130px,0.6fr)', gap: 10 }}>
      <Field theme={theme} label="Role Name"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Goliath Dashboard Access" style={input(theme)} /></Field>
      <Field theme={theme} label="Colour Preset"><select value={color} onChange={(event) => setColor(event.target.value)} style={input(theme)}>{ROLE_COLORS.map(([hex, label]) => <option key={hex} value={hex}>{label} — {hex}</option>)}</select></Field>
      <Field theme={theme} label="Hex Colour"><input value={color} onChange={(event) => setColor(event.target.value)} placeholder="#3b82f6" style={input(theme)} /></Field>
    </div>

    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}><Toggle theme={theme} label="Show role separately" checked={hoist} onChange={setHoist} /><Toggle theme={theme} label="Allow mentions" checked={mentionable} onChange={setMentionable} /></div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
      <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 10 }}><span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950 }}>Enabled</span><strong style={{ display: 'block', marginTop: 4 }}>{permissions.length}</strong></div>
      <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: 10 }}><span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950 }}>Groups</span><strong style={{ display: 'block', marginTop: 4 }}>{DISCORD_ROLE_PERMISSION_GROUPS.length}</strong></div>
    </div>

    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center' }}><strong>Discord Permissions</strong><button type="button" onClick={() => setOpenGroups(Object.fromEntries(DISCORD_ROLE_PERMISSION_GROUPS.map(([group]) => [group, true])))} style={actionButton(theme)}>Expand All</button><button type="button" onClick={() => setOpenGroups(Object.fromEntries(DISCORD_ROLE_PERMISSION_GROUPS.map(([group]) => [group, false])))} style={actionButton(theme)}>Collapse All</button></div>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search permissions..." style={input(theme)} />
      {groups.map(([group, items]) => {
        const open = needle || openGroups[group] !== false;
        const selectedCount = items.filter(([key]) => permissionSet.has(key)).length;
        return <div key={group} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12 }}>
          <div role="button" tabIndex={0} onClick={() => !needle && setOpenGroups((current) => ({ ...current, [group]: current[group] === false }))} onKeyDown={(event) => { if (!needle && (event.key === 'Enter' || event.key === ' ')) setOpenGroups((current) => ({ ...current, [group]: current[group] === false })); }} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, cursor: needle ? 'default' : 'pointer' }}><strong>{group}</strong><span style={{ color: theme.mutedText, fontWeight: 850 }}>{selectedCount}/{items.length}</span></div>
          {open ? <><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}><button type="button" onClick={() => setGroup(items, true)} style={actionButton(theme)}>Select Group</button><button type="button" onClick={() => setGroup(items, false)} style={actionButton(theme)}>Clear Group</button></div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{items.map(([key, label]) => <Toggle key={key} theme={theme} label={label} checked={permissionSet.has(key)} onChange={(checked) => setPermission(key, checked)} />)}</div></> : null}
        </div>;
      })}
      {!groups.length ? <div style={{ color: theme.mutedText }}>No permissions match that search.</div> : null}
    </div>
  </div>;
}
