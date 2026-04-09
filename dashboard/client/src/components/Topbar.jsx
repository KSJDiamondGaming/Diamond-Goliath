import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { topbarStyles } from '../ui';

function Topbar({
  theme,
  authLoading,
  isAuthenticated,
  handleLogin,
  handleLogout,
  topbarUserName,
  currentUserAvatar,
  darkMode,
  setDarkMode,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isUserButtonHovered, setIsUserButtonHovered] = useState(false);
  const [hoveredMenuItem, setHoveredMenuItem] = useState('');
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const styles = useMemo(() => topbarStyles(theme), [theme]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handlePointerDown(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        !menuButtonRef.current?.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
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
  }, [menuOpen]);

  return (
    <header style={styles.root}>
      <div style={styles.inner}>
        <div />

        <div style={styles.actionsWrap}>
          {isAuthenticated ? (
            <>
              <button
                ref={menuButtonRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => {
                  if (authLoading) return;
                  setMenuOpen((prev) => !prev);
                }}
                onMouseEnter={() => setIsUserButtonHovered(true)}
                onMouseLeave={() => setIsUserButtonHovered(false)}
                onBlur={() => setIsUserButtonHovered(false)}
                style={styles.userButton(isUserButtonHovered || menuOpen)}
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
                  <div style={styles.avatarFallback}>
                    {topbarUserName.charAt(0)?.toUpperCase() || '?'}
                  </div>
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
                      onClick={() => setDarkMode((prev) => !prev)}
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
                    onClick={() => {
                      setMenuOpen(false);
                      handleLogout();
                    }}
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
              style={styles.userButton(false)}
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default memo(Topbar);