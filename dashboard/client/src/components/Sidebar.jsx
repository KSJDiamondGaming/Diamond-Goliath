import { memo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function Sidebar({
  theme,
  selectedGuild,
  setSelectedGuild,
  guilds,
  guildError,
  isAuthenticated,
  authLoading = false,
  navItems,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const canNavigate = !authLoading && (isAuthenticated || guilds.length > 0);

  function getNavItemStyle(active) {
    return {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 14px',
      borderRadius: '14px',
      border: active ? `1px solid ${theme.primaryBorder}` : '1px solid transparent',
      background: active ? theme.primarySoft : 'transparent',
      color: active ? '#ffffff' : theme.sidebarText,
      cursor: canNavigate ? 'pointer' : 'not-allowed',
      textAlign: 'left',
      fontSize: '14px',
      fontWeight: active ? 700 : 600,
      transition: 'all 0.18s ease',
      opacity: canNavigate ? 1 : 0.45,
    };
  }

  function handleNavigate(key) {
    if (!canNavigate) return;
    navigate(`/${key}`);
  }

  return (
    <aside
      style={{
        background: theme.sidebarBg,
        borderRight: `1px solid ${theme.sidebarBorder}`,
        padding: '24px 16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 10px' }}>
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontWeight: 800,
          }}
        >
          K
        </div>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>KSJ Goliath</div>
          <div style={{ marginTop: '3px', fontSize: '12px', color: theme.sidebarMuted }}>
            Discord dashboard
          </div>
        </div>
      </div>

      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${theme.sidebarBorder}`,
          borderRadius: '16px',
          padding: '14px',
        }}
      >
        <label
          style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '12px',
            fontWeight: 700,
            color: theme.sidebarMuted,
            textTransform: 'uppercase',
          }}
        >
          Guild
        </label>

        <div style={{ position: 'relative' }}>
          <select
            value={selectedGuild}
            onChange={(e) => setSelectedGuild(e.target.value)}
            disabled={authLoading || (!isAuthenticated && guilds.length === 0)}
            style={{
              width: '100%',
              padding: '11px 40px 11px 12px',
              borderRadius: '12px',
              border: `1px solid ${theme.inputBorder}`,
              background: theme.inputBg,
              color: theme.inputText,
              fontSize: '14px',
              appearance: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              outline: 'none',
              boxShadow: 'none',
              cursor:
                authLoading || (!isAuthenticated && guilds.length === 0)
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {authLoading ? (
              <option value="">Loading guilds...</option>
            ) : !isAuthenticated && guilds.length === 0 ? (
              <option value="">Login required</option>
            ) : guilds.length === 0 ? (
              <option value="">No guilds found</option>
            ) : (
              guilds.map((guild) => (
                <option key={guild.id} value={guild.id}>
                  {guild.name}
                </option>
              ))
            )}
          </select>

          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '50%',
              right: '14px',
              transform: 'translateY(-50%)',
              color: theme.mutedText,
              fontSize: '13px',
              lineHeight: 1,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            ▾
          </span>
        </div>

        {guildError ? (
          <p style={{ marginTop: '8px', fontSize: '12px', color: '#fca5a5' }}>{guildError}</p>
        ) : null}
      </div>

      <div style={{ display: 'grid', gap: '6px' }}>
        {navItems.map((item) => {
          const active =
            location.pathname === `/${item.key}` ||
            (item.key === 'overview' && location.pathname === '/');

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleNavigate(item.key)}
              disabled={!canNavigate}
              style={getNavItemStyle(active)}
            >
              <span
                style={{
                  width: '18px',
                  textAlign: 'center',
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export default memo(Sidebar);