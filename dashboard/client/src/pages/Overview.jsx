import { memo, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import PageShell, {
  EmptyState,
  LoadingPanel,
  Notice,
  SectionCard,
} from '../components/PageShell';
import { OVERVIEW_UI, PAGE_LAYOUTS, SECTION_DEFS } from '../ui';

const INITIAL_STATE = {
  loading: true,
  error: '',
  statusData: null,
  casesData: null,
  warningsData: null,
};

const PAGE_KEY = 'overview';

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function firstNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

function getDeepValue(source, paths = [], fallback = undefined) {
  for (const path of paths) {
    const segments = Array.isArray(path) ? path : String(path).split('.');
    let current = source;

    for (const key of segments) {
      if (current == null || typeof current !== 'object' || !(key in current)) {
        current = undefined;
        break;
      }
      current = current[key];
    }

    if (current !== undefined && current !== null) {
      return current;
    }
  }

  return fallback;
}

function getStatusTone(value) {
  if (typeof value === 'boolean') return value ? 'online' : 'offline';

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (['online', 'up', 'healthy', 'ok', 'ready', 'connected'].includes(normalized)) return 'online';
  if (['offline', 'down', 'error', 'failed', 'disconnected'].includes(normalized)) return 'offline';
  return 'unknown';
}

function getStatusLabel(value) {
  const tone = getStatusTone(value);
  if (tone === 'online') return 'Online';
  if (tone === 'offline') return 'Offline';
  return 'Checking';
}

function getThemeColors(theme) {
  return {
    pageGlow: theme?.pageGlow || 'radial-gradient(circle at top right, rgba(80,130,255,0.22), transparent 34%)',
    cardBg: theme?.cardBg || 'rgba(8, 18, 40, 0.96)',
    softBg: theme?.softBg || 'rgba(14, 26, 56, 0.9)',
    cardBorder: theme?.cardBorder || 'rgba(110, 144, 210, 0.18)',
    cardText: theme?.cardText || '#f8fafc',
    mutedText: theme?.mutedText || 'rgba(203, 213, 225, 0.82)',
    accent: theme?.accent || '#4f8cff',
    accentStrong: theme?.accentStrong || '#67a1ff',
    success: theme?.success || '#22c55e',
    danger: theme?.danger || '#ef4444',
    shadow: theme?.shadow || '0 20px 60px rgba(0, 0, 0, 0.38)',
  };
}

function normalizeWarnings(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.warnings)) return data.warnings;
  return [];
}

function getOverviewData(statusData, casesData, warningsData) {
  const casesArray = Array.isArray(casesData)
    ? casesData
    : Array.isArray(casesData?.items)
      ? casesData.items
      : Array.isArray(casesData?.cases)
        ? casesData.cases
        : casesData && typeof casesData === 'object'
          ? Object.values(casesData)
          : [];

  const warningsArray = normalizeWarnings(warningsData);

  const totalCases = casesArray.length;
  const totalWarnings = warningsArray.length;
  const activeWarnings = warningsArray.filter((warning) => warning?.cleared !== true).length;
  const clearedWarnings = warningsArray.filter((warning) => warning?.cleared === true).length;

  const members = firstNumber(
    getDeepValue(statusData, ['members', 'memberCount', 'guild.memberCount', 'guild.members']),
    getDeepValue(statusData, [['guild', 'approximateMemberCount']]),
  );

  const latency = firstNumber(
    getDeepValue(statusData, ['latency', 'ping', 'wsPing', 'discordPing', 'performance.latency']),
  );

  const requestCount = firstNumber(
    getDeepValue(statusData, ['requestCount', 'requests', 'apiRequests', 'performance.requests']),
  );

  const botStatusRaw = getDeepValue(statusData, ['botStatus', 'bot.status', 'bot.online', 'bot']);
  const backendStatusRaw = getDeepValue(statusData, ['backendStatus', 'backend.status', 'backend.online', 'backend']);
  const apiStatusRaw = getDeepValue(statusData, ['apiStatus', 'api.status', 'api.online', 'api']);

  const systemBars = [
    {
      key: 'backend',
      label: 'Backend',
      value: getStatusTone(backendStatusRaw) === 'online' ? 100 : 18,
      footer: getStatusLabel(backendStatusRaw),
    },
    {
      key: 'api',
      label: 'API',
      value: getStatusTone(apiStatusRaw) === 'online' ? 100 : 18,
      footer: getStatusLabel(apiStatusRaw),
    },
    {
      key: 'bot',
      label: 'Bot',
      value: getStatusTone(botStatusRaw) === 'online' ? 100 : 18,
      footer: getStatusLabel(botStatusRaw),
    },
  ];

  const moderationBars = [
    { key: 'cases', label: 'Cases', value: totalCases, footer: totalCases },
    { key: 'warnings', label: 'Warnings', value: totalWarnings, footer: totalWarnings },
    { key: 'active', label: 'Active', value: activeWarnings, footer: activeWarnings },
    { key: 'cleared', label: 'Cleared', value: clearedWarnings, footer: clearedWarnings },
  ];

  const performanceBars = [
    { key: 'latency', label: 'Latency', value: latency, footer: latency || 0 },
    { key: 'requests', label: 'Request', value: requestCount, footer: requestCount || 0 },
    { key: 'members', label: 'Members', value: members, footer: members || 0 },
  ];

  return {
    totalCases,
    totalWarnings,
    activeWarnings,
    clearedWarnings,
    members,
    latency,
    requestCount,
    botStatus: getStatusLabel(botStatusRaw),
    backendStatus: getStatusLabel(backendStatusRaw),
    apiStatus: getStatusLabel(apiStatusRaw),
    systemBars,
    moderationBars,
    performanceBars,
  };
}

const MetricCard = memo(function MetricCard({ theme, eyebrow, value, statusDot = null }) {
  const colors = getThemeColors(theme);

  return (
    <div
      style={{
        background: colors.softBg,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: '18px',
        padding: '18px 20px',
        display: 'grid',
        gap: '10px',
        minHeight: '92px',
        boxShadow: colors.shadow,
      }}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: colors.mutedText,
        }}
      >
        {eyebrow}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        {statusDot ? (
          <span
            aria-hidden="true"
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '999px',
              background: statusDot,
              boxShadow: `0 0 0 4px ${statusDot}22`,
              flexShrink: 0,
            }}
          />
        ) : null}

        <div
          style={{
            color: colors.cardText,
            fontSize: '22px',
            lineHeight: 1.1,
            fontWeight: 900,
            textShadow: '0 2px 0 rgba(0,0,0,0.2)',
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
});

const SnapshotCard = memo(function SnapshotCard({ theme, label, value }) {
  const colors = getThemeColors(theme);

  return (
    <div
      style={{
        background: 'rgba(8, 18, 40, 0.66)',
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: '16px',
        padding: '16px 16px 14px',
        display: 'grid',
        gap: '10px',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: colors.mutedText,
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: colors.cardText,
          fontSize: '18px',
          fontWeight: 900,
          textShadow: '0 2px 0 rgba(0,0,0,0.2)',
        }}
      >
        {value}
      </div>
    </div>
  );
});

const ChartCard = memo(function ChartCard({ theme, title, subtitle, items, mode = 'scaled' }) {
  const colors = getThemeColors(theme);
  const maxValue = Math.max(...items.map((item) => toNumber(item.value, 0)), 1);

  return (
    <div
      style={{
        background: 'rgba(8, 18, 40, 0.66)',
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: '18px',
        padding: '16px',
        display: 'grid',
        gap: '16px',
      }}
    >
      <div style={{ display: 'grid', gap: '6px' }}>
        <div
          style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 900,
            color: colors.cardText,
          }}
        >
          {title}
        </div>
        <div
          style={{
            margin: 0,
            fontSize: '13px',
            lineHeight: 1.5,
            color: colors.mutedText,
          }}
        >
          {subtitle}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
          gap: '10px',
          alignItems: 'end',
          minHeight: '160px',
        }}
      >
        {items.map((item) => {
          const rawValue = toNumber(item.value, 0);
          const percentage =
            mode === 'percentage' ? clamp(rawValue, 10, 100) : clamp((rawValue / maxValue) * 100, 10, 100);

          return (
            <div
              key={item.key}
              style={{
                display: 'grid',
                gap: '10px',
                alignItems: 'end',
              }}
            >
              <div
                style={{
                  height: '100px',
                  display: 'flex',
                  alignItems: 'flex-end',
                }}
              >
                <div
                  title={`${item.label}: ${item.footer}`}
                  style={{
                    width: '100%',
                    height: `${percentage}%`,
                    minHeight: '14px',
                    borderRadius: '10px',
                    background: 'linear-gradient(180deg, rgba(84,138,255,1) 0%, rgba(29,78,216,0.98) 58%, rgba(15,23,42,0.98) 100%)',
                    border: '1px solid rgba(147, 197, 253, 0.24)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gap: '4px' }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    color: colors.cardText,
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    color: colors.mutedText,
                  }}
                >
                  {item.footer}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default function Overview({ selectedGuild, theme }) {
  const [state, setState] = useState(INITIAL_STATE);

  const page = PAGE_LAYOUTS[PAGE_KEY] || {
    title: 'Overview',
    description: 'Select a server to view live guild and moderation stats.',
    sections: [],
  };

  useEffect(() => {
    let mounted = true;

    async function loadOverview() {
      if (!selectedGuild) {
        if (mounted) {
          setState({
            loading: false,
            error: '',
            statusData: null,
            casesData: null,
            warningsData: null,
          });
        }
        return;
      }

      if (mounted) {
        setState((prev) => ({
          ...prev,
          loading: true,
          error: '',
        }));
      }

      const [statusResult, casesResult, warningsResult] = await Promise.allSettled([
        api.getStatus(selectedGuild),
        api.getCases(selectedGuild),
        api.getWarnings(selectedGuild),
      ]);

      if (!mounted) return;

      const nextStatusData = statusResult.status === 'fulfilled' ? statusResult.value : null;
      const nextCasesData = casesResult.status === 'fulfilled' ? casesResult.value : null;
      const nextWarningsData = warningsResult.status === 'fulfilled' ? warningsResult.value : null;

      const failures = [statusResult, casesResult, warningsResult].filter(
        (result) => result.status === 'rejected',
      );

      let error = '';
      if (failures.length === 3) {
        error = 'Could not load overview stats.';
      } else if (failures.length > 0) {
        error = 'Some overview stats could not be loaded.';
      }

      setState({
        loading: false,
        error,
        statusData: nextStatusData,
        casesData: nextCasesData,
        warningsData: nextWarningsData,
      });
    }

    loadOverview();

    const interval = window.setInterval(loadOverview, 15000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [selectedGuild]);

  const colors = useMemo(() => getThemeColors(theme), [theme]);

  const overviewData = useMemo(
    () => getOverviewData(state.statusData, state.casesData, state.warningsData),
    [state.statusData, state.casesData, state.warningsData],
  );

  const heroTitle = getDeepValue(
    state.statusData,
    ['guild.name', 'guildName', 'name'],
    selectedGuild || 'Guild Overview',
  );

  if (!selectedGuild) {
    return (
      <PageShell
        title={page.title || 'Overview'}
        subtitle={page.description || 'Select a server to view live guild and moderation stats.'}
        theme={theme}
      >
        <EmptyState theme={theme} text="Select a guild to view overview stats." />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={page.title || 'Overview'}
      subtitle={page.description || 'Guild stats and live moderation overview.'}
      theme={theme}
    >
      {state.error ? (
        <Notice theme={theme} tone="danger">
          {state.error}
        </Notice>
      ) : null}

      <section
        style={{
          background: `${colors.pageGlow}, ${colors.cardBg}`,
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: '26px',
          padding: '22px 24px',
          boxShadow: colors.shadow,
          display: 'grid',
          gap: '10px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            fontSize: 'clamp(30px, 5vw, 52px)',
            lineHeight: 0.95,
            fontWeight: 1000,
            letterSpacing: '-0.04em',
            color: colors.cardText,
            textTransform: 'uppercase',
            textShadow: '0 3px 0 rgba(0,0,0,0.25)',
          }}
        >
          {heroTitle}
        </div>

        <div style={{ color: colors.mutedText, fontWeight: 700, fontSize: '14px' }}>
          Guild ID: {selectedGuild}
        </div>

        <div style={{ color: colors.mutedText, fontSize: '14px', lineHeight: 1.6 }}>
          {OVERVIEW_UI.heroDescription}
        </div>
      </section>

      <SectionCard
        theme={theme}
        title={SECTION_DEFS?.overviewStats?.title || OVERVIEW_UI.sectionTitles.overview}
        subtitle={SECTION_DEFS?.overviewStats?.description || OVERVIEW_UI.sectionDescriptions.overview}
        padding="22px"
      >
        {state.loading ? (
          <LoadingPanel theme={theme} text="Loading overview..." />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: '14px',
            }}
          >
            <MetricCard
              theme={theme}
              eyebrow={OVERVIEW_UI.metricLabels.botStatus}
              value={overviewData.botStatus}
              statusDot={overviewData.botStatus === 'Online' ? colors.success : colors.danger}
            />
            <MetricCard
              theme={theme}
              eyebrow={OVERVIEW_UI.metricLabels.members}
              value={overviewData.members}
            />
            <MetricCard
              theme={theme}
              eyebrow={OVERVIEW_UI.metricLabels.backendStatus}
              value={overviewData.backendStatus}
              statusDot={overviewData.backendStatus === 'Online' ? colors.success : colors.danger}
            />
            <MetricCard
              theme={theme}
              eyebrow={OVERVIEW_UI.metricLabels.apiStatus}
              value={overviewData.apiStatus}
              statusDot={overviewData.apiStatus === 'Online' ? colors.success : colors.danger}
            />
          </div>
        )}
      </SectionCard>

      <SectionCard
        theme={theme}
        title={SECTION_DEFS?.moderationSnapshot?.title || OVERVIEW_UI.sectionTitles.moderation}
        subtitle={SECTION_DEFS?.moderationSnapshot?.description || OVERVIEW_UI.sectionDescriptions.moderation}
        padding="22px"
      >
        {state.loading ? (
          <LoadingPanel theme={theme} text="Loading moderation snapshot..." />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '14px',
            }}
          >
            <SnapshotCard theme={theme} label={OVERVIEW_UI.snapshotLabels.totalCases} value={overviewData.totalCases} />
            <SnapshotCard theme={theme} label={OVERVIEW_UI.snapshotLabels.totalWarnings} value={overviewData.totalWarnings} />
            <SnapshotCard theme={theme} label={OVERVIEW_UI.snapshotLabels.activeWarnings} value={overviewData.activeWarnings} />
            <SnapshotCard theme={theme} label={OVERVIEW_UI.snapshotLabels.clearedWarnings} value={overviewData.clearedWarnings} />
          </div>
        )}
      </SectionCard>

      <SectionCard
        theme={theme}
        title={SECTION_DEFS?.liveCharts?.title || OVERVIEW_UI.sectionTitles.charts}
        subtitle={SECTION_DEFS?.liveCharts?.description || OVERVIEW_UI.sectionDescriptions.charts}
        padding="22px"
      >
        {state.loading ? (
          <LoadingPanel theme={theme} text="Loading live charts..." />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '14px',
            }}
          >
            <ChartCard
              theme={theme}
              title={OVERVIEW_UI.chartCards.system.title}
              subtitle={OVERVIEW_UI.chartCards.system.subtitle}
              items={overviewData.systemBars}
              mode="percentage"
            />
            <ChartCard
              theme={theme}
              title={OVERVIEW_UI.chartCards.moderation.title}
              subtitle={OVERVIEW_UI.chartCards.moderation.subtitle}
              items={overviewData.moderationBars}
            />
            <ChartCard
              theme={theme}
              title={OVERVIEW_UI.chartCards.performance.title}
              subtitle={OVERVIEW_UI.chartCards.performance.subtitle}
              items={overviewData.performanceBars}
            />
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
