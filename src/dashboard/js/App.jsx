import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { appBaseStyles, shellStyles } from './ui/components.js';
import { getTheme } from './ui/theme.js';
import { api } from './services/apiClient.js';
import { navItems, ROUTES } from './ui/layout.js';

import { useNavbar } from './hooks/useNavbar.js';
import { useBotStatus } from './hooks/useBotStatus.js';
import { useGuilds } from './hooks/useGuilds.js';
import { useAuthSession } from './hooks/useAuthSession.js';

import Navbar from './shared/Navbar.jsx';
import OwnerSidebar from './pages/owner/components/OwnerSidebar.jsx';
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
  'forms',
  'modules',
  'logs',
  'admin',
  'moderation',
]);

function normalizeOwnerGuilds(payload) {
  const guilds = Array.isArray(payload?.guilds) ? payload.guilds : [];

  return guilds.map((guild, index) => {
    const environment = String(guild.environment || guild.runtimeMode || '').toUpperCase();
    const guildId = String(guild.guildId || guild.id || index);
    const guildName = guild.name || guild.guildName || 'Unknown Guild';
    const environmentLabel = environment === 'PRODUCTION' ? 'PROD' : environment || 'ENV';

    return {
      ...guild,
      id: environment + ':' + guildId,
      guildId,
      rawName: guildName,
      name: environmentLabel + ' - ' + guildName,
      environment,
      iconUrl: guild.iconUrl || guild.iconURL || guild.icon || '',
    };
  });
}

function useIsMobile(breakpoint = 1024) {
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
        minHeight: 'calc(100dvh - 180px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(16px, 3vw, 24px)',
      }}
    >
      <div
        style={{
          width: 'min(520px, 100%)',
          border: `1px solid ${theme.cardBorder}`,
          background: theme.cardBg,
          color: theme.cardText,
          borderRadius: 24,
          padding: 'clamp(20px, 4vw, 28px)',
          textAlign: 'center',
          boxShadow: theme.shadow,
        }}
      >
        <h2 style={{ margin: '0 0 10px', fontSize: 'clamp(20px, 4vw, 24px)' }}>
          {title}
        </h2>
        <p style={{ margin: 0, color: theme.mutedText, lineHeight: 1.6 }}>{text}</p>
      </div>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [darkMode, setDarkMode] = useState(true);
  const isMobile = useIsMobile(1024);

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

  const isOwner = authState.currentUser?.isOwner === true;
  const isOwnerRoute = location.pathname.toLowerCase().startsWith('/owner');

  const [ownerGuilds, setOwnerGuilds] = useState([]);
  const [ownerGuildError, setOwnerGuildError] = useState('');
  const [ownerGuildsLoading, setOwnerGuildsLoading] = useState(false);
  const [selectedOwnerGuild, setSelectedOwnerGuild] = useState('');

  useEffect(() => {
    if (!isOwnerRoute || !isOwner || !authState.isAuthenticated) return undefined;

    let cancelled = false;

    async function loadOwnerGuilds() {
      try {
        setOwnerGuildsLoading(true);
        setOwnerGuildError('');

        const payload = await api.getOwnerGuilds();
        console.log('[Owner Guilds Payload]', payload);
        const nextGuilds = normalizeOwnerGuilds(payload);

        if (cancelled) return;

        setOwnerGuilds(nextGuilds);
        setSelectedOwnerGuild((currentValue) => {
          const stillExists = nextGuilds.some((guild) => guild.id === currentValue);
          return stillExists ? currentValue : nextGuilds[0]?.id || '';
        });
      } catch (error) {
        if (!cancelled) {
          setOwnerGuilds([]);
          setSelectedOwnerGuild('');
          setOwnerGuildError(error.message || 'Could not load owner guilds.');
        }
      } finally {
        if (!cancelled) {
          setOwnerGuildsLoading(false);
        }
      }
    }

    loadOwnerGuilds();

    return () => {
      cancelled = true;
    };
  }, [authState.isAuthenticated, isOwner, isOwnerRoute]);

  const navbarGuilds = isOwnerRoute && isOwner ? ownerGuilds : guildState.guilds;
  const navbarSelectedGuild = isOwnerRoute && isOwner ? selectedOwnerGuild : guildState.selectedGuild;
  const setNavbarSelectedGuild = isOwnerRoute && isOwner ? setSelectedOwnerGuild : guildState.setSelectedGuild;
  const navbarGuildError = isOwnerRoute && isOwner ? ownerGuildError : guildState.guildError;
  const navbarGuildsLoading = isOwnerRoute && isOwner ? ownerGuildsLoading : guildState.guildsLoading;

  const styles = useMemo(
    () => shellStyles(theme, { navbarExpanded }),
    [theme, navbarExpanded],
  );

  const responsiveStyles = useMemo(() => {
    const desktopGrid = styles.grid || {};
    const desktopMainColumn = styles.mainColumn || {};
    const desktopMain = styles.main || {};

    return {
      app: {
        ...styles.app,
        minHeight: '100dvh',
        width: '100%',
        maxWidth: '100%',
        overflowX: 'hidden',
      },

      grid: isMobile
        ? {
            display: 'block',
            minHeight: '100dvh',
            width: '100%',
            maxWidth: '100%',
            overflowX: 'hidden',
          }
        : {
            ...desktopGrid,
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            overflowX: 'hidden',
          },

      mainColumn: isMobile
        ? {
            minHeight: '100dvh',
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            overflowX: 'hidden',
          }
        : {
            ...desktopMainColumn,
            minWidth: 0,
            maxWidth: '100%',
            overflowX: 'hidden',
          },

      main: {
        ...desktopMain,
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        overflowX: 'hidden',
        padding: isMobile
          ? '78px clamp(12px, 4vw, 18px) clamp(18px, 4vw, 28px)'
          : desktopMain.padding,
      },
    };
  }, [styles, isMobile]);

  const isLoginPage = location.pathname === '/login';

  const activeRoute = useMemo(
    () => getRouteForPath(location.pathname),
    [location.pathname],
  );

  const ActivePage = activeRoute?.component || null;

  const routeNeedsGuild = Boolean(
    activeRoute?.key && GUILD_REQUIRED_ROUTES.has(activeRoute.key),
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
      return;
    }

    if (authState.isAuthenticated && activeRoute?.ownerOnly && !isOwner) {
      navigate('/overview', { replace: true });
    }
  }, [
    activeRoute,
    authState.authLoading,
    authState.isAuthenticated,
    isOwner,
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

    currentUser: authState.currentUser,
    isOwner,

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
            minHeight: '100dvh',
            background: theme.pageBg,
            color: theme.cardText,
            padding: 'clamp(16px, 4vw, 24px)',
            overflowX: 'hidden',
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

      <div style={responsiveStyles.app}>
        <div style={responsiveStyles.grid}>
          {isOwnerRoute && isOwner ? (
            <OwnerSidebar
              theme={theme}
              botName={botState.botName}
              botAvatar={botState.botAvatar}
              guilds={navbarGuilds}
              selectedGuild={navbarSelectedGuild}
              setSelectedGuild={setNavbarSelectedGuild}
            />
          ) : (
          <Navbar
            theme={theme}
            selectedGuild={navbarSelectedGuild}
            setSelectedGuild={setNavbarSelectedGuild}
            guilds={navbarGuilds}
            guildError={navbarGuildError}
            isAuthenticated={authState.isAuthenticated}
            authLoading={authState.authLoading}
            guildsLoading={navbarGuildsLoading}
            navItems={navItems}
            botName={botState.botName}
            botAvatar={botState.botAvatar}
              botData={botState.botData}
            expanded={navbarExpanded}
            onToggleCollapsed={toggleNavbar}
          />
          )}

          <div style={responsiveStyles.mainColumn}>
            <Topbar
              theme={theme}
              authLoading={authState.authLoading}
              isAuthenticated={authState.isAuthenticated}
              handleLogin={authState.handleLogin}
              handleLogout={handleLogout}
              topbarUserName={authState.currentUserName}
              currentUser={authState.currentUser}
              currentUserAvatar={authState.currentUserAvatar}
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              loginPending={authState.loginPending}
            />

            <main style={responsiveStyles.main}>
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
              ) : activeRoute?.ownerOnly && !isOwner ? (
                <CenterMessage
                  theme={theme}
                  title="Owner access required"
                  text="This dashboard view is restricted to KSJ owner accounts."
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










