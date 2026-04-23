import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import { getStorage, removeStorage, setStorage } from './storage';
import { getTheme, appBaseStyles, shellStyles, navItems } from './ui';
import Navbar from './components/Navbar';
import Topbar from './components/Topbar';
import AppRoutes from './routes';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const LOGIN_PATH = '/api/auth/login';
const LOGOUT_PATH = '/api/auth/logout';
const GUILD_STORAGE_KEY = 'selected_guild';

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

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [darkMode, setDarkMode] = useState(true);
  const [selectedGuild, setSelectedGuild] = useState(() =>
    getStorage(GUILD_STORAGE_KEY, '')
  );
  const [guilds, setGuilds] = useState([]);
  const [guildError, setGuildError] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loginPending, setLoginPending] = useState(false);

  const [botAvatar, setBotAvatar] = useState('');
  const [botName, setBotName] = useState('KSJ Goliath');

  const theme = useMemo(() => getTheme(darkMode), [darkMode]);
  const styles = shellStyles(theme, { sidebarExpanded: true });
  const isLoginPage = location.pathname === '/login';

  const selectedGuildData = useMemo(
    () => guilds.find((guild) => guild.id === selectedGuild) || null,
    [guilds, selectedGuild]
  );

  const loadBotStatus = useCallback(async () => {
    try {
      const status = await api.getStatus();
      const nextBotAvatar = status?.bot?.avatarUrl || '';
      const nextBotName = status?.bot?.name || status?.bot?.username || 'KSJ Goliath';

      setBotAvatar(nextBotAvatar);
      setBotName(nextBotName);
    } catch (error) {
      console.error('Failed to load bot status:', error);
      setBotAvatar('');
      setBotName('KSJ Goliath');
    }
  }, []);

  const loadGuilds = useCallback(async () => {
    try {
      setGuildError('');
      const guildResponse = await api.getGuilds();
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
        setIsAuthenticated(false);
        setCurrentUser(null);
        setGuilds([]);
        setSelectedGuild('');
        removeStorage(GUILD_STORAGE_KEY);
        return;
      }

      setIsAuthenticated(true);
      setCurrentUser(normalizeUser(authResponse));
      await loadGuilds();
    } catch (error) {
      console.error('Session check failed:', error);
      setIsAuthenticated(false);
      setCurrentUser(null);
      setGuilds([]);
      setSelectedGuild('');
      removeStorage(GUILD_STORAGE_KEY);
    } finally {
      setAuthLoading(false);
      setLoginPending(false);
    }
  }, [loadGuilds]);

  useEffect(() => {
    loadBotStatus();
    loadSession();
  }, [loadBotStatus, loadSession]);

  useEffect(() => {
    if (selectedGuild) {
      setStorage(GUILD_STORAGE_KEY, selectedGuild);
    } else {
      removeStorage(GUILD_STORAGE_KEY);
    }
  }, [selectedGuild]);

  useEffect(() => {
    if (authLoading) return;

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
    window.location.href = `${API_BASE}${LOGIN_PATH}`;
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      setAuthLoading(true);

      await fetch(`${API_BASE}${LOGOUT_PATH}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setGuilds([]);
      setSelectedGuild('');
      removeStorage(GUILD_STORAGE_KEY);
      setAuthLoading(false);
      navigate('/login', { replace: true });
    }
  }, [navigate]);

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
          <AppRoutes
            selectedGuild={selectedGuild}
            selectedGuildName={selectedGuildData?.name || ''}
            selectedGuildId={selectedGuildData?.id || ''}
            selectedGuildIcon={
              selectedGuildData?.iconUrl ||
              selectedGuildData?.iconURL ||
              selectedGuildData?.avatarUrl ||
              ''
            }
            theme={theme}
            authLoading={authLoading}
            isAuthenticated={isAuthenticated}
            handleLogin={handleLogin}
            loginPending={loginPending}
            botName={botName}
            botAvatar={botAvatar}
          />
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
            navItems={navItems}
            botName={botName}
            botAvatar={botAvatar}
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
              <AppRoutes
                selectedGuild={selectedGuild}
                selectedGuildName={selectedGuildData?.name || ''}
                selectedGuildId={selectedGuildData?.id || ''}
                selectedGuildIcon={
                  selectedGuildData?.iconUrl ||
                  selectedGuildData?.iconURL ||
                  selectedGuildData?.avatarUrl ||
                  ''
                }
                theme={theme}
                authLoading={authLoading}
                isAuthenticated={isAuthenticated}
                handleLogin={handleLogin}
                loginPending={loginPending}
                botName={botName}
                botAvatar={botAvatar}
              />
            </main>
          </div>
        </div>
      </div>
    </>
  );
}