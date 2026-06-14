import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { topbarStyles } from '../ui/components';

function getInitial(name = '') {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    function handleResize() {
      setIsMobile(window.innerWidth < breakpoint);
    }

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isMobile;
}

function Topbar({
  theme,
  authLoading = false,
  isAuthenticated = false,
  handleLogin = () => {},
  handleLogout = () => {},
  topbarUserName = 'User',
  currentUser = null,
  currentUserAvatar,
  darkMode = true,
  setDarkMode = () => {},
  loginPending = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isUserButtonHovered, setIsUserButtonHovered] = useState(false);
  const [hoveredMenuItem, setHoveredMenuItem] = useState('');

  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);

  const isMobile = useIsMobile(768);
  const styles = useMemo(() => topbarStyles(theme), [theme]);
  const userInitial = getInitial(topbarUserName);

  const isOwner = currentUser?.isOwner === true;

  const isOwnerView =
  currentUser?.isOwner === true &&
  typeof window !== 'undefined' &&
  window.location.pathname.toLowerCase().includes('owner');

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setHoveredMenuItem('');
    setIsUserButtonHovered(false);
  }, []);

  const toggleMenu = useCallback(() => {
    if (authLoading || !isAuthenticated) return;
    setMenuOpen((prev) => !prev);
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handleClickOutside(event) {
      const target = event.target;

      if (
        menuRef.current?.contains(target) ||
        menuButtonRef.current?.contains(target)
      ) {
        return;
      }

      closeMenu();
    }

    function handleEscape(event) {
      if (event.key === 'Escape') closeMenu();
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen, closeMenu]);

  const handleThemeToggle = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, [setDarkMode]);

  const onLogoutClick = useCallback(() => {
    closeMenu();
    handleLogout();
  }, [closeMenu, handleLogout]);

  const goToPath = useCallback(
    (path) => {
      closeMenu();

      if (typeof window !== 'undefined') {
        window.location.href = path;
      }
    },
    [closeMenu],
  );

  const rootStyle = {
    ...styles.root,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'visible',
  };

  const innerStyle = {
    ...styles.inner,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    gap: isMobile ? 10 : styles.inner?.gap,
    paddingLeft: isMobile ? 64 : styles.inner?.paddingLeft,
    paddingRight: isMobile ? 12 : styles.inner?.paddingRight,
  };

  const actionsWrapStyle = {
    ...styles.actionsWrap,
    minWidth: 0,
    maxWidth: '100%',
    marginLeft: 'auto',
  };

  const userButtonStyle = {
    ...styles.userButton(isUserButtonHovered || menuOpen),
    opacity: authLoading ? 0.7 : 1,
    cursor: authLoading ? 'not-allowed' : 'pointer',
    maxWidth: isMobile ? 'calc(100vw - 88px)' : 320,
    minWidth: 0,
    overflow: 'hidden',
  };

  const loginButtonStyle = {
    ...styles.userButton(false),
    opacity: authLoading || loginPending ? 0.7 : 1,
    cursor: authLoading || loginPending ? 'not-allowed' : 'pointer',
    maxWidth: isMobile ? 'calc(100vw - 88px)' : 320,
    minWidth: 0,
    overflow: 'hidden',
  };

  const userTextStyle = {
    ...styles.userText,
    minWidth: 0,
    overflow: 'hidden',
  };

  const userNameStyle = {
    ...styles.userName,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: isMobile ? 132 : 220,
  };

  const menuStyle = {
    ...styles.menu,
    position: 'absolute',
    right: isMobile ? 8 : styles.menu?.right,
    left: isMobile ? 'auto' : styles.menu?.left,
    top: styles.menu?.top,
    width: isMobile ? 'min(320px, calc(100vw - 24px))' : styles.menu?.width,
    maxWidth: 'calc(100vw - 24px)',
    zIndex: 1200,
  };

  return (
    <header style={rootStyle}>
      <div style={innerStyle}>
        <div style={styles.left} />

        <div style={actionsWrapStyle}>
          {isAuthenticated ? (
            <>
              <button
                ref={menuButtonRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                disabled={authLoading}
                onClick={toggleMenu}
                onMouseEnter={() => setIsUserButtonHovered(true)}
                onMouseLeave={() => setIsUserButtonHovered(false)}
                onBlur={() => setIsUserButtonHovered(false)}
                style={userButtonStyle}
              >
                {currentUserAvatar ? (
                  <img
                    src={currentUserAvatar}
                    alt={topbarUserName}
                    style={{
                      ...styles.avatar,
                      flex: '0 0 auto',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      ...styles.avatarFallback,
                      flex: '0 0 auto',
                    }}
                  >
                    {userInitial}
                  </div>
                )}

                <div style={userTextStyle}>
                  <div style={userNameStyle}>{topbarUserName}</div>
                </div>

                <span
                  style={{
                    ...styles.chevron(menuOpen),
                    flex: '0 0 auto',
                  }}
                >
                  ▾
                </span>
              </button>

              {menuOpen ? (
                <div ref={menuRef} style={menuStyle} role="menu">
                  <MenuButton
                    styles={styles}
                    hovered={hoveredMenuItem === 'billing'}
                    onHover={() => setHoveredMenuItem('billing')}
                    onLeave={() => setHoveredMenuItem('')}
                    onClick={() => goToPath('/billing')}
                    icon="£"
                    label="Billing"
                  />

                  <MenuButton
                    styles={styles}
                    hovered={hoveredMenuItem === 'docs'}
                    onHover={() => setHoveredMenuItem('docs')}
                    onLeave={() => setHoveredMenuItem('')}
                    onClick={() => goToPath('/docs')}
                    icon="?"
                    label="Documentation"
                  />

                  {isOwner ? (
                    isOwnerView ? (
                      <MenuButton
                        styles={styles}
                        hovered={hoveredMenuItem === 'return'}
                        onHover={() => setHoveredMenuItem('return')}
                        onLeave={() => setHoveredMenuItem('')}
                        onClick={() => goToPath('/dashboard')}
                        icon="🏠"
                        label="Return"
                      />
                    ) : (
                      <MenuButton
                        styles={styles}
                        hovered={hoveredMenuItem === 'owner'}
                        onHover={() => setHoveredMenuItem('owner')}
                        onLeave={() => setHoveredMenuItem('')}
                        onClick={() => goToPath('/owner')}
                        icon="👑"
                        label="Owner View"
                      />
                    )
                  ) : null}

                  <div style={styles.themeRow}>
                    <div style={styles.themeCopy}>
                      <span style={styles.themeLabel}>Dark mode</span>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={darkMode}
                      aria-label={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
                      onClick={handleThemeToggle}
                      onMouseEnter={() => setHoveredMenuItem('theme')}
                      onMouseLeave={() => setHoveredMenuItem('')}
                      onBlur={() => setHoveredMenuItem('')}
                      style={styles.themeSwitch(!darkMode, hoveredMenuItem === 'theme')}
                    >
                      <span style={styles.themeSwitchTrack}>
                        <span style={styles.themeIconLeft}>☾</span>
                        <span style={styles.themeIconRight}>☀</span>
                        <span style={styles.themeThumb(!darkMode)} />
                      </span>
                    </button>
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={onLogoutClick}
                    onMouseEnter={() => setHoveredMenuItem('logout')}
                    onMouseLeave={() => setHoveredMenuItem('')}
                    onBlur={() => setHoveredMenuItem('')}
                    style={styles.logoutButton(hoveredMenuItem === 'logout')}
                  >
                    Log out
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              onClick={handleLogin}
              disabled={authLoading || loginPending}
              style={loginButtonStyle}
            >
              <div style={userTextStyle}>
                <div style={userNameStyle}>
                  {loginPending ? 'Redirecting...' : 'Login'}
                </div>
              </div>

              <div
                style={{
                  ...styles.avatarFallback,
                  flex: '0 0 auto',
                }}
              >
                ↗
              </div>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

const MenuButton = memo(function MenuButton({
  styles,
  hovered = false,
  onHover,
  onLeave,
  onClick,
  icon,
  label,
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onBlur={onLeave}
      style={styles.menuButton(hovered)}
    >
      <span style={styles.menuButtonIcon}>{icon}</span>
      <span style={styles.menuButtonLabel}>{label}</span>
    </button>
  );
});

export default memo(Topbar);