import React from 'react';

import useOwnerBackups from '../../hooks/useOwnerBackups.js';

export default function BackupCenter({ theme }) {
  const { backups, loading, error } = useOwnerBackups();

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
        <p style={{ margin: 0, color: '#22c55e', fontWeight: 900, textTransform: 'uppercase' }}>
          Global Backups
        </p>

        <h1 style={{ margin: '8px 0 0', fontSize: 34 }}>
          Backup Center
        </h1>

        <p style={{ marginTop: 8, color: theme.mutedText }}>
          Monitor server backups, restore points, sync status and recovery readiness across all environments.
        </p>
      </section>

      {error ? (
        <section style={{ ...card, color: '#fca5a5' }}>
          {error}
        </section>
      ) : null}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))',
          gap: 14,
        }}
      >
        <StatCard title="Last Backup" value={loading ? 'Loading' : 'Pending'} theme={theme} />
        <StatCard title="Restore Points" value={String(backups.length)} theme={theme} />
        <StatCard title="Backup Size" value="Pending" theme={theme} />
        <StatCard title="Drive Sync" value="Pending" theme={theme} />
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Restore Points</h3>

        {backups.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {backups.map((backup, index) => (
              <BackupRow
                key={backup.id || index}
                environment={backup.environment || 'GLOBAL'}
                status={backup.status || 'Available'}
                theme={theme}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              border: '1px dashed ' + theme.cardBorder,
              borderRadius: 14,
              padding: 20,
              color: theme.mutedText,
            }}
          >
            Restore point list and Google Drive sync status coming soon.
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ title, value, theme }) {
  return (
    <div
      style={{
        border: '1px solid ' + theme.cardBorder,
        background: theme.cardBg,
        borderRadius: 18,
        padding: 18,
      }}
    >
      <div style={{ color: theme.mutedText }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8 }}>{value}</div>
    </div>
  );
}

function BackupRow({ environment, status, theme }) {
  return (
    <div
      style={{
        border: '1px solid ' + theme.cardBorder,
        borderRadius: 14,
        padding: 14,
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <strong>{environment}</strong>
      <span style={{ color: '#f59e0b', fontWeight: 900 }}>{status}</span>
    </div>
  );
}
