import React, { memo } from 'react';

/**
 * Shared page UI for dashboard feature pages.
 * This is not a page by itself.
 */

function PageShell({ title, subtitle, theme, children, actions = null }) {
  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <header
        style={{
          background: theme.cardBg,
          border: `1px solid ${theme.cardBorder}`,
          borderRadius: '20px',
          padding: '22px 24px',
          boxShadow: theme.shadow,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'grid', gap: '8px', minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: '26px',
              fontWeight: 900,
              letterSpacing: '-0.02em',
              color: theme.cardText,
            }}
          >
            {title}
          </h1>

          {subtitle ? (
            <p
              style={{
                margin: 0,
                color: theme.mutedText,
                fontSize: '14px',
                lineHeight: 1.6,
                maxWidth: '900px',
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>

        {actions ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            {actions}
          </div>
        ) : null}
      </header>

      <div style={{ display: 'grid', gap: '20px' }}>{children}</div>
    </div>
  );
}

export const SectionCard = memo(function SectionCard({
  theme,
  title,
  subtitle,
  actions = null,
  padding = '18px',
  children,
}) {
  return (
    <section
      style={{
        background: theme.cardBg,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: '20px',
        padding,
        boxShadow: theme.shadow,
        display: 'grid',
        gap: '16px',
      }}
    >
      {(title || subtitle || actions) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'grid', gap: '6px', minWidth: 0 }}>
            {title ? (
              <h2
                style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: 800,
                  color: theme.cardText,
                }}
              >
                {title}
              </h2>
            ) : null}

            {subtitle ? (
              <p
                style={{
                  margin: 0,
                  color: theme.mutedText,
                  fontSize: '14px',
                  lineHeight: 1.5,
                }}
              >
                {subtitle}
              </p>
            ) : null}
          </div>

          {actions ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap',
              }}
            >
              {actions}
            </div>
          ) : null}
        </div>
      )}

      {children}
    </section>
  );
});

export const EmptyState = memo(function EmptyState({ theme, text }) {
  return (
    <div
      style={{
        background: theme.cardBg,
        border: `1px dashed ${theme.cardBorder}`,
        borderRadius: '18px',
        padding: '24px',
        color: theme.mutedText,
        textAlign: 'center',
        boxShadow: theme.shadow,
      }}
    >
      {text}
    </div>
  );
});

export const LoadingPanel = memo(function LoadingPanel({ theme, text = 'Loading...' }) {
  return (
    <div
      style={{
        background: theme.softBg,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: '14px',
        padding: '16px',
        color: theme.mutedText,
      }}
    >
      {text}
    </div>
  );
});

export const Notice = memo(function Notice({ theme, tone = 'info', children }) {
  const tones = {
    info: {
      bg: theme.softBg,
      border: theme.cardBorder,
      text: theme.cardText,
    },
    success: {
      bg: 'rgba(34,197,94,0.12)',
      border: 'rgba(34,197,94,0.26)',
      text: '#16a34a',
    },
    danger: {
      bg: 'rgba(239,68,68,0.12)',
      border: 'rgba(239,68,68,0.28)',
      text: '#ef4444',
    },
    warning: {
      bg: 'rgba(245,158,11,0.12)',
      border: 'rgba(245,158,11,0.26)',
      text: '#d97706',
    },
  };

  const current = tones[tone] || tones.info;

  return (
    <div
      style={{
        background: current.bg,
        border: `1px solid ${current.border}`,
        borderRadius: '14px',
        padding: '14px 16px',
        color: current.text,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
});

export const StatGrid = memo(function StatGrid({ children, min = '180px' }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))`,
        gap: '14px',
      }}
    >
      {children}
    </div>
  );
});

export const SummaryStat = memo(function SummaryStat({
  theme,
  label,
  value,
  accent = null,
}) {
  return (
    <div
      style={{
        background: theme.softBg,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: '14px',
        padding: '16px',
        display: 'grid',
        gap: '8px',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 800,
          color: theme.mutedText,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: accent || theme.cardText,
          fontWeight: 800,
          fontSize: '22px',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  );
});

export const DetailGrid = memo(function DetailGrid({ children, min = '180px' }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))`,
        gap: '12px',
      }}
    >
      {children}
    </div>
  );
});

export const DetailRow = memo(function DetailRow({ theme, label, value }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: '4px',
        padding: '12px 14px',
        borderRadius: '14px',
        background: theme.softBg,
        border: `1px solid ${theme.cardBorder}`,
      }}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 700,
          color: theme.mutedText,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: '14px',
          color: theme.cardText,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
    </div>
  );
});

export const PrimaryButton = memo(function PrimaryButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        border: '1px solid rgba(59,130,246,0.28)',
        background: disabled ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.16)',
        color: '#ffffff',
        padding: '10px 14px',
        borderRadius: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 700,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {children}
    </button>
  );
});

export const SecondaryButton = memo(function SecondaryButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
  theme,
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${theme.cardBorder}`,
        background: theme.softBg,
        color: theme.cardText,
        padding: '10px 14px',
        borderRadius: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 700,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {children}
    </button>
  );
});

export default memo(PageShell);
