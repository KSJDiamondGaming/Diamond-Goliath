import { memo, useState } from 'react';
import { loginPageStyles } from '../ui';

function getNameInitial(name = '') {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function Login({
  theme,
  authLoading,
  isAuthenticated,
  selectedGuildName,
  selectedGuildIcon,
  handleLogin,
  botAvatar,
  botName,
  loginPending,
}) {
  const styles = loginPageStyles(theme);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const guildInitial = getNameInitial(selectedGuildName || 'Guild');
  const botInitial = getNameInitial(botName || 'KSJ Goliath');

  const avatarSrc = isAuthenticated ? selectedGuildIcon || '' : botAvatar || '';
  const showAvatarImage = Boolean(avatarSrc) && !avatarFailed;

  const fallbackInitial = isAuthenticated ? guildInitial : botInitial;
  const fallbackTitle = isAuthenticated
    ? selectedGuildName || 'Selected guild'
    : botName || 'KSJ Goliath';

  return (
    <div style={styles.page}>
      <section style={styles.card}>
        <section style={styles.root}>
          <div style={styles.guildRow}>
            {showAvatarImage ? (
              <img
                src={avatarSrc}
                alt={fallbackTitle}
                style={{
                  ...styles.guildAvatar,
                  objectFit: 'cover',
                  padding: 0,
                }}
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <div style={styles.guildAvatar}>{fallbackInitial}</div>
            )}

            <div style={styles.guildInfo}>
              <h1 style={styles.title}>KSJ Goliath Dashboard</h1>
            </div>
          </div>

          <p style={styles.text}>
            Sign in with Discord to access your servers, moderation tools, and dashboard controls.
          </p>

          {!authLoading && !isAuthenticated ? (
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
          ) : null}
        </section>
      </section>
    </div>
  );
}

export default memo(Login);