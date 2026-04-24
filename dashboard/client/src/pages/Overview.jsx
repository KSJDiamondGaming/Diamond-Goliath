import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import {
  PAGE_LAYOUTS,
  OVERVIEW_UI,
  buildOverviewMetrics,
  createOverviewPageStyles,
  formatOverviewDisplayValue,
  getOverviewChartValue,
} from '../ui';

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

function getGuildAvatar(guild) {
  return guild?.iconUrl || guild?.iconURL || guild?.avatarUrl || guild?.image || '';
}

function normalizeStatusData(payload, selectedGuild, selectedGuildData) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const guildPayload =
    payload.guild ||
    payload.guilds?.[selectedGuild] ||
    payload.data?.guild ||
    null;

  const memberCount =
    payload.members ??
    payload.memberCount ??
    payload.totalMembers ??
    guildPayload?.memberCount ??
    selectedGuildData?.memberCount ??
    0;

  const bots =
    payload.bots ??
    payload.botCount ??
    guildPayload?.bots ??
    selectedGuildData?.bots ??
    0;

  const humans =
    payload.humans ??
    payload.humanCount ??
    guildPayload?.humans ??
    Math.max(Number(memberCount || 0) - Number(bots || 0), 0);

  const botOnline = Boolean(
    payload.botOnline ??
      payload.bot?.online ??
      payload.status === 'online',
  );

  const backendOnline = Boolean(
    payload.backendOnline ??
      payload.backend?.online ??
      true,
  );

  const apiOnline = Boolean(
    payload.apiOnline ??
      payload.api?.online ??
      payload.ok ??
      true,
  );

  const normalizedGuild = {
    ...(guildPayload || {}),
    id: guildPayload?.id || selectedGuild,
    name: guildPayload?.name || selectedGuildData?.name || null,
    memberCount,
    humans,
    bots,
    connected: guildPayload?.connected ?? true,
    status: guildPayload?.status || 'connected',
  };

  return {
    ...payload,
    botOnline,
    backendOnline,
    apiOnline,
    members: memberCount,
    memberCount,
    humans,
    bots,
    guild: normalizedGuild,
    guilds: {
      ...(payload.guilds || {}),
      [selectedGuild]: {
        ...(payload.guilds?.[selectedGuild] || {}),
        ...normalizedGuild,
      },
    },
  };
}

const HeroCard = memo(function HeroCard({ styles, metrics, selectedGuildData }) {
  const guildAvatar = getGuildAvatar(selectedGuildData);

  return (
    <section style={styles.hero}>
      <div style={styles.heroGlow} />

      <div style={styles.heroMeta}>
        <h1 style={styles.heroTitle}>{metrics.guildName}</h1>

        <p style={styles.heroMetaText}>
          {OVERVIEW_UI.labels.guildId}: {metrics.guildId}
        </p>

        <p style={styles.heroMetaText}>{OVERVIEW_UI.hero.subtitle}</p>
      </div>

      {guildAvatar ? (
        <img
          src={guildAvatar}
          alt={metrics.guildName}
          style={{
            position: 'absolute',
            right: '24px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '84px',
            height: '84px',
            borderRadius: '20px',
            objectFit: 'cover',
            opacity: 0.1,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </section>
  );
});

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

const TopStatCard = memo(function TopStatCard({ theme, styles, item, metrics }) {
  const statusMap = {
    botStatus: metrics.botOnline,
    botOnline: metrics.botOnline,
    backend: metrics.backendOnline,
    backendOnline: metrics.backendOnline,
    apiStatus: metrics.apiOnline,
    apiOnline: metrics.apiOnline,
  };

  const valueMap = {
    members: metrics.members,
    memberCount: metrics.members,
    humans: metrics.humans,
    bots: metrics.bots,
    botCount: metrics.bots,
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
    : formatOverviewDisplayValue(valueMap[item.key] ?? 0, item.format);

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

const SnapshotCard = memo(function SnapshotCard({ styles, label, value }) {
  return (
    <div style={styles.snapshotCard}>
      <p style={styles.snapshotLabel}>{label}</p>
      <p style={styles.snapshotValue}>{value}</p>
    </div>
  );
});

const ChartGroup = memo(function ChartGroup({ styles, metrics, group }) {
  return (
    <div style={styles.chartCard}>
      <div style={styles.chartHeading}>
        <h3 style={styles.chartTitle}>{group.title}</h3>
        <p style={styles.chartSubtitle}>{group.subtitle}</p>
      </div>

      <div style={styles.barsWrap}>
        <div style={styles.barsRow}>
          {group.bars.map((bar) => {
            const rawValue = metrics[bar.valueKey] ?? 0;
            const displayValue = formatOverviewDisplayValue(rawValue, bar.format);
            const chartHeight = getOverviewChartValue(rawValue, group.key);

            return (
              <div key={bar.key} style={styles.barColumn}>
                <div style={styles.barTrack}>
                  <div style={styles.barFill(chartHeight)} />
                </div>
                <p style={styles.barLabel}>{bar.label}</p>
                <p style={styles.barValue}>{displayValue}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default function Overview({
  selectedGuild,
  selectedGuildId,
  theme,
  guilds = [],
}) {
  const activeGuildId = selectedGuildId || selectedGuild;
  const [state, setState] = useState(INITIAL_STATE);
  const requestIdRef = useRef(0);

  const page = PAGE_LAYOUTS[PAGE_KEY] || {
    title: 'Overview',
    description: 'Select a server to view live guild and moderation stats.',
    sections: [],
  };

  const styles = useMemo(() => createOverviewPageStyles(theme), [theme]);

  const selectedGuildData = useMemo(
    () => guilds.find((guild) => guild.id === activeGuildId) || null,
    [guilds, activeGuildId],
  );

  const loadOverview = useCallback(
    async ({ preserveData = true } = {}) => {
      const requestId = ++requestIdRef.current;

      if (!activeGuildId) {
        setState({
          loading: false,
          error: '',
          statusData: null,
          casesData: null,
          warningsData: null,
          streamConnected: false,
        });
        return;
      }

      setState((prev) => ({
        loading: true,
        error: '',
        statusData: preserveData ? prev.statusData : null,
        casesData: preserveData ? prev.casesData : null,
        warningsData: preserveData ? prev.warningsData : null,
        streamConnected: prev.streamConnected,
      }));

      const [statusResult, casesResult, warningsResult] = await Promise.allSettled([
        api.getStatus(activeGuildId, { force: true }),
        api.getCases(activeGuildId),
        api.getWarnings(activeGuildId),
      ]);

      if (requestId !== requestIdRef.current) return;

      const rawStatusData =
        statusResult.status === 'fulfilled' ? statusResult.value : null;

      const nextStatusData = normalizeStatusData(
        rawStatusData,
        activeGuildId,
        selectedGuildData,
      );

      const nextCasesData =
        casesResult.status === 'fulfilled' ? casesResult.value : null;

      const nextWarningsData =
        warningsResult.status === 'fulfilled' ? warningsResult.value : null;

      const failures = [statusResult, casesResult, warningsResult].filter(
        (result) => result.status === 'rejected',
      );

      let error = '';
      if (failures.length === 3) {
        error = 'Could not load overview stats.';
      } else if (failures.length > 0) {
        error = 'Some overview stats could not be loaded.';
      }

      setState((prev) => ({
        loading: false,
        error,
        statusData: nextStatusData ?? prev.statusData,
        casesData: nextCasesData ?? prev.casesData,
        warningsData: nextWarningsData ?? prev.warningsData,
        streamConnected: prev.streamConnected,
      }));
    },
    [activeGuildId, selectedGuildData],
  );

  useEffect(() => {
    loadOverview({ preserveData: false });
  }, [loadOverview]);

  useEffect(() => {
    if (!activeGuildId) return undefined;

    let cancelled = false;
    const currentGuildId = activeGuildId;
    let stream = null;

    if (typeof api.createStatusStream === 'function') {
      stream = api.createStatusStream(currentGuildId, {
        onOpen: () => {
          if (cancelled) return;

          setState((prev) => ({
            ...prev,
            streamConnected: true,
            error: '',
          }));
        },

        onStatus: (payload) => {
          if (cancelled || currentGuildId !== activeGuildId) return;

          setState((prev) => ({
            ...prev,
            loading: false,
            error: '',
            streamConnected: true,
            statusData: normalizeStatusData(
              payload,
              currentGuildId,
              selectedGuildData,
            ),
          }));
        },

        onCases: (payload) => {
          if (cancelled || currentGuildId !== activeGuildId) return;

          setState((prev) => ({
            ...prev,
            loading: false,
            casesData: payload,
          }));
        },

        onWarnings: (payload) => {
          if (cancelled || currentGuildId !== activeGuildId) return;

          setState((prev) => ({
            ...prev,
            loading: false,
            warningsData: payload,
          }));
        },

        onSnapshot: (payload) => {
          if (cancelled || currentGuildId !== activeGuildId) return;

          setState((prev) => ({
            ...prev,
            loading: false,
            error: '',
            streamConnected: true,
            statusData: normalizeStatusData(
              payload?.status ?? prev.statusData,
              currentGuildId,
              selectedGuildData,
            ),
            casesData: payload?.cases ?? prev.casesData,
            warningsData: payload?.warnings ?? prev.warningsData,
          }));
        },

        onError: () => {
          if (cancelled) return;

          setState((prev) => ({
            ...prev,
            streamConnected: false,
          }));
        },
      });
    }

    return () => {
      cancelled = true;

      if (stream && typeof stream.close === 'function') {
        stream.close();
      }
    };
  }, [activeGuildId, selectedGuildData]);

  useEffect(() => {
    if (!activeGuildId) return undefined;

    const interval = window.setInterval(() => {
      loadOverview({ preserveData: true });
    }, FALLBACK_REFRESH_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadOverview, activeGuildId]);

  useEffect(() => {
    if (!activeGuildId) return undefined;

    const handleFocus = () => {
      loadOverview({ preserveData: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadOverview({ preserveData: true });
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadOverview, activeGuildId]);

  const metrics = useMemo(
    () =>
      buildOverviewMetrics({
        selectedGuild: activeGuildId,
        selectedGuildData,
        statusData: state.statusData,
        casesData: state.casesData,
        warningsData: state.warningsData,
      }),
    [
      activeGuildId,
      selectedGuildData,
      state.statusData,
      state.casesData,
      state.warningsData,
    ],
  );

  if (!activeGuildId) {
    return (
      <div style={styles.page}>
        <section style={styles.sectionCard}>
          <OverviewSectionHeader
            styles={styles}
            title={page.title || 'Overview'}
            subtitle={
              page.description ||
              'Select a server to view live guild and moderation stats.'
            }
          />

          <div
            style={{
              background: theme.softBg,
              border: `1px dashed ${theme.cardBorder}`,
              borderRadius: '16px',
              padding: '26px',
              color: theme.mutedText,
              textAlign: 'center',
              fontWeight: 600,
            }}
          >
            Select a guild to view overview stats.
          </div>
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
          title={OVERVIEW_UI.labels.overviewTitle}
          subtitle={OVERVIEW_UI.labels.overviewSubtitle}
        />

        {state.error ? (
          <div
            style={{
              background: theme.dangerSoft,
              border: `1px solid ${theme.dangerBorder}`,
              borderRadius: '14px',
              padding: '14px 16px',
              color: theme.dangerText,
              fontWeight: 700,
            }}
          >
            {state.error}
          </div>
        ) : null}

        {state.loading && !state.statusData && !state.casesData && !state.warningsData ? (
          <div
            style={{
              background: theme.softBg,
              border: `1px solid ${theme.cardBorder}`,
              borderRadius: '14px',
              padding: '16px',
              color: theme.mutedText,
            }}
          >
            Loading overview...
          </div>
        ) : (
          <div style={styles.topStatsGrid}>
            {OVERVIEW_UI.topStats.map((item) => (
              <div key={item.key} style={styles.topStatsGridItem(item.key)}>
                <TopStatCard
                  theme={theme}
                  styles={styles}
                  item={item}
                  metrics={metrics}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={styles.sectionCard}>
        <OverviewSectionHeader
          styles={styles}
          title={OVERVIEW_UI.labels.moderationTitle}
          subtitle={OVERVIEW_UI.labels.moderationSubtitle}
        />

        <div style={styles.snapshotGrid}>
          <SnapshotCard
            styles={styles}
            label={OVERVIEW_UI.labels.totalCases}
            value={metrics.totalCases}
          />
          <SnapshotCard
            styles={styles}
            label={OVERVIEW_UI.labels.totalWarnings}
            value={metrics.totalWarnings}
          />
          <SnapshotCard
            styles={styles}
            label={OVERVIEW_UI.labels.activeWarnings}
            value={metrics.activeWarnings}
          />
          <SnapshotCard
            styles={styles}
            label={OVERVIEW_UI.labels.clearedWarnings}
            value={metrics.clearedWarnings}
          />
        </div>
      </section>

      <section style={styles.sectionCard}>
        <OverviewSectionHeader
          styles={styles}
          title={OVERVIEW_UI.labels.chartsTitle}
          subtitle={OVERVIEW_UI.labels.chartsSubtitle}
        />

        <div style={styles.chartsGrid}>
          {OVERVIEW_UI.chartGroups.map((group) => (
            <ChartGroup
              key={group.key}
              styles={styles}
              metrics={metrics}
              group={group}
            />
          ))}
        </div>
      </section>
    </div>
  );
}