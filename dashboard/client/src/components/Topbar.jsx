import { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { topbarStyles } from '../ui';

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

  const handleThemeToggle = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, [setDarkMode]);

  const onLogoutClick = useCallback(() => {
    closeMenu();
    handleLogout();
  }, [closeMenu, handleLogout]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handlePointerDown(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        !menuButtonRef.current?.contains(event.target)
      ) {
        closeMenu();
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closeMenu();
        menuButtonRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen, closeMenu]);

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
                <div style={styles.userText}>
                  <div style={styles.userName}>{topbarUserName}</div>
                </div>

                <span style={styles.chevron(menuOpen)}>▾</span>

                {currentUserAvatar ? (
                  <img
                    src={currentUserAvatar}
                    alt={topbarUserName}
                    style={styles.avatar}
                  />
                ) : (
                  <div style={styles.avatarFallback}>{userInitial}</div>
                )}
              </button>

              {menuOpen ? (
                <div ref={menuRef} style={styles.menu} role="menu">
                  <div style={styles.themeRow}>
                    <div style={styles.themeCopy}>
                      <span style={styles.themeLabel}>Theme</span>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={!darkMode}
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

export default memo(Topbar);