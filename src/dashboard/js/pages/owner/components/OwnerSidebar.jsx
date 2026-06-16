import React, { memo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { OWNER_NAV_ITEMS } from '../../../shared/ownerNav.js';

function OwnerSidebar({ theme, botName = 'Goliath', botAvatar }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside
      style={{
        width: 280,
        minHeight: '100dvh',
        borderRight: '1px solid rgba(148,163,184,0.16)',
        background: 'rgba(3,7,18,0.92)',
        padding: 14,
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr auto',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10 }}>
        {botAvatar ? (
          <img src={botAvatar} alt={botName} style={{ width: 30, height: 30, borderRadius: 10 }} />
        ) : null}
        <strong style={{ color: theme.cardText }}>{botName}</strong>
      </div>

      <div
        style={{
          border: '1px solid rgba(59,130,246,0.28)',
          background: 'rgba(15,23,42,0.82)',
          color: theme.cardText,
          borderRadius: 14,
          padding: '10px 12px',
          fontSize: 13,
          fontWeight: 900,
        }}
      >
        Owner Control
      </div>

      <nav style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
        <div
          style={{
            color: theme.navbarMuted,
            fontSize: 10,
            fontWeight: 950,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            margin: '6px 8px',
          }}
        >
          Owner Control
        </div>

        {OWNER_NAV_ITEMS.map((item) => {
          const active =
            location.pathname === item.path ||
            (item.path !== '/owner' && location.pathname.startsWith(item.path));

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate(item.path)}
              style={{
                border: active ? '1px solid rgba(59,130,246,0.75)' : '1px solid transparent',
                background: active ? 'rgba(37,99,235,0.28)' : 'transparent',
                color: active ? '#bfdbfe' : theme.navbarText,
                borderRadius: 14,
                padding: '12px 14px',
                textAlign: 'left',
                cursor: 'pointer',
                fontWeight: 900,
              }}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div
        style={{
          border: '1px solid rgba(34,197,94,0.24)',
          background: 'rgba(15,23,42,0.72)',
          borderRadius: 16,
          padding: 12,
          color: theme.mutedText,
          fontSize: 12,
        }}
      >
        <strong style={{ display: 'block', color: theme.cardText }}>KSJ Owner</strong>
        Owner Access
      </div>
    </aside>
  );
}

export default memo(OwnerSidebar);


