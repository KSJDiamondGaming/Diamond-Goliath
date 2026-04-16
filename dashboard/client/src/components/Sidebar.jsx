import { memo, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const TOP_SECTION_HEIGHT = 64;

function getGuildInitial(name = '') {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function getGuildAvatar(guild) {
  return (
    guild?.iconUrl ||
    guild?.iconURL ||
    guild?.icon ||
    guild?.avatarUrl ||
    guild?.image ||
    ''
  );
}

function SidebarIcon({ type, active, color }) {
  const stroke = active ? '#93c5fd' : color;

  const baseProps = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    style: { display: 'block' },
  };

  switch (type) {
    case 'overview':
      return (
        <svg {...baseProps}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V20h13V9.5" />
        </svg>
      );

    case 'cases':
      return (
        <svg {...baseProps}>
          <path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z" />
        </svg>
      );

    case 'warnings':
      return (
        <svg {...baseProps}>
          <path d="M12 4 21 20H3L12 4z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );

    case 'automod':
      return (
        <svg {...baseProps}>
          <rect x="5" y="8" width="14" height="10" rx="3" />
          <path d="M12 4v4" />
          <path d="M9 12h.01" />
          <path d="M15 12h.01" />
          <path d="M8 18v2" />
          <path d="M16 18v2" />
        </svg>
      );

    case 'config':
      return (
        <svg {...baseProps}>
          <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z" />
          <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
          <path d="M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14z" />
        </svg>
      );

    case 'messages':
      return (
        <svg {...baseProps}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="m4 8 8 6 8-6" />
        </svg>
      );

    default:
      return (
        <svg {...baseProps}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

function Sidebar({
  theme,
  selectedGuild,
  setSelectedGuild,
  guilds,
  guildError,
  isAuthenticated,
  authLoading,
  navItems,
  botAvatar,
  botName,
  expanded,
  collapsed,
  onToggleCollapsed,
}) {
  const location = useLocation();
  const navigate = useNavigate();

  const selectedGuildData = useMemo(
    () => guilds.find((g) => g.id === selectedGuild) || null,
    [guilds, selectedGuild]
  );

  const selectedGuildAvatar = getGuildAvatar(selectedGuildData);
  const selectedGuildInitial = getGuildInitial(selectedGuildData?.name || '');
  const canNavigate = isAuthenticated && Boolean(selectedGuild);

  function handleNavigate(key) {
    if (!canNavigate) return;
    navigate(`/${key}`);
  }

  function getNavItemStyle(active) {
    return {
      width: '100%',
      padding: expanded ? '10px 12px' : '10px',
      borderRadius: '12px',
      border: active ? `1px solid ${theme.primaryBorder}` : '1px solid transparent',
      background: active ? theme.primarySoft : 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: expanded ? 'flex-start' : 'center',
      gap: '10px',
      color: active ? '#93c5fd' : theme.sidebarText,
      cursor: canNavigate ? 'pointer' : 'not-allowed',
      textAlign: 'left',
      fontSize: '14px',
      fontWeight: active ? 700 : 600,
      opacity: canNavigate ? 1 : 0.5,
      transition:
        'background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.18s ease, opacity 0.18s ease, box-shadow 0.18s ease',
      outline: 'none',
      boxShadow: active ? '0 0 0 1px rgba(59,130,246,0.08) inset' : 'none',
      appearance: 'none',
      WebkitAppearance: 'none',
    };
  }

  return (
    <aside
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        height: '100vh',
        background: theme.sidebarBg,
        borderRight: `1px solid ${theme.sidebarBorder}`,
        padding: '16px 16px 72px',
        gap: '16px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: `${TOP_SECTION_HEIGHT}px`,
          minHeight: `${TOP_SECTION_HEIGHT}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: expanded ? 'flex-start' : 'center',
          gap: '10px',
        }}
      >
        {botAvatar ? (
          <img
            src={botAvatar}
            alt={botName || 'KSJ Goliath'}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: theme.softBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              color: theme.cardText,
              flexShrink: 0,
            }}
          >
            K
          </div>
        )}

        {expanded ? (
          <div
            style={{
              fontWeight: 800,
              color: theme.sidebarText,
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {botName || 'KSJ Goliath'}
          </div>
        ) : null}
      </div>

      {isAuthenticated ? (
        <div
          style={{
            height: `${TOP_SECTION_HEIGHT}px`,
            minHeight: `${TOP_SECTION_HEIGHT}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: expanded ? 'flex-start' : 'center',
          }}
        >
          {expanded ? (
            <div style={{ position: 'relative', width: '100%' }}>
              <select
                value={selectedGuild}
                onChange={(e) => setSelectedGuild(e.target.value)}
                disabled={authLoading || guilds.length === 0}
                style={{
                  width: '100%',
                  padding: '10px 38px 10px 10px',
                  borderRadius: '10px',
                  border: `1px solid ${theme.inputBorder}`,
                  background: theme.inputBg,
                  color: theme.inputText,
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                  outline: 'none',
                  cursor: authLoading || guilds.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {authLoading ? (
                  <option value="">Loading guilds...</option>
                ) : guilds.length === 0 ? (
                  <option value="">No guilds found</option>
                ) : (
                  guilds.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))
                )}
              </select>

              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: '12px',
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
          ) : (
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                border: `1px solid ${theme.primaryBorder || theme.sidebarBorder}`,
                background: theme.softBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                boxShadow: theme.shadow,
                flexShrink: 0,
              }}
              title={selectedGuildData?.name || 'Selected guild'}
            >
              {selectedGuildAvatar ? (
                <img
                  src={selectedGuildAvatar}
                  alt={selectedGuildData?.name || 'Selected guild'}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 800,
                    color: theme.sidebarText,
                  }}
                >
                  {selectedGuildInitial}
                </span>
              )}
            </div>
          )}
        </div>
      ) : null}

      {guildError ? (
        <div
          style={{
            color: '#f87171',
            fontSize: '12px',
            lineHeight: 1.4,
            textAlign: expanded ? 'left' : 'center',
          }}
        >
          {guildError}
        </div>
      ) : null}

      {isAuthenticated ? (
        <nav
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            marginTop: '10px',
          }}
        >
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
                title={!expanded ? item.label : ''}
                aria-current={active ? 'page' : undefined}
                style={getNavItemStyle(active)}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: expanded ? '20px' : '100%',
                    minWidth: expanded ? '20px' : 'auto',
                    flexShrink: 0,
                  }}
                >
                  <SidebarIcon
                    type={item.icon}
                    active={active}
                    color={theme.sidebarText}
                  />
                </span>

                {expanded ? (
                  <span
                    style={{
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.label}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      ) : null}

      <div
        style={{
          position: 'absolute',
          bottom: '14px',
          right: '14px',
        }}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '6px 8px',
            borderRadius: '10px',
            border: `1px solid ${theme.sidebarBorder}`,
            background: 'rgba(255,255,255,0.05)',
            color: theme.sidebarText,
            cursor: 'pointer',
            lineHeight: 1,
            transition: 'all 0.2s ease',
            boxShadow: collapsed
              ? '0 0 10px rgba(239,68,68,0.15)'
              : '0 0 10px rgba(34,197,94,0.15)',
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '20px',
              width: '20px',
              transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 0.25s cubic-bezier(0.22,1,0.36,1)',
              fontSize: '16px',
            }}
          >
            ›
          </span>

          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '20px',
              width: '20px',
              fontSize: '16px',
              transform: collapsed ? 'scale(1)' : 'scale(1.15)',
              transition: 'transform 0.2s ease',
            }}
          >
            {collapsed ? '🔒' : '🔓'}
          </span>
        </button>
      </div>
    </aside>
  );
}

export default memo(Sidebar);