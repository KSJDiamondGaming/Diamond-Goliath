import React from 'react';

export default function Translation({ theme }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, borderRadius: 22, padding: 24 }}>
        <p style={{ margin: '0 0 8px', color: '#93c5fd', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Goliath Translation Hub</p>
        <h1 style={{ margin: 0 }}>Translation</h1>
        <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6 }}>Overview, Settings, Analytics and Discord Resources for translation channels, language preferences and provider-ready controls.</p>
      </section>
    </div>
  );
}
