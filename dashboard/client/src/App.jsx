import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import { getStorage, removeStorage, setStorage } from './storage';
import { getTheme, appBaseStyles, shellStyles, navItems, ROUTES } from './ui';
import Navbar from './components/Navbar';
import Topbar from './components/Topbar';
import Cases from './pages/Cases';
import Warnings from './pages/Warnings';
import AutoMod from './pages/AutoMod';
import Config from './pages/Config';
import Messages from './pages/Messages';
import Logs from './pages/Logs';
import Overview from './pages/Overview';
import Login from './pages/Login';

const GUILD_STORAGE_KEY = 'selected_guild';
const BOT_PROFILE_STORAGE_KEY = 'bot_profile';
const SIDEBAR_EXPANDED_STORAGE_KEY = 'sidebar_expanded';

const PAGE_COMPONENTS = {
  overview: Overview,
  cases: Cases,
  warnings: Warnings,
  automod: AutoMod,
  config: Config,
  messages: Messages,
  logs: Logs,
};

const ROUTE_PATHS = ROUTES.map((routeItem) => routeItem.path);
const GUILD_REQUIRED_ROUTES = new Set([
  'overview',
  'cases',
  'warnings',
  'automod',
  'config',
  'messages',
  'logs',
]);

function normalizeGuilds(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.guilds)) return payload.guilds;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeUser(payload) {
  return payload?.user || payload?.me || payload?.data?.user || payload?.data || null;
}

function getAvatarUrl(user) {
  if (!user) return '';

  if (user.avatarUrl) return user.avatarUrl;
  if (user.avatarURL) return user.avatarURL;

  if (typeof user.avatar === 'string' && user.id) {
    const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
  }

  return user.image || user.profileImage || '';
}

function getDisplayName(user) {
  return (
    user?.global_name ||
    user?.globalName ||
    user?.displayName ||
    user?.username ||
    user?.name ||
    'User'
  );
}

function buildDiscordAvatarUrl(entity) {
  if (!entity) return '';

  if (entity.avatarUrl) return entity.avatarUrl;
  if (entity.avatarURL) return entity.avatarURL;
  if (entity.image) return entity.image;
  if (entity.profileImage) return entity.profileImage;

  const id = entity.id || entity.botId || '';
  const avatar = entity.avatar || entity.avatarHash || '';

  if (!id || !avatar || typeof avatar !== 'string') return '';

  const ext = avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=256`;
}

function normalizeBotProfile(payload) {
  const bot = payload?.bot || payload?.data?.bot || payload?.botData || payload || null;

  if (!bot || typeof bot !== 'object') {
    return {
      name: 'KSJ Goliath',
      avatar: '',
      raw: null,
    };
  }

  const name =
    bot.name ||
    bot.username ||
    bot.displayName ||
    bot.global_name ||
    bot.globalName ||
    'KSJ Goliath';

  const avatar = bot.avatarUrl || bot.avatarURL || buildDiscordAvatarUrl(bot) || '';

  return {
    name,
    avatar,
    raw: bot,
  };
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
          border: `1px solid ${theme.border}`,
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
  const sessionLoadedRef = useRef(false);
  const botStatusLoadedRef = useRef(false);

  const [darkMode, setDarkMode] = useState(true);
  const [sidebarExpanded, setSidebarExpanded] = useState(() =>
    getStorage(SIDEBAR_EXPANDED_STORAGE_KEY, true)
  );
  const [selectedGuild, setSelectedGuild] = useState(() =>
    getStorage(GUILD_STORAGE_KEY, '')
  );
  const [guilds, setGuilds] = useState([]);
  const [guildError, setGuildError] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [guildsLoading, setGuildsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loginPending, setLoginPending] = useState(false);

  const cachedBotProfile = useMemo(
    () =>
      getStorage(BOT_PROFILE_STORAGE_KEY, {
        name: 'KSJ Goliath',
        avatar: '',
        raw: null,
      }),
    []
  );

  const [botAvatar, setBotAvatar] = useState(cachedBotProfile?.avatar || '');
  const [botName, setBotName] = useState(cachedBotProfile?.name || 'KSJ Goliath');
  const [botData, setBotData] = useState(cachedBotProfile?.raw || null);

  const theme = useMemo(() => getTheme(darkMode), [darkMode]);
  const styles = shellStyles(theme, { sidebarExpanded });
  const isLoginPage = location.pathname === '/login';

  const selectedGuildData = useMemo(
    () => guilds.find((guild) => guild.id === selectedGuild) || null,
    [guilds, selectedGuild]
  );

  const clearAuthState = useCallback(() => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setGuilds([]);
    setSelectedGuild('');
    removeStorage(GUILD_STORAGE_KEY);
  }, []);

  const applyBotProfile = useCallback((profile) => {
    const safeProfile = {
      name: profile?.name || 'KSJ Goliath',
      avatar: profile?.avatar || '',
      raw: profile?.raw || null,
    };

    setBotName(safeProfile.name);
    setBotAvatar(safeProfile.avatar);
    setBotData(safeProfile.raw);
    setStorage(BOT_PROFILE_STORAGE_KEY, safeProfile);
  }, []);

  const loadBotStatus = useCallback(async ({ force = false } = {}) => {
    try {
      const status = await api.getStatus(undefined, { force });
      const nextProfile = normalizeBotProfile(status?.bot || status);

      applyBotProfile(nextProfile);
      return nextProfile;
    } catch (error) {
      console.error('Failed to load bot status:', error);
      return null;
    }
  }, [applyBotProfile]);

  const loadGuilds = useCallback(async ({ force = false } = {}) => {
    try {
      setGuildsLoading(true);
      setGuildError('');

      const guildResponse = await api.getGuilds({ force });
      const nextGuilds = normalizeGuilds(guildResponse);

      setGuilds(nextGuilds);

      setSelectedGuild((currentGuildId) => {
        const storedGuildId = currentGuildId || getStorage(GUILD_STORAGE_KEY, '');
        const storedGuildStillExists = nextGuilds.some(
          (guild) => guild.id === storedGuildId
        );

        if (storedGuildStillExists) return storedGuildId;

        const fallbackGuildId = nextGuilds[0]?.id || '';

        if (fallbackGuildId) {
          setStorage(GUILD_STORAGE_KEY, fallbackGuildId);
        } else {
          removeStorage(GUILD_STORAGE_KEY);
        }

        return fallbackGuildId;
      });
    } catch (error) {
      console.error('Failed to load guilds:', error);
      setGuilds([]);
      setGuildError('Could not load guilds.');
      setSelectedGuild('');
      removeStorage(GUILD_STORAGE_KEY);
    } finally {
      setGuildsLoading(false);
    }
  }, []);

  const loadSession = useCallback(async () => {
    try {
      setAuthLoading(true);
      setGuildError('');

      const authResponse = await api.getAuthMe();

      const authenticated = Boolean(
        authResponse?.authenticated ??
          authResponse?.isAuthenticated ??
          authResponse?.user
      );

      if (!authenticated) {
        clearAuthState();
        return;
      }

      setIsAuthenticated(true);
      setCurrentUser(normalizeUser(authResponse));

      const authBotProfile = normalizeBotProfile(
        authResponse?.bot || authResponse?.client || authResponse?.application
      );

      if (authBotProfile.avatar || authBotProfile.raw || authBotProfile.name !== 'KSJ Goliath') {
        applyBotProfile(authBotProfile);
      }

      await Promise.all([loadGuilds(), loadBotStatus()]);
    } catch (error) {
      console.error('Session check failed:', error);
      clearAuthState();
    } finally {
      setAuthLoading(false);
      setLoginPending(false);
    }
  }, [applyBotProfile, clearAuthState, loadBotStatus, loadGuilds]);

  useEffect(() => {
    if (botStatusLoadedRef.current) return;

    botStatusLoadedRef.current = true;
    loadBotStatus();
  }, [loadBotStatus]);

  useEffect(() => {
    if (sessionLoadedRef.current) return;

    sessionLoadedRef.current = true;
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!botAvatar && !botData) {
      loadBotStatus();
    }
  }, [botAvatar, botData, loadBotStatus]);

  useEffect(() => {
    if (selectedGuild) {
      setStorage(GUILD_STORAGE_KEY, selectedGuild);
    } else {
      removeStorage(GUILD_STORAGE_KEY);
    }
  }, [selectedGuild]);

  useEffect(() => {
    setStorage(SIDEBAR_EXPANDED_STORAGE_KEY, sidebarExpanded);
  }, [sidebarExpanded]);

  useEffect(() => {
    if (authLoading) return;

    if (!isKnownPath(location.pathname)) {
      navigate(isAuthenticated ? '/overview' : '/login', { replace: true });
      return;
    }

    if (location.pathname === '/') {
      navigate(isAuthenticated ? '/overview' : '/login', { replace: true });
      return;
    }

    if (!isAuthenticated && location.pathname !== '/login') {
      navigate('/login', { replace: true });
      return;
    }

    if (isAuthenticated && location.pathname === '/login') {
      navigate('/overview', { replace: true });
    }
  }, [authLoading, isAuthenticated, location.pathname, navigate]);

  const handleLogin = useCallback(() => {
    setLoginPending(true);
    window.location.href = api.getLoginUrl();
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      setAuthLoading(true);
      await api.logout();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      clearAuthState();
      setAuthLoading(false);
      navigate('/login', { replace: true });
    }
  }, [clearAuthState, navigate]);

  const pageProps = {
    selectedGuild,
    selectedGuildName: selectedGuildData?.name || '',
    selectedGuildId: selectedGuildData?.id || '',
    selectedGuildIcon:
      selectedGuildData?.iconUrl ||
      selectedGuildData?.iconURL ||
      selectedGuildData?.avatarUrl ||
      '',
    selectedGuildData,
    guilds,
    guildsLoading,
    guildError,
    theme,
    authLoading,
    isAuthenticated,
    handleLogin,
    loginPending,
    botName,
    botAvatar,
    botData,
    refreshGuilds: () => loadGuilds({ force: true }),
    refreshBotStatus: () => loadBotStatus({ force: true }),
  };

  const activeRoute = getRouteForPath(location.pathname);
  const ActivePage = activeRoute?.component || PAGE_COMPONENTS[activeRoute?.key] || null;
  const routeNeedsGuild = Boolean(activeRoute?.key && GUILD_REQUIRED_ROUTES.has(activeRoute.key));

  if (isLoginPage) {
    return (
      <>
        <style>{appBaseStyles(theme).globalCss}</style>

        <div
          style={{
            minHeight: '100vh',
            background: theme.pageBg,
            color: theme.cardText,
            padding: '24px',
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
            selectedGuild={selectedGuild}
            setSelectedGuild={setSelectedGuild}
            guilds={guilds}
            guildError={guildError}
            isAuthenticated={isAuthenticated}
            authLoading={authLoading}
            guildsLoading={guildsLoading}
            navItems={navItems}
            botName={botName}
            botAvatar={botAvatar}
            botData={botData}
            sidebarExpanded={sidebarExpanded}
            setSidebarExpanded={setSidebarExpanded}
          />

          <div style={styles.mainColumn}>
            <Topbar
              theme={theme}
              authLoading={authLoading}
              isAuthenticated={isAuthenticated}
              handleLogin={handleLogin}
              handleLogout={handleLogout}
              topbarUserName={getDisplayName(currentUser)}
              currentUserAvatar={getAvatarUrl(currentUser)}
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              loginPending={loginPending}
            />

            <main style={styles.main}>
              {authLoading ? (
                <CenterMessage
                  theme={theme}
                  title="Loading dashboard..."
                  text="Checking your Discord session and preparing your server tools."
                />
              ) : !isAuthenticated ? (
                <CenterMessage
                  theme={theme}
                  title="Not signed in"
                  text="Please login with Discord to access your dashboard."
                />
              ) : guildsLoading && guilds.length === 0 ? (
                <CenterMessage
                  theme={theme}
                  title="Loading servers..."
                  text="Fetching the Discord servers shared with KSJ Goliath."
                />
              ) : routeNeedsGuild && !selectedGuild ? (
                <CenterMessage
                  theme={theme}
                  title="No server selected"
                  text="Select a server from the sidebar to continue."
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