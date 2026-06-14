import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../services/apiClient.js';
import { getStorage, removeStorage, setStorage } from '../storage.js';

const GUILD_STORAGE_KEY = 'selected_guild';

function normalizeGuildId(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && value.id) {
    return String(value.id);
  }

  return '';
}

function normalizeGuilds(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.guilds)) return payload.guilds;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export function useGuilds() {
  const [selectedGuild, setSelectedGuildState] = useState(() =>
    normalizeGuildId(getStorage(GUILD_STORAGE_KEY, ''))
  );

  const [guilds, setGuilds] = useState([]);
  const [guildError, setGuildError] = useState('');
  const [guildsLoading, setGuildsLoading] = useState(false);

  const setSelectedGuild = useCallback((value) => {
    setSelectedGuildState(normalizeGuildId(value));
  }, []);

  const clearGuilds = useCallback(() => {
    setGuilds([]);
    setSelectedGuildState('');
    setGuildError('');
    removeStorage(GUILD_STORAGE_KEY);
  }, []);

  const loadGuilds = useCallback(async ({ force = false } = {}) => {
    try {
      setGuildsLoading(true);
      setGuildError('');

      const guildResponse = await api.getGuilds({ force });
      const nextGuilds = normalizeGuilds(guildResponse);

      setGuilds(nextGuilds);

      setSelectedGuildState((currentValue) => {
        const currentGuildId = normalizeGuildId(currentValue);
        const storedGuildId = normalizeGuildId(getStorage(GUILD_STORAGE_KEY, ''));
        const preferredGuildId = currentGuildId || storedGuildId;

        const stillExists = nextGuilds.some(
          (guild) => String(guild.id) === String(preferredGuildId)
        );

        if (stillExists) {
          setStorage(GUILD_STORAGE_KEY, preferredGuildId);
          return preferredGuildId;
        }

        const fallbackGuildId = nextGuilds[0]?.id ? String(nextGuilds[0].id) : '';

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
      setSelectedGuildState('');
      removeStorage(GUILD_STORAGE_KEY);
    } finally {
      setGuildsLoading(false);
    }
  }, []);

  useEffect(() => {
    const safeGuildId = normalizeGuildId(selectedGuild);

    if (safeGuildId) {
      setStorage(GUILD_STORAGE_KEY, safeGuildId);
    } else {
      removeStorage(GUILD_STORAGE_KEY);
    }
  }, [selectedGuild]);

  const selectedGuildData = useMemo(
    () =>
      guilds.find((guild) => String(guild.id) === String(selectedGuild)) ||
      null,
    [guilds, selectedGuild]
  );

  return {
    guilds,
    guildError,
    guildsLoading,

    selectedGuild,
    setSelectedGuild,
    selectedGuildData,

    selectedGuildName: selectedGuildData?.name || '',
    selectedGuildId: selectedGuildData?.id || selectedGuild || '',
    selectedGuildIcon:
      selectedGuildData?.iconUrl ||
      selectedGuildData?.iconURL ||
      selectedGuildData?.avatarUrl ||
      '',

    loadGuilds,
    refreshGuilds: () => loadGuilds({ force: true }),
    clearGuilds,
  };
}