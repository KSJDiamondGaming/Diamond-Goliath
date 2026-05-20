import React, { memo, useEffect, useMemo, useState } from 'react';
import { api } from '../services/apiClient';
import { PAGE_LAYOUTS } from '../ui/layout';

const PAGE_KEY = 'overview';
const REFRESH_MS = 20000;

const INITIAL_STATE = {
  loading: false,
  error: '',
  statusData: null,
  casesData: [],
  warningsData: [],
};

function getGuildAvatar(guild, statusData) {
  return (
    guild?.iconUrl ||
    guild?.iconURL ||
    guild?.avatarUrl ||
    guild?.image ||
    statusData?.guild?.iconUrl ||
    statusData?.guild?.iconURL ||
    ''
  );
}

function getGuildName(guild, statusData, fallback = 'Selected Server') {
  return guild?.name || statusData?.guild?.name || fallback;
}

function getNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }

  return 0;
}

function getBoolean(...values) {
  return values.some(Boolean);
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function buildMetrics({
  selectedGuildId,
  selectedGuildData,
  statusData,
  casesData,
  warningsData,
}) {
  const guildStatus =
    statusData?.guild ||
    statusData?.guilds?.[selectedGuildId] ||
    null;

  const cases = normalizeArray(casesData);
  const warnings = normalizeArray(warningsData);

  const activeWarnings = warnings.filter((warning) => {
    const status = String(warning?.status || warning?.state || '').toLowerCase();
    return !['cleared', 'removed', 'expired', 'deleted', 'inactive'].includes(status);
  });

  const clearedWarnings = warnings.filter((warning) => {
    const status = String(warning?.status || warning?.state || '').toLowerCase();
    return ['cleared', 'removed', 'expired', 'deleted', 'inactive'].includes(status);
  });

  return {
    guildId: selectedGuildId,
    guildName: getGuildName(selectedGuildData, statusData),

    members: getNumber(
      statusData?.members,
      statusData?.memberCount,
      guildStatus?.members,
      guildStatus?.memberCount
    ),
    humans: getNumber(statusData?.humans, guildStatus?.humans),
    bots: getNumber(statusData?.bots, guildStatus?.bots),

    botOnline: getBoolean(statusData?.botOnline, statusData?.bot?.online),
    backendOnline: getBoolean(statusData?.backendOnline, statusData?.backend?.online),
    apiOnline: getBoolean(statusData?.apiOnline, statusData?.api?.online),

    latencyMs: Number(statusData?.latencyMs || statusData?.botLatencyMs || 0),

    totalCases: cases.length,
    totalWarnings: warnings.length,
    activeWarnings: activeWarnings.length,
    clearedWarnings: clearedWarnings.length,
  };
}

function createStyles(theme = {}) {
  const pageBg = theme.pageBg || '#070b14';
  const cardBg = theme.cardBg || '#0f172a';
  const cardSoft = theme.softBg || '#111c33';
  const border = theme.cardBorder || theme.border || 'rgba(148, 163, 184, 0.16)';
  const text = theme.cardText || theme.text || '#f8fafc';
  const muted = theme.mutedText || '#93a4bd';
  const primary = theme.primary || '#3b82f6';
  const success = theme.success || '#22c55e';
  const danger = theme.danger || '#ef4444';

  return {
    page: {
      minHeight: '100%',
      background: pageBg,
      color: text,
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
    },

    hero: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 18,
      border: `1px solid ${border}`,
      background:
        'linear-gradient(135deg, rgba(30, 64, 175, 0.34), rgba(15, 23, 42, 0.96) 62%)',
      padding: '26px 28px',
      minHeight: 116,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 18px 45px rgba(0, 0, 0, 0.28)',
    },

    heroContent: {
      position: 'relative',
      zIndex: 2,
    },

    heroTitle: {
      margin: 0,
      fontSize: 'clamp(30px, 4vw, 48px)',
      lineHeight: 1,
      fontWeight: 900,
      letterSpacing: '-0.05em',
      textTransform: 'uppercase',
      color: text,
    },

    heroText: {
      margin: '10px 0 0',
      color: muted,
      fontSize: 13,
      fontWeight: 700,
    },

    heroLogo: {
      width: 92,
      height: 92,
      borderRadius: 18,
      objectFit: 'cover',
      opacity: 0.7,
      border: `1px solid ${border}`,
      boxShadow: '0 18px 36px rgba(0,0,0,0.3)',
    },

    section: {
      borderRadius: 18,
      border: `1px solid ${border}`,
      background: cardBg,
      padding: 20,
      boxShadow: '0 14px 38px rgba(0, 0, 0, 0.22)',
    },

    sectionTitle: {
      margin: 0,
      fontSize: 28,
      lineHeight: 1,
      fontWeight: 900,
      letterSpacing: '-0.04em',
      color: text,
    },

    sectionSubtitle: {
      margin: '8px 0 0',
      color: muted,
      fontSize: 13,
      fontWeight: 600,
    },

    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: 12,
      marginTop: 18,
    },

    snapshotGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      gap: 12,
      marginTop: 18,
    },

    chartGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: 14,
      marginTop: 18,
    },

    statCard: {
      minHeight: 72,
      borderRadius: 12,
      border: `1px solid ${border}`,
      background: cardSoft,
      padding: '14px 16px',
    },

    statLabel: {
      margin: 0,
      color: muted,
      fontSize: 11,
      fontWeight: 900,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
    },

    statValue: {
      margin: '10px 0 0',
      color: text,
      fontSize: 22,
      fontWeight: 900,
      letterSpacing: '-0.03em',
    },

    statusValue: (online) => ({
      margin: '10px 0 0',
      color: online ? success : danger,
      fontSize: 22,
      fontWeight: 900,
      letterSpacing: '-0.03em',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }),

    dot: (online) => ({
      width: 9,
      height: 9,
      borderRadius: 999,
      background: online ? success : danger,
      boxShadow: `0 0 12px ${online ? success : danger}`,
    }),

    chartCard: {
      borderRadius: 14,
      border: `1px solid ${border}`,
      background: cardSoft,
      padding: 16,
      minHeight: 160,
    },

    chartTitle: {
      margin: 0,
      color: text,
      fontSize: 16,
      fontWeight: 900,
    },

    chartSub: {
      margin: '4px 0 0',
      color: muted,
      fontSize: 12,
      fontWeight: 600,
    },

    bars: {
      display: 'flex',
      alignItems: 'end',
      gap: 12,
      height: 84,
      marginTop: 20,
    },

    barWrap: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: 8,
    },

    bar: (height) => ({
      height,
      minHeight: 10,
      borderRadius: 8,
      background: `linear-gradient(180deg, ${primary}, rgba(37, 99, 235, 0.72))`,
      boxShadow: '0 10px 24px rgba(37, 99, 235, 0.28)',
    }),

    barLabel: {
      color: text,
      fontSize: 11,
      fontWeight: 900,
    },

    barValue: {
      color: muted,
      fontSize: 11,
      fontWeight: 800,
    },

    error: {
      borderRadius: 12,
      border: '1px solid rgba(239, 68, 68, 0.28)',
      background: 'rgba(239, 68, 68, 0.08)',
      color: '#fecaca',
      padding: 12,
      fontSize: 13,
      fontWeight: 700,
    },

    empty: {
      borderRadius: 18,
      border: `1px solid ${border}`,
      background: cardBg,
      padding: 36,
      textAlign: 'center',
      color: muted,
    },
  };
}

const SectionHeader = memo(function SectionHeader({ styles, title, subtitle }) {
  return (
    <div>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {subtitle ? <p style={styles.sectionSubtitle}>{subtitle}</p> : null}
    </div>
  );
});

const StatCard = memo(function StatCard({ styles, label, value, online }) {
  const isStatus = typeof online === 'boolean';

  return (
    <div style={styles.statCard}>
      <p style={styles.statLabel}>{label}</p>

      {isStatus ? (
        <p style={styles.statusValue(online)}>
          <span style={styles.dot(online)} />
          {online ? 'Online' : 'Offline'}
        </p>
      ) : (
        <p style={styles.statValue}>{value}</p>
      )}
    </div>
  );
});

const ChartCard = memo(function ChartCard({ styles, title, subtitle, bars }) {
  const maxValue = Math.max(...bars.map((bar) => Number(bar.value || 0)), 1);

  return (
    <div style={styles.chartCard}>
      <h3 style={styles.chartTitle}>{title}</h3>
      <p style={styles.chartSub}>{subtitle}</p>

      <div style={styles.bars}>
        {bars.map((bar) => {
          const value = Number(bar.value || 0);
          const height = Math.max(12, Math.round((value / maxValue) * 68));

          return (
            <div key={bar.label} style={styles.barWrap}>
              <div style={styles.bar(height)} />
              <div>
                <div style={styles.barLabel}>{bar.label}</div>
                <div style={styles.barValue}>{value}</div>
              </div>
            </div>
          );
        })}
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

  const page = PAGE_LAYOUTS[PAGE_KEY] || {
    title: 'Overview',
    description: 'Select a server to view stats.',
  };

  const styles = useMemo(() => createStyles(theme), [theme]);

  const selectedGuildData = useMemo(
    () => guilds.find((guild) => String(guild.id) === String(activeGuildId)) || null,
    [guilds, activeGuildId]
  );

  useEffect(() => {
    if (!activeGuildId) {
      setState(INITIAL_STATE);
      return undefined;
    }

    let cancelled = false;

    async function loadOverview() {
      setState((current) => ({
        ...current,
        loading: true,
        error: '',
      }));

      try {
        const [statusData, casesData, warningsData] = await Promise.all([
          api.getStatus(activeGuildId),
          api.getCases(activeGuildId).catch(() => []),
          api.getWarnings(activeGuildId).catch(() => []),
        ]);

        if (cancelled) return;

        setState({
          loading: false,
          error: '',
          statusData,
          casesData,
          warningsData,
        });
      } catch (error) {
        if (cancelled) return;

        setState((current) => ({
          ...current,
          loading: false,
          error: error.message || 'Failed to load overview.',
        }));
      }
    }

    loadOverview();

    const interval = setInterval(loadOverview, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeGuildId]);

  const metrics = useMemo(
    () =>
      buildMetrics({
        selectedGuildId: activeGuildId,
        selectedGuildData,
        statusData: state.statusData,
        casesData: state.casesData,
        warningsData: state.warningsData,
      }),
    [activeGuildId, selectedGuildData, state.statusData, state.casesData, state.warningsData]
  );

  const guildAvatar = getGuildAvatar(selectedGuildData, state.statusData);

  if (!activeGuildId) {
    return (
      <div style={styles.page}>
        <div style={styles.empty}>
          <h2 style={{ margin: 0, color: '#f8fafc' }}>{page.title}</h2>
          <p>{page.description}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {state.error ? <div style={styles.error}>{state.error}</div> : null}

      <section style={styles.hero}>
        <div style={styles.heroContent}>
          <h1 style={styles.heroTitle}>{metrics.guildName}</h1>
          <p style={styles.heroText}>Guild ID: {metrics.guildId}</p>
          <p style={styles.heroText}>Real-time server insights</p>
        </div>

        {guildAvatar ? (
          <img
            src={guildAvatar}
            alt={`${metrics.guildName} logo`}
            style={styles.heroLogo}
          />
        ) : null}
      </section>

      <section style={styles.section}>
        <SectionHeader
          styles={styles}
          title="Overview"
          subtitle={state.loading ? 'Refreshing live stats...' : 'Live server stats and system status'}
        />

        <div style={styles.statsGrid}>
          <StatCard styles={styles} label="Bot Status" online={metrics.botOnline} />
          <StatCard styles={styles} label="Backend" online={metrics.backendOnline} />
          <StatCard styles={styles} label="API Status" online={metrics.apiOnline} />

          <StatCard styles={styles} label="Members" value={metrics.members} />
          <StatCard styles={styles} label="Humans" value={metrics.humans} />
          <StatCard styles={styles} label="Bots" value={metrics.bots} />
        </div>
      </section>

      <section style={styles.section}>
        <SectionHeader
          styles={styles}
          title="Moderation Snapshot"
          subtitle="A breakdown of current warning records and moderation activity for this guild."
        />

        <div style={styles.snapshotGrid}>
          <StatCard styles={styles} label="Total Cases" value={metrics.totalCases} />
          <StatCard styles={styles} label="Total Warnings" value={metrics.totalWarnings} />
          <StatCard styles={styles} label="Active Warnings" value={metrics.activeWarnings} />
          <StatCard styles={styles} label="Cleared Warnings" value={metrics.clearedWarnings} />
        </div>
      </section>

      <section style={styles.section}>
        <SectionHeader
          styles={styles}
          title="Live Charts"
          subtitle="Quick visual indicators for health, moderation, and performance."
        />

        <div style={styles.chartGrid}>
          <ChartCard
            styles={styles}
            title="System"
            subtitle="Backend, API, Bot"
            bars={[
              { label: 'Backend', value: metrics.backendOnline ? 100 : 0 },
              { label: 'API', value: metrics.apiOnline ? 100 : 0 },
              { label: 'Bot', value: metrics.botOnline ? 100 : 0 },
            ]}
          />

          <ChartCard
            styles={styles}
            title="Moderation"
            subtitle="Cases and warnings"
            bars={[
              { label: 'Cases', value: metrics.totalCases },
              { label: 'Warnings', value: metrics.totalWarnings },
              { label: 'Active', value: metrics.activeWarnings },
              { label: 'Cleared', value: metrics.clearedWarnings },
            ]}
          />

          <ChartCard
            styles={styles}
            title="Performance"
            subtitle="Latency, humans, members, bots"
            bars={[
              { label: 'Latency', value: metrics.latencyMs || 1 },
              { label: 'Humans', value: metrics.humans },
              { label: 'Members', value: metrics.members },
              { label: 'Bots', value: metrics.bots },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
