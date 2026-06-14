import React, { useEffect, useMemo, useState } from 'react';

import RestoreConfirmModal from '../shared/RestoreConfirmModal';
import { getTheme } from '../ui/system';

import PageShell, {
  SectionCard,
  StatGrid,
  SummaryStat,
  EmptyState,
  LoadingPanel,
  Notice,
  PrimaryButton,
  SecondaryButton,
} from '../shared/PageShell';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

function formatDate(value) {
  if (!value) return 'Unknown';

  try {
    return new Date(value).toLocaleString();
  } catch {
    return 'Unknown';
  }
}

function SafeValue({ theme, label, value }) {
  return (
    <div
      style={{
        background: theme.softBg,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: 14,
        padding: '13px 14px',
        display: 'grid',
        gap: 6,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          color: theme.mutedText,
          fontSize: 11,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </span>

      <strong
        style={{
          color: theme.cardText,
          fontSize: 14,
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </strong>
    </div>
  );
}

export default function Restore({
  selectedGuild,
  selectedGuildId,
  theme: providedTheme,
}) {
  const theme = providedTheme || getTheme(true);
  const guildId = selectedGuildId || selectedGuild || '';

  const [backups, setBackups] = useState([]);
  const [selectedBackupId, setSelectedBackupId] = useState('');
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  const [loadingBackups, setLoadingBackups] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [executing, setExecuting] = useState(false);

  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const selectedBackupSummary = useMemo(
    () => backups.find((backup) => backup.backupId === selectedBackupId) || null,
    [backups, selectedBackupId],
  );

  const backupCount = backups.length;
  const latestBackup = backups[0] || null;

  async function readJsonResponse(response, fallbackMessage) {
    const text = await response.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(fallbackMessage || 'Server returned an invalid response.');
    }

    if (!response.ok || data.success === false) {
      throw new Error(data.error || fallbackMessage || 'Request failed.');
    }

    return data;
  }

  async function fetchBackups() {
    if (!guildId) return;

    setLoadingBackups(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/server-restore/${guildId}/backups`, {
        credentials: 'include',
      });

      const data = await readJsonResponse(response, 'Failed to load backups.');
      const nextBackups = Array.isArray(data.backups) ? data.backups : [];

      setBackups(nextBackups);

      if (!selectedBackupId && nextBackups[0]?.backupId) {
        setSelectedBackupId(nextBackups[0].backupId);
      }
    } catch (err) {
      setError(err.message || 'Failed to load backups.');
    } finally {
      setLoadingBackups(false);
    }
  }

  async function fetchBackupDetails(backupId) {
    if (!guildId || !backupId) return;

    setSelectedBackup(null);
    setError('');

    try {
      const response = await fetch(
        `${API_BASE}/api/server-restore/${guildId}/backups/${backupId}`,
        { credentials: 'include' },
      );

      const data = await readJsonResponse(response, 'Failed to load backup.');
      setSelectedBackup(data.backup || null);
    } catch (err) {
      setError(err.message || 'Failed to load backup.');
    }
  }

  async function runPreview() {
    if (!guildId || !selectedBackupId) return;

    setLoadingPreview(true);
    setPreview(null);
    setResult(null);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/server-restore/${guildId}/restore/preview`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backupId: selectedBackupId,
          options: {
            restoreRoles: true,
            restoreCategories: true,
            restoreChannels: true,
            restoreConfig: true,
            restoreRolePositions: true,
          },
        }),
      });

      const data = await readJsonResponse(response, 'Restore preview failed.');
      setPreview(data.report || null);
    } catch (err) {
      setError(err.message || 'Restore preview failed.');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function executeRestore({ cleanupMode }) {
    if (!guildId || !selectedBackupId) return;

    setExecuting(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/server-restore/${guildId}/restore/execute`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backupId: selectedBackupId,
          confirmText: 'RESTORE',
          cleanupMode,
          options: {
            restoreRoles: true,
            restoreCategories: true,
            restoreChannels: true,
            restoreConfig: true,
            restoreRolePositions: true,
          },
        }),
      });

      const data = await readJsonResponse(response, 'Restore failed.');

      setResult(data);
      setShowConfirm(false);

      await fetchBackups();
    } catch (err) {
      setError(err.message || 'Restore failed.');
    } finally {
      setExecuting(false);
    }
  }

  useEffect(() => {
    fetchBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  useEffect(() => {
    if (!selectedBackupId) return;

    fetchBackupDetails(selectedBackupId);
    setPreview(null);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBackupId]);

  return (
    <PageShell
      title="Full Server Restore"
      subtitle="Preview and safely restore roles, categories, channels, permissions, and saved configuration."
      theme={theme}
      guild={{
        id: guildId,
        name: 'Full Server Restore',
      }}
      actions={
        <SecondaryButton
          theme={theme}
          onClick={fetchBackups}
          disabled={loadingBackups || !guildId}
        >
          {loadingBackups ? 'Refreshing...' : 'Refresh Backups'}
        </SecondaryButton>
      }
    >
      {!guildId ? (
        <EmptyState theme={theme} text="Select a server before using restore." />
      ) : null}

      {error ? (
        <Notice theme={theme} tone="danger">
          {error}
        </Notice>
      ) : null}

      {guildId ? (
        <>
          <StatGrid min="min(190px, 100%)">
            <SummaryStat
              theme={theme}
              label="Backups"
              value={backupCount}
              description="Available restore points"
            />

            <SummaryStat
              theme={theme}
              label="Selected"
              value={selectedBackupSummary ? 'Ready' : 'None'}
              accent={selectedBackupSummary ? theme.success : theme.warning}
              description="Current backup selection"
            />

            <SummaryStat
              theme={theme}
              label="Preview"
              value={preview ? 'Ready' : 'Not Run'}
              accent={preview ? theme.success : theme.warning}
              description="Safe dry-run status"
            />

            <SummaryStat
              theme={theme}
              label="Latest Backup"
              value={latestBackup?.createdAt ? 'Found' : 'None'}
              description={
                latestBackup?.createdAt
                  ? formatDate(latestBackup.createdAt)
                  : 'No backups loaded'
              }
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
              title="Available Backups"
              subtitle="Choose which server backup you want to inspect."
            >
              {loadingBackups ? (
                <LoadingPanel theme={theme} text="Loading backups..." />
              ) : backups.length === 0 ? (
                <EmptyState
                  theme={theme}
                  text="No backups found. Create a server backup before using restore."
                />
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gap: 12,
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: 0,
                  }}
                >
                  {backups.map((backup) => {
                    const active = backup.backupId === selectedBackupId;

                    return (
                      <button
                        key={backup.backupId}
                        type="button"
                        onClick={() => setSelectedBackupId(backup.backupId)}
                        style={{
                          width: '100%',
                          maxWidth: '100%',
                          minWidth: 0,
                          overflow: 'hidden',
                          border: `1px solid ${
                            active ? theme.primaryBorder : theme.cardBorder
                          }`,
                          background: active ? theme.primarySoft : theme.softBg,
                          color: theme.cardText,
                          borderRadius: 16,
                          padding: 'clamp(14px, 3vw, 16px)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'grid',
                          gap: 7,
                          boxShadow: active ? theme.shadow : 'none',
                        }}
                      >
                        <strong
                          style={{
                            fontSize: 15,
                            overflowWrap: 'break-word',
                          }}
                        >
                          {backup.guildName || 'Server Backup'}
                        </strong>

                        <span
                          style={{
                            color: theme.mutedText,
                            fontSize: 12,
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                          }}
                        >
                          {backup.backupId}
                        </span>

                        <span
                          style={{
                            color: theme.mutedText,
                            fontSize: 13,
                            fontWeight: 700,
                            overflowWrap: 'break-word',
                          }}
                        >
                          {backup.roles || 0} roles · {backup.channels || 0} channels
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard
              theme={theme}
              title="Selected Backup"
              subtitle="Review the selected backup before running a safe preview."
            >
              {!selectedBackupSummary ? (
                <EmptyState theme={theme} text="Choose a backup to preview restore impact." />
              ) : (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
                      gap: 12,
                      width: '100%',
                      maxWidth: '100%',
                      minWidth: 0,
                    }}
                  >
                    <SafeValue theme={theme} label="Backup ID" value={selectedBackupSummary.backupId} />
                    <SafeValue theme={theme} label="Created" value={formatDate(selectedBackupSummary.createdAt)} />
                    <SafeValue theme={theme} label="Roles" value={selectedBackupSummary.roles || 0} />
                    <SafeValue theme={theme} label="Channels" value={selectedBackupSummary.channels || 0} />
                    <SafeValue theme={theme} label="Logs Included" value={selectedBackupSummary.logsIncluded ? 'Yes' : 'No'} />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 12,
                      flexWrap: 'wrap',
                      width: '100%',
                    }}
                  >
                    <PrimaryButton onClick={runPreview} disabled={loadingPreview}>
                      {loadingPreview ? 'Running Preview...' : 'Run Safe Preview'}
                    </PrimaryButton>

                    <button
                      type="button"
                      onClick={() => setShowConfirm(true)}
                      disabled={!preview || executing}
                      style={{
                        border: `1px solid ${theme.dangerBorder}`,
                        background:
                          !preview || executing
                            ? 'rgba(239,68,68,0.08)'
                            : theme.dangerSoft,
                        color: theme.dangerText,
                        padding: '10px 14px',
                        borderRadius: 12,
                        cursor: !preview || executing ? 'not-allowed' : 'pointer',
                        fontWeight: 900,
                        opacity: !preview || executing ? 0.55 : 1,
                      }}
                    >
                      Restore This Backup
                    </button>
                  </div>
                </>
              )}
            </SectionCard>
          </div>

          {selectedBackup?.restoreNotes ? (
            <SectionCard
              theme={theme}
              title="Restore Limits"
              subtitle="Some server data cannot be restored by Discord bots."
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                  gap: 16,
                  width: '100%',
                  maxWidth: '100%',
                  minWidth: 0,
                }}
              >
                <Notice theme={theme} tone="success">
                  <strong>Can Restore</strong>
                  <ul>
                    {selectedBackup.restoreNotes.canRestore?.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </Notice>

                <Notice theme={theme} tone="danger">
                  <strong>Cannot Restore</strong>
                  <ul>
                    {selectedBackup.restoreNotes.cannotRestore?.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </Notice>
              </div>
            </SectionCard>
          ) : null}

          {preview ? (
            <SectionCard
              theme={theme}
              title="Safe Restore Preview"
              subtitle="This is a dry-run. Nothing has been changed yet."
            >
              <StatGrid min="min(180px, 100%)">
                <SummaryStat theme={theme} label="Roles Planned" value={preview.roles?.planned || 0} />
                <SummaryStat theme={theme} label="Duplicate Roles" value={preview.roles?.skippedDuplicates || 0} />
                <SummaryStat theme={theme} label="Categories Planned" value={preview.categories?.planned || 0} />
                <SummaryStat theme={theme} label="Duplicate Categories" value={preview.categories?.skippedDuplicates || 0} />
                <SummaryStat theme={theme} label="Channels Planned" value={preview.channels?.planned || 0} />
                <SummaryStat theme={theme} label="Duplicate Channels" value={preview.channels?.skippedDuplicates || 0} />
                <SummaryStat theme={theme} label="Config Sections" value={preview.config?.planned || 0} />
              </StatGrid>

              {preview.warnings?.length ? (
                <Notice theme={theme} tone="warning">
                  {preview.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </Notice>
              ) : null}
            </SectionCard>
          ) : null}

          {result ? (
            <SectionCard
              theme={theme}
              title="Restore Complete"
              subtitle={`Safety backup created before restore: ${
                result.safetyBackup?.backupId || 'Unknown'
              }`}
            >
              <Notice theme={theme} tone="success">
                Restore finished successfully.
              </Notice>

              <StatGrid min="min(180px, 100%)">
                <SummaryStat theme={theme} label="Roles Created" value={result.report?.roles?.created || 0} />
                <SummaryStat theme={theme} label="Categories Created" value={result.report?.categories?.created || 0} />
                <SummaryStat theme={theme} label="Channels Created" value={result.report?.channels?.created || 0} />
                <SummaryStat theme={theme} label="Config Restored" value={result.report?.config?.restored || 0} />
              </StatGrid>
            </SectionCard>
          ) : null}
        </>
      ) : null}

      {showConfirm ? (
        <RestoreConfirmModal
          theme={theme}
          backup={selectedBackupSummary}
          preview={preview}
          executing={executing}
          onCancel={() => setShowConfirm(false)}
          onConfirm={executeRestore}
        />
      ) : null}
    </PageShell>
  );
}