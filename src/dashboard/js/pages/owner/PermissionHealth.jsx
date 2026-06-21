import React, { useEffect, useMemo, useState } from 'react';

import useOwnerGuilds from '../../hooks/useOwnerGuilds.js';
import { api } from '../../services/apiClient.js';

function getGuildId(guild = {}) {
  return guild.guildId || guild.id || '';
}

function getGuildName(guild = {}) {
  return guild.name || guild.guildName || 'Selected Guild';
}

function getStatusLabel(status) {
  if (status === 'healthy') return '🟢 Healthy';
  if (status === 'warning') return '🟡 Warning';
  if (status === 'critical') return '🔴 Critical';
  if (status === 'idle') return '⚪ Not Configured';
  return '⚪ Unknown';
}

function formatList(items = [], fallback = 'None') {
  if (!Array.isArray(items) || !items.length) return fallback;
  return items.slice(0, 6).join(', ');
}

function plural(value, label) {
  return `${Number(value || 0)} ${label}${Number(value || 0) === 1 ? '' : 's'}`;
}

export default function PermissionHealth({ theme }) {
  const { guilds, selectedGuild, loading: guildsLoading } = useOwnerGuilds();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const activeGuild = useMemo(
    () => guilds.find((guild) => String(getGuildId(guild)) === String(selectedGuild)) || null,
    [guilds, selectedGuild],
  );

  async function loadHealth() {
    if (!selectedGuild) return;

    try {
      setLoading(true);
      setError('');
      const response = await api.getPermissionHealth(selectedGuild);
      setHealth(response);
    } catch (loadError) {
      console.error(loadError);
      setError(loadError.message || 'Failed to load permission health.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHealth();
  }, [selectedGuild]);

  const card = {
    border: '1px solid ' + theme.cardBorder,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 20,
    padding: 18,
    boxShadow: theme.shadow,
    minWidth: 0,
    overflow: 'hidden',
  };

  const issueCards = [
    {
      title: 'Base Permissions',
      value: String(health?.summary?.basePermissionIssueCount || 0),
      detail: health?.basePermissions?.message || 'Waiting for scan.',
    },
    {
      title: 'Channel Issues',
      value: String(health?.summary?.channelIssueCount || 0),
      detail: `${health?.channels?.checked || 0} channels checked`,
    },
    {
      title: 'Role Issues',
      value: String(health?.summary?.roleIssueCount || 0),
      detail: `${health?.roles?.checked || 0} roles checked`,
    },
    {
      title: 'Module Issues',
      value: String(health?.summary?.moduleIssueCount || 0),
      detail: `${health?.summary?.moduleConfiguredCount || 0} configured targets mapped`,
    },
    {
      title: 'Total Issues',
      value: String(health?.summary?.issueCount || 0),
      detail: health?.checkedAt ? `Last checked ${new Date(health.checkedAt).toLocaleString()}` : 'Not checked yet',
    },
  ];

  const channelIssues = health?.channels?.issues || [];
  const roleIssues = health?.roles?.issues || [];
  const moduleSections = health?.modules?.sections || [];

  return (
    <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
      <section style={{ ...card, background: 'linear-gradient(135deg, rgba(34,197,94,0.16), rgba(15,23,42,0.08) 48%, rgba(59,130,246,0.10))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 420px' }}>
            <p style={{ margin: 0, color: '#22c55e', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Permission Guard</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '-0.04em', lineHeight: 1 }}>Permission Health</h1>
            <p style={{ marginTop: 8, color: theme.mutedText, lineHeight: 1.55, maxWidth: 820 }}>
              Check whether Goliath can access channels, manage configured roles, and safely deploy modules before clients hit broken setups.
            </p>
          </div>

          <button
            type="button"
            onClick={loadHealth}
            disabled={loading || !selectedGuild}
            style={{
              border: '1px solid ' + theme.cardBorder,
              background: 'rgba(34,197,94,0.16)',
              color: theme.cardText,
              borderRadius: 12,
              padding: '10px 14px',
              cursor: loading ? 'wait' : 'pointer',
              fontWeight: 900,
            }}
          >
            {loading ? 'Scanning...' : 'Refresh Scan'}
          </button>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,190px),1fr))', gap: 12 }}>
        <HealthCard title="Selected Guild" value={guildsLoading ? 'Loading' : getGuildName(activeGuild)} detail={selectedGuild || 'No guild selected'} theme={theme} />
        <HealthCard title="Overall Status" value={getStatusLabel(health?.status)} detail="Live backend permission scan" theme={theme} />
        {issueCards.map((item) => (
          <HealthCard key={item.title} {...item} theme={theme} />
        ))}
      </section>

      {error ? <section style={{ ...card, color: '#fca5a5' }}>{error}</section> : null}

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Module Diagnostics</h3>
        <p style={{ margin: '0 0 14px', color: theme.mutedText, lineHeight: 1.55 }}>
          Mapped module configuration against the channel and role scans so owner view can show exactly which systems are affected.
        </p>

        {loading ? <div>Scanning module diagnostics...</div> : moduleSections.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 12 }}>
            {moduleSections.map((section) => (
              <ModuleCard key={section.key} section={section} theme={theme} />
            ))}
          </div>
        ) : <div style={{ color: theme.mutedText }}>No module diagnostics returned yet.</div>}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 14 }}>
        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Recommended Server Permissions</h3>
          <p style={{ margin: '0 0 10px', color: theme.mutedText, lineHeight: 1.55 }}>{health?.basePermissions?.message || 'Run a scan to check recommended server permissions.'}</p>
          <div style={{ color: health?.basePermissions?.missingPermissions?.length ? '#fca5a5' : theme.mutedText }}>
            Missing: {formatList(health?.basePermissions?.missingPermissions)}
          </div>
        </section>

        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Role Hierarchy Issues</h3>
          {loading ? <div>Scanning roles...</div> : roleIssues.length ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {roleIssues.slice(0, 8).map((issue) => (
                <IssueRow key={issue.roleId} title={`@${issue.roleName || issue.roleId}`} detail={issue.message} meta={issue.fix || issue.reason} theme={theme} />
              ))}
            </div>
          ) : <div style={{ color: theme.mutedText }}>No role hierarchy issues found.</div>}
        </section>
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Channel Access Issues</h3>
        {loading ? <div>Scanning channels...</div> : channelIssues.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 10 }}>
            {channelIssues.slice(0, 12).map((issue) => (
              <IssueRow key={issue.channelId} title={`#${issue.channelName || issue.channelId}`} detail={issue.result?.message} meta={formatList(issue.result?.missingPermissions)} theme={theme} />
            ))}
          </div>
        ) : <div style={{ color: theme.mutedText }}>No channel access issues found.</div>}
      </section>
    </div>
  );
}

function HealthCard({ title, value, detail, theme }) {
  return (
    <div style={{ border: '1px solid ' + theme.cardBorder, background: theme.cardBg, borderRadius: 18, padding: 16, boxShadow: theme.shadow, minHeight: 118, display: 'grid', alignContent: 'space-between', gap: 10, minWidth: 0, overflow: 'hidden' }}>
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 950, marginTop: 0, wordBreak: 'break-word' }}>{value}</div>
      <div style={{ color: theme.mutedText, marginTop: 0, fontSize: 13, lineHeight: 1.45 }}>{detail}</div>
    </div>
  );
}

function ModuleCard({ section, theme }) {
  const hasIssues = Number(section.issueCount || 0) > 0;

  return (
    <div style={{ border: '1px solid ' + theme.cardBorder, borderRadius: 16, padding: 14, background: hasIssues ? 'rgba(239,68,68,0.10)' : 'rgba(15,23,42,0.18)', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <strong>{section.label}</strong>
          <div style={{ color: theme.mutedText, marginTop: 5 }}>{getStatusLabel(section.status)}</div>
        </div>
        <span style={{ color: hasIssues ? '#fca5a5' : '#86efac', fontWeight: 900 }}>{plural(section.issueCount, 'issue')}</span>
      </div>

      <div style={{ color: theme.mutedText, marginTop: 10, fontSize: 13, lineHeight: 1.45 }}>
        {plural(section.configuredCount, 'configured target')} • {plural(section.channelIssueCount, 'channel issue')} • {plural(section.roleIssueCount, 'role issue')}
      </div>

      {section.notes?.length ? (
        <div style={{ color: theme.mutedText, marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>{section.notes.slice(0, 2).join(' ')}</div>
      ) : null}

      {hasIssues ? (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {(section.channelIssues || []).slice(0, 2).map((issue) => (
            <IssueRow key={`channel-${issue.channelId}`} title={`#${issue.channelName || issue.channelId}`} detail={issue.result?.message} meta={formatList(issue.result?.missingPermissions)} theme={theme} />
          ))}
          {(section.roleIssues || []).slice(0, 2).map((issue) => (
            <IssueRow key={`role-${issue.roleId}`} title={`@${issue.roleName || issue.roleId}`} detail={issue.message} meta={issue.fix || issue.reason} theme={theme} />
          ))}
        </div>
      ) : (
        <div style={{ color: theme.mutedText, marginTop: 10, fontSize: 13 }}>{section.recommendation}</div>
      )}
    </div>
  );
}

function IssueRow({ title, detail, meta, theme }) {
  return (
    <div style={{ border: '1px solid ' + theme.cardBorder, borderRadius: 14, padding: 12, background: 'rgba(15,23,42,0.18)', minWidth: 0 }}>
      <strong style={{ wordBreak: 'break-word' }}>{title}</strong>
      <div style={{ color: theme.mutedText, marginTop: 6, fontSize: 13, lineHeight: 1.45 }}>{detail}</div>
      {meta ? <div style={{ color: '#fbbf24', marginTop: 6, fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word' }}>{meta}</div> : null}
    </div>
  );
}
