import React from 'react';

import useOwnerGuilds from '../../hooks/useOwnerGuilds.js';

export default function GlobalServers({ theme }) {
  const { guilds, loading, error } = useOwnerGuilds();

  const card = {
    border: '1px solid ' + theme.cardBorder,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 20,
    padding: 18,
    boxShadow: theme.shadow,
  };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={card}>
        <p style={{ margin: 0, color: '#93c5fd', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Owner Registry
        </p>

        <h1 style={{ margin: '8px 0 0', fontSize: 34 }}>
          Global Servers
        </h1>

        <p style={{ margin: '8px 0 0', color: theme.mutedText }}>
          View every Discord guild connected to Goliath across DEV, BETA and PRODUCTION.
        </p>
      </section>

      {error ? (
        <section style={{ ...card, color: '#fca5a5' }}>
          {error}
        </section>
      ) : null}

      <section style={card}>
        <div style={{ marginBottom: 14, color: theme.mutedText, fontWeight: 800 }}>
          {loading ? 'Loading servers...' : guilds.length + ' connected server(s)'}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                {['Environment', 'Guild', 'Guild ID', 'Members', 'Bot Status', 'Actions'].map((heading) => (
                  <th
                    key={heading}
                    style={{
                      textAlign: 'left',
                      color: theme.mutedText,
                      fontSize: 12,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      padding: '0 12px 12px',
                      borderBottom: '1px solid ' + theme.cardBorder,
                    }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {guilds.map((guild) => {
                const environment =
                  guild.environment === 'PRODUCTION'
                    ? 'PROD'
                    : guild.environment || guild.runtimeMode || 'ENV';

                return (
                  <tr key={(guild.environment || guild.runtimeMode || 'env') + '-' + (guild.guildId || guild.id)}>
                    <td style={cellStyle(theme)}>{environment}</td>
                    <td style={cellStyle(theme)}>
                      <strong>{guild.name || guild.guildName || 'Unknown Guild'}</strong>
                    </td>
                    <td style={cellStyle(theme)}>{guild.guildId || guild.id}</td>
                    <td style={cellStyle(theme)}>{guild.memberCount ?? 'Unknown'}</td>
                    <td style={cellStyle(theme)}>
                      <span style={{ color: '#86efac', fontWeight: 900 }}>
                        {guild.status || 'Connected'}
                      </span>
                    </td>
                    <td style={cellStyle(theme)}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <ActionButton label="Open Guild" theme={theme} />
                        <ActionButton label="Runtime" theme={theme} />
                        <ActionButton label="Security" theme={theme} />
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loading && guilds.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...cellStyle(theme), color: theme.mutedText }}>
                    No global servers found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function cellStyle(theme) {
  return {
    padding: '14px 12px',
    borderBottom: '1px solid ' + theme.cardBorder,
    color: theme.cardText,
    fontSize: 13,
  };
}

function ActionButton({ label, theme }) {
  return (
    <button
      type="button"
      style={{
        border: '1px solid rgba(59,130,246,0.32)',
        background: 'rgba(37,99,235,0.12)',
        color: '#bfdbfe',
        borderRadius: 10,
        padding: '7px 10px',
        cursor: 'pointer',
        fontWeight: 850,
        fontSize: 12,
      }}
    >
      {label}
    </button>
  );
}
