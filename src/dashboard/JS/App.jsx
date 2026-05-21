import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { appBaseStyles, shellStyles } from './ui/components.js';
import { getTheme } from './ui/theme.js';
import { navItems, ROUTES } from './ui/layout.js';

import { useNavbar } from './hooks/useNavbar.js';
import { useBotStatus } from './hooks/useBotStatus.js';
import { useGuilds } from './hooks/useGuilds.js';
import { useAuthSession } from './hooks/useAuthSession.js';

import Navbar from './shared/Navbar.jsx';
import Topbar from './shared/Topbar.jsx';
import Login from './pages/Login.jsx';

const ROUTE_PATHS = ROUTES.map((routeItem) => routeItem.path);

const GUILD_REQUIRED_ROUTES = new Set([
  'overview',
  'cases',
  'warnings',
  'automod',
  'generalSettings',
  'messages',
  'logs',
  'admin',
  'moderation',
]);

function getRouteForPath(pathname) {
  return ROUTES.find((routeItem) => routeItem.path === pathname) || null;
}

function isKnownPath(pathname) {
  return pathname === '/' || pathname === '/login' || ROUTE_PATHS.includes(pathname);
}

function CenterMessage({ theme, title, text }) {
  return (
    <div
      style={{
        minHeight: 'calc(100vh - 180px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(520px, 100%)',
          border: `1px solid ${theme.cardBorder}`,
          background: theme.cardBg,
          color: theme.cardText,
          borderRadius: 24,
          padding: 28,
          textAlign: 'center',
          boxShadow: theme.shadow,
        }}
      >
        <h2 style={{ margin: '0 0 10px', fontSize: 24 }}>{title}</h2>
        <p style={{ margin: 0, color: theme.mutedText, lineHeight: 1.6 }}>{text}</p>
      </div>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [darkMode, setDarkMode] = useState(true);

  const theme = useMemo(() => getTheme(darkMode), [darkMode]);

  const { navbarExpanded, toggleNavbar } = useNavbar();

  const guildState = useGuilds();

  const botState = useBotStatus();

  const authState = useAuthSession({
    loadGuilds: guildState.loadGuilds,
    loadBotStatus: botState.refreshBotStatus,
    applyBotProfile: botState.applyBotProfile,
    clearGuilds: guildState.clearGuilds,
  });

  const styles = useMemo(
    () => shellStyles(theme, { sidebarExpanded: navbarExpanded }),
    [theme, navbarExpanded]
  );

  const isLoginPage = location.pathname === '/login';

  const activeRoute = useMemo(
    () => getRouteForPath(location.pathname),
    [location.pathname]
  );

  const ActivePage = activeRoute?.component || null;

  const routeNeedsGuild = Boolean(
    activeRoute?.key && GUILD_REQUIRED_ROUTES.has(activeRoute.key)
  );

  useEffect(() => {
    if (authState.authLoading) return;

    if (!isKnownPath(location.pathname)) {
      navigate(authState.isAuthenticated ? '/overview' : '/login', { replace: true });
      return;
    }

    if (location.pathname === '/') {
      navigate(authState.isAuthenticated ? '/overview' : '/login', { replace: true });
      return;
    }

    if (!authState.isAuthenticated && location.pathname !== '/login') {
      navigate('/login', { replace: true });
      return;
    }

    if (authState.isAuthenticated && location.pathname === '/login') {
      navigate('/overview', { replace: true });
    }
  }, [
    authState.authLoading,
    authState.isAuthenticated,
    location.pathname,
    navigate,
  ]);

  const handleLogout = async () => {
    await authState.handleLogout();
    navigate('/login', { replace: true });
  };

  const pageProps = {
    selectedGuild: guildState.selectedGuild,
    selectedGuildName: guildState.selectedGuildName,
    selectedGuildId: guildState.selectedGuildId,
    selectedGuildIcon: guildState.selectedGuildIcon,
    selectedGuildData: guildState.selectedGuildData,

    guilds: guildState.guilds,
    guildsLoading: guildState.guildsLoading,
    guildError: guildState.guildError,

    theme,

    authLoading: authState.authLoading,
    isAuthenticated: authState.isAuthenticated,
    handleLogin: authState.handleLogin,
    loginPending: authState.loginPending,

    botName: botState.botName,
    botAvatar: botState.botAvatar,
    botData: botState.botData,

    refreshGuilds: guildState.refreshGuilds,
    refreshBotStatus: botState.refreshBotStatus,
  };

  if (isLoginPage) {
    return (
      <>
        <style>{appBaseStyles(theme).globalCss}</style>

        <div
          style={{
            minHeight: '100vh',
            background: theme.pageBg,
            color: theme.cardText,
            padding: 24,
          }}
        >
          <Login {...pageProps} />
        </div>
      </>
    );
  }

  return (
    <>
      <style>{appBaseStyles(theme).globalCss}</style>

      <div style={styles.app}>
        <div style={styles.grid}>
          <Navbar
            theme={theme}
            selectedGuild={guildState.selectedGuild}
            setSelectedGuild={guildState.setSelectedGuild}
            guilds={guildState.guilds}
            guildError={guildState.guildError}
            isAuthenticated={authState.isAuthenticated}
            authLoading={authState.authLoading}
            guildsLoading={guildState.guildsLoading}
            navItems={navItems}
            botName={botState.botName}
            botAvatar={botState.botAvatar}
            botData={botState.botData}
            expanded={navbarExpanded}
            onToggleCollapsed={toggleNavbar}
          />

          <div style={styles.mainColumn}>
            <Topbar
              theme={theme}
              authLoading={authState.authLoading}
              isAuthenticated={authState.isAuthenticated}
              handleLogin={authState.handleLogin}
              handleLogout={handleLogout}
              topbarUserName={authState.currentUserName}
              currentUserAvatar={authState.currentUserAvatar}
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              loginPending={authState.loginPending}
            />

            <main style={styles.main}>
              {authState.authLoading ? (
                <CenterMessage
                  theme={theme}
                  title="Loading dashboard..."
                  text="Checking your Discord session and preparing your server tools."
                />
              ) : !authState.isAuthenticated ? (
                <CenterMessage
                  theme={theme}
                  title="Not signed in"
                  text="Please login with Discord to access your dashboard."
                />
              ) : guildState.guildsLoading && guildState.guilds.length === 0 ? (
                <CenterMessage
                  theme={theme}
                  title="Loading servers..."
                  text="Fetching the Discord servers shared with Goliath."
                />
              ) : routeNeedsGuild &&
                !guildState.guildsLoading &&
                !guildState.selectedGuild ? (
                <CenterMessage
                  theme={theme}
                  title="No server selected"
                  text="Select a server from the navbar to continue."
                />
              ) : ActivePage ? (
                <ActivePage {...pageProps} />
              ) : (
                <CenterMessage
                  theme={theme}
                  title="Page not found"
                  text="That dashboard page does not exist."
                />
              )}
            </main>
          </div>
        </div>
      </div>
    </>
  );
}