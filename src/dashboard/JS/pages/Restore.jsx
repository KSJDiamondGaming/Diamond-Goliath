import React, { useEffect, useMemo, useState } from 'react';
import RestoreConfirmModal from '../shared/RestoreConfirmModal';

import {
  createRestorePageStyles,
  getTheme,
} from '../ui/system';

const API_BASE =
  import.meta.env.VITE_API_BASE || '';

export default function Restore({
  selectedGuild,
  theme: providedTheme,
}) {
  const theme = providedTheme || getTheme(true);
  const styles = createRestorePageStyles(theme);

  const guildId = selectedGuild;

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

  const selectedBackupSummary = useMemo(() => {
    return (
      backups.find(
        (backup) => backup.backupId === selectedBackupId,
      ) || null
    );
  }, [backups, selectedBackupId]);

  async function fetchBackups() {
    if (!guildId) return;

    setLoadingBackups(true);
    setError('');

    try {
      const response = await fetch(
        `${API_BASE}/api/server-restore/${guildId}/backups`,
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(
          data.error || 'Failed to load backups.',
        );
      }

      setBackups(data.backups || []);

      if (
        !selectedBackupId &&
        data.backups?.[0]?.backupId
      ) {
        setSelectedBackupId(
          data.backups[0].backupId,
        );
      }
    } catch (err) {
      setError(err.message);
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
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(
          data.error || 'Failed to load backup.',
        );
      }

      setSelectedBackup(data.backup);
    } catch (err) {
      setError(err.message);
    }
  }

  async function runPreview() {
    if (!guildId || !selectedBackupId) return;

    setLoadingPreview(true);
    setPreview(null);
    setResult(null);
    setError('');

    try {
      const response = await fetch(
        `${API_BASE}/api/server-restore/${guildId}/restore/preview`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
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
        },
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(
          data.error || 'Restore preview failed.',
        );
      }

      setPreview(data.report);
    } catch (err) {
      setError(err.message);
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
      const response = await fetch(
        `${API_BASE}/api/server-restore/${guildId}/restore/execute`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
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
        },
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(
          data.error || 'Restore failed.',
        );
      }

      setResult(data);
      setShowConfirm(false);

      await fetchBackups();
    } catch (err) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  }

  useEffect(() => {
    fetchBackups();
  }, [guildId]);

  useEffect(() => {
    if (!selectedBackupId) return;

    fetchBackupDetails(selectedBackupId);

    setPreview(null);
    setResult(null);
  }, [selectedBackupId]);

    return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <h1 style={styles.heroTitle}>Full Server Restore</h1>
        <p style={styles.heroText}>
          Preview and safely restore roles, categories, channels, permissions,
          and saved log configuration.
        </p>

        <div style={styles.actionRow}>
          <button
            type="button"
            style={styles.button('soft', loadingBackups)}
            onClick={fetchBackups}
            disabled={loadingBackups}
          >
            {loadingBackups ? 'Refreshing...' : 'Refresh Backups'}
          </button>
        </div>
      </section>

      {!guildId ? (
        <section style={styles.emptyPanel}>
          <strong>Select a server.</strong>
          <span>Choose a server before using restore.</span>
        </section>
      ) : null}

      {error ? <div style={styles.dangerBox}>{error}</div> : null}

      {guildId ? (
        <div style={styles.grid}>
          <section style={styles.panel}>
            <div style={styles.panelHeader}>
              <h2 style={styles.panelTitle}>Available Backups</h2>
              <p style={styles.panelText}>
                Choose which server backup you want to inspect.
              </p>
            </div>

            <div style={styles.panelBody}>
              {backups.length === 0 ? (
                <div style={styles.emptyPanel}>
                  <strong>No backups found.</strong>
                  <span>Create a server backup before using restore.</span>
                </div>
              ) : (
                <div style={styles.backupList}>
                  {backups.map((backup) => (
                    <button
                      key={backup.backupId}
                      type="button"
                      style={styles.backupButton(
                        backup.backupId === selectedBackupId,
                      )}
                      onClick={() => setSelectedBackupId(backup.backupId)}
                    >
                      <span style={styles.backupTitle}>
                        {backup.guildName || 'Server Backup'}
                      </span>

                      <span style={styles.backupMeta}>
                        {backup.backupId}
                      </span>

                      <span style={styles.backupMeta}>
                        {backup.roles || 0} roles · {backup.channels || 0}{' '}
                        channels
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section style={styles.panel}>
            <div style={styles.panelHeader}>
              <h2 style={styles.panelTitle}>Selected Backup</h2>
              <p style={styles.panelText}>
                Review the selected backup before running a safe preview.
              </p>
            </div>

            <div style={styles.panelBody}>
              {!selectedBackupSummary ? (
                <div style={styles.emptyPanel}>
                  <strong>Select a backup.</strong>
                  <span>Choose a backup to preview restore impact.</span>
                </div>
              ) : (
                <>
                  <div style={styles.summaryRow}>
                    <span style={styles.summaryLabel}>Backup ID</span>
                    <strong>{selectedBackupSummary.backupId}</strong>
                  </div>

                  <div style={styles.summaryRow}>
                    <span style={styles.summaryLabel}>Created</span>
                    <strong>
                      {selectedBackupSummary.createdAt
                        ? new Date(
                            selectedBackupSummary.createdAt,
                          ).toLocaleString()
                        : 'Unknown'}
                    </strong>
                  </div>

                  <div style={styles.summaryRow}>
                    <span style={styles.summaryLabel}>Roles</span>
                    <strong>{selectedBackupSummary.roles || 0}</strong>
                  </div>

                  <div style={styles.summaryRow}>
                    <span style={styles.summaryLabel}>Channels</span>
                    <strong>{selectedBackupSummary.channels || 0}</strong>
                  </div>

                  <div style={styles.summaryRow}>
                    <span style={styles.summaryLabel}>Logs Included</span>
                    <strong>
                      {selectedBackupSummary.logsIncluded ? 'Yes' : 'No'}
                    </strong>
                  </div>

                  <div style={styles.actionRow}>
                    <button
                      type="button"
                      style={styles.button('primary', loadingPreview)}
                      onClick={runPreview}
                      disabled={loadingPreview}
                    >
                      {loadingPreview
                        ? 'Running Preview...'
                        : 'Run Safe Preview'}
                    </button>

                    <button
                      type="button"
                      style={styles.button('danger', !preview || executing)}
                      onClick={() => setShowConfirm(true)}
                      disabled={!preview || executing}
                    >
                      Restore This Backup
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {selectedBackup?.restoreNotes ? (
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Restore Limits</h2>
            <p style={styles.panelText}>
              Some server data cannot be restored by Discord bots.
            </p>
          </div>

          <div style={styles.panelBody}>
            <div style={styles.statGrid}>
              <div style={styles.successBox}>
                <strong>Can Restore</strong>
                <ul>
                  {selectedBackup.restoreNotes.canRestore?.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div style={styles.dangerBox}>
                <strong>Cannot Restore</strong>
                <ul>
                  {selectedBackup.restoreNotes.cannotRestore?.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {preview ? (
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Safe Restore Preview</h2>
            <p style={styles.panelText}>
              This is a dry-run. Nothing has been changed yet.
            </p>
          </div>

          <div style={styles.panelBody}>
            <div style={styles.statGrid}>
              <div style={styles.statCard}>
                <p style={styles.statLabel}>Roles Planned</p>
                <strong style={styles.statValue}>
                  {preview.roles?.planned || 0}
                </strong>
              </div>

              <div style={styles.statCard}>
                <p style={styles.statLabel}>Duplicate Roles</p>
                <strong style={styles.statValue}>
                  {preview.roles?.skippedDuplicates || 0}
                </strong>
              </div>

              <div style={styles.statCard}>
                <p style={styles.statLabel}>Categories Planned</p>
                <strong style={styles.statValue}>
                  {preview.categories?.planned || 0}
                </strong>
              </div>

              <div style={styles.statCard}>
                <p style={styles.statLabel}>Duplicate Categories</p>
                <strong style={styles.statValue}>
                  {preview.categories?.skippedDuplicates || 0}
                </strong>
              </div>

              <div style={styles.statCard}>
                <p style={styles.statLabel}>Channels Planned</p>
                <strong style={styles.statValue}>
                  {preview.channels?.planned || 0}
                </strong>
              </div>

              <div style={styles.statCard}>
                <p style={styles.statLabel}>Duplicate Channels</p>
                <strong style={styles.statValue}>
                  {preview.channels?.skippedDuplicates || 0}
                </strong>
              </div>

              <div style={styles.statCard}>
                <p style={styles.statLabel}>Config Sections</p>
                <strong style={styles.statValue}>
                  {preview.config?.planned || 0}
                </strong>
              </div>
            </div>

            {preview.warnings?.length ? (
              <div style={styles.warningBox}>
                {preview.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {result ? (
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Restore Complete</h2>
            <p style={styles.panelText}>
              Safety backup created before restore:{' '}
              <strong>{result.safetyBackup?.backupId}</strong>
            </p>
          </div>

          <div style={styles.panelBody}>
            <div style={styles.successBox}>
              Restore finished successfully.
            </div>

            <div style={styles.statGrid}>
              <div style={styles.statCard}>
                <p style={styles.statLabel}>Roles Created</p>
                <strong style={styles.statValue}>
                  {result.report?.roles?.created || 0}
                </strong>
              </div>

              <div style={styles.statCard}>
                <p style={styles.statLabel}>Categories Created</p>
                <strong style={styles.statValue}>
                  {result.report?.categories?.created || 0}
                </strong>
              </div>

              <div style={styles.statCard}>
                <p style={styles.statLabel}>Channels Created</p>
                <strong style={styles.statValue}>
                  {result.report?.channels?.created || 0}
                </strong>
              </div>

              <div style={styles.statCard}>
                <p style={styles.statLabel}>Config Restored</p>
                <strong style={styles.statValue}>
                  {result.report?.config?.restored || 0}
                </strong>
              </div>
            </div>
          </div>
        </section>
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
    </div>
  );
}