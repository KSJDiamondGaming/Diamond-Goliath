import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../services/apiClient.js';

const FILTERS = [
  { key: 'all', label: '🌐 All Guilds' },
  { key: 'DEV', label: '🟢 DEV Guilds' },
  { key: 'BETA', label: '🟡 BETA Guilds' },
  { key: 'PRODUCTION', label: '🔴 Production Guilds' },
];

function getEnvironmentBadge(environment = '') {
  const mode = String(environment || '').toUpperCase();

  if (mode === 'DEV') return '🟢 DEV';
  if (mode === 'BETA') return '🟡 BETA';
  if (mode === 'PRODUCTION') return '🔴 PROD';

  return '⚪ UNKNOWN';
}

function normalizeGuilds(payload) {
  if (Array.isArray(payload?.guilds)) return payload.guilds;
  return [];
}

export default function OwnerGlobalView({ theme, currentUser }) {
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

    return guilds.filter(
      (guild) => String(guild.environment || guild.runtimeMode || '').toUpperCase() === activeFilter,
    );
  }, [activeFilter, guilds]);

  const stats = useMemo(() => {
    const totals = {
      all: guilds.length,
      DEV: 0,
      BETA: 0,
      PRODUCTION: 0,
    };

    guilds.forEach((guild) => {
      const mode = String(guild.environment || guild.runtimeMode || '').toUpperCase();
      if (Object.prototype.hasOwnProperty.call(totals, mode)) {
        totals[mode] += 1;
      }
    });

    return totals;
  }, [guilds]);

  const cardStyle = {
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 22,
    boxShadow: theme.shadow,
  };

  if (!isOwner) {
    return (
      <section style={{ ...cardStyle, padding: 24 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 26 }}>Owner Global View</h1>
        <p style={{ margin: 0, color: theme.mutedText }}>You do not have permission to view this page.</p>
      </section>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{ ...cardStyle, padding: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: '0 0 8px', color: '#93c5fd', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              KSJ Owner Mode
            </p>
            <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 36px)' }}>Owner Global View</h1>
            <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6 }}>
              View every guild connected to the current Goliath runtime. Cross-environment aggregation can be added in Phase 2.
            </p>
          </div>

          <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: '12px 14px', background: 'rgba(59,130,246,0.10)' }}>
            <strong>{ownerPayload?.runtimeMode || ownerPayload?.mode || 'UNKNOWN'}</strong>
            <div style={{ color: theme.mutedText, fontSize: 13 }}>Current Runtime</div>
          </div>
        </div>
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
              <div style={{ fontWeight: 900 }}>{filter.label}</div>
              <div style={{ marginTop: 8, color: theme.mutedText }}>{count} guild{count === 1 ? '' : 's'}</div>
            </button>
          );
        })}
      </section>

      <section style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: 18, borderBottom: `1px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <strong>Guild Registry</strong>
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
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
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
                {filteredGuilds.map((guild) => (
                  <tr key={guild.guildId || guild.id} style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
                    <td style={{ padding: '14px 18px', fontWeight: 800 }}>{getEnvironmentBadge(guild.environment || guild.runtimeMode)}</td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {guild.iconUrl || guild.iconURL ? (
                          <img src={guild.iconUrl || guild.iconURL} alt="" style={{ width: 32, height: 32, borderRadius: 10 }} />
                        ) : (
                          <div style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(148,163,184,0.14)', fontWeight: 900 }}>
                            {(guild.name || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <strong>{guild.name || guild.guildName || 'Unknown Guild'}</strong>
                      </div>
                    </td>
                    <td style={{ padding: '14px 18px', color: theme.mutedText, fontFamily: 'monospace' }}>{guild.guildId || guild.id}</td>
                    <td style={{ padding: '14px 18px' }}>{Number(guild.memberCount || 0).toLocaleString()}</td>
                    <td style={{ padding: '14px 18px' }}>{guild.botConnected || guild.connected ? 'Connected' : 'Missing'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
