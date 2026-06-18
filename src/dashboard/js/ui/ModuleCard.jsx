import React, { memo, useState } from 'react';

import { getModuleStatusMeta } from '../shared/moduleRegistry.js';

const STATUS_STYLES = {
  success: {
    border: '#34d39966',
    bg: 'rgba(34,197,94,0.10)',
    text: '#86efac',
    glow: '#34d39922',
  },
  info: {
    border: '#38bdf866',
    bg: 'rgba(14,165,233,0.10)',
    text: '#7dd3fc',
    glow: '#38bdf822',
  },
  warning: {
    border: '#facc1566',
    bg: 'rgba(250,204,21,0.10)',
    text: '#fde68a',
    glow: '#facc1522',
  },
  muted: {
    border: '#64748b55',
    bg: 'rgba(100,116,139,0.10)',
    text: '#cbd5e1',
    glow: '#64748b22',
  },
};

function ModuleCard({ module, theme, onOpen }) {
  const [hovered, setHovered] = useState(false);
  const enabled = module?.enabled === true;
  const canOpen = Boolean(module?.route);
  const statusMeta = getModuleStatusMeta(module?.status);
  const statusStyle = STATUS_STYLES[statusMeta.tone] || STATUS_STYLES.muted;

  return (
    <button
      type="button"
      onClick={() => onOpen?.(module)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onBlur={() => setHovered(false)}
      style={{
        border: `1px solid ${enabled ? statusStyle.border : theme.cardBorder}`,
        background: enabled
          ? 'linear-gradient(135deg, rgba(15,23,42,0.72), rgba(15,23,42,0.26))'
          : theme.cardBg,
        color: theme.cardText,
        borderRadius: 18,
        boxShadow: hovered && canOpen ? '0 22px 60px rgba(0,0,0,0.32)' : theme.shadow,
        padding: 18,
        minHeight: 176,
        cursor: canOpen ? 'pointer' : 'default',
        textAlign: 'left',
        display: 'grid',
        gap: 14,
        alignContent: 'space-between',
        opacity: enabled ? 1 : 0.78,
        transform: hovered && canOpen ? 'translateY(-2px)' : 'translateY(0)',
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
          width: 118,
          height: 118,
          borderRadius: 999,
          background: statusStyle.glow,
          filter: 'blur(4px)',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, position: 'relative' }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            display: 'grid',
            placeItems: 'center',
            border: `1px solid ${statusStyle.border}`,
            background: statusStyle.bg,
            color: statusStyle.text,
            fontWeight: 950,
            fontSize: 13,
          }}
        >
          {module.icon}
        </div>

        <span
          style={{
            border: `1px solid ${statusStyle.border}`,
            background: statusStyle.bg,
            color: statusStyle.text,
            borderRadius: 999,
            padding: '5px 9px',
            fontSize: 11,
            fontWeight: 950,
            whiteSpace: 'nowrap',
          }}
        >
          {statusMeta.label}
        </span>
      </div>

      <div style={{ position: 'relative', display: 'grid', gap: 10 }}>
        <div>
          <strong style={{ display: 'block', fontSize: 16 }}>{module.name}</strong>
          <span style={{ display: 'block', color: theme.mutedText, fontSize: 12, fontWeight: 850, marginTop: 6 }}>
            {module.category}
          </span>
        </div>

        <p style={{ margin: 0, color: theme.mutedText, fontSize: 13, lineHeight: 1.45 }}>
          {module.summary || 'Module dashboard page pending.'}
        </p>

        <span
          style={{
            display: 'inline-flex',
            justifySelf: 'start',
            alignItems: 'center',
            color: canOpen ? statusStyle.text : theme.mutedText,
            fontSize: 12,
            fontWeight: 950,
          }}
        >
          {canOpen ? 'Open module →' : 'Dashboard page pending'}
        </span>
      </div>
    </button>
  );
}

export default memo(ModuleCard);
