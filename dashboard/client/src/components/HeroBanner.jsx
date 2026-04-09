import { memo, useMemo, useState } from 'react';
import { heroStyles } from '../ui';

function DiscordIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="currentColor"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.249.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.14 14.14 0 0 0 1.226-1.994.076.076 0 0 0-.041-.105 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.04.106c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .03-.055c.5-5.177-.838-9.674-3.548-13.66a.061.061 0 0 0-.031-.028ZM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.418 0-1.333.955-2.418 2.157-2.418 1.21 0 2.166 1.094 2.157 2.418 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.418 0-1.333.955-2.418 2.157-2.418 1.21 0 2.166 1.094 2.157 2.418 0 1.333-.947 2.418-2.157 2.418Z" />
    </svg>
  );
}

function HeroBanner({
  theme,
  authLoading,
  isAuthenticated,
  selectedGuildName,
  selectedGuildId,
  centered = false,
  botAvatar = '',
  botName = 'KSJ Goliath',
  handleLogin,
  loginPending = false,
}) {
  const styles = useMemo(() => heroStyles(theme), [theme]);
  const [buttonHovered, setButtonHovered] = useState(false);
  const [buttonPressed, setButtonPressed] = useState(false);

  const title = authLoading
    ? 'Loading...'
    : isAuthenticated
      ? selectedGuildName || 'No guild selected'
      : 'Welcome to KSJ Goliath';

  const subtitle = authLoading
    ? 'Checking your session...'
    : isAuthenticated
      ? 'Manage your moderation tools, messages, warnings and embed settings from one clean dashboard.'
      : 'Sign in with Discord to access your server dashboard, moderation tools, and settings.';

  if (!isAuthenticated && !authLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: centered ? 'center' : 'flex-start',
          width: '100%',
          marginBottom: centered ? 0 : '24px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '720px',
            background:
              theme.mode === 'light'
                ? 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.98) 100%)'
                : 'linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(17,24,39,0.98) 100%)',
            border: `1px solid ${theme.cardBorder}`,
            borderRadius: '28px',
            boxShadow: theme.shadow,
            padding: '34px 28px 28px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(circle at top center, rgba(59,130,246,0.18), transparent 42%)',
              pointerEvents: 'none',
            }}
          />

          <div
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'grid',
              gap: '22px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
                textAlign: 'center',
              }}
            >
              {botAvatar ? (
                <img
                  src={botAvatar}
                  alt={botName}
                  style={{
                    width: '58px',
                    height: '58px',
                    borderRadius: '18px',
                    objectFit: 'cover',
                    boxShadow: '0 14px 30px rgba(37, 99, 235, 0.28)',
                    border: `1px solid ${theme.cardBorder}`,
                    display: 'block',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '58px',
                    height: '58px',
                    borderRadius: '18px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontWeight: 900,
                    fontSize: '24px',
                    boxShadow: '0 14px 30px rgba(37, 99, 235, 0.28)',
                  }}
                >
                  K
                </div>
              )}

              <div>
                <h1
                  style={{
                    margin: 0,
                    color: theme.cardText,
                    fontSize: 'clamp(30px, 4vw, 42px)',
                    lineHeight: 1.02,
                    fontWeight: 900,
                    letterSpacing: '-0.03em',
                  }}
                >
                  {title}
                </h1>

                <p
                  style={{
                    margin: '10px auto 0',
                    maxWidth: '560px',
                    color: theme.mutedText,
                    fontSize: '15px',
                    lineHeight: 1.7,
                  }}
                >
                  {subtitle}
                </p>
              </div>
            </div>

            <div
              style={{
                background:
                  theme.mode === 'light'
                    ? 'rgba(255,255,255,0.88)'
                    : 'rgba(255,255,255,0.035)',
                border: `1px solid ${theme.cardBorder}`,
                borderRadius: '22px',
                padding: '22px',
                display: 'grid',
                gap: '18px',
                maxWidth: '560px',
                width: '100%',
                margin: '0 auto',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: theme.cardText,
                    fontSize: '20px',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                  }}
                >
                  Login required
                </div>

                <div
                  style={{
                    marginTop: '6px',
                    color: theme.mutedText,
                    fontSize: '14px',
                    lineHeight: 1.6,
                  }}
                >
                  Continue with Discord to open your dashboard.
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (loginPending || typeof handleLogin !== 'function') return;
                  handleLogin();
                }}
                disabled={loginPending}
                onMouseEnter={() => setButtonHovered(true)}
                onMouseLeave={() => {
                  setButtonHovered(false);
                  setButtonPressed(false);
                }}
                onMouseDown={() => {
                  if (!loginPending) {
                    setButtonPressed(true);
                  }
                }}
                onMouseUp={() => setButtonPressed(false)}
                onBlur={() => {
                  setButtonHovered(false);
                  setButtonPressed(false);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  minHeight: '52px',
                  padding: '0 18px',
                  borderRadius: '16px',
                  border: 'none',
                  cursor: loginPending ? 'not-allowed' : 'pointer',
                  textDecoration: 'none',
                  background: loginPending
                    ? 'linear-gradient(135deg, #7c86f7 0%, #6f79ef 100%)'
                    : buttonHovered
                      ? 'linear-gradient(135deg, #4752c4 0%, #5865f2 100%)'
                      : 'linear-gradient(135deg, #5865f2 0%, #4752c4 100%)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '15px',
                  boxShadow: loginPending
                    ? '0 10px 24px rgba(88, 101, 242, 0.18)'
                    : buttonHovered
                      ? '0 16px 34px rgba(88, 101, 242, 0.32)'
                      : '0 12px 26px rgba(88, 101, 242, 0.24)',
                  transform:
                    loginPending
                      ? 'translateY(0)'
                      : buttonPressed
                        ? 'translateY(1px) scale(0.992)'
                        : 'translateY(0)',
                  transition:
                    'transform 0.14s ease, box-shadow 0.18s ease, filter 0.18s ease, background 0.18s ease, opacity 0.18s ease',
                  filter: loginPending ? 'none' : buttonHovered ? 'brightness(1.04)' : 'none',
                  opacity: loginPending ? 0.82 : 1,
                }}
              >
                <DiscordIcon />
                {loginPending ? 'Redirecting...' : 'Continue with Discord'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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

      {isAuthenticated ? <p style={styles.text}>{subtitle}</p> : null}
    </div>
  );
}

export default memo(HeroBanner);