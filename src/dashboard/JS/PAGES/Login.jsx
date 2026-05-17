import React, { memo, useMemo, useState } from 'react';
import { loginPageStyles } from '../ui/components';

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
  const styles = useMemo(() => loginPageStyles(theme), [theme]);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const guildInitial = getNameInitial(selectedGuildName || 'Guild');
  const botInitial = getNameInitial(botName || 'Goliath');

  const avatarSrc = isAuthenticated ? selectedGuildIcon || '' : botAvatar || '';
  const showAvatarImage = Boolean(avatarSrc) && !avatarFailed;

  const fallbackInitial = isAuthenticated ? guildInitial : botInitial;
  const fallbackTitle = isAuthenticated
    ? selectedGuildName || 'Selected guild'
    : botName || 'Goliath';

  return (
    <div style={styles.page}>
      <section style={styles.card}>
        <section style={styles.root}>
          <div style={styles.guildRow}>
            {showAvatarImage ? (
              <img
                src={avatarSrc}
                alt={fallbackTitle}
                style={styles.guildAvatarImage}
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <div style={styles.guildAvatar}>{fallbackInitial}</div>
            )}

            <div style={styles.guildInfo}>
              <h1 style={styles.title}>Goliath Dashboard</h1>
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
                ...styles.loginButtonState(loginPending),
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
