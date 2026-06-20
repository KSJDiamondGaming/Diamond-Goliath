import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../../services/apiClient.js';

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram', hint: 'Posts and reels later.' },
  { value: 'kick', label: 'Kick', hint: 'Live alerts.' },
  { value: 'tiktok', label: 'TikTok', hint: 'Posts and live alerts later.' },
  { value: 'twitch', label: 'Twitch', hint: 'Live alerts.' },
  { value: 'x', label: 'X', hint: 'Posts later.' },
  { value: 'youtube', label: 'YouTube', hint: 'Uploads, shorts and live alerts.' },
];

const ALERT_TYPES = ['live', 'upload', 'short', 'post'];

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
}

function normalizeAccounts(config) {
  if (Array.isArray(config?.accounts)) return config.accounts;
  if (config?.accounts && typeof config.accounts === 'object') return Object.values(config.accounts);
  return [];
}

function formatPlatform(platform) {
  return PLATFORMS.find((item) => item.value === platform)?.label || String(platform || '').toUpperCase();
}

function getPlatformHint(platform) {
  return PLATFORMS.find((item) => item.value === platform)?.hint || 'Creator alerts.';
}

function getChannelLabel(channels, channelId) {
  const channel = channels.find((item) => String(item.id) === String(channelId));
  return channel ? `#${channel.name}` : channelId || 'Not set';
}

function getRoleLabel(roles, roleId) {
  const role = roles.find((item) => String(item.id) === String(roleId));
  return role ? `@${role.name}` : roleId || 'Not set';
}

function defaultAlertType(platform) {
  if (platform === 'youtube') return 'upload';
  if (platform === 'twitch' || platform === 'kick') return 'live';
  return 'post';
}

function makeEditState(account = {}) {
  const platform = account.platform || 'instagram';
  return {
    platform,
    displayName: account.displayName || '',
    username: account.username || '',
    alertChannelId: account.alertChannelId || '',
    mentionRoleId: account.mentionRoleId || '',
    alertTypes: Array.isArray(account.alertTypes) && account.alertTypes.length ? account.alertTypes : [defaultAlertType(platform)],
  };
}

function fieldStyle(theme) {
  return {
    border: `1px solid ${theme.cardBorder}`,
    background: 'rgba(15,23,42,0.35)',
    color: theme.cardText,
    borderRadius: 14,
    padding: 12,
    fontWeight: 850,
    minHeight: 46,
    outline: 'none',
  };
}

function smallButton(theme, options = {}) {
  return {
    border: `1px solid ${options.border || theme.cardBorder}`,
    background: options.background || 'rgba(15,23,42,0.35)',
    color: options.color || theme.cardText,
    borderRadius: 999,
    padding: '9px 12px',
    fontWeight: 900,
    cursor: options.disabled ? 'not-allowed' : 'pointer',
    opacity: options.disabled ? 0.6 : 1,
  };
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

function PlatformPill({ theme, platform }) {
  return (
    <span style={{ border: `1px solid ${theme.cardBorder}`, color: theme.cardText, background: 'rgba(59,130,246,0.14)', borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 950, textTransform: 'uppercase' }}>
      {formatPlatform(platform)}
    </span>
  );
}

function ToggleButton({ theme, enabled, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={smallButton(theme, {
        border: enabled ? 'rgba(34,197,94,0.45)' : theme.cardBorder,
        background: enabled ? 'rgba(22,163,74,0.22)' : 'rgba(15,23,42,0.35)',
        color: enabled ? '#86efac' : theme.mutedText,
        disabled,
      })}
    >
      {enabled ? 'Enabled' : 'Disabled'}
    </button>
  );
}

function AlertTypeButtons({ theme, values, onToggle }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {ALERT_TYPES.map((type) => (
        <button key={type} type="button" onClick={() => onToggle(type)} style={{ border: `1px solid ${values.includes(type) ? '#93c5fd' : theme.cardBorder}`, background: values.includes(type) ? 'rgba(59,130,246,0.24)' : 'rgba(15,23,42,0.35)', color: theme.cardText, borderRadius: 999, padding: '9px 12px', fontWeight: 900, cursor: 'pointer', textTransform: 'capitalize' }}>
          {type}
        </button>
      ))}
    </div>
  );
}

function SocialAccountForm({ theme, values, channels, roles, onChange, onPlatformChange, onToggleAlertType, submitLabel, saving, onSubmit, onCancel }) {
  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 12 }}>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900 }}>Platform</span>
        <select value={values.platform} onChange={(event) => onPlatformChange(event.target.value)} style={fieldStyle(theme)}>
          {PLATFORMS.map((platform) => <option key={platform.value} value={platform.value}>{platform.label}</option>)}
        </select>
        <span style={{ color: theme.mutedText, fontSize: 12 }}>{getPlatformHint(values.platform)}</span>
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900 }}>Display Name</span>
        <input value={values.displayName} onChange={(event) => onChange('displayName', event.target.value)} placeholder="TwoToneTaj" style={fieldStyle(theme)} />
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900 }}>Username / Channel ID</span>
        <input value={values.username} onChange={(event) => onChange('username', event.target.value)} placeholder="twotonetaj" required style={fieldStyle(theme)} />
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900 }}>Alert Channel</span>
        <select value={values.alertChannelId} onChange={(event) => onChange('alertChannelId', event.target.value)} style={fieldStyle(theme)}>
          <option value="">Select channel</option>
          {channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
        </select>
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900 }}>Ping Role</span>
        <select value={values.mentionRoleId} onChange={(event) => onChange('mentionRoleId', event.target.value)} style={fieldStyle(theme)}>
          <option value="">No role ping</option>
          {roles.map((role) => <option key={role.id} value={role.id}>@{role.name}</option>)}
        </select>
      </label>

      <div style={{ display: 'grid', gap: 8 }}>
        <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900 }}>Alert Types</span>
        <AlertTypeButtons theme={theme} values={values.alertTypes || []} onToggle={onToggleAlertType} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
        <button type="submit" disabled={saving} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(37,99,235,0.26)', color: theme.cardText, borderRadius: 14, padding: '11px 14px', fontWeight: 950, cursor: saving ? 'not-allowed' : 'pointer', minHeight: 46 }}>{saving ? 'Saving...' : submitLabel}</button>
        {onCancel ? <button type="button" disabled={saving} onClick={onCancel} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.35)', color: theme.cardText, borderRadius: 14, padding: '11px 14px', fontWeight: 950, cursor: saving ? 'not-allowed' : 'pointer', minHeight: 46 }}>Cancel</button> : null}
      </div>
    </form>
  );
}

export default function Social({ theme, selectedGuild, selectedGuildData }) {
  const navigate = useNavigate();
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [overview, setOverview] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ platform: 'instagram', displayName: '', username: '', alertChannelId: '', mentionRoleId: '', alertTypes: ['post'] });
  const [editingAccountId, setEditingAccountId] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const cardStyle = useMemo(() => ({
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 22,
    boxShadow: theme.shadow,
  }), [theme]);

  async function loadGuildOptions() {
    if (!guildId) return;

    try {
      const channelPayload = await api.request(`/api/discord/${guildId}/channels`);
      setChannels(Array.isArray(channelPayload) ? channelPayload : channelPayload.channels || []);
    } catch {
      setChannels([]);
    }

    try {
      const rolePayload = await api.request(`/api/discord/${guildId}/roles`);
      setRoles(Array.isArray(rolePayload) ? rolePayload : rolePayload.roles || []);
    } catch {
      setRoles([]);
    }
  }

  async function load() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    try {
      const [overviewPayload, configPayload] = await Promise.all([
        api.request(`/api/social/${guildId}/overview`),
        api.request(`/api/social/${guildId}`),
      ]);
      setOverview(overviewPayload.overview || {});
      setAccounts(normalizeAccounts(configPayload.config));
      await loadGuildOptions();
    } catch (loadError) {
      setError(loadError.message || 'Failed to load social alerts.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [guildId]);

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updatePlatform(platform) {
    setForm((current) => ({ ...current, platform, alertTypes: [defaultAlertType(platform)] }));
  }

  function toggleAlertType(type) {
    setForm((current) => {
      const currentTypes = Array.isArray(current.alertTypes) ? current.alertTypes : [];
      const nextTypes = currentTypes.includes(type)
        ? currentTypes.filter((item) => item !== type)
        : [...currentTypes, type];
      return { ...current, alertTypes: nextTypes.length ? nextTypes : [defaultAlertType(current.platform)] };
    });
  }

  function updateEditForm(key, value) {
    setEditForm((current) => ({ ...current, [key]: value }));
  }

  function updateEditPlatform(platform) {
    setEditForm((current) => ({ ...current, platform, alertTypes: [defaultAlertType(platform)] }));
  }

  function toggleEditAlertType(type) {
    setEditForm((current) => {
      const currentTypes = Array.isArray(current?.alertTypes) ? current.alertTypes : [];
      const nextTypes = currentTypes.includes(type)
        ? currentTypes.filter((item) => item !== type)
        : [...currentTypes, type];
      return { ...current, alertTypes: nextTypes.length ? nextTypes : [defaultAlertType(current?.platform)] };
    });
  }

  function startEditing(account) {
    setEditingAccountId(account.accountId);
    setEditForm(makeEditState(account));
    setError('');
    setNotice('');
  }

  function cancelEditing() {
    setEditingAccountId('');
    setEditForm(null);
  }

  async function saveAccount(event) {
    event.preventDefault();
    if (!guildId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.request(`/api/social/${guildId}/accounts`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setNotice('Social account saved.');
      setForm({ platform: 'instagram', displayName: '', username: '', alertChannelId: '', mentionRoleId: '', alertTypes: ['post'] });
      await load();
    } catch (saveError) {
      setError(saveError.message || 'Failed to save social account.');
    } finally {
      setSaving(false);
    }
  }

  async function updateAccount(account, updates) {
    if (!guildId || !account?.accountId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.request(`/api/social/${guildId}/accounts/${account.accountId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      setNotice('Social account updated.');
      await load();
    } catch (updateError) {
      setError(updateError.message || 'Failed to update social account.');
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(event, account) {
    event.preventDefault();
    await updateAccount(account, editForm || {});
    cancelEditing();
  }

  async function removeAccount(account) {
    if (!guildId || !account?.accountId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.request(`/api/social/${guildId}/accounts/${account.accountId}`, { method: 'DELETE' });
      setNotice('Social account removed.');
      if (editingAccountId === account.accountId) cancelEditing();
      await load();
    } catch (removeError) {
      setError(removeError.message || 'Failed to remove social account.');
    } finally {
      setSaving(false);
    }
  }

  async function testAccount(account) {
    if (!guildId || !account?.accountId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await api.request(`/api/social/${guildId}/accounts/${account.accountId}/test`, { method: 'POST' });
      setNotice(result.alert?.title || 'Test alert generated.');
    } catch (testError) {
      setError(testError.message || 'Failed to generate test alert.');
    } finally {
      setSaving(false);
    }
  }

  if (!guildId) {
    return <div style={{ ...cardStyle, padding: 24 }}>Select a server from the navbar to manage social alerts.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{ ...cardStyle, padding: 24, background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.08) 46%, rgba(236,72,153,0.14))', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => navigate('/modules')} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.35)', color: theme.cardText, borderRadius: 999, padding: '9px 12px', fontWeight: 950, cursor: 'pointer' }}>
            Back to Modules
          </button>
          <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Modules / Social Alerts</div>
        </div>
        <div>
          <p style={{ margin: '0 0 8px', color: '#93c5fd', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Goliath Creator Suite</p>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: '-0.04em' }}>Social Alerts</h1>
          <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 860 }}>Track multiple creators across Instagram, Kick, TikTok, Twitch, X and YouTube. Provider polling comes next; this page builds the account and notification foundation.</p>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12 }}>
        <StatCard theme={theme} label="Status" value={overview.enabled === false ? 'Disabled' : 'Enabled'} hint={loading ? 'Loading...' : 'Social module'} />
        <StatCard theme={theme} label="Accounts" value={overview.accountCount ?? accounts.length} hint="Tracked creators" />
        <StatCard theme={theme} label="Enabled" value={overview.enabledAccountCount ?? accounts.filter((item) => item.enabled !== false).length} hint="Active monitors" />
        <StatCard theme={theme} label="Platforms" value={Object.keys(overview.platformCounts || {}).length} hint="Configured" />
        <StatCard theme={theme} label="Alerts Sent" value={overview.analytics?.alertsSent ?? 0} hint="All platforms" />
      </section>

      {(error || notice) ? <section style={{ ...cardStyle, padding: 16, color: error ? '#fca5a5' : '#86efac', fontWeight: 850 }}>{error || notice}</section> : null}

      <section style={{ ...cardStyle, padding: 22, display: 'grid', gap: 16 }}>
        <div>
          <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Add Creator Account</div>
          <p style={{ margin: '6px 0 0', color: theme.mutedText }}>Add one account per creator/platform combination. Channel and role selectors use the current Discord server.</p>
        </div>

        <SocialAccountForm
          theme={theme}
          values={form}
          channels={channels}
          roles={roles}
          onChange={updateForm}
          onPlatformChange={updatePlatform}
          onToggleAlertType={toggleAlertType}
          submitLabel="Save Account"
          saving={saving}
          onSubmit={saveAccount}
        />
      </section>

      <section style={{ ...cardStyle, padding: 22, display: 'grid', gap: 12 }}>
        <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tracked Accounts</div>
        {accounts.length === 0 ? (
          <div style={{ color: theme.mutedText, padding: 14 }}>No social accounts added yet.</div>
        ) : accounts.map((account) => {
          const enabled = account.enabled !== false;
          const isEditing = editingAccountId === account.accountId;
          return (
            <article key={account.accountId} style={{ border: `1px solid ${isEditing ? '#93c5fd' : enabled ? 'rgba(59,130,246,0.34)' : theme.cardBorder}`, background: enabled ? 'rgba(15,23,42,0.32)' : 'rgba(15,23,42,0.18)', borderRadius: 18, padding: 16, display: 'grid', gap: 14, opacity: enabled ? 1 : 0.72 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <PlatformPill theme={theme} platform={account.platform} />
                  <h3 style={{ margin: '10px 0 0', color: theme.cardText }}>{account.displayName || account.username}</h3>
                  <p style={{ margin: '6px 0 0', color: theme.mutedText }}>{account.username}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <ToggleButton theme={theme} enabled={enabled} disabled={saving} onClick={() => updateAccount(account, { enabled: !enabled })} />
                  <button type="button" onClick={() => (isEditing ? cancelEditing() : startEditing(account))} disabled={saving} style={smallButton(theme, { background: isEditing ? 'rgba(250,204,21,0.16)' : 'rgba(59,130,246,0.16)', color: isEditing ? '#fde68a' : theme.cardText, disabled: saving })}>{isEditing ? 'Close Edit' : 'Edit'}</button>
                  <button type="button" onClick={() => testAccount(account)} disabled={saving || !enabled} style={smallButton(theme, { background: 'rgba(37,99,235,0.22)', disabled: saving || !enabled })}>Test</button>
                  <button type="button" onClick={() => removeAccount(account)} disabled={saving} style={smallButton(theme, { background: 'rgba(220,38,38,0.18)', disabled: saving })}>Remove</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10, color: theme.mutedText, fontSize: 13 }}>
                <div><strong style={{ color: theme.cardText }}>Alert Channel:</strong> {getChannelLabel(channels, account.alertChannelId)}</div>
                <div><strong style={{ color: theme.cardText }}>Ping Role:</strong> {getRoleLabel(roles, account.mentionRoleId)}</div>
                <div><strong style={{ color: theme.cardText }}>Alert Types:</strong> {(account.alertTypes || []).join(', ')}</div>
                <div><strong style={{ color: theme.cardText }}>Last Alert:</strong> {account.lastSeen?.lastAlertAt || 'Never'}</div>
              </div>

              {isEditing && editForm ? (
                <section style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.28)', borderRadius: 16, padding: 14, display: 'grid', gap: 12 }}>
                  <div>
                    <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Edit Account</div>
                    <p style={{ margin: '5px 0 0', color: theme.mutedText, fontSize: 13 }}>Update this creator account without removing it.</p>
                  </div>
                  <SocialAccountForm
                    theme={theme}
                    values={editForm}
                    channels={channels}
                    roles={roles}
                    onChange={updateEditForm}
                    onPlatformChange={updateEditPlatform}
                    onToggleAlertType={toggleEditAlertType}
                    submitLabel="Save Changes"
                    saving={saving}
                    onSubmit={(event) => saveEdit(event, account)}
                    onCancel={cancelEditing}
                  />
                </section>
              ) : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}
