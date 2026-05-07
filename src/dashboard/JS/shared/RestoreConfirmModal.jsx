import React, { useState } from 'react';

import {
  createRestoreModalStyles,
  getTheme,
} from '../ui/system';

export default function RestoreConfirmModal({
  theme: providedTheme,
  backup,
  preview,
  executing = false,
  onCancel,
  onConfirm,
}) {
  const theme = providedTheme || getTheme(true);
  const styles = createRestoreModalStyles(theme);

  const [confirmText, setConfirmText] = useState('');
  const [cleanupMode, setCleanupMode] = useState(false);

  const canConfirm = confirmText.trim() === 'RESTORE' && !executing;

  function handleBackdropClick(event) {
    if (event.target !== event.currentTarget || executing) return;
    onCancel?.();
  }

  function handleConfirm() {
    if (!canConfirm) return;

    onConfirm?.({
      cleanupMode,
    });
  }

  return (
    <div
      style={styles.backdrop}
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-confirm-title"
      >
        <div style={styles.header}>
          <div>
            <p
              style={{
                margin: 0,
                color: theme.dangerText,
                fontWeight: 900,
                fontSize: '12px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              Danger Zone
            </p>

            <h2
              id="restore-confirm-title"
              style={styles.title}
            >
              Confirm Server Restore
            </h2>
          </div>

          <button
            type="button"
            style={styles.closeButton}
            onClick={onCancel}
            disabled={executing}
            aria-label="Close restore confirmation"
          >
            ✕
          </button>
        </div>

        <div style={styles.dangerBox}>
          This will modify your live Discord server. Goliath will create a
          safety backup first, then restore from the selected backup.
        </div>

        <section>
          <h3 style={styles.sectionTitle}>Selected Backup</h3>

          <p style={styles.text}>
            Backup ID:{' '}
            <strong>{backup?.backupId || 'Unknown'}</strong>
          </p>

          <p style={styles.text}>
            {backup?.roles || 0} roles · {backup?.channels || 0} channels
          </p>
        </section>

        <section>
          <h3 style={styles.sectionTitle}>Preview Summary</h3>

          <div style={styles.miniGrid}>
            <span>Roles to create</span>
            <strong>{preview?.roles?.planned || 0}</strong>

            <span>Role duplicates skipped</span>
            <strong>{preview?.roles?.skippedDuplicates || 0}</strong>

            <span>Channels to create</span>
            <strong>
              {(preview?.channels?.planned || 0) +
                (preview?.categories?.planned || 0)}
            </strong>

            <span>Channel duplicates skipped</span>
            <strong>
              {(preview?.channels?.skippedDuplicates || 0) +
                (preview?.categories?.skippedDuplicates || 0)}
            </strong>

            <span>Config sections</span>
            <strong>{preview?.config?.planned || 0}</strong>
          </div>
        </section>

        <label style={styles.cleanupToggle}>
          <input
            type="checkbox"
            checked={cleanupMode}
            onChange={(event) => setCleanupMode(event.target.checked)}
            disabled={executing}
          />

          <span>
            <strong>Enable cleanup mode before restore</strong>

            <small style={styles.smallText}>
              Deletes matching existing restored roles/channels first, then
              recreates them from backup. Leave this off unless fixing a broken
              restore.
            </small>
          </span>
        </label>

        <div>
          <label style={styles.label}>
            Type <strong>RESTORE</strong> to confirm
          </label>

          <input
            style={styles.input}
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder="RESTORE"
            disabled={executing}
            autoComplete="off"
          />
        </div>

        <div style={styles.actionRow}>
          <button
            type="button"
            style={styles.button('soft', executing)}
            onClick={onCancel}
            disabled={executing}
          >
            Cancel
          </button>

          <button
            type="button"
            style={styles.button('danger', !canConfirm)}
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {executing ? 'Restoring...' : 'Confirm Restore'}
          </button>
        </div>
      </div>
    </div>
  );
}