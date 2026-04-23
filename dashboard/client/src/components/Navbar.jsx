import { memo, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BotAvatar from './BotAvatar';
import { navbarStyles } from '../ui';

function getNameInitial(name = '') {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function getGuildAvatar(guild) {
  return guild?.iconUrl || guild?.iconURL || guild?.avatarUrl || guild?.image || '';
}

function normalizePath(path = '') {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function isActivePath(currentPath, itemPath) {
  const normalizedCurrent = normalizePath(currentPath);
  const normalizedItem = normalizePath(itemPath);

  if (normalizedItem === '/') {
    return normalizedCurrent === '/';
  }

  return (
    normalizedCurrent === normalizedItem ||
    normalizedCurrent.startsWith(`${normalizedItem}/`)
  );
}

function SidebarIcon({ type, active, color }) {
  const stroke = active ? '#93c5fd' : color;

  const baseProps = {
    width: 18,
    height: 18,
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

function Navbar({
  theme,
  selectedGuild,
  setSelectedGuild,
  guilds,
  guildError = '',
  isAuthenticated = true,
  authLoading = false,
  navItems = [],
  botAvatar,
  botName,
  botData,
  expanded = true,
  onToggleCollapsed = () => {},
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const styles = useMemo(() => navbarStyles(theme), [theme]);

  const safeNavItems = Array.isArray(navItems) ? navItems : [];

  const selectedGuildData = useMemo(
    () => guilds.find((g) => g.id === selectedGuild) || null,
    [guilds, selectedGuild]
  );

  const selectedGuildAvatar = getGuildAvatar(selectedGuildData);
  const selectedGuildInitial = getNameInitial(selectedGuildData?.name || '');
  const canNavigate = isAuthenticated && Boolean(selectedGuild);
  const canPickGuild = isAuthenticated && !authLoading && guilds.length > 0;

  const handleNavigate = useCallback(
    (item) => {
      if (!canNavigate || !item?.path) return;
      navigate(normalizePath(item.path));
    },
    [canNavigate, navigate]
  );

  const guildOptions = useMemo(() => {
    if (authLoading) return [{ id: '', name: 'Loading guilds...' }];
    if (!guilds.length) return [{ id: '', name: 'No guilds found' }];
    return guilds;
  }, [authLoading, guilds]);

  return (
    <aside style={styles.root(expanded)}>
      <div style={styles.top}>
        <BotAvatar
          theme={theme}
          botAvatar={botAvatar}
          botName={botName}
          botData={botData}
          expanded={expanded}
        />
      </div>

      <div style={styles.middle}>
        {isAuthenticated ? (
          <div style={styles.guildWrap}>
            {expanded ? (
              <div style={styles.guildSelectWrap}>
                <select
                  value={selectedGuild}
                  onChange={(e) => setSelectedGuild(e.target.value)}
                  disabled={!canPickGuild}
                  style={styles.guildSelect(canPickGuild)}
                >
                  {guildOptions.map((guild) => (
                    <option key={guild.id || guild.name} value={guild.id}>
                      {guild.name}
                    </option>
                  ))}
                </select>

                <span style={styles.guildChevron}>▾</span>
              </div>
            ) : (
              <div style={styles.guildMini}>
                {selectedGuildAvatar ? (
                  <img
                    src={selectedGuildAvatar}
                    alt={selectedGuildData?.name || 'Guild'}
                    style={styles.guildMiniAvatar}
                  />
                ) : (
                  <div style={styles.guildMiniFallback}>{selectedGuildInitial}</div>
                )}
              </div>
            )}

            {guildError && expanded ? <p style={styles.guildError}>{guildError}</p> : null}
          </div>
        ) : null}

        <nav style={styles.nav}>
          {safeNavItems.map((item) => {
            const itemPath = normalizePath(item.path || '/');
            const active = isActivePath(location.pathname, itemPath);

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleNavigate(item)}
                style={styles.navItem(active, expanded, canNavigate)}
                title={expanded ? undefined : item.label}
                disabled={!canNavigate || !item.path}
                aria-current={active ? 'page' : undefined}
              >
                <span style={styles.navIcon}>
                  <SidebarIcon
                    type={item.icon}
                    active={active}
                    color={theme.sidebarText}
                  />
                </span>

                {expanded ? <span style={styles.navLabel}>{item.label}</span> : null}
              </button>
            );
          })}
        </nav>
      </div>

      <div style={styles.bottom}>
        <button
          type="button"
          onClick={onToggleCollapsed}
          style={styles.collapseButton}
          title={expanded ? 'Collapse navbar' : 'Expand navbar'}
        >
          <span style={styles.collapseButtonIcon(expanded)}>›</span>
        </button>
      </div>
    </aside>
  );
}

export default memo(Navbar);