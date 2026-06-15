import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../services/apiClient.js';

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

export default function OwnerView({ theme, currentUser }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ownerPayload, setOwnerPayload] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

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

  const guilds = useMemo(() => normalizeGuilds(ownerPayload), [ownerPayload]);

  const filteredGuilds = useMemo(() => {
    if (activeFilter === 'all') return guilds;

    return guilds.filter((guild) => getEnvironmentMode(guild) === activeFilter);
  }, [activeFilter, guilds]);

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

  const heroStyle = {
    ...cardStyle,
    padding: 24,
    position: 'relative',
    overflow: 'hidden',
    background:
      'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.06) 45%, rgba(168,85,247,0.12))',
  };

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
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr style={{ color: theme.mutedText, textAlign: 'left', fontSize: 13 }}>
                  <th style={{ padding: '14px 18px' }}>Environment</th>
                  <th style={{ padding: '14px 18px' }}>Guild</th>
                  <th style={{ padding: '14px 18px' }}>Guild ID</th>
                  <th style={{ padding: '14px 18px' }}>Members</th>
                  <th style={{ padding: '14px 18px' }}>Bot</th>
                </tr>
              </thead>

              <tbody>
                {filteredGuilds.map((guild) => {
                  const guildName = getGuildName(guild);
                  const guildId = getGuildId(guild);
                  const guildIcon = getGuildIcon(guild);
                  const connected = isGuildConnected(guild);

                  return (
                    <tr key={guildId} style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}