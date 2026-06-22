import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient.js';
import PageShell, { SectionCard, EmptyState, LoadingPanel, Notice, SecondaryButton, StatGrid, SummaryStat } from '../../shared/PageShell';
import PremiumLock from '../../shared/PremiumLock.jsx';

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Never' : date.toLocaleString();
}

function formatNumber(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number.toLocaleString() : String(fallback);
}

function DetailRow({ theme, label, value, hint }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.28)', borderRadius: 14, padding: 13, display: 'grid', gap: 4 }}>
      <div style={{ color: theme.mutedText, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ color: theme.cardText, fontWeight: 950, overflowWrap: 'anywhere' }}>{value || 'None'}</div>
      {hint ? <div style={{ color: theme.mutedText, fontSize: 12, overflowWrap: 'anywhere' }}>{hint}</div> : null}
    </div>
  );
}

function StatusPill({ theme, enabled, label }) {
  const tone = enabled ? '#86efac' : '#fcd34d';
  return (
    <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {label || (enabled ? 'enabled' : 'disabled')}
    </span>
  );
}

function ChannelCard({ theme, channel }) {
  const enabled = channel.enabled !== false;
  const sourceLanguage = channel.sourceLanguage || channel.from || channel.language || 'auto';
  const targetLanguage = channel.targetLanguage || channel.to || channel.outputLanguage || 'not set';

  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.26)', borderRadius: 18, padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{channel.channelId || channel.sourceChannelId || 'translation_channel'}</div>
          <h3 style={{ margin: '5px 0 0', color: theme.cardText }}>{channel.name || channel.channelName || 'Translation Channel'}</h3>
        </div>
        <StatusPill theme={theme} enabled={enabled} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
        <DetailRow theme={theme} label="Source" value={sourceLanguage} />
        <DetailRow theme={theme} label="Target" value={targetLanguage} />
        <DetailRow theme={theme} label="Output Channel" value={channel.outputChannelId || channel.targetChannelId || 'Same channel'} />
        <DetailRow theme={theme} label="Thread Mode" value={channel.threadMode || channel.threadsEnabled ? 'Enabled' : 'Disabled'} />
      </div>
    </div>
  );
}

function PreferenceCard({ theme, preference }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.24)', borderRadius: 14, padding: 13, display: 'grid', gap: 8 }}>
      <strong style={{ color: theme.cardText }}>{preference.userTag || preference.username || preference.userId || preference.id || 'Unknown user'}</strong>
      <div style={{ color: theme.mutedText, fontSize: 13, lineHeight: 1.5 }}>
        <div><strong style={{ color: theme.cardText }}>Language:</strong> {preference.language || preference.locale || 'Not set'}</div>
        <div><strong style={{ color: theme.cardText }}>Updated:</strong> {formatDate(preference.updatedAt)}</div>
      </div>
    </div>
  );
}

export default function Translation({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [config, setConfig] = useState({});
  const [entitlements, setEntitlements] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const settings = config.settings || {};
  const analytics = config.analytics || {};
  const channels = useMemo(() => asArray(config.channels || config.channelPairs || config.configuredChannels), [config]);
  const preferences = useMemo(() => asArray(config.userLanguages || config.preferences || config.userPreferences), [config]);
  const providers = useMemo(() => asArray(config.providers || settings.providers), [config, settings]);
  const threads = useMemo(() => asArray(config.threads || config.translationThreads), [config]);
  const hasTranslationAccess = Array.isArray(entitlements?.features) && entitlements.features.includes('translation.hub');

  async function load() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    setNotice('');

    try {
      const entitlementPayload = await api.getBillingEntitlements(guildId);
      setEntitlements(entitlementPayload);

      if (!Array.isArray(entitlementPayload.features) || !entitlementPayload.features.includes('translation.hub')) {
        setConfig({ enabled: false, settings: {}, channels: {}, userLanguages: {}, analytics: {} });
        return;
      }

      const payload = await api.getGuildModules(guildId);
      const modules = payload.modules || {};
      setConfig(modules.translation || { enabled: false, settings: {}, channels: {}, userLanguages: {}, analytics: {} });
    } catch (loadError) {
      setError(loadError.message || 'Failed to load Translation Hub.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [guildId]);

  async function toggleEnabled() {
    if (!guildId || !hasTranslationAccess) return;
    setLoading(true);
    setError('');
    setNotice('');

    try {
      const enabled = config.enabled !== true;
      const result = await api.setGuildModuleEnabled(guildId, 'translation', enabled);
      setConfig(result.modules?.translation || { ...config, enabled });
      setNotice(`Translation Hub ${enabled ? 'enabled' : 'disabled'}.`);
    } catch (saveError) {
      setError(saveError.message || 'Failed to update Translation Hub status.');
    } finally {
      setLoading(false);
    }
  }

  if (!guildId) {
    return (
      <PageShell title="Translation Hub" subtitle="Select a server to manage translation settings." theme={theme}>
        <EmptyState theme={theme} text="Select a server to manage Translation Hub." />
      </PageShell>
    );
  }

  if (!loading && entitlements && !hasTranslationAccess) {
    return (
      <PageShell title="Translation Hub" subtitle="Translation Hub is a premium Goliath Pro feature." theme={theme} guild={{ id: guildId, name: 'Translation Hub' }}>
        <PremiumLock
          theme={theme}
          title="Translation Hub"
          featureKey="translation.hub"
          currentPlan={entitlements.plan}
          requiredPlan={{ name: 'Pro', icon: '👑' }}
          message="Realtime multilingual channels, provider integration and translation threads require Goliath Pro."
        />
      </PageShell>
    );
  }

  const providerName = settings.provider || config.provider || providers[0]?.name || providers[0]?.id || 'Not connected';
  const providerReady = Boolean(settings.provider || config.provider || providers.length);

  return (
    <PageShell
      title="Translation Hub"
      subtitle="Manage multilingual channels, language preferences, providers and translation analytics."
      theme={theme}
      guild={{ id: guildId, name: 'Translation Hub' }}
      actions={<SecondaryButton theme={theme} onClick={toggleEnabled} disabled={loading || !hasTranslationAccess}>{config.enabled === true ? 'Disable' : 'Enable'}</SecondaryButton>}
    >
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {notice ? <Notice theme={theme} tone="success">{notice}</Notice> : null}
      {loading ? <LoadingPanel theme={theme} text="Loading Translation Hub..." /> : null}

      <StatGrid min="min(190px, 100%)">
        <SummaryStat theme={theme} label="Status" value={config.enabled === true ? 'Enabled' : 'Disabled'} accent={config.enabled === true ? '#22c55e' : '#f59e0b'} description="modules.translation.enabled" />
        <SummaryStat theme={theme} label="Channels" value={channels.length} accent="#3b82f6" description="Configured translation channels" />
        <SummaryStat theme={theme} label="Threads" value={threads.length} accent="#a855f7" description="Translation threads" />
        <SummaryStat theme={theme} label="Users" value={preferences.length} accent="#22c55e" description="Language preferences" />
        <SummaryStat theme={theme} label="Provider" value={providerReady ? 'Ready' : 'Missing'} accent={providerReady ? '#22c55e' : '#f59e0b'} description={providerName} />
      </StatGrid>

      <SectionCard theme={theme} title="Translation Analytics" subtitle="Usage data from modules.translation.analytics.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
          <DetailRow theme={theme} label="Messages Translated" value={formatNumber(analytics.messagesTranslated ?? analytics.translated ?? 0)} />
          <DetailRow theme={theme} label="Characters" value={formatNumber(analytics.charactersTranslated ?? analytics.characters ?? 0)} />
          <DetailRow theme={theme} label="Failures" value={formatNumber(analytics.failed ?? analytics.failures ?? 0)} />
          <DetailRow theme={theme} label="Last Translation" value={formatDate(analytics.lastTranslationAt || analytics.lastTranslatedAt)} />
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Channel Management" subtitle="Configured channel language pairs and output behaviour.">
        <div style={{ display: 'grid', gap: 12 }}>
          {channels.length ? channels.map((channel, index) => (
            <ChannelCard key={channel.id || channel.channelId || channel.sourceChannelId || index} theme={theme} channel={channel} />
          )) : <EmptyState theme={theme} text="No translation channels configured yet." />}
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Provider Status" subtitle="Provider-ready status and future premium gating information.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
          <DetailRow theme={theme} label="Provider" value={providerName} />
          <DetailRow theme={theme} label="Mode" value={settings.mode || config.mode || 'Provider-ready'} />
          <DetailRow theme={theme} label="Fallback" value={settings.fallbackProvider || 'Not set'} />
          <DetailRow theme={theme} label="Premium Gate" value="translation.hub" hint="Ready for entitlement checks." />
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="User Language Preferences" subtitle="Stored user language preferences for automatic translation flows.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
          {preferences.length ? preferences.slice(0, 12).map((preference, index) => (
            <PreferenceCard key={preference.userId || preference.id || index} theme={theme} preference={preference} />
          )) : <EmptyState theme={theme} text="No user language preferences stored yet." />}
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Thread Translation" subtitle="Prepared for future translation thread workflows.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
          <DetailRow theme={theme} label="Threads" value={threads.length} />
          <DetailRow theme={theme} label="Thread Mode" value={settings.threadMode || config.threadMode || 'Planned'} />
          <DetailRow theme={theme} label="Auto Create" value={settings.autoCreateThreads === true ? 'On' : 'Off'} />
          <DetailRow theme={theme} label="Last Thread" value={formatDate(analytics.lastThreadAt)} />
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Management Roadmap" subtitle="This hub is ready for provider integration, thread management and premium gating.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
          <DetailRow theme={theme} label="Provider Integration" value="Next" hint="Connect a translation provider backend." />
          <DetailRow theme={theme} label="Thread System" value="Next" hint="Per-language translation threads." />
          <DetailRow theme={theme} label="Premium Gate" value="Ready" hint="Gate with entitlement translation.hub." />
          <DetailRow theme={theme} label="Analytics" value="Ready" hint="Messages, characters and failures are surfaced here." />
        </div>
      </SectionCard>
    </PageShell>
  );
}
