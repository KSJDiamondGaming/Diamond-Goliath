import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient.js';
import PageShell, { SectionCard, EmptyState, LoadingPanel, Notice, SecondaryButton, StatGrid, SummaryStat } from '../../shared/PageShell';
import PremiumLock from '../../shared/PremiumLock.jsx';
import TranslationThreadsPanel from './TranslationThreadsPanel.jsx';

const PROVIDER_OPTIONS = [
  { id: 'manual', label: 'Manual / Not configured' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'deepl', label: 'DeepL' },
  { id: 'google', label: 'Google Translate' },
];

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function flattenThreads(threadMappings = {}) {
  return Object.values(threadMappings || {}).flatMap((languageMap) => Object.values(languageMap || {}));
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

function fieldStyle(theme) {
  return {
    border: `1px solid ${theme.cardBorder}`,
    background: 'rgba(15,23,42,0.48)',
    color: theme.cardText,
    borderRadius: 12,
    padding: '11px 12px',
    fontWeight: 900,
    minWidth: 0,
  };
}

function StatusPill({ enabled, label }) {
  const tone = enabled ? '#86efac' : '#fcd34d';
  return <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label || (enabled ? 'enabled' : 'disabled')}</span>;
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
        <StatusPill enabled={enabled} />
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
        <div><strong style={{ color: theme.cardText }}>Language:</strong> {preference.language || preference.locale || preference.preferredLanguage || 'Not set'}</div>
        <div><strong style={{ color: theme.cardText }}>Updated:</strong> {formatDate(preference.updatedAt)}</div>
      </div>
    </div>
  );
}

export default function Translation({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [config, setConfig] = useState({});
  const [providerStatus, setProviderStatus] = useState(null);
  const [providerForm, setProviderForm] = useState({ provider: 'manual', defaultLanguage: 'en', sourceLanguage: 'auto' });
  const [entitlements, setEntitlements] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const settings = config.settings || {};
  const analytics = config.analytics || {};
  const channels = useMemo(() => asArray(config.channels || config.channelPairs || config.configuredChannels), [config]);
  const preferences = useMemo(() => asArray(config.userLanguages || config.preferences || config.userPreferences), [config]);
  const threads = useMemo(() => flattenThreads(config.threadMappings || config.threads || config.translationThreads), [config]);
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
        setProviderStatus(null);
        return;
      }

      const [configPayload, providerPayload] = await Promise.all([
        api.getTranslationConfig(guildId),
        api.getTranslationProvider(guildId),
      ]);

      const nextConfig = configPayload.config || { enabled: false, settings: {}, channels: {}, userLanguages: {}, analytics: {} };
      const nextProvider = providerPayload.provider || nextConfig.providerStatus || null;

      setConfig(nextConfig);
      setProviderStatus(nextProvider);
      setProviderForm({
        provider: nextProvider?.provider || nextConfig.provider || nextConfig.settings?.provider || 'manual',
        defaultLanguage: nextProvider?.defaultLanguage || nextConfig.settings?.defaultTargetLanguage || 'en',
        sourceLanguage: nextProvider?.sourceLanguage || nextConfig.settings?.defaultSourceLanguage || 'auto',
      });
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
      const result = await api.setTranslationEnabled(guildId, enabled);
      setConfig(result.config || { ...config, enabled });
      setNotice(`Translation Hub ${enabled ? 'enabled' : 'disabled'}.`);
    } catch (saveError) {
      setError(saveError.message || 'Failed to update Translation Hub status.');
    } finally {
      setLoading(false);
    }
  }

  async function saveProvider(event) {
    event.preventDefault();
    if (!guildId || !hasTranslationAccess) return;
    setSavingProvider(true);
    setError('');
    setNotice('');

    try {
      const result = await api.saveTranslationProvider(guildId, providerForm);
      setConfig(result.config || config);
      setProviderStatus(result.provider || null);
      setNotice('Translation provider settings saved. API keys are never returned to the dashboard.');
    } catch (saveError) {
      setError(saveError.message || 'Failed to save provider settings.');
    } finally {
      setSavingProvider(false);
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
          unlocks={['OpenAI, DeepL or Google provider support', 'Realtime translation channels', 'User language profiles', 'Translation threads', 'Translation analytics']}
        />
      </PageShell>
    );
  }

  const providerName = providerStatus?.label || settings.provider || config.provider || 'Not configured';
  const providerReady = Boolean(providerStatus?.ready);
  const providerState = providerStatus?.status || (providerReady ? 'ready' : 'not_configured');

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
        <SummaryStat theme={theme} label="Provider" value={providerReady ? 'Ready' : 'Missing'} accent={providerReady ? '#22c55e' : '#f59e0b'} description={providerName} />
        <SummaryStat theme={theme} label="Channels" value={channels.length} accent="#3b82f6" description="Configured translation channels" />
        <SummaryStat theme={theme} label="Threads" value={threads.length} accent="#a855f7" description="Mapped language threads" />
        <SummaryStat theme={theme} label="Users" value={preferences.length} accent="#22c55e" description="Language preferences" />
      </StatGrid>

      <SectionCard theme={theme} title="Provider Configuration" subtitle="Choose the translation provider and default language. API keys stay server-side and are never exposed here.">
        <form onSubmit={saveProvider} style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6, color: theme.mutedText, fontWeight: 900 }}>Provider<select value={providerForm.provider} onChange={(event) => setProviderForm((current) => ({ ...current, provider: event.target.value }))} style={fieldStyle(theme)}>{PROVIDER_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
            <label style={{ display: 'grid', gap: 6, color: theme.mutedText, fontWeight: 900 }}>Source Language<input value={providerForm.sourceLanguage} onChange={(event) => setProviderForm((current) => ({ ...current, sourceLanguage: event.target.value }))} placeholder="auto" style={fieldStyle(theme)} /></label>
            <label style={{ display: 'grid', gap: 6, color: theme.mutedText, fontWeight: 900 }}>Default Language<input value={providerForm.defaultLanguage} onChange={(event) => setProviderForm((current) => ({ ...current, defaultLanguage: event.target.value }))} placeholder="en" style={fieldStyle(theme)} /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
            <DetailRow theme={theme} label="Provider Status" value={providerState.replace(/_/g, ' ')} />
            <DetailRow theme={theme} label="API Key" value={providerStatus?.apiKeyConfigured ? 'Configured' : 'Missing'} hint="Set provider API keys in the server environment." />
            <DetailRow theme={theme} label="Dashboard Safety" value="Keys hidden" hint="The API never returns provider secrets." />
          </div>
          <button type="submit" disabled={savingProvider} style={{ justifySelf: 'start', border: '1px solid rgba(34,197,94,0.42)', background: savingProvider ? 'rgba(34,197,94,0.10)' : 'rgba(34,197,94,0.18)', color: '#bbf7d0', borderRadius: 12, padding: '11px 13px', fontWeight: 950, cursor: savingProvider ? 'not-allowed' : 'pointer' }}>{savingProvider ? 'Saving...' : 'Save Provider Settings'}</button>
        </form>
      </SectionCard>

      <TranslationThreadsPanel theme={theme} guildId={guildId} config={config} onRefresh={load} />

      <SectionCard theme={theme} title="Translation Analytics" subtitle="Usage data from modules.translation.analytics.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
          <DetailRow theme={theme} label="Messages Translated" value={formatNumber(analytics.messagesTranslated ?? analytics.translated ?? analytics.manualTranslations ?? 0)} />
          <DetailRow theme={theme} label="Thread Translations" value={formatNumber(analytics.threadTranslations ?? 0)} />
          <DetailRow theme={theme} label="Threads Created" value={formatNumber(analytics.threadsCreated ?? 0)} />
          <DetailRow theme={theme} label="Failures" value={formatNumber(analytics.failed ?? analytics.failures ?? analytics.failedTranslations ?? 0)} />
          <DetailRow theme={theme} label="Last Translation" value={formatDate(analytics.lastTranslationAt || analytics.lastTranslatedAt)} />
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Channel Management" subtitle="Configured channel language pairs and output behaviour.">
        <div style={{ display: 'grid', gap: 12 }}>{channels.length ? channels.map((channel, index) => <ChannelCard key={channel.id || channel.channelId || channel.sourceChannelId || index} theme={theme} channel={channel} />) : <EmptyState theme={theme} text="No translation channels configured yet." />}</div>
      </SectionCard>

      <SectionCard theme={theme} title="User Language Preferences" subtitle="Stored user language preferences for automatic translation flows.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>{preferences.length ? preferences.slice(0, 12).map((preference, index) => <PreferenceCard key={preference.userId || preference.id || index} theme={theme} preference={preference} />) : <EmptyState theme={theme} text="No user language preferences stored yet." />}</div>
      </SectionCard>
    </PageShell>
  );
}
