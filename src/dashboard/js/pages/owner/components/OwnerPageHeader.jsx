import React from 'react';

export default function OwnerPageHeader({
  eyebrow,
  title,
  description,
  tone = '#93c5fd',
  theme,
}) {
  return (
    <section
      style={{
        border: '1px solid ' + theme.cardBorder,
        background: theme.cardBg,
        color: theme.cardText,
        borderRadius: 20,
        padding: 18,
        boxShadow: theme.shadow,
      }}
    >
      <p
        style={{
          margin: 0,
          color: tone,
          fontWeight: 900,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {eyebrow}
      </p>

      <h1 style={{ margin: '8px 0 0', fontSize: 34 }}>
        {title}
      </h1>

      {description ? (
        <p style={{ marginTop: 8, color: theme.mutedText }}>
          {description}
        </p>
      ) : null}
    </section>
  );
}
