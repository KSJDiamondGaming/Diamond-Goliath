import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { getStorage, setStorage } from './storage';
import { getTheme, navItems } from './appConfig';
import { shellStyles } from './ui';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import HeroBanner from './components/HeroBanner';
import AppRoutes from './routes';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

function App() {
  const [selectedGuild, setSelectedGuild] = useState(() => getStorage('selectedGuild', ''));
  const [guilds, setGuilds] = useState([]);
  const [guildError, setGuildError] = useState('');
  const [darkMode, setDarkMode] = useState(() => getStorage('darkMode', true));
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [guildsLoading, setGuildsLoading] = useState(false);
  const [loginPending, setLoginPending] = useState(false);
  const loginStartedRef = useRef(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    getStorage('sidebarCollapsed', false)
  );

  const [botProfile, setBotProfile] = useState({
    name: 'KSJ Goliath',
    avatarUrl: '',
  });

  useEffect(() => {
    setStorage('selectedGuild', selectedGuild);
  }, [selectedGuild]);

  useEffect(() => {
    setStorage('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    setStorage('sidebarCollapsed', sidebarCollapsed);
  }, [sidebarCollapsed]);

  useEffect(() => {
    let isMounted = true;

    async function loadBotProfile() {
      try {
        const statusData = await api.getStatus();

        if (!isMounted || !statusData || typeof statusData !== 'object') return;

        const botData =
          statusData?.bot && typeof statusData.bot === 'object' ? statusData.bot : statusData;

        const avatarUrl =
          botData?.avatarUrl ||
          botData?.displayAvatarURL ||
          botData?.displayAvatarUrl ||
          botData?.image ||
          '';

        const name =
          botData?.name ||
          botData?.username ||
          botData?.displayName ||
          botData?.tag ||
          'KSJ Goliath';

        setBotProfile({
          name,
          avatarUrl,
        });
      } catch (error) {
        console.warn('Bot profile load failed:', error);
      }
    }

    loadBotProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      setAuthLoading(true);

      try {
        const authResponse = await fetch(`${API_BASE}/api/auth/me`, {
          credentials: 'include',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!isMounted) return;

        if (authResponse.status === 401) {
          setCurrentUser(null);
          setGuilds([]);
          setSelectedGuild('');
          setGuildError('');
          return;
        }

        if (!authResponse.ok) {
          console.warn('Auth check failed with status:', authResponse.status);
          setCurrentUser(null);
          setGuilds([]);
          setSelectedGuild('');
          setGuildError('');
          return;
        }

        const authData = await authResponse.json();
        setCurrentUser(authData?.user || null);
      } catch (err) {
        if (!isMounted) return;
        console.warn('Auth check failed:', err);
        setCurrentUser(null);
        setGuilds([]);
        setSelectedGuild('');
        setGuildError('');
      } finally {
        if (isMounted) {
          setAuthLoading(false);
        }
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    function applyGuildSelection(nextGuilds) {
      if (!isMounted) return;

      const safeGuilds = Array.isArray(nextGuilds) ? nextGuilds : [];
      setGuilds(safeGuilds);
      setGuildError('');

      if (safeGuilds.length === 0) {
        setSelectedGuild('');
        return;
      }

      const savedGuild = getStorage('selectedGuild', '');
      const guildStillExists = safeGuilds.some((guild) => guild.id === savedGuild);

      setSelectedGuild((current) => {
        if (current && safeGuilds.some((guild) => guild.id === current)) {
          return current;
        }

        if (savedGuild && guildStillExists) {
          return savedGuild;
        }

        return safeGuilds[0]?.id || '';
      });
    }

    async function loadGuilds() {
      if (!currentUser) {
        setGuilds([]);
        setSelectedGuild('');
        setGuildError('');
        setGuildsLoading(false);
        return;
      }

      setGuildsLoading(true);

      try {
        const guildList = await api.getGuilds();

        if (!isMounted) return;

        if (!Array.isArray(guildList)) {
          console.warn('Guild response was not an array:', guildList);
          setGuilds([]);
          setSelectedGuild('');
          setGuildError('Guild endpoint did not return valid JSON.');
          return;
        }

        applyGuildSelection(guildList);
      } catch (err) {
        if (!isMounted) return;

        console.error('Failed to load guilds:', err);
        setGuilds([]);
        setSelectedGuild('');

        if (String(err?.message || '').includes('(401)')) {
          setGuildError('');
          return;
        }

        setGuildError(err?.message || 'Could not load guild list.');
      } finally {
        if (isMounted) {
          setGuildsLoading(false);
        }
      }
    }

    loadGuilds();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const selectedGuildData = useMemo(
    () => guilds.find((guild) => guild.id === selectedGuild) || null,
    [guilds, selectedGuild]
  );

  const theme = useMemo(() => getTheme(darkMode), [darkMode]);
  const sidebarExpanded = !sidebarCollapsed;

  const styles = useMemo(
    () =>
      shellStyles(theme, {
        sidebarExpanded,
      }),
    [theme, sidebarExpanded]
  );

  const pageProps = useMemo(
    () => ({
      selectedGuild,
      darkMode,
      theme,
    }),
    [selectedGuild, darkMode, theme]
  );

  const topbarUserName = useMemo(() => {
    if (authLoading) return 'Loading...';

    return (
      currentUser?.global_name ||
      currentUser?.globalName ||
      currentUser?.displayName ||
      currentUser?.username ||
      currentUser?.name ||
      'Not signed in'
    );
  }, [currentUser, authLoading]);

  const currentUserAvatar = useMemo(() => {
    if (!currentUser) return null;

    if (currentUser?.avatarUrl || currentUser?.image) {
      return currentUser.avatarUrl || currentUser.image;
    }

    if (currentUser?.id && currentUser?.avatar) {
      return `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png?size=128`;
    }

    return null;
  }, [currentUser]);

  const isAuthenticated = Boolean(currentUser);

  const handleLogin = useCallback(() => {
    if (loginStartedRef.current) return;

    loginStartedRef.current = true;
    setLoginPending(true);
    window.location.href = `${API_BASE}/api/auth/login`;
  }, []);

  const handleLogout = useCallback(async () => {
    setCurrentUser(null);
    setGuilds([]);
    setSelectedGuild('');
    setGuildError('');

    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });
    } catch (error) {
      console.error('Logout failed:', error);
    }

    window.location.assign('/');
  }, []);

  const handleSidebarToggle = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const pageLoader = <div style={styles.card}>Loading page...</div>;
  const visibleNavItems = isAuthenticated ? navItems : [];
  const visibleGuildError = isAuthenticated ? guildError : '';

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        html, body, #root {
          margin: 0;
          padding: 0;
          min-height: 100%;
          width: 100%;
          background: ${theme.pageBg};
          overflow-x: hidden;
        }
        button, select, input, textarea { font: inherit; }
        h1, h2, h3, h4, h5, h6, p { margin: 0; }
        .ksj-shell { min-height: 100vh; }
      `}</style>

      <div className="ksj-shell" style={styles.app}>
        <div style={styles.grid}>
          <Sidebar
            theme={theme}
            selectedGuild={selectedGuild}
            setSelectedGuild={setSelectedGuild}
            guilds={isAuthenticated ? guilds : []}
            guildError={visibleGuildError}
            isAuthenticated={isAuthenticated}
            authLoading={authLoading}
            navItems={visibleNavItems}
            botAvatar={botProfile.avatarUrl}
            botName={botProfile.name}
            expanded={sidebarExpanded}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={handleSidebarToggle}
          />

          <div style={styles.mainColumn}>
            <Topbar
              theme={theme}
              authLoading={authLoading}
              isAuthenticated={isAuthenticated}
              handleLogin={handleLogin}
              handleLogout={handleLogout}
              topbarUserName={topbarUserName}
              currentUserAvatar={currentUserAvatar}
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              loginPending={loginPending}
            />

            <main style={styles.main}>
              <HeroBanner
                theme={theme}
                authLoading={authLoading}
                isAuthenticated={isAuthenticated}
                selectedGuildName={selectedGuildData?.name || ''}
                selectedGuildId={selectedGuildData?.id || ''}
                handleLogin={handleLogin}
                botAvatar={botProfile.avatarUrl}
                botName={botProfile.name}
                loginPending={loginPending}
              />

              {authLoading ? (
                <div style={styles.card}>Checking your session...</div>
              ) : !isAuthenticated ? null : guildsLoading ? (
                <div style={styles.card}>Loading your guild data...</div>
              ) : selectedGuild ? (
                <Suspense fallback={pageLoader}>
                  <AppRoutes pageProps={pageProps} />
                </Suspense>
              ) : (
                <div style={styles.card}>No guilds available for this dashboard.</div>
              )}
            </main>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;