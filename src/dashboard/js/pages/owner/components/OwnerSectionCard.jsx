import React from 'react';

export default function OwnerSectionCard({
  title,
  description,
  children,
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
      {(title || description) && (
        <div style={{ marginBottom: 16 }}>
          {title ? (
            <h3
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 900,
              }}
            >
              {title}
            </h3>
          ) : null}

          {description ? (
            <p
              style={{
                margin: '6px 0 0',
                color: theme.mutedText,
                fontSize: 13,
              }}
            >
              {description}
            </p>
          ) : null}
        </div>
      )}

      {children}
    </section>
  );
}
