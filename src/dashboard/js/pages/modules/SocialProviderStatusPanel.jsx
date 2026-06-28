import React from 'react';

import {
  formatProviderDate,
  getProviderLiveState,
  getProviderMetadata,
  getProviderStatus,
  getProviderStatusLabel,
  getProviderStatusTone,
} from './socialProviderStatus.js';

function toneStyles(tone, theme) {
  const tones = {
    live: { border: 'rgba(34,197,94,0.45)', background: 'rgba(22,163,74,0.18)', color: '#86efac' },
    ready: { border: 'rgba(59,130,246,0.42)', background: 'rgba(59,130,246,0.16)', color: '#bfdbfe' },
    warning: { border: 'rgba(250,204,21,0.42)', background: 'rgba(250,204,21,0.14)', color: '#fde68a' },
    error: { border: 'rgba(248,113,113,0.42)', background: 'rgba(248,113,113,0.14)', color: '#fca5a5' },
    muted: { border: theme.cardBorder, background: 'rgba(15,23,42,0.35)', color: theme.cardText },
  };

  return tones[tone] || tones.muted;
}

function StatusPill({ theme, label, tone }) {
  const styles = toneStyles(tone, theme);

  return (
    <span style={{ border: `1px solid ${styles.border}`, background: styles.background, color: styles.color, borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 950 }}>
      {label}
    </span>
  );
}

function Detail({ theme, label, value }) {
  return (
    <div>
      <strong style={{ color: theme.cardText }}>{label}:</strong> {value || 'None'}
    </div>
  );
}

export default function SocialProviderStatusPanel({ account, theme }) {
  const provider = getProviderMetadata(account);
  const status = getProviderStatus(account);
  const live = getProviderLiveState(account);
  const tone = getProviderStatusTone(status, live);

  return (
    <section style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.22)', borderRadius: 16, padding: 14, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <StatusPill theme={theme} label={live ? 'Live' : 'Offline'} tone={live ? 'live' : 'muted'} />
        <StatusPill theme={theme} label={getProviderStatusLabel(status)} tone={tone} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 10, color: theme.mutedText, fontSize: 13 }}>
        <Detail theme={theme} label="Provider" value={getProviderStatusLabel(status)} />
        <Detail theme={theme} label="Live Status" value={live ? 'Live' : 'Offline'} />
        <Detail theme={theme} label="Last Checked" value={formatProviderDate(provider.lastCheckedAt || account.lastSeen?.lastCheckedAt)} />
        <Detail theme={theme} label="Last Error" value={provider.lastError || account.lastSeen?.lastProviderError || 'None'} />
        <Detail theme={theme} label="Category" value={provider.lastGameName || 'None'} />
        <Detail theme={theme} label="Last Title" value={provider.lastTitle || 'None'} />
      </div>
    </section>
  );
}
