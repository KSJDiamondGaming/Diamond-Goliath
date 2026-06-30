import React, { useEffect, useMemo, useState } from 'react';

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

function Bar({ theme, label, value, total, accent = '#60a5fa' }) {
  const percent = total ? Math.round((Number(value || 0) / Number(total || 1)) * 100) : 0;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.mutedText, fontSize: 13, fontWeight: 850 }}><span>{label}</span><span>{value} · {percent}%</span></div>
      <div style={{ height: 9, borderRadius: 999, background: 'rgba(148,163,184,0.18)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${percent}%`, background: accent }} /></div>
    </div>
  );
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
      const result = await api.request(`/api/stats/${guildId}/overview`);
      setStats(result);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load stats.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [guildId]);

  const analytics = useMemo(() => {
    const live = stats?.live || {};
    const stored = stats?.stored || {};
    const modules = stats?.modules || {};
    const workflowsTotal = Number(stored.tickets?.total || 0) + Number(stored.forms?.submissions || 0) + Number(stored.polls?.total || 0);
    const moduleCoverage = modules.total ? Math.round((Number(modules.enabled || 0) / Number(modules.total || 1)) * 100) : 0;
    const ticketOpenRate = stored.tickets?.total ? Math.round((Number(stored.tickets?.open || 0) / Number(stored.tickets?.total || 1)) * 100) : 0;
    const securityScore = Math.max(0, 100 - (Number(stored.security?.criticalIncidents || 0) * 20) - (Number(stored.security?.totalIncidents || 0) * 3));
    return { live, stored, modules, workflowsTotal, moduleCoverage, ticketOpenRate, securityScore };
  }, [stats]);

  if (!guildId) return <EmptyState theme={theme} title="Select a guild" text="Select a guild to view analytics." />;
  if (loading && !stats) return <LoadingPanel theme={theme} text="Loading analytics..." />;

  const { live, stored, modules } = analytics;

  return (
    <PageShell title="Analytics Centre" subtitle="Server, module, workflow and security analytics." theme={theme} guild={{ id: guildId, name: selectedGuildData?.name || selectedGuildData?.guildName || live.guild?.name || 'Analytics' }} actions={<PrimaryButton onClick={load} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</PrimaryButton>}>
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}

      <StatGrid min="170px">
        <SummaryStat theme={theme} label="Members" value={live.members?.total ?? '—'} accent="#60a5fa" description="Live Discord count" />
        <SummaryStat theme={theme} label="Module Coverage" value={`${analytics.moduleCoverage}%`} accent="#22c55e" description={`${modules.enabled || 0}/${modules.total || 0} enabled`} />
        <SummaryStat theme={theme} label="Workflow Records" value={analytics.workflowsTotal} accent="#c084fc" description="Tickets, forms and polls" />
        <SummaryStat theme={theme} label="Security Score" value={analytics.securityScore} accent={analytics.securityScore >= 85 ? '#22c55e' : analytics.securityScore >= 65 ? '#f59e0b' : '#ef4444'} description="Stored incident pressure" />
      </StatGrid>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
        <Card theme={theme} title="Live Discord">
          <Row theme={theme} label="Server" value={live.guild?.name || 'Unavailable'} />
          <Row theme={theme} label="Members" value={live.members?.total ?? '—'} />
          <Row theme={theme} label="Text Channels" value={live.channels?.text ?? '—'} />
          <Row theme={theme} label="Voice Channels" value={live.channels?.voice ?? '—'} />
          <Row theme={theme} label="Categories" value={live.channels?.categories ?? '—'} />
          <Row theme={theme} label="Roles" value={live.roles?.total ?? '—'} />
          <Row theme={theme} label="Emojis" value={live.emojis?.total ?? '—'} />
        </Card>

        <Card theme={theme} title="Module Adoption">
          <Bar theme={theme} label="Enabled Modules" value={modules.enabled || 0} total={modules.total || 0} accent="#22c55e" />
          <Bar theme={theme} label="Disabled Modules" value={modules.disabled || 0} total={modules.total || 0} accent="#f59e0b" />
          <div style={{ marginTop: 12, color: theme.mutedText, fontSize: 13, lineHeight: 1.55 }}>{(modules.enabledKeys || []).length ? `Enabled: ${(modules.enabledKeys || []).join(', ')}` : 'No enabled module keys found.'}</div>
        </Card>

        <Card theme={theme} title="Workflow Analytics">
          <Row theme={theme} label="Tickets" value={stored.tickets?.total || 0} />
          <Row theme={theme} label="Open Tickets" value={`${stored.tickets?.open || 0} (${analytics.ticketOpenRate}%)`} />
          <Row theme={theme} label="Ticket Panels" value={stored.tickets?.panels || 0} />
          <Row theme={theme} label="Forms" value={stored.forms?.forms || 0} />
          <Row theme={theme} label="Submissions" value={stored.forms?.submissions || 0} />
          <Row theme={theme} label="Polls" value={stored.polls?.total || 0} />
          <Row theme={theme} label="Active Polls" value={stored.polls?.active || 0} />
        </Card>

        <Card theme={theme} title="Security & Logs">
          <Row theme={theme} label="Security Enabled" value={stored.security?.enabled ? 'Yes' : 'No'} />
          <Row theme={theme} label="Threat Level" value={stored.security?.threatLevel || 'low'} />
          <Row theme={theme} label="Security Incidents" value={stored.security?.totalIncidents || 0} />
          <Row theme={theme} label="Critical Incidents" value={stored.security?.criticalIncidents || 0} />
          <Row theme={theme} label="Logging Enabled" value={stored.logs?.enabled ? 'Yes' : 'No'} />
          <Row theme={theme} label="Log Channels" value={stored.logs?.channels || 0} />
          <Row theme={theme} label="Log Events" value={stored.logs?.events || 0} />
        </Card>
      </div>
    </PageShell>
  );
}
