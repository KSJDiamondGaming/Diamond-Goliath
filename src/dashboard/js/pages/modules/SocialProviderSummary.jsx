import React from 'react';

function statusLabel(status) {
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

function statusTone(status) {
  if (status === 'ready') return { border: 'rgba(34,197,94,0.42)', background: 'rgba(22,163,74,0.16)', color: '#86efac' };
  if (status === 'not_configured') return { border: 'rgba(250,204,21,0.42)', background: 'rgba(250,204,21,0.14)', color: '#fde68a' };
  if (status === 'error') return { border: 'rgba(248,113,113,0.42)', background: 'rgba(248,113,113,0.14)', color: '#fca5a5' };
  return { border: 'rgba(148,163,184,0.28)', background: 'rgba(15,23,42,0.35)', color: '#cbd5e1' };
}

function ProviderCard({ provider, theme }) {
  const tone = statusTone(provider.status);
  const required = Array.isArray(provider.requiredEnv) && provider.requiredEnv.length ? provider.requiredEnv.join(', ') : 'None';
  const capabilities = Array.isArray(provider.supportedAlertTypes) && provider.supportedAlertTypes.length ? provider.supportedAlertTypes.join(', ') : 'None';

  return (
    <article style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.28)', borderRadius: 16, padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ color: theme.cardText }}>{provider.label}</strong>
        <span style={{ border: `1px solid ${tone.border}`, background: tone.background, color: tone.color, borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 950 }}>{statusLabel(provider.status)}</span>
      </div>
      <div style={{ color: theme.mutedText, fontSize: 13 }}><strong style={{ color: theme.cardText }}>Capabilities:</strong> {capabilities}</div>
      <div style={{ color: theme.mutedText, fontSize: 13 }}><strong style={{ color: theme.cardText }}>Global env:</strong> {required}</div>
    </article>
  );
}

export default function SocialProviderSummary({ providers = [], theme }) {
  return (
    <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 22, boxShadow: theme.shadow, padding: 22, display: 'grid', gap: 16 }}>
      <div>
        <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Global Provider Status</div>
        <p style={{ margin: '6px 0 0', color: theme.mutedText }}>Clients only add usernames, channel IDs, or profile URLs. Platform credentials are configured once by the Goliath owner.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
        {providers.length ? providers.map((provider) => <ProviderCard key={provider.id} provider={provider} theme={theme} />) : <div style={{ color: theme.mutedText }}>Provider status has not loaded yet.</div>}
      </div>
    </section>
  );
}
