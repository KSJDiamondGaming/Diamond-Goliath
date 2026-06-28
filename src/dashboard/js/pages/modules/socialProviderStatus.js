export function formatProviderDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export function getProviderMetadata(account = {}) {
  return account.metadata?.provider || {};
}

export function getProviderStatus(account = {}) {
  const provider = getProviderMetadata(account);
  return provider.providerStatus || account.lastSeen?.lastProviderStatus || 'unknown';
}

export function getProviderLiveState(account = {}) {
  const provider = getProviderMetadata(account);
  return provider.isLive === true || account.lastSeen?.lastLiveState === 'live';
}

export function getProviderStatusLabel(status) {
  const value = String(status || 'unknown');
  const labels = {
    ready: 'Ready',
    not_configured: 'Not Configured',
    not_implemented: 'Not Implemented',
    error: 'Error',
    unknown: 'Unknown',
  };

  return labels[value] || value.replace(/_/g, ' ');
}

export function getProviderStatusTone(status, isLive = false) {
  if (isLive) return 'live';
  if (status === 'ready') return 'ready';
  if (status === 'not_configured') return 'warning';
  if (status === 'error') return 'error';
  return 'muted';
}
