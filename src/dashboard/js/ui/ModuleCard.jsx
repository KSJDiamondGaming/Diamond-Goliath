import React, { memo, useState } from 'react';

function ModuleCard({ module, theme, onOpen }) {
  const [hovered, setHovered] = useState(false);
  const enabled = module?.enabled === true;

  const accent = enabled ? '#34d399' : '#64748b';

  return (
    <button
      type="button"
      onClick={() => onOpen?.(module)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onBlur={() => setHovered(false)}
      style={{
        border: `1px solid ${enabled ? '#34d39966' : theme.cardBorder}`,
        background: enabled
          ? 'linear-gradient(135deg, rgba(52,211,153,0.14), rgba(15,23,42,0.22))'
          : theme.cardBg,
        color: theme.cardText,
        borderRadius: 18,
        boxShadow: hovered ? '0 22px 60px rgba(0,0,0,0.32)' : theme.shadow,
        padding: 18,
        minHeight: 128,
        cursor: 'pointer',
        textAlign: 'left',
        display: 'grid',
        gap: 14,
        alignContent: 'space-between',
        opacity: enabled ? 1 : 0.72,
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, opacity 0.18s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      aria-label={`${module.name} module`}
    >
      <span
        style={{
          position: 'absolute',
          right: -34,
          bottom: -42,
          width: 104,
          height: 104,
          borderRadius: 999,
          background: `${accent}22`,
          filter: 'blur(4px)',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, position: 'relative' }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            display: 'grid',
            placeItems: 'center',
            border: `1px solid ${enabled ? '#34d39966' : theme.cardBorder}`,
            background: enabled ? 'rgba(52,211,153,0.12)' : 'rgba(148,163,184,0.10)',
            color: enabled ? '#86efac' : theme.mutedText,
            fontWeight: 950,
            fontSize: 13,
          }}
        >
          {module.icon}
        </div>

        {enabled ? (
          <span
            style={{
              color: '#86efac',
              fontSize: 16,
              lineHeight: 1,
            }}
            title="Settings coming later"
          >
            ⚙
          </span>
        ) : null}
      </div>

      <div style={{ position: 'relative' }}>
        <strong style={{ display: 'block', fontSize: 16 }}>{module.name}</strong>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            marginTop: 10,
            border: `1px solid ${enabled ? '#22c55e55' : '#64748b55'}`,
            background: enabled ? 'rgba(34,197,94,0.10)' : 'rgba(100,116,139,0.10)',
            color: enabled ? '#86efac' : theme.mutedText,
            borderRadius: 999,
            padding: '5px 9px',
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
    </button>
  );
}

export default memo(ModuleCard);
