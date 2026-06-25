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
  const checkedAt = environment.checkedAt || new Date().toISOString();
  const warning = environment.error || (!backupPath.exists ? 'Backup folder missing' : status === 'offline' ? 'Runtime offline' : '');

  return {
    id: name,
    environment: name,
    status,
    backupWorker,
    backupPath: backupPath.path || '',
    backupFolderReady: Boolean(backupPath.exists),
    restorePoints: Number(environment.backups?.restorePoints || 0),
    backupSizeBytes: Number(environment.backups?.sizeBytes || 0),
    backupSizeLabel: formatBytes(environment.backups?.sizeBytes || 0),
    lastBackupAt: environment.backups?.lastBackupAt || null,
    checkedAt,
    warning,
    port: environment.port || environment.sourcePort || null,
  };
}

function buildSummary(environments = []) {
  const warnings = environments.filter((environment) => environment.warning);
  const ready = environments.filter((environment) => environment.backupFolderReady && environment.status !== 'offline');
  const totalSizeBytes = environments.reduce((sum, environment) => sum + Number(environment.backupSizeBytes || 0), 0);
  const restorePoints = environments.reduce((sum, environment) => sum + Number(environment.restorePoints || 0), 0);
  const lastBackupAt = environments
    .map((environment) => environment.lastBackupAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

  return {
    environments: environments.length,
    ready: ready.length,
    warnings: warnings.length,
    failed: environments.filter((environment) => environment.status === 'offline' || !environment.backupFolderReady).length,
    restorePoints,
    totalSizeBytes,
    totalSizeLabel: formatBytes(totalSizeBytes),
    lastBackupAt,
    health: warnings.length ? 'attention' : 'healthy',
  };
}

function normaliseRuntimePayload(payload = {}) {
  const runtime = payload.runtime || {};
  const environments = Array.isArray(payload.environments)
    ? payload.environments
    : Array.isArray(runtime.environments)
      ? runtime.environments
      : [];

  const currentEnvironment = runtime?.environment || runtime?.mode ? [runtime] : [];
  const merged = [...environments, ...currentEnvironment]
    .map(normaliseEnvironment)
    .filter((environment, index, list) => (
      list.findIndex((item) => item.environment === environment.environment) === index
    ))
    .sort((a, b) => {
      const aIndex = ENVIRONMENT_ORDER.indexOf(a.environment);
      const bIndex = ENVIRONMENT_ORDER.indexOf(b.environment);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });

  return {
    environments: merged,
    summary: buildSummary(merged),
    updatedAt: payload.updatedAt || runtime.checkedAt || new Date().toISOString(),
  };
}

export default function useOwnerBackups() {
  const [state, setState] = useState({
    environments: [],
    summary: buildSummary([]),
    updatedAt: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const payload = await api.getPlatformRuntime();
      setState(normaliseRuntimePayload(payload));
    } catch (err) {
      setState({ environments: [], summary: buildSummary([]), updatedAt: null });
      setError(err.message || 'Failed to load backup data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError('');
        const payload = await api.getPlatformRuntime();
        if (!cancelled) setState(normaliseRuntimePayload(payload));
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
  }, []);

  const backups = useMemo(() => state.environments, [state.environments]);

  return {
    backups,
    environments: state.environments,
    summary: state.summary,
    updatedAt: state.updatedAt,
    loading,
    error,
    refresh,
  };
}
