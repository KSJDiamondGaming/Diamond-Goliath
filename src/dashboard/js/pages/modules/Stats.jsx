import React, { useEffect, useState } from 'react';

import { api } from '../../services/apiClient';
import PageShell, { EmptyState, LoadingPanel, Notice, PrimaryButton, StatGrid, SummaryStat } from '../../shared/PageShell';

function guildIdFrom(selectedGuild, selectedGuildData) {
  return String(selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '').split(':').pop().trim();
}

function Card({ theme, title, children }) {
  return <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 22, boxShadow: theme.shadow, padding: 18 }}><h2 style={{ margin: '0 0 12px' }}>{title}</h2>{children}</section>;
}

function Row({ theme, label, value }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: `1px solid ${theme.cardBorder}`, padding: '10px 0' }}><span style={{ color: theme.mutedText, fontWeight: 800 }}>{label}</span><strong>{value}</strong></div>;
}

export default function Stats({ theme, selectedGuild, selectedGuildData }) {
  const guildId = guildIdFrom(selectedGuild, selectedGuildData);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.getStatsOverview(guildId);
      setStats(result);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load stats.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [guildId]);

  if (!guildId) return <EmptyState theme={theme} title="Select a guild" text="Select a guild to view stats." />;
  if (loading && !stats) return <LoadingPanel theme={theme} text="Loading stats..." />;

  const live = stats?.live || {};
  const stored = stats?.stored || {};
  const modules = stats?.modules || {};

  return (
    <PageShell title="Stats" subtitle="Server, module, workflow and security statistics." theme={theme} guild={{ id: guildId, name: selectedGuildData?.name || selectedGuildData?.guildName || live.guild?.name || 'Stats' }} actions={<PrimaryButton onClick={load} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</PrimaryButton>}>
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}

      <StatGrid min="170px">
        <SummaryStat theme={theme} label="Members" value={live.members?.total ?? '—'} accent="#60a5fa" description="Live Discord count" />
        <SummaryStat theme={theme} label="Channels" value={live.channels?.total ?? '—'} accent="#22c55e" description="Text, voice and categories" />
        <SummaryStat theme={theme} label="Enabled Modules" value={`${modules.enabled || 0}/${modules.total || 0}`} accent="#f59e0b" description="Saved module states" />
        <SummaryStat theme={theme} label="Security Incidents" value={stored.security?.totalIncidents || 0} accent="#ef4444" description="Stored incident count" />
      </StatGrid>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
        <Card theme={theme} title="Live Discord">
          <Row theme={theme} label="Server" value={live.guild?.name || 'Unavailable'} />
          <Row theme={theme} label="Text Channels" value={live.channels?.text ?? '—'} />
          <Row theme={theme} label="Voice Channels" value={live.channels?.voice ?? '—'} />
          <Row theme={theme} label="Categories" value={live.channels?.categories ?? '—'} />
          <Row theme={theme} label="Roles" value={live.roles?.total ?? '—'} />
          <Row theme={theme} label="Emojis" value={live.emojis?.total ?? '—'} />
          <Row theme={theme} label="Boosts" value={live.guild?.premiumSubscriptionCount ?? '—'} />
        </Card>

        <Card theme={theme} title="Modules">
          <Row theme={theme} label="Total Modules" value={modules.total || 0} />
          <Row theme={theme} label="Enabled" value={modules.enabled || 0} />
          <Row theme={theme} label="Disabled" value={modules.disabled || 0} />
          <div style={{ marginTop: 12, color: theme.mutedText, fontSize: 13, lineHeight: 1.55 }}>{(modules.enabledKeys || []).length ? `Enabled: ${(modules.enabledKeys || []).join(', ')}` : 'No enabled module keys found.'}</div>
        </Card>

        <Card theme={theme} title="Workflows">
          <Row theme={theme} label="Tickets" value={stored.tickets?.total || 0} />
          <Row theme={theme} label="Ticket Panels" value={stored.tickets?.panels || 0} />
          <Row theme={theme} label="Forms" value={stored.forms?.forms || 0} />
          <Row theme={theme} label="Submissions" value={stored.forms?.submissions || 0} />
          <Row theme={theme} label="Polls" value={stored.polls?.total || 0} />
          <Row theme={theme} label="Active Polls" value={stored.polls?.active || 0} />
        </Card>

        <Card theme={theme} title="Security & Logs">
          <Row theme={theme} label="Security Enabled" value={stored.security?.enabled ? 'Yes' : 'No'} />
          <Row theme={theme} label="Threat Level" value={stored.security?.threatLevel || 'low'} />
          <Row theme={theme} label="Critical Incidents" value={stored.security?.criticalIncidents || 0} />
          <Row theme={theme} label="Logging Enabled" value={stored.logs?.enabled ? 'Yes' : 'No'} />
          <Row theme={theme} label="Log Channels" value={stored.logs?.channels || 0} />
          <Row theme={theme} label="Log Events" value={stored.logs?.events || 0} />
        </Card>
      </div>
    </PageShell>
  );
}
