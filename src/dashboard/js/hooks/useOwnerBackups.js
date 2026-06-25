import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../services/apiClient.js';

const ENVIRONMENT_ORDER = ['DEV', 'BETA', 'PRODUCTION'];

function formatBytes(bytes = 0) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / Math.pow(1024, index);

  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

function normaliseEnvironment(environment = {}) {
  const name = String(environment.environment || environment.mode || 'UNKNOWN').toUpperCase();
  const backupPath = environment.runtimePaths?.backups || {};
  const status = String(environment.status || 'offline').toLowerCase();
  const backupWorker = environment.services?.backupWorker || 'unknown';
  const restoreQueue = environment.restoreQueue || { pending: [], history: [], audit: [], counts: {} };
  const backups = environment.backups || {};
  const checkedAt = environment.checkedAt || new Date().toISOString();
  const warnings = Array.isArray(environment.warnings) ? environment.warnings : environment.warning ? [environment.warning] : [];
  const warning = warnings[0] || (!backupPath.exists ? 'Backup folder missing' : status === 'offline' ? 'Runtime offline' : '');

  return {
    id: name,
    environment: name,
    status,
    backupWorker,
    backupPath: backups.path || backupPath.path || '',
    backupFolderReady: Boolean(backupPath.exists),
    restorePoints: Number(backups.restorePoints || 0),
    backupSizeBytes: Number(backups.sizeBytes || 0),
    backupSizeLabel: backups.sizeLabel || formatBytes(backups.sizeBytes || 0),
    lastBackupAt: backups.lastBackupAt || null,
    failedIntegrity: Number(backups.failedIntegrity || 0),
    recentBackups: Array.isArray(backups.recent) ? backups.recent : [],
    restoreQueue: {
      path: restoreQueue.path || '',
      exists: Boolean(restoreQueue.exists),
      pending: Array.isArray(restoreQueue.pending) ? restoreQueue.pending : [],
      history: Array.isArray(restoreQueue.history) ? restoreQueue.history : [],
      audit: Array.isArray(restoreQueue.audit) ? restoreQueue.audit : [],
      counts: {
        pending: Number(restoreQueue.counts?.pending || 0),
        history: Number(restoreQueue.counts?.history || 0),
        audit: Number(restoreQueue.counts?.audit || 0),
        failed: Number(restoreQueue.counts?.failed || 0),
      },
    },
    checkedAt,
    warnings,
    warning,
    port: environment.port || environment.sourcePort || null,
  };
}

function buildSummary(environments = []) {
  const warnings = environments.filter((environment) => environment.warning || environment.warnings?.length);
  const ready = environments.filter((environment) => environment.backupFolderReady && environment.status !== 'offline');
  const totalSizeBytes = environments.reduce((sum, environment) => sum + Number(environment.backupSizeBytes || 0), 0);
  const restorePoints = environments.reduce((sum, environment) => sum + Number(environment.restorePoints || 0), 0);
  const restoreQueuePending = environments.reduce((sum, environment) => sum + Number(environment.restoreQueue?.counts?.pending || 0), 0);
  const failed = environments.reduce((sum, environment) => sum + Number(environment.failedIntegrity || 0) + Number(environment.restoreQueue?.counts?.failed || 0), 0);
  const lastBackupAt = environments
    .map((environment) => environment.lastBackupAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

  return {
    environments: environments.length,
    ready: ready.length,
    warnings: warnings.length,
    failed,
    restorePoints,
    restoreQueuePending,
    totalSizeBytes,
    totalSizeLabel: formatBytes(totalSizeBytes),
    lastBackupAt,
    health: warnings.length || failed ? 'attention' : 'healthy',
  };
}

function normaliseBackupPayload(payload = {}) {
  const environments = Array.isArray(payload.environments) ? payload.environments : payload.environment ? [payload.environment] : [];
  const merged = environments
    .map(normaliseEnvironment)
    .filter((environment, index, list) => list.findIndex((item) => item.environment === environment.environment) === index)
    .sort((a, b) => {
      const aIndex = ENVIRONMENT_ORDER.indexOf(a.environment);
      const bIndex = ENVIRONMENT_ORDER.indexOf(b.environment);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });

  return {
    environments: merged,
    summary: payload.summary ? { ...buildSummary(merged), ...payload.summary, totalSizeLabel: payload.summary.totalSizeLabel || formatBytes(payload.summary.totalSizeBytes || 0) } : buildSummary(merged),
    updatedAt: payload.updatedAt || new Date().toISOString(),
  };
}

export default function useOwnerBackups(defaultEnvironment = 'all') {
  const [environmentFilter, setEnvironmentFilter] = useState(defaultEnvironment);
  const [state, setState] = useState({
    environments: [],
    summary: buildSummary([]),
    updatedAt: null,
  });
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const refresh = useCallback(async (nextEnvironment = environmentFilter) => {
    try {
      setLoading(true);
      setError('');

      const payload = await api.getOwnerBackups(nextEnvironment);
      setState(normaliseBackupPayload(payload));
    } catch (err) {
      setState({ environments: [], summary: buildSummary([]), updatedAt: null });
      setError(err.message || 'Failed to load backup data.');
    } finally {
      setLoading(false);
    }
  }, [environmentFilter]);

  const changeEnvironment = useCallback((nextEnvironment) => {
    setEnvironmentFilter(nextEnvironment);
    refresh(nextEnvironment);
  }, [refresh]);

  const createManualBackup = useCallback(async ({ environment, guildId, reason }) => {
    try {
      setActionLoading(true);
      setActionMessage('');
      setError('');

      const payload = await api.createOwnerManualBackup({ environment, guildId, reason });
      const backupId = payload.backup?.backupId || 'created';
      setActionMessage(`Manual backup ${backupId} completed for ${payload.backup?.guildName || guildId}.`);
      await refresh(environmentFilter);
      return payload;
    } catch (err) {
      const message = err.message || 'Manual backup failed.';
      setActionMessage('');
      setError(message);
      throw err;
    } finally {
      setActionLoading(false);
    }
  }, [environmentFilter, refresh]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError('');
        const payload = await api.getOwnerBackups(environmentFilter);
        if (!cancelled) setState(normaliseBackupPayload(payload));
      } catch (err) {
        if (!cancelled) {
          setState({ environments: [], summary: buildSummary([]), updatedAt: null });
          setError(err.message || 'Failed to load backup data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [environmentFilter]);

  const backups = useMemo(() => state.environments, [state.environments]);
  const recentBackups = useMemo(() => backups.flatMap((environment) => environment.recentBackups.map((backup) => ({ ...backup, environment: backup.environment || environment.environment }))).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()), [backups]);
  const restoreQueue = useMemo(() => backups.flatMap((environment) => environment.restoreQueue.pending.map((request) => ({ ...request, environment: environment.environment }))), [backups]);

  return {
    backups,
    environments: state.environments,
    recentBackups,
    restoreQueue,
    summary: state.summary,
    updatedAt: state.updatedAt,
    environmentFilter,
    loading,
    actionLoading,
    error,
    actionMessage,
    refresh,
    changeEnvironment,
    createManualBackup,
  };
}
