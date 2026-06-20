import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../../services/apiClient.js';

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
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

function ResourceList({ theme, title, items, emptyText }) {
  const visibleItems = Array.isArray(items) ? items.slice(0, 8) : [];

  return (
    <section style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.28)', borderRadius: 18, padding: 16 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {visibleItems.length === 0 ? (
          <div style={{ color: theme.mutedText, fontSize: 13 }}>{emptyText}</div>
        ) : visibleItems.map((item) => (
          <div key={item.id || item.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: '9px 10px' }}>
            <span style={{ fontWeight: 850 }}>{item.name || item.id}</span>
            <span style={{ color: theme.mutedText, fontSize: 12 }}>{item.id}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function DiscordResourceDashboard({
  theme,
  selectedGuild,
  selectedGuildData,
  title,
  eyebrow = 'Goliath Module',
  description,
  settings = [],
  analytics = [],
}) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [resources, setResources] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const cardStyle = useMemo(() => ({
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 22,
    boxShadow: theme.shadow,
  }), [theme]);

  async function loadResources() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    setNotice('');

    try {
      const payload = await api.getGuildDiscordResources(guildId);
      setResources(payload || {});
    } catch (loadError) {
      setError(loadError.message || 'Failed to load Discord resources.');
    } finally {
      setLoading(false);
    }
  }

  async function syncResources() {
    if (!guildId) return;
    setSyncing(true);
    setError('');
    setNotice('');

    try {
      const payload = await api.syncGuildDiscordResources(guildId);
      setResources(payload || {});
      setNotice('Discord resources refreshed and saved to guild JSON.');
    } catch (syncError) {
      setError(syncError.message || 'Failed to refresh Discord resources.');
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadResources();
  }, [guildId]);

  const channels = resources?.channels || [];
  const categories = resources?.categories || [];
  const roles = resources?.roles || [];
  const emojis = resources?.emojis || [];
  const guild = resources?.guild || null;

  if (!guildId) {
    return <div style={{ ...cardStyle, padding: 24 }}>Select a server from the navbar to manage {title}.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{ ...cardStyle, padding: 24, background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.08) 46%, rgba(52,211,153,0.14))' }}>
        <p style={{ margin: '0 0 8px', color: '#93c5fd', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{eyebrow}</p>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: '-0.04em' }}>{title}</h1>
        <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 840 }}>{description}</p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
        <StatCard theme={theme} label="Channels" value={channels.length} hint="Cached resources" />
        <StatCard theme={theme} label="Categories" value={categories.length} hint="Cached resources" />
        <StatCard theme={theme} label="Roles" value={roles.length} hint="Cached resources" />
        <StatCard theme={theme} label="Emojis" value={emojis.length} hint="Cached resources" />
      </section>

      {(error || notice || loading) ? (
        <section style={{ ...cardStyle, padding: 16, color: error ? '#fca5a5' : notice ? '#86efac' : theme.mutedText, fontWeight: 850 }}>
          {error || notice || 'Loading Discord resources...'}
        </section>
      ) : null}

      <section style={{ ...cardStyle, padding: 22, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>Overview</h2>
            <p style={{ margin: '6px 0 0', color: theme.mutedText }}>Shared Discord metadata is cached inside guild JSON and reused across module dashboards.</p>
          </div>
          <button type="button" onClick={syncResources} disabled={syncing} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(37,99,235,0.22)', color: theme.cardText, borderRadius: 14, padding: '11px 14px', fontWeight: 950, cursor: 'pointer' }}>
            {syncing ? 'Refreshing...' : 'Refresh Discord Resources'}
          </button>
        </div>
        <div style={{ color: theme.mutedText, fontSize: 13 }}>
          Last sync: {resources?.lastSync || 'Not synced yet'}{guild?.name ? ` • ${guild.name}` : ''}
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 22, display: 'grid', gap: 16 }}>
        <h2 style={{ margin: 0 }}>Settings</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
          {settings.map((setting) => (
            <StatCard key={setting.label} theme={theme} label={setting.label} value={setting.value} hint={setting.hint} />
          ))}
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 22, display: 'grid', gap: 16 }}>
        <h2 style={{ margin: 0 }}>Analytics</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
          {analytics.map((item) => (
            <StatCard key={item.label} theme={theme} label={item.label} value={item.value} hint={item.hint} />
          ))}
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 22, display: 'grid', gap: 16 }}>
        <h2 style={{ margin: 0 }}>Discord Resources</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
          <ResourceList theme={theme} title="Channels" items={channels} emptyText="No channels cached yet." />
          <ResourceList theme={theme} title="Categories" items={categories} emptyText="No categories cached yet." />
          <ResourceList theme={theme} title="Roles" items={roles} emptyText="No roles cached yet." />
          <ResourceList theme={theme} title="Emojis" items={emojis} emptyText="No emojis cached yet." />
        </div>
      </section>
    </div>
  );
}
