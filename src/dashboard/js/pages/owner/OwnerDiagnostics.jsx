import React from 'react';

import OwnerDiagnosticsPanel from './OwnerDiagnosticsPanel.jsx';

export default function OwnerDiagnostics({ theme }) {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{
        border: `1px solid ${theme.cardBorder}`,
        background: 'linear-gradient(135deg, rgba(56,189,248,0.16), rgba(15,23,42,0.10) 48%, rgba(59,130,246,0.12))',
        color: theme.cardText,
        borderRadius: 22,
        padding: 22,
        boxShadow: theme.shadow,
      }}>
        <p style={{ margin: 0, color: '#38bdf8', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Owner Diagnostics
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 34 }}>Dashboard Access Health</h1>
        <p style={{ margin: '8px 0 0', color: theme.mutedText, lineHeight: 1.6 }}>
          Safe checks for owner detection, session health, owner API routing, Discord client status and runtime configuration.
        </p>
      </section>

      <OwnerDiagnosticsPanel theme={theme} />
    </div>
  );
}
