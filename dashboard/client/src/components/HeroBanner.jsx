import { memo, useMemo } from 'react';
import { heroStyles } from '../ui';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

function HeroBanner({
  theme,
  authLoading,
  isAuthenticated,
  selectedGuildName,
  selectedGuildId,
  centered = false,
}) {
  const styles = useMemo(() => heroStyles(theme), [theme]);

  const title = authLoading
    ? 'Loading...'
    : isAuthenticated
      ? selectedGuildName || 'No guild selected'
      : 'Sign in with Discord';

  const subtitle = authLoading
    ? 'Checking your session...'
    : isAuthenticated
      ? 'Manage your moderation tools, messages, warnings and embed settings from one clean dashboard.'
      : 'Sign in to load your account and unlock the dashboard.';

  return (
    <div
      style={{
        ...styles.root,
        marginBottom: centered ? 0 : '24px',
        maxWidth: centered ? '980px' : undefined,
        width: centered ? '100%' : undefined,
      }}
    >
      <h1 style={styles.title}>{title}</h1>

      {isAuthenticated && !authLoading && selectedGuildId ? (
        <p style={styles.meta}>Guild ID: {selectedGuildId}</p>
      ) : null}

      <p style={styles.text}>{subtitle}</p>

      {!authLoading && !isAuthenticated ? (
        <a
          href={`${API_BASE}/api/auth/login`}
          style={{
            ...styles.loginButton,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
          }}
        >
          Login with Discord
        </a>
      ) : null}
    </div>
  );
}

export default memo(HeroBanner);