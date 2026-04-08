import { memo, useMemo } from 'react';

const PAGE_HEADER_MIN_HEIGHT = '174px';

export default function DashboardPage({
  title,
  subtitle,
  theme,
  actions = null,
  children,
  guildName = '',
  eyebrow = '',
  useGuildNameAsTitle = true,
}) {
  const resolvedTitle =
    useGuildNameAsTitle && guildName?.trim() ? guildName.trim() : title;

  const resolvedEyebrow = eyebrow?.trim();

  const shellStyle = useMemo(
    () => ({
      display: 'grid',
      gap: '24px',
      width: '100%',
    }),
    []
  );

  const heroStyle = useMemo(
    () => ({
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '24px',
      padding: '24px',
      minHeight: PAGE_HEADER_MIN_HEIGHT,
      boxShadow: theme.shadow,
      display: 'grid',
      gap: '16px',
      alignContent: 'start',
    }),
    [theme.cardBg, theme.cardBorder, theme.shadow]
  );

  const heroTopStyle = useMemo(
    () => ({
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: '16px',
      flexWrap: 'wrap',
    }),
    []
  );

  const eyebrowStyle = useMemo(
    () => ({
      fontSize: '11px',
      lineHeight: 1,
      fontWeight: 800,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: theme.mutedText,
    }),
    [theme.mutedText]
  );

  const titleStyle = useMemo(
    () => ({
      color: theme.cardText,
      fontSize: 'clamp(28px, 3.3vw, 38px)',
      lineHeight: 1.04,
      fontWeight: 900,
      letterSpacing: '-0.03em',
      marginTop: resolvedEyebrow ? '10px' : 0,
      wordBreak: 'break-word',
    }),
    [theme.cardText, resolvedEyebrow]
  );

  const subtitleStyle = useMemo(
    () => ({
      maxWidth: '780px',
      color: theme.mutedText,
      fontSize: '15px',
      lineHeight: 1.7,
    }),
    [theme.mutedText]
  );

  const actionWrapStyle = useMemo(
    () => ({
      display: 'flex',
      gap: '10px',
      flexWrap: 'wrap',
      alignItems: 'center',
    }),
    []
  );

  const contentStyle = useMemo(
    () => ({
      display: 'grid',
      gap: '24px',
      minWidth: 0,
    }),
    []
  );

  return (
    <div style={shellStyle}>
      <div style={heroStyle}>
        <div style={heroTopStyle}>
          <div style={{ minWidth: 0 }}>
            {resolvedEyebrow ? <div style={eyebrowStyle}>{resolvedEyebrow}</div> : null}
            <h1 style={titleStyle}>{resolvedTitle}</h1>
          </div>

          {actions ? <div style={actionWrapStyle}>{actions}</div> : null}
        </div>

        {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
      </div>

      <div style={contentStyle}>{children}</div>
    </div>
  );
}

export const SectionCard = memo(function SectionCard({
  theme,
  title,
  subtitle,
  children,
  actions = null,
  padding = '24px',
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
        alignContent: 'start',
        transition: 'border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease',
      }}
    >
      {title || subtitle || actions ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '14px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title ? (
              <h2
                style={{
                  color: theme.cardText,
                  fontSize: '20px',
                  lineHeight: 1.15,
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                }}
              >
                {title}
              </h2>
            ) : null}

            {subtitle ? (
              <p
                style={{
                  marginTop: title ? '8px' : 0,
                  color: theme.mutedText,
                  fontSize: '14px',
                  lineHeight: 1.65,
                  maxWidth: '760px',
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
                gap: '10px',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}

      {children}
    </section>
  );
});

export const StatGrid = memo(function StatGrid({ children }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
      }}
    >
      {children}
    </div>
  );
});

export const DetailGrid = memo(function DetailGrid({ children, min = '220px' }) {
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

export const SplitPanel = memo(function SplitPanel({
  left,
  right,
  rightMin = '320px',
}) {
  return (
    <div
      className="dashboard-split-fallback"
      style={{
        display: 'grid',
        gridTemplateColumns: `minmax(0, 1fr) minmax(${rightMin}, 0.9fr)`,
        gap: '20px',
        alignItems: 'start',
      }}
    >
      <div style={{ minWidth: 0 }}>{left}</div>
      <div style={{ minWidth: 0 }}>{right}</div>

      <style>{`
        @media (max-width: 1080px) {
          .dashboard-split-fallback {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
});

export const DetailRow = memo(function DetailRow({ label, value, theme }) {
  return (
    <div
      style={{
        background: theme.softBg,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: '14px',
        padding: '13px 14px',
        display: 'grid',
        gap: '7px',
        transition: 'transform 0.18s ease, border-color 0.18s ease',
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
          color: theme.cardText,
          fontWeight: 650,
          wordBreak: 'break-word',
          lineHeight: 1.5,
        }}
      >
        {value}
      </div>
    </div>
  );
});

export const EmptyState = memo(function EmptyState({ theme, text }) {
  return (
    <div
      style={{
        background: theme.cardBg,
        border: `1px solid ${theme.cardBorder}`,
        padding: '24px',
        borderRadius: '18px',
        boxShadow: theme.shadow,
        color: theme.mutedText,
      }}
    >
      {text}
    </div>
  );
});

export const PrimaryButton = memo(function PrimaryButton({
  children,
  onClick,
  disabled = false,
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: '44px',
        padding: '12px 16px',
        borderRadius: '12px',
        border: 'none',
        background: disabled ? '#64748b' : '#2563eb',
        color: 'white',
        fontWeight: 800,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'transform 0.18s ease, opacity 0.18s ease, box-shadow 0.18s ease',
        boxShadow: disabled ? 'none' : '0 10px 22px rgba(37, 99, 235, 0.22)',
      }}
    >
      {children}
    </button>
  );
});

export const SecondaryButton = memo(function SecondaryButton({
  children,
  onClick,
  theme,
}) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: '42px',
        border: `1px solid ${theme.cardBorder}`,
        background: theme.softBg,
        color: theme.cardText,
        borderRadius: '12px',
        padding: '10px 13px',
        cursor: 'pointer',
        fontWeight: 700,
        transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
      }}
    >
      {children}
    </button>
  );
});