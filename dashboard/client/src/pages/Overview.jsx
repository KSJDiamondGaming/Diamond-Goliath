import { memo, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import DashboardPage, {
  EmptyState,
  SectionCard,
  StatGrid,
} from '../components/DashboardPage';

const INITIAL_STATE = {
  loading: true,
  error: '',
  statusData: null,
  casesData: null,
  warningsData: null,
  requestSpeedMs: null,
};

export default function Overview({ selectedGuild, theme }) {
  const [state, setState] = useState(INITIAL_STATE);

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
            requestSpeedMs: null,
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

      const startedAt = performance.now();

      const [statusResult, casesResult, warningsResult] = await Promise.allSettled([
        api.getStatus(selectedGuild),
        api.getCases(selectedGuild),
        api.getWarnings(selectedGuild),
      ]);

      const endedAt = performance.now();

      if (!mounted) return;

      const nextStatusData = statusResult.status === 'fulfilled' ? statusResult.value : null;
      const nextCasesData = casesResult.status === 'fulfilled' ? casesResult.value : null;
      const nextWarningsData = warningsResult.status === 'fulfilled' ? warningsResult.value : null;

      const failures = [statusResult, casesResult, warningsResult].filter(
        (result) => result.status === 'rejected'
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
        requestSpeedMs: Math.max(1, Math.round(endedAt - startedAt)),
      });
    }

    loadOverview();

    const interval = window.setInterval(loadOverview, 15000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [selectedGuild]);

  const overviewStats = useMemo(() => {
    const statusData = state.statusData;
    const casesData = state.casesData;
    const warningsData = state.warningsData;

    const totalCases = countCases(casesData, selectedGuild);
    const warningStats = countWarnings(warningsData, selectedGuild);

    const backendOnline = resolveBackendOnline(statusData);
    const apiOnline = resolveApiOnline(statusData);
    const botOnline = resolveBotOnline(statusData);
    const guildConnected = resolveGuildConnected(statusData, selectedGuild);

    const botLatencyMs = resolveBotLatency(statusData);
    const memberCount = resolveMemberCount(statusData, selectedGuild);
    const requestSpeedMs = Number(state.requestSpeedMs ?? statusData?.requestSpeedMs ?? 0) || null;

    return {
      totalCases,
      totalWarnings: warningStats.total,
      activeWarnings: warningStats.active,
      clearedWarnings: warningStats.cleared,
      backendOnline,
      apiOnline,
      botOnline,
      guildConnected,
      botLatencyMs,
      memberCount,
      requestSpeedMs,
      charts: {
        health: [
          backendOnline ? 100 : 15,
          apiOnline ? 100 : 15,
          botOnline ? 100 : 15,
        ],
        moderation: [
          totalCases,
          warningStats.total,
          warningStats.active,
          warningStats.cleared,
        ],
        performance: [
          botLatencyMs ?? 0,
          requestSpeedMs ?? 0,
          memberCount ?? 0,
        ],
      },
    };
  }, [state.statusData, state.casesData, state.warningsData, state.requestSpeedMs, selectedGuild]);

  if (!selectedGuild) {
    return (
      <DashboardPage
        title="Overview"
        subtitle="Select a server to view live guild and moderation stats."
        theme={theme}
      >
        <EmptyState theme={theme} text="Select a guild to view overview stats." />
      </DashboardPage>
    );
  }

  return (
    <DashboardPage
      title="Overview"
      subtitle="Guild Stats"
      theme={theme}
    >
      {state.error ? <p style={{ color: '#ef4444', margin: 0 }}>{state.error}</p> : null}

      <StatGrid>
        <StatusCard
          title="Bot Status"
          value={state.loading ? 'Checking...' : overviewStats.botOnline ? 'Online' : 'Offline'}
          theme={theme}
          tone={state.loading ? 'neutral' : overviewStats.botOnline ? 'success' : 'danger'}
        />

        <StatusCard
          title="Members"
          value={
            state.loading
              ? '...'
              : overviewStats.memberCount != null
                ? String(overviewStats.memberCount)
                : 'Unavailable'
          }
          theme={theme}
          tone="neutral"
        />

        <StatusCard
          title="Backend"
          value={state.loading ? 'Checking...' : overviewStats.backendOnline ? 'Online' : 'Offline'}
          theme={theme}
          tone={state.loading ? 'neutral' : overviewStats.backendOnline ? 'success' : 'danger'}
        />

        <StatusCard
          title="API Status"
          value={state.loading ? 'Checking...' : overviewStats.apiOnline ? 'Online' : 'Offline'}
          theme={theme}
          tone={state.loading ? 'neutral' : overviewStats.apiOnline ? 'success' : 'danger'}
        />
      </StatGrid>

      <SectionCard
        theme={theme}
        title="Moderation Snapshot"
        subtitle="A breakdown of current warning records and moderation activity for this guild."
        padding="20px"
      >
        {state.loading ? (
          <div
            style={{
              background: theme.softBg,
              border: `1px solid ${theme.cardBorder}`,
              borderRadius: '14px',
              padding: '16px',
              color: theme.mutedText,
            }}
          >
            Loading moderation snapshot...
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
            }}
          >
            <MiniMetric label="Total Cases" value={overviewStats.totalCases} theme={theme} />
            <MiniMetric label="Total Warnings" value={overviewStats.totalWarnings} theme={theme} />
            <MiniMetric label="Active Warnings" value={overviewStats.activeWarnings} theme={theme} />
            <MiniMetric label="Cleared Warnings" value={overviewStats.clearedWarnings} theme={theme} />
          </div>
        )}
      </SectionCard>

      <SectionCard
        theme={theme}
        title="Live Charts"
        subtitle="Quick visual indicators for health, moderation, and performance."
        padding="20px"
      >
        {state.loading ? (
          <div
            style={{
              background: theme.softBg,
              border: `1px solid ${theme.cardBorder}`,
              borderRadius: '14px',
              padding: '16px',
              color: theme.mutedText,
            }}
          >
            Loading charts...
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            <MiniChartCard
              theme={theme}
              title="System Health"
              subtitle="Backend, API, bot"
              data={overviewStats.charts.health}
              max={100}
              labels={['Backend', 'API', 'Bot']}
            />

            <MiniChartCard
              theme={theme}
              title="Moderation Load"
              subtitle="Cases and warnings"
              data={overviewStats.charts.moderation}
              labels={['Cases', 'Total Warn', 'Active', 'Cleared']}
            />

            <MiniChartCard
              theme={theme}
              title="Performance"
              subtitle="Latency, request speed, members"
              data={overviewStats.charts.performance}
              labels={['Latency', 'Request', 'Members']}
            />
          </div>
        )}
      </SectionCard>
    </DashboardPage>
  );
}

const StatusCard = memo(function StatusCard({ title, value, theme, tone = 'neutral' }) {
  const toneStyles = getToneStyles(tone);

  return (
    <div
      style={{
        background: theme.cardBg,
        border: `1px solid ${theme.cardBorder}`,
        padding: '20px',
        borderRadius: '18px',
        boxShadow: theme.shadow,
        minWidth: '180px',
        display: 'grid',
        gap: '10px',
      }}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 700,
          color: theme.mutedText,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {title}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '999px',
            background: toneStyles.dot,
            flexShrink: 0,
          }}
        />

        <span
          style={{
            fontSize: '24px',
            fontWeight: 800,
            color: toneStyles.text || theme.cardText,
            lineHeight: 1.1,
          }}
        >
          {value}
        </span>
      </div>
    </div>
  );
});

const MiniMetric = memo(function MiniMetric({ label, value, theme }) {
  return (
    <div
      style={{
        background: theme.softBg,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: '14px',
        padding: '16px',
        display: 'grid',
        gap: '8px',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 800,
          color: theme.mutedText,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: theme.cardText,
          fontWeight: 800,
          fontSize: '22px',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  );
});

const MiniChartCard = memo(function MiniChartCard({
  theme,
  title,
  subtitle,
  data,
  labels = [],
  max,
}) {
  const normalizedData = Array.isArray(data) ? data.map((value) => Number(value || 0)) : [];
  const maxValue = max || Math.max(...normalizedData, 1);

  return (
    <div
      style={{
        background: theme.softBg,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: '16px',
        padding: '16px',
        display: 'grid',
        gap: '14px',
      }}
    >
      <div>
        <div
          style={{
            color: theme.cardText,
            fontWeight: 800,
            fontSize: '16px',
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            style={{
              marginTop: '6px',
              color: theme.mutedText,
              fontSize: '13px',
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'end',
          gap: '10px',
          minHeight: '130px',
        }}
      >
        {normalizedData.map((value, index) => {
          const height = maxValue > 0 ? Math.max(14, Math.round((value / maxValue) * 100)) : 14;

          return (
            <div
              key={`${title}-${index}`}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'grid',
                gap: '8px',
                alignItems: 'end',
              }}
            >
              <div
                title={`${labels[index] || `Value ${index + 1}`}: ${value}`}
                style={{
                  height: `${height}px`,
                  borderRadius: '10px 10px 6px 6px',
                  background:
                    'linear-gradient(180deg, rgba(59,130,246,0.95) 0%, rgba(37,99,235,0.45) 100%)',
                  border: `1px solid ${theme.cardBorder}`,
                  boxShadow: theme.shadow,
                }}
              />
              <div
                style={{
                  color: theme.cardText,
                  fontWeight: 700,
                  fontSize: '12px',
                  lineHeight: 1.3,
                  wordBreak: 'break-word',
                }}
              >
                {labels[index] || `Value ${index + 1}`}
              </div>
              <div
                style={{
                  color: theme.mutedText,
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                {value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

function getToneStyles(tone) {
  switch (tone) {
    case 'success':
      return { dot: '#22c55e', text: '#22c55e' };
    case 'danger':
      return { dot: '#ef4444', text: '#ef4444' };
    case 'warning':
      return { dot: '#f59e0b', text: '#f59e0b' };
    default:
      return { dot: '#3b82f6', text: '' };
  }
}

function countCases(data, selectedGuild) {
  if (!data) return 0;

  if (Array.isArray(data)) {
    return data.length;
  }

  if (typeof data !== 'object') {
    return 0;
  }

  if (selectedGuild && data[selectedGuild] && typeof data[selectedGuild] === 'object') {
    const guildCases = data[selectedGuild];
    return Array.isArray(guildCases) ? guildCases.length : Object.keys(guildCases).length;
  }

  return Object.keys(data).length;
}

function countWarnings(data, selectedGuild) {
  let warningList = [];

  if (Array.isArray(data)) {
    warningList = data;
  } else if (data && typeof data === 'object') {
    if (selectedGuild && Array.isArray(data[selectedGuild])) {
      warningList = data[selectedGuild];
    } else if (selectedGuild && data[selectedGuild] && typeof data[selectedGuild] === 'object') {
      warningList = Object.values(data[selectedGuild]);
    } else {
      warningList = Object.values(data).flatMap((entry) => {
        if (Array.isArray(entry)) return entry;
        if (entry && typeof entry === 'object') return Object.values(entry);
        return [];
      });
    }
  }

  const active = warningList.filter((warning) => warning?.cleared !== true).length;
  const cleared = warningList.filter((warning) => warning?.cleared === true).length;

  return {
    total: warningList.length,
    active,
    cleared,
  };
}

function resolveBackendOnline(statusData) {
  if (!statusData || typeof statusData !== 'object') return false;

  if (typeof statusData.backendOnline === 'boolean') return statusData.backendOnline;
  if (typeof statusData.backend === 'boolean') return statusData.backend;
  if (typeof statusData.ok === 'boolean') return statusData.ok;
  if (typeof statusData.success === 'boolean') return statusData.success;

  if (statusData.backend && typeof statusData.backend === 'object') {
    if (typeof statusData.backend.online === 'boolean') return statusData.backend.online;
    if (typeof statusData.backend.ok === 'boolean') return statusData.backend.ok;
    if (typeof statusData.backend.status === 'string') {
      return isPositiveStatus(statusData.backend.status);
    }
  }

  if (typeof statusData.status === 'string') {
    return isPositiveStatus(statusData.status);
  }

  return false;
}

function resolveApiOnline(statusData) {
  if (!statusData || typeof statusData !== 'object') return false;

  if (typeof statusData.apiOnline === 'boolean') return statusData.apiOnline;
  if (typeof statusData.api === 'boolean') return statusData.api;

  if (statusData.api && typeof statusData.api === 'object') {
    if (typeof statusData.api.online === 'boolean') return statusData.api.online;
    if (typeof statusData.api.ok === 'boolean') return statusData.api.ok;
    if (typeof statusData.api.healthy === 'boolean') return statusData.api.healthy;
    if (typeof statusData.api.status === 'string') {
      return isPositiveStatus(statusData.api.status);
    }
  }

  if (typeof statusData.ok === 'boolean') return statusData.ok;
  if (typeof statusData.success === 'boolean') return statusData.success;

  return false;
}

function resolveBotOnline(statusData) {
  if (!statusData || typeof statusData !== 'object') return false;

  if (typeof statusData.botOnline === 'boolean') return statusData.botOnline;
  if (typeof statusData.bot === 'boolean') return statusData.bot;

  if (statusData.bot && typeof statusData.bot === 'object') {
    if (typeof statusData.bot.online === 'boolean') return statusData.bot.online;
    if (typeof statusData.bot.connected === 'boolean') return statusData.bot.connected;
    if (typeof statusData.bot.status === 'string') return isPositiveStatus(statusData.bot.status);
  }

  return false;
}

function resolveGuildConnected(statusData, selectedGuild) {
  if (!selectedGuild) return false;
  if (!statusData || typeof statusData !== 'object') return false;

  if (statusData.guilds && typeof statusData.guilds === 'object') {
    const guildState = statusData.guilds[selectedGuild];
    if (typeof guildState === 'boolean') return guildState;
    if (guildState && typeof guildState === 'object') {
      if (typeof guildState.inGuild === 'boolean') return guildState.inGuild;
      if (typeof guildState.connected === 'boolean') return guildState.connected;
      if (typeof guildState.available === 'boolean') return guildState.available;
      if (typeof guildState.online === 'boolean') return guildState.online;
    }
  }

  if (statusData.bot && typeof statusData.bot === 'object' && statusData.bot.guilds) {
    const guildState = statusData.bot.guilds[selectedGuild];
    if (typeof guildState === 'boolean') return guildState;
    if (guildState && typeof guildState === 'object') {
      if (typeof guildState.inGuild === 'boolean') return guildState.inGuild;
      if (typeof guildState.connected === 'boolean') return guildState.connected;
      if (typeof guildState.available === 'boolean') return guildState.available;
      if (typeof guildState.online === 'boolean') return guildState.online;
    }
  }

  return false;
}

function resolveBotLatency(statusData) {
  if (!statusData || typeof statusData !== 'object') return null;

  if (typeof statusData.botLatencyMs === 'number') return Math.round(statusData.botLatencyMs);
  if (typeof statusData.latencyMs === 'number') return Math.round(statusData.latencyMs);

  if (statusData.bot && typeof statusData.bot === 'object') {
    if (typeof statusData.bot.latencyMs === 'number') return Math.round(statusData.bot.latencyMs);
    if (typeof statusData.bot.ping === 'number') return Math.round(statusData.bot.ping);
  }

  return null;
}

function resolveMemberCount(statusData, selectedGuild) {
  if (!statusData || typeof statusData !== 'object') return null;

  if (typeof statusData.memberCount === 'number') return statusData.memberCount;

  if (statusData.guilds && selectedGuild && typeof statusData.guilds[selectedGuild] === 'object') {
    const guildState = statusData.guilds[selectedGuild];
    if (typeof guildState.memberCount === 'number') return guildState.memberCount;
    if (typeof guildState.members === 'number') return guildState.members;
  }

  if (statusData.bot && statusData.bot.guilds && selectedGuild) {
    const guildState = statusData.bot.guilds[selectedGuild];
    if (guildState && typeof guildState === 'object') {
      if (typeof guildState.memberCount === 'number') return guildState.memberCount;
      if (typeof guildState.members === 'number') return guildState.members;
    }
  }

  return null;
}

function isPositiveStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['ok', 'online', 'healthy', 'ready', 'connected', 'up'].includes(normalized);
}