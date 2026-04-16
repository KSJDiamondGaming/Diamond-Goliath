import { memo } from 'react';
import { heroStyles } from '../ui';

function HeroBanner({
  theme,
  authLoading,
  isAuthenticated,
  selectedGuildName,
  selectedGuildId,
  handleLogin,
  botAvatar,
  botName,
  loginPending,
}) {
  const styles = heroStyles(theme);

  return (
    <section style={styles.root}>
      <div style={styles.guildRow}>
        {/* ❌ Removed avatar/icon */}

        <div style={styles.guildInfo}>
          <h1 style={styles.title}>
            {isAuthenticated
              ? selectedGuildName || 'Select a guild'
              : 'KSJ Goliath Dashboard'}
          </h1>

          <div style={styles.metaRow}>
            {isAuthenticated && selectedGuildId && (
              <span style={styles.metaPill}>
                Guild ID: {selectedGuildId}
              </span>
            )}
          </div>
        </div>
      </div>

      <p style={styles.text}>
        {isAuthenticated
          ? selectedGuildName
            ? 'Manage moderation, warnings, automod, embeds, and join messages for your selected server.'
            : 'Pick a guild from the sidebar to manage your Discord server settings.'
          : 'Sign in with Discord to access your servers, moderation tools, and dashboard controls.'}
      </p>

      {!authLoading && !isAuthenticated && (
        <button
          type="button"
          onClick={handleLogin}
          disabled={loginPending}
          style={{
            ...styles.loginButton,
            opacity: loginPending ? 0.7 : 1,
            cursor: loginPending ? 'not-allowed' : 'pointer',
          }}
        >
          {loginPending ? 'Redirecting to Discord...' : 'Login with Discord'}
        </button>
      )}
    </section>
  );
}

export default memo(HeroBanner);