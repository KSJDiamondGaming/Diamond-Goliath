import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { PAGE_LAYOUTS } from '../ui/layout';

import {
  createOverviewPageStyles,
  buildOverviewMetrics,
  formatOverviewDisplayValue,
} from '../ui/components';

import { api, joinGuildRoom, listenForGuildUpdate } from '../api';

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

/* -------------------- CONFIG -------------------- */

const OVERVIEW_CONFIG = {
  labels: {
    guildId: 'Guild ID',
    overviewTitle: 'Overview',
    overviewSubtitle: 'Live server stats and system status',

    moderationTitle: 'Moderation Snapshot',
    moderationSubtitle: 'Cases and warnings overview',

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

  moderationStats: [
    { key: 'totalCases', label: 'Total Cases' },
    { key: 'totalWarnings', label: 'Total Warnings' },
    { key: 'activeWarnings', label: 'Active Warnings' },
    { key: 'clearedWarnings', label: 'Cleared Warnings' },
  ],
};

/* -------------------- HELPERS -------------------- */

function getGuildAvatar(guild) {
  return guild?.iconUrl || guild?.iconURL || guild?.avatarUrl || guild?.image || '';
}

function getGuildName(guild, fallback = 'Selected Server') {
  return guild?.name || guild?.guildName || fallback;
}

function getSafeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return 0;
}

function getArrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

function getCaseCount(casesData) {
  if (Array.isArray(casesData)) return casesData.length;

  if (casesData?.cases && Array.isArray(casesData.cases)) {
    return casesData.cases.length;
  }

  if (casesData && typeof casesData === 'object') {
    return firstNumber(casesData.total, casesData.count, Object.keys(casesData).length);
  }

  return 0;
}

function getWarningCount(warningsData) {
  if (Array.isArray(warningsData)) return warningsData.length;

  if (warningsData?.warnings && Array.isArray(warningsData.warnings)) {
    return warningsData.warnings.length;
  }

  if (warningsData && typeof warningsData === 'object') {
    return firstNumber(
      warningsData.total,
      warningsData.count,
      Object.keys(warningsData).length,
    );
  }

  return 0;
}

function getActiveWarningCount(warningsData) {
  if (Array.isArray(warningsData)) {
    return warningsData.filter((warning) => {
      const status = String(warning?.status || '').toLowerCase();
      const cleared = Boolean(warning?.cleared || warning?.removed || warning?.resolved);

      return !cleared && status !== 'cleared' && status !== 'removed' && status !== 'resolved';
    }).length;
  }

  return firstNumber(warningsData?.active, warningsData?.activeWarnings);
}

function getClearedWarningCount(warningsData) {
  if (Array.isArray(warningsData)) {
    return warningsData.filter((warning) => {
      const status = String(warning?.status || '').toLowerCase();
      const cleared = Boolean(warning?.cleared || warning?.removed || warning?.resolved);

      return cleared || status === 'cleared' || status === 'removed' || status === 'resolved';
    }).length;
  }

  return firstNumber(warningsData?.cleared, warningsData?.clearedWarnings);
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
    totalCases: metrics.totalCases,
    totalWarnings: metrics.totalWarnings,
    activeWarnings: metrics.activeWarnings,
    clearedWarnings: metrics.clearedWarnings,
  };

  const isStatus = item.type === 'status';
  const isOnline = Boolean(statusMap[item.key]);
  const color = isOnline ? theme.success : theme.danger;

  const value = isStatus
    ? isOnline
      ? item.onlineText
      : item.offlineText
    : formatOverviewDisplayValue(getSafeNumber(valueMap[item.key]));

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
  selectedGuildName,
  selectedGuildData: selectedGuildDataProp,
  theme,
  guilds = [],
}) {
  const activeGuildId = selectedGuildId || selectedGuild || '';

  const [state, setState] = useState(INITIAL_STATE);
  const joinedGuildRef = useRef('');

  const page = PAGE_LAYOUTS[PAGE_KEY] || {
    title: 'Overview',
    description: 'Select a server to view stats.',
  };

  const styles = useMemo(() => createOverviewPageStyles(theme), [theme]);

  const selectedGuildData = useMemo(() => {
    if (selectedGuildDataProp?.id === activeGuildId) return selectedGuildDataProp;

    return (
      guilds.find((guild) => guild.id === activeGuildId) ||
      selectedGuildDataProp ||
      null
    );
  }, [activeGuildId, guilds, selectedGuildDataProp]);

  const loadOverviewData = useCallback(
    async ({ silent = false } = {}) => {
      if (!activeGuildId) {
        setState({
          ...INITIAL_STATE,
          loading: false,
        });
        return;
      }

      setState((current) => ({
        ...current,
        loading: silent ? current.loading : true,
        error: '',
      }));

      try {
        const [statusResult, casesResult, warningsResult] = await Promise.allSettled([
          api.getStatus(activeGuildId),
          api.getCases(activeGuildId),
          api.getWarnings(activeGuildId),
        ]);

        const statusData =
          statusResult.status === 'fulfilled' ? statusResult.value : null;

        const casesData =
          casesResult.status === 'fulfilled' ? casesResult.value : null;

        const warningsData =
          warningsResult.status === 'fulfilled' ? warningsResult.value : null;

        if (statusResult.status === 'rejected') {
          throw statusResult.reason;
        }

        setState((current) => ({
          ...current,
          loading: false,
          error: '',
          statusData,
          casesData,
          warningsData,
        }));
      } catch (error) {
        console.error('Failed to load overview data:', error);

        setState((current) => ({
          ...current,
          loading: false,
          error: 'Could not load overview stats for this server.',
        }));
      }
    },
    [activeGuildId],
  );

  useEffect(() => {
    loadOverviewData();
  }, [loadOverviewData]);

  useEffect(() => {
    if (!activeGuildId) return undefined;

    if (joinedGuildRef.current !== activeGuildId) {
      joinGuildRoom(activeGuildId);
      joinedGuildRef.current = activeGuildId;
    }

    setState((current) => ({
      ...current,
      streamConnected: true,
    }));

    const stopListening = listenForGuildUpdate((payload) => {
      const payloadGuildId =
        payload?.guildId ||
        payload?.guild?.id ||
        payload?.id ||
        '';

      if (!payloadGuildId || payloadGuildId === activeGuildId) {
        loadOverviewData({ silent: true });
      }
    });

    return () => {
      stopListening?.();

      setState((current) => ({
        ...current,
        streamConnected: false,
      }));
    };
  }, [activeGuildId, loadOverviewData]);

  useEffect(() => {
    if (!activeGuildId) return undefined;

    const interval = window.setInterval(() => {
      loadOverviewData({ silent: true });
    }, FALLBACK_REFRESH_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeGuildId, loadOverviewData]);

  const metrics = useMemo(() => {
    const statusData = state.statusData || {};
    const statusGuild = statusData.guild || {};

    const builtMetrics = buildOverviewMetrics({
      selectedGuild: activeGuildId,
      selectedGuildData,
      statusData,
      casesData: state.casesData,
      warningsData: state.warningsData,
    });

    /**
     * Important:
     * Backend status is the source of truth.
     *
     * The old version gave priority to builtMetrics.members,
     * which could resolve to humans or stale frontend fallback values.
     */
    const members = firstNumber(
      statusData.memberCount,
      statusData.members,
      statusGuild.memberCount,
      statusGuild.members,
      builtMetrics.memberCount,
      builtMetrics.members,
      selectedGuildData?.memberCount,
      selectedGuildData?.members,
    );

    const humans = firstNumber(
      statusData.humans,
      statusGuild.humans,
      builtMetrics.humans,
    );

    const bots = firstNumber(
      statusData.bots,
      statusGuild.bots,
      builtMetrics.bots,
    );

    const totalCases = firstNumber(
      builtMetrics.totalCases,
      state.casesData?.totalCases,
      state.casesData?.total,
      state.casesData?.count,
      getCaseCount(state.casesData),
    );

    const totalWarnings = firstNumber(
      builtMetrics.totalWarnings,
      state.warningsData?.totalWarnings,
      state.warningsData?.total,
      state.warningsData?.count,
      getWarningCount(state.warningsData),
    );

    const activeWarnings = firstNumber(
      builtMetrics.activeWarnings,
      state.warningsData?.activeWarnings,
      state.warningsData?.active,
      getActiveWarningCount(state.warningsData),
    );

    const clearedWarnings = firstNumber(
      builtMetrics.clearedWarnings,
      state.warningsData?.clearedWarnings,
      state.warningsData?.cleared,
      getClearedWarningCount(state.warningsData),
    );

    return {
      ...builtMetrics,

      guildId: builtMetrics.guildId || activeGuildId,
      guildName:
        statusGuild.name ||
        builtMetrics.guildName ||
        selectedGuildName ||
        getGuildName(selectedGuildData),

      members,
      memberCount: members,
      humans,
      bots,

      botOnline: Boolean(
        statusData.botOnline ??
          statusData.bot?.online ??
          builtMetrics.botOnline ??
          statusData.online
      ),

      backendOnline: Boolean(
        statusData.backendOnline ??
          statusData.backend?.online ??
          builtMetrics.backendOnline
      ),

      apiOnline: Boolean(
        statusData.apiOnline ??
          statusData.api?.online ??
          statusData.ok ??
          builtMetrics.apiOnline
      ),

      totalCases,
      totalWarnings,
      activeWarnings,
      clearedWarnings,
    };
  }, [
    activeGuildId,
    selectedGuildData,
    selectedGuildName,
    state.statusData,
    state.casesData,
    state.warningsData,
  ]);

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

      {state.error ? (
        <section style={styles.sectionCard}>
          <OverviewSectionHeader
            styles={styles}
            title="Overview Error"
            subtitle={state.error}
          />
        </section>
      ) : null}

      <section style={styles.sectionCard}>
        <OverviewSectionHeader
          styles={styles}
          title={OVERVIEW_CONFIG.labels.overviewTitle}
          subtitle={
            state.loading
              ? 'Loading live server stats...'
              : OVERVIEW_CONFIG.labels.overviewSubtitle
          }
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

      <section style={styles.sectionCard}>
        <OverviewSectionHeader
          styles={styles}
          title={OVERVIEW_CONFIG.labels.moderationTitle}
          subtitle={OVERVIEW_CONFIG.labels.moderationSubtitle}
        />

        <div style={styles.topStatsGrid}>
          {OVERVIEW_CONFIG.moderationStats.map((item) => (
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
