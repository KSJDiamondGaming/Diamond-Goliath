import React from 'react';

export default function TemplateSyncPanel({ theme }) {
  return (
    <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 22, padding: 20, boxShadow: theme.shadow }}>
      <h3 style={{ margin: 0 }}>Embed Studio Template Sync</h3>
      <p style={{ color: theme.mutedText }}>Welcome, leave, and direct welcome messages can now use shared Embed Studio template bindings.</p>
    </section>
  );
}
