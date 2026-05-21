import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../services/apiClient';

import {
  joinGuildRoom,
  onSocketEvent,
} from '../services/socketClient';

import PageShell, {
  SectionCard,
  StatGrid,
  SummaryStat,
  EmptyState,
  LoadingPanel,
  Notice,
} from '../shared/PageShell';

const INITIAL_STATE = {
  ok: true,

  threatLevel: 'low',

  incidents: {
    total: 0,
    critical: 0,
    recent: [],
  },

  lockdown: {
    active: false,
  },

  quarantine: {
    users: {},
  },
};

function getGuildAvatar(guild) {
  return guild?.iconUrl || guild?.iconURL || guild?.avatarUrl || guild?.image || '';
}

function getThreatAccent(theme, level = 'low') {
  const normalized = String(level || 'low').toLowerCase();

  if (normalized === 'critical') return theme.danger || '#ef4444';
  if (normalized === 'high') return theme.danger || '#ef4444';
  if (normalized === 'medium') return theme.warning || '#f59e0b';
  return theme.success || '#22c55e';
}

function getSeverityTone(severity = 'low') {
  const normalized = String(severity || 'low').toLowerCase();

  if (normalized === 'critical') return 'danger';
  if (normalized === 'high') return 'danger';
  if (normalized === 'medium') return 'warning';
  return 'success';
}

function StatusPill({ theme, tone = 'info', children }) {
  const tones = {
    info: {
      bg: 'rgba(59,130,246,0.14)',
      border: 'rgba(59,130,246,0.28)',
      text: '#bfdbfe',
    },
    success: {
      bg: 'rgba(34,197,94,0.13)',
      border: 'rgba(34,197,94,0.28)',
      text: theme.successText || '#86efac',
    },
    warning: {
      bg: 'rgba(245,158,11,0.14)',
      border: 'rgba(245,158,11,0.28)',
      text: theme.warningText || '#fcd34d',
    },
    danger: {
      bg: 'rgba(239,68,68,0.14)',
      border: 'rgba(239,68,68,0.30)',
      text: theme.dangerText || '#fca5a5',
    },
  };

  const current = tones[tone] || tones.info;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 28,
        padding: '5px 10px',
        borderRadius: 999,
        border: `1px solid ${current.border}`,
        background: current.bg,
        color: current.text,
        fontSize: 12,
        fontWeight: 900,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
      }}
    >
      {children}
    </span>
  );
}

function IncidentCard({ theme, incident }) {
  const severity = incident?.severity || 'low';
  const tone = getSeverityTone(severity);

  return (
    <div
      style={{
        background: theme.softBg,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: 16,
        padding: 'clamp(14px, 3vw, 16px)',
        display: 'grid',
        gap: 10,
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'grid', gap: 5, minWidth: 0, flex: '1 1 220px' }}>
          <div
            style={{
              color: theme.cardText,
              fontSize: 15,
              fontWeight: 900,
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
          >
            {incident?.type || 'Unknown Incident'}
          </div>

          <div
            style={{
              color: theme.mutedText,
              fontSize: 13,
              lineHeight: 1.45,
              fontWeight: 600,
              wordBreak: 'break-word',
            }}
          >
            {incident?.reason || 'No reason provided'}
          </div>
        </div>

        <StatusPill theme={theme} tone={tone}>
          {severity}
        </StatusPill>
      </div>

      {incident?.createdAt || incident?.timestamp || incident?.time ? (
        <div
          style={{
            color: theme.mutedText,
            fontSize: 12,
            fontWeight: 700,
            wordBreak: 'break-word',
          }}
        >
          {incident.createdAt || incident.timestamp || incident.time}
        </div>
      ) : null}
    </div>
  );
}

function StateRow({ theme, label, children }) {
  return (
    <div
      style={{
        background: theme.softBg,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: 16,
        padding: 14,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
        minWidth: 0,
      }}
    >
      <span
        style={{
          color: theme.cardText,
          fontWeight: 900,
          wordBreak: 'break-word',
        }}
      >
        {label}
      </span>

      {children}
    </div>
  );
}

export default function Security({
  selectedGuild,
  selectedGuildId,
  theme,
  guilds = [],
}) {
  const activeGuildId = selectedGuildId || selectedGuild || '';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(INITIAL_STATE);

  const selectedGuildData = useMemo(
    () => guilds.find((guild) => String(guild.id) === String(activeGuildId)) || null,
    [guilds, activeGuildId],
  );

  const pageGuild = useMemo(
    () => ({
      id: activeGuildId,
      name: selectedGuildData?.name || 'Security Center',
      iconUrl: getGuildAvatar(selectedGuildData),
    }),
    [activeGuildId, selectedGuildData],
  );

  useEffect(() => {
    if (!activeGuildId) {
      setLoading(false);

      setData({
        ok: false,
        error: 'Select a server first.',
      });

      return;
    }

    let cancelled = false;

    async function loadSecurityOverview() {
      try {
        setLoading(true);

        const result = await api.getSecurityOverview(activeGuildId);

        if (cancelled) return;

        setData({
          ...INITIAL_STATE,
          ...result,
        });
      } catch (error) {
        console.error('[Security] Failed to load:', error);

        if (cancelled) return;

        setData({
          ok: false,
          error: error.message || 'Failed to load security data.',
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSecurityOverview();

    return () => {
      cancelled = true;
    };
  }, [activeGuildId]);

  useEffect(() => {
    if (!activeGuildId) {
      return undefined;
    }

    joinGuildRoom(activeGuildId);

    const unsubscribe = onSocketEvent('guild:update', (update) => {
      if (!update) return;

      console.log('[Security] Live update:', update);

      if (update.type === 'security:event' && update.incident) {
        setData((previous) => {
          const incidents = previous?.incidents || {};
          const recent = Array.isArray(incidents.recent) ? incidents.recent : [];

          return {
            ...previous,

            threatLevel: update.incident.severity || previous.threatLevel,

            incidents: {
              ...incidents,

              total: Number(incidents.total || 0) + 1,

              critical:
                update.incident.severity === 'critical'
                  ? Number(incidents.critical || 0) + 1
                  : Number(incidents.critical || 0),

              recent: [update.incident, ...recent].slice(0, 25),
            },
          };
        });
      }

      if (update.type === 'security:lockdown') {
        setData((previous) => ({
          ...previous,

          lockdown: {
            ...(previous.lockdown || {}),
            ...(update.lockdown || {}),
          },
        }));
      }

      if (update.type === 'security:quarantine') {
        setData((previous) => ({
          ...previous,

          quarantine: {
            ...(previous.quarantine || {}),
            ...(update.quarantine || {}),
          },
        }));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeGuildId]);

  const quarantineCount = Object.keys(data.quarantine?.users || {}).length;
  const recentIncidents = Array.isArray(data.incidents?.recent)
    ? data.incidents.recent
    : [];

  const threatAccent = getThreatAccent(theme, data.threatLevel);
  const lockdownActive = Boolean(data.lockdown?.active);

  if (loading) {
    return (
      <PageShell
        title="Security Center"
        subtitle="Loading live Goliath protection overview."
        theme={theme}
        guild={pageGuild}
      >
        <LoadingPanel theme={theme} text="Loading security overview..." />
      </PageShell>
    );
  }

  if (!data?.ok) {
    return (
      <PageShell
        title="Security Center"
        subtitle="Live Goliath protection overview."
        theme={theme}
        guild={pageGuild}
      >
        <Notice theme={theme} tone="danger">
          {data?.error || 'Failed to load security data.'}
        </Notice>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Security Center"
      subtitle="Live Goliath protection overview, realtime incidents, lockdown state, and quarantine activity."
      theme={theme}
      guild={pageGuild}
      actions={
        <StatusPill theme={theme} tone="success">
          Live
        </StatusPill>
      }
    >
      <StatGrid min="min(190px, 100%)">
        <SummaryStat
          theme={theme}
          label="Threat Level"
          value={data.threatLevel || 'low'}
          accent={threatAccent}
          description="Current live security level"
        />

        <SummaryStat
          theme={theme}
          label="Total Incidents"
          value={data.incidents?.total || 0}
          description="Detected security events"
        />

        <SummaryStat
          theme={theme}
          label="Critical"
          value={data.incidents?.critical || 0}
          accent={theme.danger || '#ef4444'}
          description="Highest severity events"
        />

        <SummaryStat
          theme={theme}
          label="Lockdown"
          value={lockdownActive ? 'ACTIVE' : 'Inactive'}
          accent={lockdownActive ? theme.danger || '#ef4444' : theme.success || '#22c55e'}
          description="Emergency server protection"
        />

        <SummaryStat
          theme={theme}
          label="Quarantined"
          value={quarantineCount}
          accent={quarantineCount > 0 ? theme.warning || '#f59e0b' : theme.success || '#22c55e'}
          description="Users currently isolated"
        />
      </StatGrid>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
          gap: 'clamp(16px, 3vw, 24px)',
          alignItems: 'start',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
        }}
      >
        <SectionCard
          theme={theme}
          title="Live Security Feed"
          subtitle="Realtime incidents pushed from the Goliath security engine."
          actions={
            <StatusPill theme={theme} tone="success">
              Live Socket
            </StatusPill>
          }
        >
          {recentIncidents.length ? (
            <div
              style={{
                display: 'grid',
                gap: 12,
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
              }}
            >
              {recentIncidents.map((incident, index) => (
                <IncidentCard
                  key={incident.id || incident.caseId || index}
                  theme={theme}
                  incident={incident}
                />
              ))}
            </div>
          ) : (
            <EmptyState theme={theme} text="No incidents detected." />
          )}
        </SectionCard>

        <div
          style={{
            display: 'grid',
            gap: 'clamp(16px, 3vw, 24px)',
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
          }}
        >
          <SectionCard
            theme={theme}
            title="Security State"
            subtitle="Current protection modules for this guild."
          >
            <div
              style={{
                display: 'grid',
                gap: 12,
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
              }}
            >
              <StateRow theme={theme} label="Lockdown">
                <StatusPill theme={theme} tone={lockdownActive ? 'danger' : 'success'}>
                  {lockdownActive ? 'Active' : 'Inactive'}
                </StatusPill>
              </StateRow>

              <StateRow theme={theme} label="Quarantine">
                <StatusPill theme={theme} tone={quarantineCount > 0 ? 'warning' : 'success'}>
                  {quarantineCount} Users
                </StatusPill>
              </StateRow>

              <StateRow theme={theme} label="Realtime">
                <StatusPill theme={theme} tone="success">
                  Connected
                </StatusPill>
              </StateRow>
            </div>
          </SectionCard>

          <SectionCard
            theme={theme}
            title="Emergency Actions"
            subtitle="Action controls will connect here once command endpoints are wired."
          >
            <Notice theme={theme} tone="info">
              Controls planned: trigger lockdown, release lockdown, review quarantine, and restore protected permissions.
            </Notice>
          </SectionCard>
        </div>
      </div>
    </PageShell>
  );
}