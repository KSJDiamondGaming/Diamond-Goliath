import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient.js';

const FILTERS = [
  { key: 'all', label: 'All Guilds', icon: '🌐' },
  { key: 'DEV', label: 'DEV Guilds', icon: '🔵' },
  { key: 'BETA', label: 'BETA Guilds', icon: '🟡' },
  { key: 'PRODUCTION', label: 'Production Guilds', icon: '🟢' },
];

const OWNER_SECTIONS = [
  {
    title: 'Global Security Center',
    icon: '🛡️',
    description: 'Lockdowns, quarantines, anti-nuke events, webhook incidents, and security warnings.',
    status: 'Ready for data',
  },
  {
    title: 'Global Forms',
    icon: '📝',
    description: 'Applications, appeals, reports, support forms, and custom client forms.',
    status: 'Foundation ready',
  },
  {
    title: 'Global Tickets',
    icon: '🎟️',
    description: 'Open, closed, claimed tickets, response times, resolution times, and transcripts.',
    status: 'Analytics ready',
  },
  {
    title: 'Translation Hub',
    icon: '🌍',
    description: 'Translation channels, language threads, enabled languages, and provider status.',
    status: 'Provider pending',
  },
  {
    title: 'Backup Center',
    icon: '💾',
    description: 'Last backup, backup status, restore points, backup size, and future Google Drive sync.',
    status: 'Worker online',
  },
  {
    title: 'Deployment Center',
    icon: '🚀',
    description: 'Current versions, latest commits, deployment queue, deployment history, and rollbacks.',
    status: 'Actions online',
  },
];

function getEnvironmentMode(guild = {}) {
  return String(guild.environment || guild.runtimeMode || '').toUpperCase();
}

function getEnvironmentBadge(environment = '') {
  const mode = String(environment || '').toUpperCase();

  if (mode === 'DEV') return '🔵 DEV';
  if (mode === 'BETA') return '🟡 BETA';
  if (mode === 'PRODUCTION') return '🟢 PROD';

  return '⚪ UNKNOWN';
}

function getGuildName(guild = {}) {
  return guild.name || guild.guildName || 'Unknown Guild';
}

function getGuildId(guild = {}) {
  return guild.guildId || guild.id || 'Unknown';
}

function getGuildIcon(guild = {}) {
  return guild.iconUrl || guild.iconURL || guild.icon || '';
}

function isGuildConnected(guild = {}) {
  return guild.botConnected || guild.connected || guild.isConnected || false;
}

function normalizeGuilds(payload) {
  if (Array.isArray(payload?.guilds)) return payload.guilds;
  return [];
}

function formatNumber(value = 0) {
  return Number(value || 0).toLocaleString();
}

function OwnerStatCard({ theme, label, value, sublabel, icon, accent = '#93c5fd' }) {
  return (
    <div
      style={{
        border: `1px solid ${theme.cardBorder}`,
        background: theme.cardBg,
        color: theme.cardText,
        borderRadius: 20,
        boxShadow: theme.shadow,
        padding: 18,
        minHeight: 118,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 'auto -30px -45px auto',
          width: 110,
          height: 110,
          borderRadius: 999,
          background: `${accent}22`,
          filter: 'blur(2px)',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ color: theme.mutedText, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        <span style={{ fontSize: 24 }}>{icon}</span>
      </div>

      <div>
        <div style={{ fontSize: 30, fontWeight: 950, lineHeight: 1 }}>{value}</div>
        {sublabel ? (
          <div style={{ marginTop: 8, color: theme.mutedText, fontSize: 13 }}>
            {sublabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RuntimeCard({ theme, label, status, description, icon, accent }) {
  return (
    <div
      style={{
        border: `1px solid ${theme.cardBorder}`,
        background: theme.cardBg,
        color: theme.cardText,
        borderRadius: 18,
        boxShadow: theme.shadow,
        padding: 16,
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <strong style={{ fontSize: 15 }}>
          {icon} {label}
        </strong>
        <span
          style={{
            border: `1px solid ${accent}55`,
            color: accent,
            background: `${accent}14`,
            borderRadius: 999,
            padding: '5px 9px',
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          {status}
        </span>
      </div>

      <p style={{ margin: 0, color: theme.mutedText, lineHeight: 1.55, fontSize: 13 }}>
        {description}
      </p>
    </div>
  );
}

function SectionCard({ theme, section }) {
  return (
    <div
      style={{
        border: `1px solid ${theme.cardBorder}`,
        background: theme.cardBg,
        color: theme.cardText,
        borderRadius: 18,
        boxShadow: theme.shadow,
        padding: 18,
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 24, marginBottom: 8 }}>{section.icon}</div>
          <strong>{section.title}</strong>
        </div>

        <span
          style={{
            border: `1px solid ${theme.cardBorder}`,
            borderRadius: 999,
            padding: '5px 9px',
            color: theme.mutedText,
            fontSize: 12,
            whiteSpace: 'nowrap',
          }}
        >
          {section.status}
        </span>
      </div>

      <p style={{ margin: 0, color: theme.mutedText, lineHeight: 1.6, fontSize: 13 }}>
        {section.description}
      </p>
    </div>
  );
}

function OwnerActionModal({ theme, action, guild, onClose }) {
  const [runtimeData, setRuntimeData] = React.useState(null);
  const [loadingRuntime, setLoadingRuntime] = React.useState(false);

  React.useEffect(() => {
    if (action !== 'runtime') return;

    let cancelled = false;

    async function loadRuntime() {
      try {
        setLoadingRuntime(true);

        const response =
          await api.getPlatformRuntime();

        if (!cancelled) {
          setRuntimeData(response.runtime);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) {
          setLoadingRuntime(false);
        }
      }
    }

    loadRuntime();

    return () => {
      cancelled = true;
    };
  }, [action]);
  if (!action || !guild) return null;

  const guildName = getGuildName(guild);
  const guildId = getGuildId(guild);
  const environment = getEnvironmentMode(guild) || 'UNKNOWN';
  const connected = isGuildConnected(guild);

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: 'rgba(2,6,23,0.72)',
    backdropFilter: 'blur(10px)',
    display: 'grid',
    placeItems: 'center',
    padding: 18,
  };

  const modalStyle = {
    width: 'min(820px, 100%)',
    maxHeight: 'min(86vh, 820px)',
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 22,
    boxShadow: theme.shadow,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 14,
    padding: '12px 0',
    borderBottom: `1px solid ${theme.cardBorder}`,
  };

  const buttonStyle = {
    border: `1px solid ${theme.cardBorder}`,
    background: 'rgba(15,23,42,0.26)',
    color: theme.cardText,
    borderRadius: 12,
    padding: '9px 12px',
    cursor: 'pointer',
    fontWeight: 850,
  };

  const pillStyle = {
    border: `1px solid ${theme.cardBorder}`,
    borderRadius: 999,
    padding: '5px 9px',
    color: theme.mutedText,
    background: 'rgba(15,23,42,0.20)',
    fontSize: 12,
    fontWeight: 850,
  };

  const infoCardStyle = {
    border: `1px solid ${theme.cardBorder}`,
    borderRadius: 16,
    padding: 14,
    background: 'rgba(15,23,42,0.18)',
    display: 'grid',
    gap: 8,
  };

  const mutedLineStyle = {
    margin: 0,
    color: theme.mutedText,
    fontSize: 13,
    lineHeight: 1.55,
  };

  const titleMap = {
    manage: '⚙️ Manage Guild',
    runtime: '📊 Runtime Data',
    security: '🛡️ Security Overview',
  };

  const descriptionMap = {
    manage: 'Guild administration overview. This panel is ready for owner-only guild management actions.',
    runtime: 'Runtime inspection panel. This is prepared for CPU, memory, uptime, version, commit SHA, JSON sync, and backup data.',
    security: 'Guild security overview. This is prepared for lockdowns, quarantines, anti-nuke events, webhook incidents, warnings, and audit events.',
  };

  const runtimeRows = [
    ['Runtime Environment', getEnvironmentBadge(environment)],
    ['Runtime Status', connected ? 'Online' : 'Bot Missing'],
    ['Guild JSON', 'Ready for API data'],
    ['Last Sync', 'Pending backend endpoint'],
    ['Last Backup', 'Pending backend endpoint'],
    ['Commit SHA', 'Pending runtime monitor'],
  ];

  const securityRows = [
    ['Lockdowns', 'Pending backend data'],
    ['Quarantines', 'Pending backend data'],
    ['Anti-Nuke Events', 'Pending backend data'],
    ['Webhook Incidents', 'Pending backend data'],
    ['Channel Delete Events', 'Pending backend data'],
    ['Security Warnings', 'Pending backend data'],
  ];

  const manageActions = [
    { label: 'Refresh Guild Cache', description: 'Future action to reload guild metadata from Discord and runtime storage.' },
    { label: 'Rebuild Settings', description: 'Future action to validate and repair missing module defaults in guild JSON.' },
    { label: 'Sync Runtime Data', description: 'Future action to force a safe guild JSON sync for this environment.' },
    { label: 'Open Security Tools', description: 'Future shortcut into this guild security panel.' },
  ];

  function renderDataRows(rows) {
    return rows.map(([label, value]) => (
      <div key={label} style={rowStyle}>
        <strong>{label}</strong>
        <span style={{ color: theme.mutedText, textAlign: 'right' }}>{value}</span>
      </div>
    ));
  }

  function renderActionContent() {
    if (action === 'manage') {
      return (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            {manageActions.map((item) => (
              <div key={item.label} style={infoCardStyle}>
                <strong>{item.label}</strong>
                <p style={mutedLineStyle}>{item.description}</p>
                <span style={pillStyle}>Coming next</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (action === 'runtime') {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {loadingRuntime ? (
        <div style={infoCardStyle}>
          Loading runtime data...
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <div style={infoCardStyle}>
              <strong>Runtime Mode</strong>
              <p style={mutedLineStyle}>
                {runtimeData?.mode || 'Unknown'}
              </p>
            </div>

            <div style={infoCardStyle}>
              <strong>Hostname</strong>
              <p style={mutedLineStyle}>
                {runtimeData?.hostname || 'Unknown'}
              </p>
            </div>

            <div style={infoCardStyle}>
              <strong>Node Version</strong>
              <p style={mutedLineStyle}>
                {runtimeData?.nodeVersion || 'Unknown'}
              </p>
            </div>

            <div style={infoCardStyle}>
              <strong>CPU Count</strong>
              <p style={mutedLineStyle}>
                {runtimeData?.cpuCount || 0}
              </p>
            </div>

            <div style={infoCardStyle}>
              <strong>Memory Used</strong>
              <p style={mutedLineStyle}>
                {runtimeData?.memory?.used
                  ? `${(
                      runtimeData.memory.used /
                      1024 /
                      1024 /
                      1024
                    ).toFixed(2)} GB`
                  : 'Unknown'}
              </p>
            </div>

            <div style={infoCardStyle}>
              <strong>Uptime</strong>
              <p style={mutedLineStyle}>
                {runtimeData?.uptime
                  ? `${Math.floor(
                      runtimeData.uptime / 3600
                    )} Hours`
                  : 'Unknown'}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

    if (action === 'security') {
      return (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <div style={infoCardStyle}>
              <strong>Current Risk</strong>
              <p style={mutedLineStyle}>Pending Security API</p>
            </div>
            <div style={infoCardStyle}>
              <strong>Open Incidents</strong>
              <p style={mutedLineStyle}>Pending Security API</p>
            </div>
            <div style={infoCardStyle}>
              <strong>Last Incident</strong>
              <p style={mutedLineStyle}>Pending Security API</p>
            </div>
          </div>

          <div style={{ ...infoCardStyle, gap: 0 }}>
            {renderDataRows(securityRows)}
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={modalStyle}>
        <div
          style={{
            padding: 18,
            borderBottom: `1px solid ${theme.cardBorder}`,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>{titleMap[action] || 'Owner Action'}</h2>
            <p style={{ margin: '8px 0 0', color: theme.mutedText, lineHeight: 1.55 }}>
              {descriptionMap[action] || 'Owner action panel.'}
            </p>
          </div>

          <button type="button" style={buttonStyle} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', display: 'grid', gap: 16 }}>
          <div style={{ ...infoCardStyle, gap: 0 }}>
            <div style={rowStyle}>
              <strong>Guild</strong>
              <span>{guildName}</span>
            </div>

            <div style={rowStyle}>
              <strong>Guild ID</strong>
              <span style={{ fontFamily: 'monospace', color: theme.mutedText }}>{guildId}</span>
            </div>

            <div style={rowStyle}>
              <strong>Environment</strong>
              <span>{getEnvironmentBadge(environment)}</span>
            </div>

            <div style={rowStyle}>
              <strong>Members</strong>
              <span>{formatNumber(guild.memberCount)}</span>
            </div>

            <div style={{ ...rowStyle, borderBottom: 0 }}>
              <strong>Bot Status</strong>
              <span style={{ color: connected ? '#86efac' : '#fca5a5', fontWeight: 900 }}>
                {connected ? 'Connected' : 'Missing'}
              </span>
            </div>
          </div>

          {renderActionContent()}

          <div
            style={{
              border: `1px dashed ${theme.cardBorder}`,
              borderRadius: 16,
              padding: 16,
              color: theme.mutedText,
              lineHeight: 1.6,
              background: 'rgba(15,23,42,0.18)',
            }}
          >
            UI is now ready for backend endpoints. Next backend routes should be owner-only and return guild-specific runtime/security data from guild JSON and runtime process metadata.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OwnerView({ theme, currentUser, onSelectGuild, onReturnToDashboard }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ownerPayload, setOwnerPayload] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeAction, setActiveAction] = useState(null);
  const [platformRuntime, setPlatformRuntime] = useState(null);
  const [securityOverview, setSecurityOverview] = useState(null);
  const [securityLoading, setSecurityLoading] = useState(false);

  const isOwner = currentUser?.isOwner === true;

  useEffect(() => {
    let cancelled = false;

    async function loadOwnerGuilds() {
      if (!isOwner) {
        setLoading(false);
        setOwnerPayload(null);
        setError('Owner access required.');
        return;
      }

      try {
        setLoading(true);
        setError('');

        const payload = await api.getOwnerGuilds();

        if (!cancelled) {
          setOwnerPayload(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || 'Failed to load owner guilds.');
          setOwnerPayload(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadOwnerGuilds();

    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  useEffect(() => {
  let cancelled = false;

  async function loadRuntime() {
    try {
      const response =
        await api.getPlatformRuntime();

      if (!cancelled) {
        setPlatformRuntime(response.runtime);
      }
    } catch (error) {
      console.error(error);
    }
  }

  loadRuntime();

  return () => {
    cancelled = true;
  };
}, []);

  const guilds = useMemo(() => normalizeGuilds(ownerPayload), [ownerPayload]);

  const filteredGuilds = useMemo(() => {
    if (activeFilter === 'all') return guilds;

    return guilds.filter((guild) => getEnvironmentMode(guild) === activeFilter);
  }, [activeFilter, guilds]);

  useEffect(() => {
    if (!filteredGuilds.length) return;

    let cancelled = false;

    async function loadSecurityOverview() {
      try {
        setSecurityLoading(true);

        const response = await api.getSecurityOverview(
          getGuildId(filteredGuilds[0])
        );

        if (!cancelled) {
          setSecurityOverview(response);
        }
      } catch (securityError) {
        console.error(securityError);

        if (!cancelled) {
          setSecurityOverview(null);
        }
      } finally {
        if (!cancelled) {
          setSecurityLoading(false);
        }
      }
    }

    loadSecurityOverview();

    return () => {
      cancelled = true;
    };
  }, [filteredGuilds]);

  const stats = useMemo(() => {
    const totals = {
      all: guilds.length,
      DEV: 0,
      BETA: 0,
      PRODUCTION: 0,
      members: 0,
      connected: 0,
      missing: 0,
    };

    guilds.forEach((guild) => {
      const mode = getEnvironmentMode(guild);

      if (Object.prototype.hasOwnProperty.call(totals, mode)) {
        totals[mode] += 1;
      }

      totals.members += Number(guild.memberCount || 0);

      if (isGuildConnected(guild)) {
        totals.connected += 1;
      } else {
        totals.missing += 1;
      }
    });

    return totals;
  }, [guilds]);

  const runtimeMode = ownerPayload?.runtimeMode || ownerPayload?.mode || 'UNKNOWN';

  const cardStyle = {
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 22,
    boxShadow: theme.shadow,
  };

  const actionButtonStyle = {
    border: `1px solid ${theme.cardBorder}`,
    background: 'rgba(15,23,42,0.26)',
    color: theme.cardText,
    borderRadius: 10,
    padding: '7px 10px',
    cursor: 'pointer',
    fontWeight: 850,
    fontSize: 12,
    whiteSpace: 'nowrap',
  };

  const heroStyle = {
    ...cardStyle,
    padding: 24,
    position: 'relative',
    overflow: 'hidden',
    background:
      'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.06) 45%, rgba(168,85,247,0.12))',
  };

  function handleOpenGuild(guild, path = '/overview') {
  const guildId = String(getGuildId(guild) || '').split(':').pop();

  if (!guildId) return;

  const environment = getEnvironmentMode(guild);
  const guildName = getGuildName(guild);

  const managedGuild = {
    ...guild,
    id: guildId,
    guildId,
    name: guildName,
    guildName,
    rawName: guildName,
    environment,
    runtimeMode: environment,
    iconUrl: getGuildIcon(guild),
    ownerManaged: true,
  };

  if (typeof onSelectGuild === 'function') {
    onSelectGuild(managedGuild, path);
    return;
  }

  const searchParams = new URLSearchParams();

  searchParams.set('ownerGuildId', guildId);
  searchParams.set('ownerGuildName', guildName);

  if (environment) {
    searchParams.set('ownerGuildEnvironment', environment);
  }

  window.location.assign(path + '?' + searchParams.toString());
}

  function handleOwnerAction(action, guild) {
    setActiveAction({ action, guild });
  }

  function closeOwnerAction() {
    setActiveAction(null);
  }

  if (!isOwner) {
    return (
      <section style={{ ...cardStyle, padding: 24 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 26 }}>Owner View</h1>
        <p style={{ margin: 0, color: theme.mutedText }}>You do not have permission to view this page.</p>
      </section>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={heroStyle}>
        <div
          style={{
            position: 'absolute',
            right: -90,
            top: -90,
            width: 230,
            height: 230,
            borderRadius: 999,
            background: 'rgba(59,130,246,0.20)',
            filter: 'blur(4px)',
          }}
        />

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          <div>
            <p
              style={{
                margin: '0 0 8px',
                color: '#93c5fd',
                fontWeight: 950,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              KSJ Owner Control Centre
            </p>

            <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: '-0.04em' }}>
              👑 Goliath Owner View
            </h1>

            <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 760 }}>
              Platform-level dashboard for monitoring Goliath guilds, runtime environments, security,
              forms, tickets, translation, backups, and deployments.
            </p>
          </div>

          <div
            style={{
              border: `1px solid ${theme.cardBorder}`,
              borderRadius: 18,
              padding: '14px 16px',
              background: 'rgba(15,23,42,0.30)',
              minWidth: 190,
            }}
          >
            <strong>{runtimeMode}</strong>
            <div style={{ color: theme.mutedText, fontSize: 13, marginTop: 4 }}>Current Runtime</div>
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <OwnerStatCard theme={theme} label="Total Servers" value={formatNumber(stats.all)} sublabel="Registered guilds" icon="🌐" accent="#60a5fa" />
        <OwnerStatCard theme={theme} label="Total Members" value={formatNumber(stats.members)} sublabel="Across known guilds" icon="👥" accent="#34d399" />
        <OwnerStatCard theme={theme} label="Connected Bots" value={formatNumber(stats.connected)} sublabel={`${stats.missing} missing`} icon="🤖" accent="#22c55e" />
        <OwnerStatCard theme={theme} label="DEV" value={formatNumber(stats.DEV)} sublabel="Development guilds" icon="🟢" accent="#22c55e" />
        <OwnerStatCard theme={theme} label="BETA" value={formatNumber(stats.BETA)} sublabel="Beta guilds" icon="🟡" accent="#facc15" />
        <OwnerStatCard theme={theme} label="PROD" value={formatNumber(stats.PRODUCTION)} sublabel="Production guilds" icon="🔴" accent="#f87171" />
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
        <RuntimeCard
          theme={theme}
          label="DEV"
          status="ONLINE"
          description="Development environment for fast testing, owner-only experiments, and dashboard iteration."
          icon="🟢"
          accent="#22c55e"
        />
        <RuntimeCard
          theme={theme}
          label="BETA"
          status="ONLINE"
          description="Staging environment for testing releases before public production promotion."
          icon="🟡"
          accent="#facc15"
        />
        <RuntimeCard
          theme={theme}
          label="PRODUCTION"
          status="ONLINE"
          description="Live public Goliath environment with production bot, dashboard, and runtime services."
          icon="🔴"
          accent="#f87171"
        />
      </section>

      <section
  style={{
    ...cardStyle,
    padding: 18,
    display: 'grid',
    gap: 16,
  }}
>
  <div>
    <strong>📊 Platform Runtime Monitor</strong>
    <div
      style={{
        color: theme.mutedText,
        fontSize: 13,
        marginTop: 4,
      }}
    >
      Live runtime information from the current environment.
    </div>
  </div>

  <div
    style={{
      display: 'grid',
      gridTemplateColumns:
        'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 12,
    }}
  >
    <div style={cardStyle}>
      <div style={{ padding: 14 }}>
        <strong>Mode</strong>
        <div>{platformRuntime?.mode || 'Loading...'}</div>
      </div>
    </div>

    <div style={cardStyle}>
      <div style={{ padding: 14 }}>
        <strong>Hostname</strong>
        <div>{platformRuntime?.hostname || 'Loading...'}</div>
      </div>
    </div>

    <div style={cardStyle}>
      <div style={{ padding: 14 }}>
        <strong>Node</strong>
        <div>{platformRuntime?.nodeVersion || 'Loading...'}</div>
      </div>
    </div>

    <div style={cardStyle}>
      <div style={{ padding: 14 }}>
        <strong>CPU Count</strong>
        <div>{platformRuntime?.cpuCount || 0}</div>
      </div>
    </div>

    <div style={cardStyle}>
      <div style={{ padding: 14 }}>
        <strong>Memory Used</strong>
        <div>
          {platformRuntime?.memory?.used
            ? `${(
                platformRuntime.memory.used /
                1024 /
                1024 /
                1024
              ).toFixed(2)} GB`
            : 'Loading...'}
        </div>
      </div>
    </div>

    <div style={cardStyle}>
      <div style={{ padding: 14 }}>
        <strong>Uptime</strong>
        <div>
          {platformRuntime?.uptime
            ? `${Math.floor(
                platformRuntime.uptime / 3600
              )} Hours`
            : 'Loading...'}
        </div>
      </div>
    </div>
  </div>
</section>

      <section
        style={{
          ...cardStyle,
          padding: 18,
          display: 'grid',
          gap: 16,
        }}
      >
        <div>
          <strong>🛡️ Global Security Center</strong>
          <div
            style={{
              color: theme.mutedText,
              fontSize: 13,
              marginTop: 4,
            }}
          >
            Live security overview from the selected environment.
          </div>
        </div>

        {securityLoading ? (
          <div style={{ color: theme.mutedText }}>Loading security data...</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <OwnerStatCard
              theme={theme}
              icon="🚨"
              label="Incidents"
              value={securityOverview?.incidents?.total || 0}
              sublabel="Total security incidents"
              accent="#f87171"
            />

            <OwnerStatCard
              theme={theme}
              icon="🔥"
              label="Critical"
              value={securityOverview?.incidents?.critical || 0}
              sublabel="Critical incidents"
              accent="#fb7185"
            />

            <OwnerStatCard
              theme={theme}
              icon="🔒"
              label="Lockdown"
              value={securityOverview?.lockdown?.active ? 'YES' : 'NO'}
              sublabel="Current lockdown state"
              accent="#facc15"
            />

            <OwnerStatCard
              theme={theme}
              icon="🚷"
              label="Quarantined"
              value={Object.keys(securityOverview?.quarantine?.users || {}).length}
              sublabel="Users currently quarantined"
              accent="#a78bfa"
            />
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {OWNER_SECTIONS.map((section) => (
          <SectionCard key={section.title} theme={theme} section={section} />
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {FILTERS.map((filter) => {
          const count = filter.key === 'all' ? stats.all : stats[filter.key] || 0;
          const active = activeFilter === filter.key;

          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => setActiveFilter(filter.key)}
              style={{
                ...cardStyle,
                cursor: 'pointer',
                padding: 16,
                textAlign: 'left',
                borderColor: active ? '#93c5fd' : theme.cardBorder,
                background: active ? 'rgba(59,130,246,0.16)' : theme.cardBg,
              }}
            >
              <div style={{ fontWeight: 950 }}>
                {filter.icon} {filter.label}
              </div>
              <div style={{ marginTop: 8, color: theme.mutedText }}>
                {count} guild{count === 1 ? '' : 's'}
              </div>
            </button>
          );
        })}
      </section>

      <section style={{ ...cardStyle, overflow: 'hidden' }}>
        <div
          style={{
            padding: 18,
            borderBottom: `1px solid ${theme.cardBorder}`,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <strong>Global Server List</strong>
            <div style={{ color: theme.mutedText, fontSize: 13, marginTop: 4 }}>
              Guild registry across DEV, BETA, and PRODUCTION.
            </div>
          </div>

          <span style={{ color: theme.mutedText }}>{filteredGuilds.length} shown</span>
        </div>

        {loading ? (
          <div style={{ padding: 22, color: theme.mutedText }}>Loading owner guilds...</div>
        ) : error ? (
          <div style={{ padding: 22, color: '#fca5a5' }}>{error}</div>
        ) : filteredGuilds.length === 0 ? (
          <div style={{ padding: 22, color: theme.mutedText }}>No guilds found for this filter.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1040 }}>
              <thead>
                <tr style={{ color: theme.mutedText, textAlign: 'left', fontSize: 13 }}>
                  <th style={{ padding: '14px 18px' }}>Environment</th>
                  <th style={{ padding: '14px 18px' }}>Guild</th>
                  <th style={{ padding: '14px 18px' }}>Guild ID</th>
                  <th style={{ padding: '14px 18px' }}>Members</th>
                  <th style={{ padding: '14px 18px' }}>Bot</th>
                  <th style={{ padding: '14px 18px' }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredGuilds.map((guild) => {
                  const guildName = getGuildName(guild);
                  const guildId = getGuildId(guild);
                  const guildIcon = getGuildIcon(guild);
                  const connected = isGuildConnected(guild);

                  return (
                    <tr
                  key={`${getEnvironmentMode(guild) || 'ENV'}-${guildId}`}
                  style={{ borderTop: `1px solid ${theme.cardBorder}` }}
                    >
                      <td style={{ padding: '14px 18px', fontWeight: 850 }}>
                        {getEnvironmentBadge(getEnvironmentMode(guild))}
                      </td>

                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {guildIcon ? (
                            <img
                              src={guildIcon}
                              alt=""
                              style={{ width: 34, height: 34, borderRadius: 11, objectFit: 'cover' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 11,
                                display: 'grid',
                                placeItems: 'center',
                                background: 'rgba(148,163,184,0.14)',
                                fontWeight: 950,
                              }}
                            >
                              {guildName.charAt(0).toUpperCase()}
                            </div>
                          )}

                          <strong>{guildName}</strong>
                        </div>
                      </td>

                      <td style={{ padding: '14px 18px', color: theme.mutedText, fontFamily: 'monospace' }}>
                        {guildId}
                      </td>

                      <td style={{ padding: '14px 18px' }}>
                        {formatNumber(guild.memberCount)}
                      </td>

                      <td style={{ padding: '14px 18px' }}>
                        <span
                          style={{
                            border: `1px solid ${connected ? '#22c55e55' : '#f8717155'}`,
                            color: connected ? '#86efac' : '#fca5a5',
                            background: connected ? 'rgba(34,197,94,0.10)' : 'rgba(248,113,113,0.10)',
                            borderRadius: 999,
                            padding: '5px 9px',
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          {connected ? 'Connected' : 'Missing'}
                        </span>
                      </td>

                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            style={actionButtonStyle}
                            onClick={() => handleOpenGuild(guild)}
                            title={`Open ${guildName}`}
                          >
                            Open Guild
                          </button>

                          <button
                            type="button"
                            style={actionButtonStyle}
                            onClick={() => handleOpenGuild(guild)}
                            title={`Manage ${guildName}`}
                          >
                            Manage
                          </button>

                          <button
                            type="button"
                            style={actionButtonStyle}
                            onClick={() => handleOwnerAction('runtime', guild)}
                            title={`View runtime data for ${guildName}`}
                          >
                            Runtime
                          </button>

                          <button
                            type="button"
                            style={actionButtonStyle}
                            onClick={() => handleOwnerAction('security', guild)}
                            title={`View security for ${guildName}`}
                          >
                            Security
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <OwnerActionModal
        theme={theme}
        action={activeAction?.action}
        guild={activeAction?.guild}
        onClose={closeOwnerAction}
      />
    </div>
  );
}


