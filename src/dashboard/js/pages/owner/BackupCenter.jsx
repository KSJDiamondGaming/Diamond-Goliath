import React from 'react';

import useOwnerBackups from '../../hooks/useOwnerBackups.js';

function formatDate(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString();
}

function humanStatus(value = '') {
  const text = String(value || 'unknown').replace(/[_-]/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function BackupCenter({ theme }) {
  const { backups, summary, updatedAt, loading, error, refresh } = useOwnerBackups();

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
      <section style={{ ...card, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, color: '#22c55e', fontWeight: 900, textTransform: 'uppercase' }}>
            Global Backups
          </p>

          <h1 style={{ margin: '8px 0 0', fontSize: 34 }}>
            Backup Center v2
          </h1>

          <p style={{ marginTop: 8, color: theme.mutedText, maxWidth: 820, lineHeight: 1.6 }}>
            Live backup readiness across DEV, BETA and PRODUCTION. This view checks runtime folders, backup worker availability, restore point readiness and failed backup warnings without creating standalone module JSON.
          </p>

          <p style={{ margin: '10px 0 0', color: theme.mutedText, fontSize: 13 }}>
            Last checked: {formatDate(updatedAt)}
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          style={{
            border: '1px solid rgba(34,197,94,0.45)',
            background: 'rgba(34,197,94,0.12)',
            color: '#86efac',
            borderRadius: 12,
            padding: '10px 14px',
            fontWeight: 900,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh Status'}
        </button>
      </section>

      {error ? (
        <section style={{ ...card, color: '#fca5a5' }}>
          {error}
        </section>
      ) : null}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))',
          gap: 14,
        }}
      >
        <StatCard title="Backup Health" value={loading ? 'Loading' : humanStatus(summary.health)} detail={`${summary.ready || 0}/${summary.environments || 0} environments ready`} tone={summary.health === 'healthy' ? 'good' : 'warn'} theme={theme} />
        <StatCard title="Restore Points" value={String(summary.restorePoints || 0)} detail="Tracked across environments" theme={theme} />
        <StatCard title="Backup Size" value={summary.totalSizeLabel || '0 B'} detail="Known stored backup size" theme={theme} />
        <StatCard title="Warnings" value={String(summary.warnings || 0)} detail={`${summary.failed || 0} failed or missing checks`} tone={summary.warnings ? 'warn' : 'good'} theme={theme} />
      </section>

      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0 }}>Environment Overview</h3>
            <p style={{ margin: '6px 0 0', color: theme.mutedText }}>
              Folder readiness, worker status and restore point metadata per runtime.
            </p>
          </div>
          <span style={{ color: summary.warnings ? '#fbbf24' : '#86efac', fontWeight: 900 }}>
            {summary.warnings ? 'Attention required' : 'Healthy'}
          </span>
        </div>

        {backups.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {backups.map((backup, index) => (
              <BackupRow
                key={backup.id || index}
                backup={backup}
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
            {loading ? 'Loading backup runtime data...' : 'No backup runtime data returned yet.'}
          </div>
        )}
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
          gap: 14,
        }}
      >
        <ActionCard title="Manual Backup" text="Ready for the next backend action: create an owner-only trigger that queues a backup job for the selected environment." theme={theme} />
        <ActionCard title="Restore Queue" text="Prepared for queued restore jobs, verification checks and rollback safety before applying recovered data." theme={theme} />
        <ActionCard title="Google Drive Sync" text="Future sync status can plug into this page without changing guild.json module storage." theme={theme} />
      </section>
    </div>
  );
}

function StatCard({ title, value, detail, tone = 'neutral', theme }) {
  const toneColor = tone === 'good' ? '#86efac' : tone === 'warn' ? '#fbbf24' : theme.cardText;

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
      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8, color: toneColor }}>{value}</div>
      {detail ? <div style={{ marginTop: 6, color: theme.mutedText, fontSize: 13 }}>{detail}</div> : null}
    </div>
  );
}

function BackupRow({ backup, theme }) {
  const ready = backup.backupFolderReady && backup.status !== 'offline';
  const statusColor = ready ? '#86efac' : '#fbbf24';

  return (
    <div
      style={{
        border: '1px solid ' + theme.cardBorder,
        borderRadius: 14,
        padding: 14,
        display: 'grid',
        gridTemplateColumns: 'minmax(140px,1fr) minmax(180px,1.4fr) minmax(140px,1fr)',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <div>
        <strong>{backup.environment}</strong>
        <div style={{ marginTop: 4, color: theme.mutedText, fontSize: 13 }}>
          Runtime: {humanStatus(backup.status)}
        </div>
      </div>

      <div style={{ color: theme.mutedText, fontSize: 13, overflowWrap: 'anywhere' }}>
        <strong style={{ color: theme.cardText }}>Backup Folder:</strong> {backup.backupPath || 'Unknown'}
        <div style={{ marginTop: 4 }}>
          Worker: {humanStatus(backup.backupWorker)} · Size: {backup.backupSizeLabel || '0 B'}
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <span style={{ color: statusColor, fontWeight: 900 }}>
          {ready ? 'Ready' : 'Needs Check'}
        </span>
        <div style={{ marginTop: 4, color: backup.warning ? '#fca5a5' : theme.mutedText, fontSize: 13 }}>
          {backup.warning || `${backup.restorePoints || 0} restore points`}
        </div>
      </div>
    </div>
  );
}

function ActionCard({ title, text, theme }) {
  return (
    <section style={{ border: '1px solid ' + theme.cardBorder, background: theme.cardBg, color: theme.cardText, borderRadius: 18, padding: 18 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      <p style={{ margin: '8px 0 0', color: theme.mutedText, lineHeight: 1.6 }}>{text}</p>
    </section>
  );
}
