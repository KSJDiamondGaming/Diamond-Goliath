import React, { useEffect, useMemo, useState } from 'react';

import useOwnerGuilds from '../../hooks/useOwnerGuilds.js';
import { api } from '../../services/apiClient.js';

const PROVIDERS = [
  ['OpenAI', 'Priority 1', 'Provider scaffold ready'],
  ['DeepL', 'Priority 2', 'Provider scaffold ready'],
  ['Google', 'Priority 3', 'Provider scaffold ready'],
];

function getGuildId(guild = {}) {
  return String(guild.guildId || guild.id || '');
}

function getGuildName(guild = {}) {
  return guild.name || guild.guildName || 'Unknown Guild';
}

function formatNumber(value = 0) {
  return Number(value || 0).toLocaleString();
}

function formatBool(value) {
  return value ? 'Enabled' : 'Disabled';
}

function card(theme, extra = {}) {
  return {
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 20,
    padding: 18,
    boxShadow: theme.shadow,
    minWidth: 0,
    overflow: 'hidden',
    ...extra,
  };
}

function StatCard({ theme, title, value, detail, accent = '#93c5fd' }) {
  return (
    <div style={card(theme, { padding: 16, minHeight: 118, display: 'grid', gap: 10, alignContent: 'space-between' })}>
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
      <div style={{ color: accent, fontSize: 27, fontWeight: 950, lineHeight: 1, wordBreak: 'break-word' }}>{value}</div>
      <div style={{ color: theme.mutedText, fontSize: 13, lineHeight: 1.45 }}>{detail}</div>
    </div>
  );
}

function ProviderRow({ theme, name, priority, status }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 13, background: 'rgba(15,23,42,0.18)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <strong>{name}</strong>
        <div style={{ color: theme.mutedText, fontSize: 13, marginTop: 4 }}>{status}</div>
      </div>
      <span style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 999, padding: '5px 9px', color: theme.mutedText, fontSize: 12, fontWeight: 900 }}>{priority}</span>
    </div>
  );
}

function ConfigRow({ theme, label, value }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12, background: 'rgba(15,23,42,0.18)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ color: theme.mutedText }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ChannelRow({ theme, channelId, channel }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12, background: 'rgba(15,23,42,0.18)', display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <strong>{channel.name ? `#${channel.name}` : channelId}</strong>
        <span style={{ color: channel.enabled !== false ? '#86efac' : '#fca5a5', fontSize: 12, fontWeight: 950 }}>{channel.enabled !== false ? 'Enabled' : 'Disabled'}</span>
      </div>
      <div style={{ color: theme.mutedText, fontSize: 13, lineHeight: 1.45 }}>
        Mode: {channel.mode || 'auto'} • Threads: {channel.threadMode || channel.autoCreateThreads ? 'On' : 'Off'} • Target: {channel.targetLanguage || channel.target || 'default'}
      </div>
    </div>
  );
}

export default function TranslationHub({ theme }) {
  const { guilds, selectedGuild, setSelectedGuild, loading, error } = useOwnerGuilds();
  const [overview, setOverview] = useState(null);
  const [channels, setChannels] = useState({});
  const [threads, setThreads] = useState(null);
  const [users, setUsers] = useState({});
  const [analytics, setAnalytics] = useState({});
  const [hubLoading, setHubLoading] = useState(false);
  const [hubError, setHubError] = useState('');

  const activeGuild = useMemo(
    () => guilds.find((guild) => getGuildId(guild) === String(selectedGuild)) || null,
    [guilds, selectedGuild],
  );

  async function loadTranslationHub() {
    if (!selectedGuild) return;

    try {
      setHubLoading(true);
      setHubError('');

      const [overviewRes, channelsRes, threadsRes, usersRes, analyticsRes] = await Promise.all([
        api.request(`/api/translation/${selectedGuild}/overview`),
        api.request(`/api/translation/${selectedGuild}/channels`),
        api.request(`/api/translation/${selectedGuild}/threads`),
        api.request(`/api/translation/${selectedGuild}/users`),
        api.request(`/api/translation/${selectedGuild}/analytics`),
      ]);

      setOverview(overviewRes?.overview || null);
      setChannels(channelsRes?.channels || {});
      setThreads(threadsRes || null);
      setUsers(usersRes?.userPreferences || {});
      setAnalytics(analyticsRes?.analytics || {});
    } catch (loadError) {
      console.error(loadError);
      setHubError(loadError.message || 'Failed to load translation hub.');
      setOverview(null);
      setChannels({});
      setThreads(null);
      setUsers({});
      setAnalytics({});
    } finally {
      setHubLoading(false);
    }
  }

  useEffect(() => {
    loadTranslationHub();
  }, [selectedGuild]);

  const channelEntries = Object.entries(channels || {});
  const enabledChannels = channelEntries.filter(([, channel]) => channel.enabled !== false).length;
  const userCount = Object.keys(users || {}).length;
  const threadMappings = threads?.threadMappings || {};
  const mappingCount = Object.values(threadMappings).reduce((total, item) => total + Object.keys(item || {}).length, 0);
  const translatedCount = analytics.totalTranslations || analytics.translations || analytics.messagesTranslated || 0;

  return (
    <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
      <section style={card(theme, { background: 'linear-gradient(135deg, rgba(59,130,246,0.16), rgba(15,23,42,0.08) 48%, rgba(34,197,94,0.12))', padding: 'clamp(18px, 2.4vw, 24px)' })}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 420px' }}>
            <p style={{ margin: 0, color: '#93c5fd', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Owner Translation</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: '-0.04em', lineHeight: 1 }}>🌍 Translation Hub</h1>
            <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 860 }}>
              Monitor translation channels, thread mappings, language preferences, provider readiness and usage health from one owner dashboard.
            </p>
          </div>

          <select
            value={selectedGuild || ''}
            onChange={(event) => setSelectedGuild(event.target.value)}
            style={{ minWidth: 240, border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.36)', color: theme.cardText, borderRadius: 12, padding: '10px 12px', fontWeight: 850 }}
          >
            {guilds.map((guild) => (
              <option key={getGuildId(guild)} value={getGuildId(guild)}>{getGuildName(guild)}</option>
            ))}
          </select>
        </div>
      </section>

      {error ? <section style={{ ...card(theme), color: '#fca5a5' }}>{error}</section> : null}
      {hubError ? <section style={{ ...card(theme), color: '#fca5a5' }}>{hubError}</section> : null}
      {loading || hubLoading ? <section style={card(theme)}>Loading translation hub...</section> : null}

      {!loading && !hubLoading ? (
        <>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))', gap: 12 }}>
            <StatCard theme={theme} title="Selected Guild" value={activeGuild ? getGuildName(activeGuild) : 'None'} detail={selectedGuild || 'No guild selected'} />
            <StatCard theme={theme} title="Translation" value={formatBool(overview?.enabled)} detail={`Provider: ${overview?.provider || 'manual'}`} accent={overview?.enabled ? '#86efac' : '#fca5a5'} />
            <StatCard theme={theme} title="Channels" value={`${enabledChannels}/${channelEntries.length}`} detail="Enabled / configured" accent="#38bdf8" />
            <StatCard theme={theme} title="User Languages" value={userCount} detail="Saved user preferences" accent="#a78bfa" />
            <StatCard theme={theme} title="Thread Mappings" value={mappingCount} detail="Language thread mappings" accent="#facc15" />
            <StatCard theme={theme} title="Tracked Translations" value={translatedCount} detail="Analytics counter" accent="#34d399" />
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 14 }}>
            <section style={card(theme)}>
              <h3 style={{ marginTop: 0 }}>Translation Health</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                <ConfigRow theme={theme} label="Auto Detect" value={formatBool(overview?.autoDetect)} />
                <ConfigRow theme={theme} label="Thread Mode" value={formatBool(overview?.threadMode)} />
                <ConfigRow theme={theme} label="Default Target" value={overview?.defaultTargetLanguage || 'en'} />
                <ConfigRow theme={theme} label="Target Languages" value={(overview?.targetLanguages || ['en']).join(', ')} />
              </div>
            </section>

            <section style={card(theme)}>
              <h3 style={{ marginTop: 0 }}>Provider Integration</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {PROVIDERS.map(([name, priority, status]) => (
                  <ProviderRow key={name} theme={theme} name={name} priority={priority} status={status} />
                ))}
              </div>
            </section>
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 14 }}>
            <section style={card(theme)}>
              <h3 style={{ marginTop: 0 }}>Configured Channels</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {channelEntries.length ? channelEntries.slice(0, 10).map(([channelId, channel]) => (
                  <ChannelRow key={channelId} theme={theme} channelId={channelId} channel={channel || {}} />
                )) : <div style={{ color: theme.mutedText }}>No translation channels configured yet.</div>}
              </div>
            </section>

            <section style={card(theme)}>
              <h3 style={{ marginTop: 0 }}>Activity & Gaps</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                <ConfigRow theme={theme} label="Logs Stored" value={formatNumber((threads?.logs || []).length)} />
                <ConfigRow theme={theme} label="Configured Thread Channels" value={formatNumber(Object.keys(threads?.threadChannels || {}).length)} />
                <ConfigRow theme={theme} label="Missing Provider" value={overview?.provider === 'manual' ? 'Yes' : 'No'} />
                <ConfigRow theme={theme} label="Next Build" value="Provider connection + activity feed" />
              </div>
            </section>
          </section>
        </>
      ) : null}
    </div>
  );
}
