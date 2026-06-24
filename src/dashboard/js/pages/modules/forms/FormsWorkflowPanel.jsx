import React from 'react';

import { FormsWorkflowBreakdown, FormsWorkflowCards } from './FormsWorkflowCards.jsx';

export default function FormsWorkflowPanel({ theme, overview = {} }) {
  const cardBorder = theme?.cardBorder || 'rgba(148,163,184,0.22)';
  const cardBg = theme?.cardBg || 'rgba(15,23,42,0.40)';
  const cardText = theme?.cardText || '#e5e7eb';
  const mutedText = theme?.mutedText || '#94a3b8';

  return (
    <section style={{
      border: `1px solid ${cardBorder}`,
      background: cardBg,
      color: cardText,
      borderRadius: 22,
      padding: 20,
      display: 'grid',
      gap: 16,
      boxShadow: theme?.shadow || 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ color: mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Forms Workflow
          </span>
          <h3 style={{ margin: 0, color: cardText }}>Forms → Tickets Health</h3>
          <p style={{ margin: 0, color: mutedText, lineHeight: 1.55 }}>
            Review submission workload, ticket linking, ticket channel health and per-form workflow activity.
          </p>
        </div>

        {overview?.missingTicketChannelCount ? (
          <span style={{
            border: '1px solid rgba(239,68,68,0.42)',
            color: '#fca5a5',
            borderRadius: 999,
            padding: '7px 10px',
            fontSize: 12,
            fontWeight: 950,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Recovery Needed
          </span>
        ) : (
          <span style={{
            border: '1px solid rgba(34,197,94,0.38)',
            color: '#86efac',
            borderRadius: 999,
            padding: '7px 10px',
            fontSize: 12,
            fontWeight: 950,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Healthy
          </span>
        )}
      </div>

      <FormsWorkflowCards theme={theme} overview={overview} />
      <FormsWorkflowBreakdown theme={theme} overview={overview} />
    </section>
  );
}
