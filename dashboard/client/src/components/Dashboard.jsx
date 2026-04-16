import { memo } from 'react';

export default function DashboardPage({ title, subtitle, theme, children }) {
  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div
        style={{
          background: theme.cardBg,
          border: `1px solid ${theme.cardBorder}`,
          borderRadius: '20px',
          padding: '22px 24px',
          boxShadow: theme.shadow,
          display: 'grid',
          gap: '8px',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '26px',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            color: theme.cardText,
          }}
        >
          {title}
        </h2>

        {subtitle ? (
          <p
            style={{
              margin: 0,
              color: theme.mutedText,
              fontSize: '14px',
              lineHeight: 1.6,
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>

      <div style={{ display: 'grid', gap: '20px' }}>{children}</div>
    </div>
  );
}

export function StatGrid({ children }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '14px',
      }}
    >
      {children}
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  theme,
  children,
  padding = '18px',
  actions = null,
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
          }}
        >
          <div style={{ display: 'grid', gap: '6px' }}>
            {title ? (
              <h3
                style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: 800,
                  color: theme.cardText,
                }}
              >
                {title}
              </h3>
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

          {actions ? <div>{actions}</div> : null}
        </div>
      )}

      {children}
    </section>
  );
}

export function EmptyState({ theme, text = 'Nothing to show yet.' }) {
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
}

export const PrimaryButton = memo(function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled = false,
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        border: '1px solid rgba(59,130,246,0.32)',
        background: disabled ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.18)',
        color: '#2563eb',
        borderRadius: '12px',
        padding: '10px 14px',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
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
  type = 'button',
  disabled = false,
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        border: '1px solid #d1d5db',
        background: 'transparent',
        color: '#6b7280',
        borderRadius: '12px',
        padding: '10px 14px',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {children}
    </button>
  );
});

export function DetailGrid({ children }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
      }}
    >
      {children}
    </div>
  );
}

export function DetailRow({ label, value, theme }) {
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
}