import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PAGE_LAYOUTS } from '../ui/layout';

import {
  createOverviewPageStyles,
  buildOverviewMetrics,
  formatOverviewDisplayValue,
  getOverviewChartValue,
} from '../ui/components';

const INITIAL_STATE = {
  loading: true,
  error: '',
  statusData: null,
  casesData: null,
  warningsData: null,
  streamConnected: false,
};

const PAGE_KEY = 'overview';
const FALLBACK_REFRESH_MS = 20000;

/* -------------------- FIXED CONFIG -------------------- */
const OVERVIEW_CONFIG = {
  labels: {
    guildId: 'Guild ID',
    overviewTitle: 'Overview',
    overviewSubtitle: 'Live server stats and system status',

    moderationTitle: 'Moderation Snapshot',
    moderationSubtitle: 'Cases and warnings overview',

    chartsTitle: 'Activity Charts',
    chartsSubtitle: 'Server metrics breakdown',

    totalCases: 'Total Cases',
    totalWarnings: 'Total Warnings',
    activeWarnings: 'Active Warnings',
    clearedWarnings: 'Cleared Warnings',
  },

  hero: {
    subtitle: 'Real-time server insights',
  },

  topStats: [
    { key: 'members', label: 'Members' },
    { key: 'humans', label: 'Humans' },
    { key: 'bots', label: 'Bots' },

    {
      key: 'botOnline',
      label: 'Bot',
      type: 'status',
      onlineText: 'Online',
      offlineText: 'Offline',
    },
    {
      key: 'backendOnline',
      label: 'Backend',
      type: 'status',
      onlineText: 'Online',
      offlineText: 'Offline',
    },
    {
      key: 'apiOnline',
      label: 'API',
      type: 'status',
      onlineText: 'Online',
      offlineText: 'Offline',
    },
  ],

  chartGroups: [
    {
      key: 'members',
      title: 'Members',
      subtitle: 'Server population',
      bars: [
        { key: 'humans', label: 'Humans', valueKey: 'humans' },
        { key: 'bots', label: 'Bots', valueKey: 'bots' },
      ],
    },
    {
      key: 'moderation',
      title: 'Moderation',
      subtitle: 'Cases vs warnings',
      bars: [
        { key: 'cases', label: 'Cases', valueKey: 'totalCases' },
        { key: 'warnings', label: 'Warnings', valueKey: 'totalWarnings' },
      ],
    },
  ],
};
/* ----------------------------------------------------- */

function getGuildAvatar(guild) {
  return guild?.iconUrl || guild?.iconURL || guild?.avatarUrl || guild?.image || '';
}

/* -------------------- HERO -------------------- */
const HeroCard = memo(function HeroCard({ styles, metrics, selectedGuildData }) {
  const guildAvatar = getGuildAvatar(selectedGuildData);

  return (
    <section style={styles.hero}>
      <div style={styles.heroGlow} />

      {guildAvatar ? (
        <img
          src={guildAvatar}
          alt={`${metrics.guildName} logo`}
          style={styles.heroGuildLogo}
        />
      ) : null}

      <div style={styles.heroMeta}>
        <h1 style={styles.heroTitle}>{metrics.guildName}</h1>

        <p style={styles.heroMetaText}>
          {OVERVIEW_CONFIG.labels.guildId}: {metrics.guildId}
        </p>

        <p style={styles.heroMetaText}>{OVERVIEW_CONFIG.hero.subtitle}</p>
      </div>
    </section>
  );
});

/* -------------------- HEADER -------------------- */
const OverviewSectionHeader = memo(function OverviewSectionHeader({
  styles,
  title,
  subtitle,
}) {
  return (
    <div style={styles.sectionHeadingWrap}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {subtitle ? <p style={styles.sectionSubtitle}>{subtitle}</p> : null}
    </div>
  );
});

/* -------------------- TOP STAT -------------------- */
const TopStatCard = memo(function TopStatCard({ theme, styles, item, metrics }) {
  const statusMap = {
    botOnline: metrics.botOnline,
    backendOnline: metrics.backendOnline,
    apiOnline: metrics.apiOnline,
  };

  const valueMap = {
    members: metrics.members,
    humans: metrics.humans,
    bots: metrics.bots,
  };

  const isStatus = item.type === 'status';
  const isOnline = Boolean(statusMap[item.key]);
  const color = isOnline ? theme.success : theme.danger;

  const value = isStatus
    ? isOnline
      ? item.onlineText
      : item.offlineText
    : formatOverviewDisplayValue(valueMap[item.key] ?? 0);

  return (
    <div style={styles.topStatCard}>
      <p style={styles.topStatLabel}>{item.label}</p>

      <div style={styles.topStatValueRow}>
        {isStatus ? <span style={styles.statusDot(color)} /> : null}
        <p style={styles.topStatValue(isStatus ? color : theme.cardText)}>{value}</p>
      </div>
    </div>
  );
});

/* -------------------- MAIN -------------------- */
export default function Overview({
  selectedGuild,
  selectedGuildId,
  theme,
  guilds = [],
}) {
  const activeGuildId = selectedGuildId || selectedGuild;
  const [state, setState] = useState(INITIAL_STATE);

  const page = PAGE_LAYOUTS[PAGE_KEY] || {
    title: 'Overview',
    description: 'Select a server to view stats.',
  };

  const styles = useMemo(() => createOverviewPageStyles(theme), [theme]);

  const selectedGuildData = useMemo(
    () => guilds.find((g) => g.id === activeGuildId) || null,
    [guilds, activeGuildId],
  );

  const metrics = useMemo(
    () =>
      buildOverviewMetrics({
        selectedGuild: activeGuildId,
        selectedGuildData,
        statusData: state.statusData,
        casesData: state.casesData,
        warningsData: state.warningsData,
      }),
    [activeGuildId, selectedGuildData, state],
  );

  if (!activeGuildId) {
    return (
      <div style={styles.page}>
        <section style={styles.sectionCard}>
          <OverviewSectionHeader
            styles={styles}
            title={page.title}
            subtitle={page.description}
          />
        </section>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <HeroCard
        styles={styles}
        metrics={metrics}
        selectedGuildData={selectedGuildData}
      />

      <section style={styles.sectionCard}>
        <OverviewSectionHeader
          styles={styles}
          title={OVERVIEW_CONFIG.labels.overviewTitle}
          subtitle={OVERVIEW_CONFIG.labels.overviewSubtitle}
        />

        <div style={styles.topStatsGrid}>
          {OVERVIEW_CONFIG.topStats.map((item) => (
            <TopStatCard
              key={item.key}
              theme={theme}
              styles={styles}
              item={item}
              metrics={metrics}
            />
          ))}
        </div>
      </section>
    </div>
  );
}