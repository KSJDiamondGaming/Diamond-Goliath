import React, { memo, useMemo, useState } from 'react';

import PageShell, { Notice, SectionCard, StatGrid, SummaryStat } from './PageShell.jsx';

export const MODULE_TABS = {
  overview: 'overview',
  configuration: 'configuration',
  discordExperience: 'discordExperience',
  activity: 'activity',
  analytics: 'analytics',
};

const DEFAULT_TABS = [
  { key: MODULE_TABS.overview, label: 'Overview' },
  { key: MODULE_TABS.configuration, label: 'Configuration' },
  { key: MODULE_TABS.discordExperience, label: 'Discord Experience' },
  { key: MODULE_TABS.activity, label: 'Activity' },
];

function cleanTabs(tabs = DEFAULT_TABS) {
  return tabs
    .filter(Boolean)
    .map((tab) => (typeof tab === 'string' ? { key: tab, label: tab } : tab))
    .filter((tab) => tab?.key)
    .map((tab) => ({ ...tab, label: tab.label || tab.key }));
}

function statusTone(status = '') {
  const clean = String(status || '').toLowerCase();
  if (['enabled', 'live', 'healthy', 'active'].includes(clean)) return '#86efac';
  if (['warning', 'partial', 'needs setup'].includes(clean)) return '#fcd34d';
  if (['disabled', 'offline', 'error'].includes(clean)) return '#fca5a5';
  return '#93c5fd';
}

function TabButton({ theme, active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? 'rgba(147,197,253,0.58)' : theme.cardBorder}`,
        background: active ? 'rgba(37,99,235,0.22)' : theme.softBg,
        color: active ? '#dbeafe' : theme.cardText,
        borderRadius: 999,
        padding: '9px 12px',
        cursor: 'pointer',
        fontWeight: 900,
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}

function ModuleStatusBar({ theme, status, updatedAt, templateCount, deploymentCount }) {
  return (
    <SectionCard theme={theme} padding="14px">
      <StatGrid min="min(160px, 100%)">
        <SummaryStat theme={theme} label="Status" value={status || 'Unknown'} accent={statusTone(status)} minHeight="96px" />
        <SummaryStat theme={theme} label="Templates" value={templateCount ?? 0} description="Discord-facing messages" minHeight="96px" />
        <SummaryStat theme={theme} label="Deployments" value={deploymentCount ?? 0} description="Active Discord posts" minHeight="96px" />
        <SummaryStat theme={theme} label="Last Updated" value={updatedAt || 'Never'} description="Latest module change" minHeight="96px" />
      </StatGrid>
    </SectionCard>
  );
}

function ModuleShell({
  title,
  subtitle,
  theme,
  guild = null,
  actions = null,
  tabs = DEFAULT_TABS,
  defaultTab = MODULE_TABS.overview,
  status = 'Unknown',
  updatedAt = 'Never',
  templateCount = 0,
  deploymentCount = 0,
  notice = '',
  noticeTone = 'info',
  children = {},
}) {
  const visibleTabs = useMemo(() => cleanTabs(tabs), [tabs]);
  const firstTab = visibleTabs[0]?.key || defaultTab;
  const [activeTab, setActiveTab] = useState(defaultTab || firstTab);
  const activeContent = children?.[activeTab] ?? children?.[firstTab] ?? null;

  return (
    <PageShell title={title} subtitle={subtitle} theme={theme} guild={guild} actions={actions}>
      <ModuleStatusBar
        theme={theme}
        status={status}
        updatedAt={updatedAt}
        templateCount={templateCount}
        deploymentCount={deploymentCount}
      />

      {notice ? <Notice theme={theme} tone={noticeTone}>{notice}</Notice> : null}

      <SectionCard theme={theme} padding="14px">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {visibleTabs.map((tab) => (
            <TabButton key={tab.key} theme={theme} active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </TabButton>
          ))}
        </div>
      </SectionCard>

      <div>{activeContent}</div>
    </PageShell>
  );
}

export default memo(ModuleShell);
