import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient.js';
import PageShell, { SectionCard, EmptyState, LoadingPanel, Notice, SecondaryButton, StatGrid, SummaryStat } from '../../shared/PageShell';

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Never' : date.toLocaleString();
}

function isEnabled(value) {
  if (!value || typeof value !== 'object') return false;
  return value.enabled === true;
}

function channelValue(section = {}) {
  return section.channelId || section.channel || section.targetChannelId || 'Not set';
}

function messageValue(section = {}) {
  return section.message || section.content || section.text || section.embed?.description || 'Not configured';
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

function StatusPill({ theme, enabled }) {
  const tone = enabled ? '#86efac' : '#fcd34d';
  return (
    <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {enabled ? 'enabled' : 'disabled'}
    </span>
  );
}

function MessageCard({ theme, title, section = {}, type }) {
  const enabled = isEnabled(section);
  const hasEmbed = Boolean(section.embed && typeof section.embed === 'object' && Object.keys(section.embed).length);

  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.26)', borderRadius: 18, padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{type}</div>
          <h3 style={{ margin: '5px 0 0', color: theme.cardText }}>{title}</h3>
        </div>
        <StatusPill theme={theme} enabled={enabled} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
        <DetailRow theme={theme} label="Channel" value={channelValue(section)} />
        <DetailRow theme={theme} label="Embed" value={hasEmbed ? 'Configured' : 'Not configured'} />
        <DetailRow theme={theme} label="Last Updated" value={formatDate(section.updatedAt)} />
      </div>

      <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(2,6,23,0.28)', borderRadius: 14, padding: 13 }}>
        <div style={{ color: theme.mutedText, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Message Preview</div>
        <div style={{ color: theme.cardText, whiteSpace: 'pre-wrap', lineHeight: 1.55, overflowWrap: 'anywhere' }}>{messageValue(section)}</div>
      </div>
    </div>
  );
}

function VariableGrid({ theme }) {
  const variables = ['{user}', '{userMention}', '{username}', '{guild}', '{memberCount}', '{createdAt}'];
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {variables.map((item) => (
        <span key={item} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.36)', color: theme.cardText, borderRadius: 999, padding: '7px 10px', fontSize: 12, fontWeight: 900 }}>
          {item}
        </span>
      ))}
    </div>
  );
}

export default function WelcomeLeave({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const welcome = config.welcome || {};
  const leave = config.leave || {};
  const dmWelcome = config.dmWelcome || config.dm || {};
  const analytics = config.analytics || {};

  const enabledCount = [welcome, leave, dmWelcome].filter(isEnabled).length;

  async function load() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    setNotice('');

    try {
      const payload = await api.getGuildModules(guildId);
      const modules = payload.modules || {};
      setConfig(modules.welcome || { enabled: false, welcome: {}, leave: {}, dmWelcome: {}, analytics: {} });
    } catch (loadError) {
      setError(loadError.message || 'Failed to load Welcome & Leave.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [guildId]);

  async function toggleEnabled() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    setNotice('');

    try {
      const enabled = config.enabled !== true;
      const result = await api.setGuildModuleEnabled(guildId, 'welcome', enabled);
      setConfig(result.modules?.welcome || { ...config, enabled });
      setNotice(`Welcome & Leave ${enabled ? 'enabled' : 'disabled'}.`);
    } catch (saveError) {
      setError(saveError.message || 'Failed to update Welcome & Leave status.');
    } finally {
      setLoading(false);
    }
  }

  if (!guildId) {
    return (
      <PageShell title="Welcome & Leave" subtitle="Select a server to manage welcome and leave messages." theme={theme}>
        <EmptyState theme={theme} text="Select a server to manage Welcome & Leave." />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Welcome & Leave"
      subtitle="Manage join messages, leave messages, DM welcomes and analytics."
      theme={theme}
      guild={{ id: guildId, name: 'Welcome & Leave' }}
      actions={<SecondaryButton theme={theme} onClick={toggleEnabled} disabled={loading}>{config.enabled === true ? 'Disable' : 'Enable'}</SecondaryButton>}
    >
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {notice ? <Notice theme={theme} tone="success">{notice}</Notice> : null}
      {loading ? <LoadingPanel theme={theme} text="Loading Welcome & Leave..." /> : null}

      <StatGrid min="min(190px, 100%)">
        <SummaryStat theme={theme} label="Status" value={config.enabled === true ? 'Enabled' : 'Disabled'} accent={config.enabled === true ? '#22c55e' : '#f59e0b'} description="modules.welcome.enabled" />
        <SummaryStat theme={theme} label="Joins" value={analytics.joins ?? analytics.welcomes ?? 0} accent="#22c55e" description="modules.welcome.analytics.joins" />
        <SummaryStat theme={theme} label="Leaves" value={analytics.leaves ?? 0} accent="#f59e0b" description="modules.welcome.analytics.leaves" />
        <SummaryStat theme={theme} label="Enabled Flows" value={`${enabledCount}/3`} accent="#3b82f6" description="Welcome, leave and DM" />
        <SummaryStat theme={theme} label="DM Welcome" value={isEnabled(dmWelcome) ? 'On' : 'Off'} accent="#a855f7" description="Optional direct message" />
      </StatGrid>

      <SectionCard theme={theme} title="Message Setup" subtitle="Current welcome, leave and DM welcome configuration from modules.welcome.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 12 }}>
          <MessageCard theme={theme} title="Welcome Message" section={welcome} type="Member Join" />
          <MessageCard theme={theme} title="Leave Message" section={leave} type="Member Leave" />
          <MessageCard theme={theme} title="DM Welcome" section={dmWelcome} type="Direct Message" />
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Activity" subtitle="Join and leave event timestamps stored in module analytics.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
          <DetailRow theme={theme} label="Last Join" value={formatDate(analytics.lastJoinAt || analytics.lastWelcomeAt)} />
          <DetailRow theme={theme} label="Last Leave" value={formatDate(analytics.lastLeaveAt)} />
          <DetailRow theme={theme} label="Last DM" value={formatDate(analytics.lastDmAt || analytics.lastDmWelcomeAt)} />
          <DetailRow theme={theme} label="Failures" value={analytics.failed ?? analytics.failures ?? 0} />
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Variables" subtitle="Supported placeholders for future welcome/leave message editors.">
        <VariableGrid theme={theme} />
      </SectionCard>

      <SectionCard theme={theme} title="Management Roadmap" subtitle="This dashboard is ready for the backend message editor actions.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
          <DetailRow theme={theme} label="Welcome Editor" value="Next" hint="Edit channel, message and embed data in modules.welcome.welcome." />
          <DetailRow theme={theme} label="Leave Editor" value="Next" hint="Edit channel, message and embed data in modules.welcome.leave." />
          <DetailRow theme={theme} label="DM Welcome" value="Next" hint="Configure private welcome message and embed." />
          <DetailRow theme={theme} label="Analytics" value="Ready" hint="Joins, leaves and timestamps are surfaced here." />
        </div>
      </SectionCard>
    </PageShell>
  );
}
