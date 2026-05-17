import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { topbarStyles } from '../ui/components';

function getInitial(name = '') {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function Topbar({
  theme,
  authLoading = false,
  isAuthenticated = false,
  handleLogin = () => {},
  handleLogout = () => {},
  topbarUserName = 'User',
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

  const styles = useMemo(() => topbarStyles(theme), [theme]);
  const userInitial = getInitial(topbarUserName);

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
    if (!menuOpen) return;

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
      if (event.key === 'Escape') {
        closeMenu();
      }
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

  return (
    <header style={styles.root}>
      <div style={styles.inner}>
        <div style={styles.left} />

        <div style={styles.actionsWrap}>
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
                style={{
                  ...styles.userButton(isUserButtonHovered || menuOpen),
                  opacity: authLoading ? 0.7 : 1,
                  cursor: authLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {currentUserAvatar ? (
                  <img src={currentUserAvatar} alt={topbarUserName} style={styles.avatar} />
                ) : (
                  <div style={styles.avatarFallback}>{userInitial}</div>
                )}

                <div style={styles.userText}>
                  <div style={styles.userName}>{topbarUserName}</div>
                </div>

                <span style={styles.chevron(menuOpen)}>▾</span>
              </button>

              {menuOpen ? (
                <div ref={menuRef} style={styles.menu} role="menu">
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
              style={{
                ...styles.userButton(false),
                opacity: authLoading || loginPending ? 0.7 : 1,
                cursor: authLoading || loginPending ? 'not-allowed' : 'pointer',
              }}
            >
              <div style={styles.userText}>
                <div style={styles.userName}>
                  {loginPending ? 'Redirecting...' : 'Login'}
                </div>
              </div>

              <div style={styles.avatarFallback}>↗</div>
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
