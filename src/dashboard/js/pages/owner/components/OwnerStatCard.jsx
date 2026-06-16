import React from 'react';

export default function OwnerStatCard({ title, value, tone = '#93c5fd', theme }) {
  return (
    <div
      style={{
        border: '1px solid ' + theme.cardBorder,
        background: theme.cardBg,
        color: theme.cardText,
        borderRadius: 18,
        padding: 18,
        boxShadow: theme.shadow,
      }}
    >
      <div
        style={{
          color: theme.mutedText,
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        {title}
      </div>

      <div
        style={{
          color: tone,
          fontSize: 30,
          fontWeight: 950,
          marginTop: 8,
        }}
      >
        {value}
      </div>
    </div>
  );
}
