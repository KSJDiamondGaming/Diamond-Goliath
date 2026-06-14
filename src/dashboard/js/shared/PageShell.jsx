import React, { memo } from 'react';

/**
 * Shared dashboard page shell + reusable UI system
 * Responsive Goliath dashboard architecture.
 */

function PageShell({
  title,
  subtitle,
  theme,
  children,
  actions = null,
  guild = null,
}) {
  const guildIcon =
    guild?.iconUrl ||
    guild?.iconURL ||
    guild?.avatarUrl ||
    guild?.image ||
    null;

  return (
    <div
      style={{
        display: 'grid',
        gap: 'clamp(16px, 2vw, 24px)',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        overflowX: 'hidden',
      }}
    >
      <header
        style={{
          position: 'relative',
          overflow: 'hidden',
          background:
            'linear-gradient(135deg, rgba(17,24,39,0.98) 0%, rgba(9,18,40,0.98) 45%, rgba(15,23,42,0.98) 100%)',
          border: `1px solid ${theme.cardBorder}`,
          borderRadius: 'clamp(18px, 2vw, 24px)',
          padding: 'clamp(18px, 3vw, 26px)',
          boxShadow:
            '0 20px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.03)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'clamp(16px, 2vw, 24px)',
          flexWrap: 'wrap',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'grid',
            gap: '10px',
            minWidth: 0,
            flex: '1 1 280px',
            zIndex: 2,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 'clamp(28px, 7vw, 64px)',
              lineHeight: 1,
              fontWeight: 900,
              letterSpacing: '-0.05em',
              textTransform: 'uppercase',
              color: '#ffffff',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}
          >
            {guild?.name || title}
          </h1>

          {guild?.id ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap',
                minWidth: 0,
              }}
            >
              <span
                style={{
                  color: theme.mutedText,
                  fontSize: '13px',
                  fontWeight: 700,
                  overflowWrap: 'anywhere',
                }}
              >
                Guild ID: {guild.id}
              </span>

              <span
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.25)',
                }}
              />

              <span
                style={{
                  color: '#dbeafe',
                  fontSize: '13px',
                  fontWeight: 700,
                }}
              >
                Real-time server insights
              </span>
            </div>
          ) : null}

          {subtitle ? (
            <p
              style={{
                margin: 0,
                color: theme.mutedText,
                fontSize: '14px',
                lineHeight: 1.7,
                maxWidth: '900px',
                overflowWrap: 'break-word',
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: '14px',
            flexWrap: 'wrap',
            zIndex: 2,
            minWidth: 0,
          }}
        >
          {actions ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap',
                minWidth: 0,
              }}
            >
              {actions}
            </div>
          ) : null}

          {guildIcon ? (
            <img
              src={guildIcon}
              alt={guild?.name || title}
              style={{
                width: 'clamp(64px, 14vw, 96px)',
                height: 'clamp(64px, 14vw, 96px)',
                borderRadius: 'clamp(16px, 2vw, 22px)',
                objectFit: 'cover',
                border: `1px solid ${theme.cardBorder}`,
                boxShadow:
                  '0 10px 40px rgba(0,0,0,0.45), 0 0 30px rgba(59,130,246,0.08)',
                background: '#0b1120',
                flex: '0 0 auto',
              }}
            />
          ) : null}
        </div>

        <div
          style={{
            position: 'absolute',
            top: '-120px',
            right: '-120px',
            width: '320px',
            height: '320px',
            background: 'rgba(37,99,235,0.12)',
            filter: 'blur(80px)',
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        />
      </header>

      <div
        style={{
          display: 'grid',
          gap: 'clamp(16px, 2vw, 24px)',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export const SectionCard = memo(
  function SectionCard({
    theme,
    title,
    subtitle,
    actions = null,
    padding = 'clamp(16px, 2vw, 20px)',
    minHeight = null,
    children,
  }) {
    return (
      <section
        style={{
          background:
            'linear-gradient(180deg, rgba(8,15,30,0.98), rgba(6,12,24,0.98))',
          border: `1px solid ${theme.cardBorder}`,
          borderRadius: '22px',
          padding,
          minHeight,
          boxShadow:
            '0 12px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)',
          display: 'grid',
          gap: '16px',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {(title || subtitle || actions) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '14px',
              flexWrap: 'wrap',
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: 'grid',
                gap: '6px',
                minWidth: 0,
                flex: '1 1 240px',
              }}
            >
              {title ? (
                <h2
                  style={{
                    margin: 0,
                    fontSize: 'clamp(18px, 2vw, 20px)',
                    fontWeight: 900,
                    letterSpacing: '-0.03em',
                    color: '#ffffff',
                    overflowWrap: 'break-word',
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
                    lineHeight: 1.6,
                    overflowWrap: 'break-word',
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
                  minWidth: 0,
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
  },
);

export const StatGrid = memo(
  function StatGrid({
    children,
    min = 'min(220px, 100%)',
  }) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))`,
          gap: '16px',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
        }}
      >
        {children}
      </div>
    );
  },
);

export const SummaryStat = memo(
  function SummaryStat({
    theme,
    label,
    value,
    description = null,
    accent = null,
    minHeight = '130px',
  }) {
    return (
      <div
        style={{
          background:
            'linear-gradient(180deg, rgba(10,18,35,0.96), rgba(6,12,24,0.98))',
          border: `1px solid ${theme.cardBorder}`,
          borderRadius: '18px',
          padding: 'clamp(16px, 2vw, 18px)',
          minHeight,
          display: 'grid',
          gap: '10px',
          boxShadow:
            '0 10px 30px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.02)',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 900,
            color: theme.mutedText,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            overflowWrap: 'break-word',
          }}
        >
          {label}
        </div>

        <div
          style={{
            color: accent || '#ffffff',
            fontWeight: 900,
            fontSize: 'clamp(28px, 6vw, 38px)',
            lineHeight: 1,
            letterSpacing: '-0.04em',
            textTransform: typeof value === 'string' ? 'capitalize' : 'none',
            overflowWrap: 'anywhere',
          }}
        >
          {value}
        </div>

        {description ? (
          <div
            style={{
              color: theme.mutedText,
              fontSize: '14px',
              lineHeight: 1.5,
              overflowWrap: 'break-word',
            }}
          >
            {description}
          </div>
        ) : null}
      </div>
    );
  },
);

export const EmptyState = memo(
  function EmptyState({
    theme,
    text,
    title = 'Nothing here yet',
  }) {
    return (
      <div
        style={{
          background: theme.cardBg,
          border: `1px dashed ${theme.cardBorder}`,
          borderRadius: '18px',
          padding: 'clamp(18px, 3vw, 24px)',
          color: theme.mutedText,
          textAlign: 'center',
          boxShadow: theme.shadow,
          display: 'grid',
          gap: '6px',
          minWidth: 0,
          overflowWrap: 'break-word',
        }}
      >
        <strong style={{ color: theme.cardText }}>{title}</strong>
        <span>{text}</span>
      </div>
    );
  },
);

export const LoadingPanel = memo(
  function LoadingPanel({
    theme,
    text = 'Loading...',
  }) {
    return (
      <div
        style={{
          background: theme.softBg,
          border: `1px solid ${theme.cardBorder}`,
          borderRadius: '14px',
          padding: '16px',
          color: theme.mutedText,
          fontWeight: 700,
          minWidth: 0,
          overflowWrap: 'break-word',
        }}
      >
        {text}
      </div>
    );
  },
);

export const Notice = memo(
  function Notice({
    theme,
    tone = 'info',
    children,
  }) {
    const tones = {
      info: {
        bg: theme.softBg,
        border: theme.cardBorder,
        text: theme.cardText,
      },
      success: {
        bg: 'rgba(34,197,94,0.12)',
        border: 'rgba(34,197,94,0.26)',
        text: theme.successText || '#86efac',
      },
      danger: {
        bg: 'rgba(239,68,68,0.12)',
        border: 'rgba(239,68,68,0.28)',
        text: theme.dangerText || '#fca5a5',
      },
      warning: {
        bg: 'rgba(245,158,11,0.12)',
        border: 'rgba(245,158,11,0.26)',
        text: theme.warningText || '#fcd34d',
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
          fontWeight: 700,
          lineHeight: 1.5,
          minWidth: 0,
          overflowWrap: 'break-word',
        }}
      >
        {children}
      </div>
    );
  },
);

export const DetailGrid = memo(
  function DetailGrid({
    children,
    min = 'min(180px, 100%)',
  }) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))`,
          gap: '12px',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
        }}
      >
        {children}
      </div>
    );
  },
);

export const DetailRow = memo(
  function DetailRow({
    theme,
    label,
    value,
  }) {
    return (
      <div
        style={{
          display: 'grid',
          gap: '4px',
          padding: '12px 14px',
          borderRadius: '14px',
          background: theme.softBg,
          border: `1px solid ${theme.cardBorder}`,
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: theme.mutedText,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            overflowWrap: 'break-word',
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
  },
);

export const PrimaryButton = memo(
  function PrimaryButton({
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
          background: disabled
            ? 'rgba(59,130,246,0.12)'
            : 'rgba(59,130,246,0.16)',
          color: '#ffffff',
          padding: '10px 14px',
          borderRadius: '12px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontWeight: 900,
          opacity: disabled ? 0.7 : 1,
          maxWidth: '100%',
          overflowWrap: 'break-word',
        }}
      >
        {children}
      </button>
    );
  },
);

export const SecondaryButton = memo(
  function SecondaryButton({
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
          fontWeight: 900,
          opacity: disabled ? 0.7 : 1,
          maxWidth: '100%',
          overflowWrap: 'break-word',
        }}
      >
        {children}
      </button>
    );
  },
);

export default memo(PageShell);