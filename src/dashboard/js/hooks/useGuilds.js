import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../services/apiClient.js';
import { getStorage, removeStorage, setStorage } from '../storage.js';

const GUILD_STORAGE_KEY = 'selected_guild';
const OWNER_MANAGED_GUILD_KEY = 'owner_managed_guild';

function normalizeGuildId(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    return value.split(':').pop();
  }

  if (typeof value === 'object' && value.guildId) {
    return String(value.guildId).split(':').pop();
  }

  if (typeof value === 'object' && value.id) {
    return String(value.id).split(':').pop();
  }

  return '';
}

function normalizeGuilds(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.guilds)) return payload.guilds;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function getOwnerManagedGuildId() {
  const ownerManagedGuild = getStorage(OWNER_MANAGED_GUILD_KEY, null);
  return normalizeGuildId(ownerManagedGuild);
}

export function useGuilds() {
  const [selectedGuild, setSelectedGuildState] = useState(() => {
    const ownerManagedGuildId = getOwnerManagedGuildId();

    if (ownerManagedGuildId) {
      setStorage(GUILD_STORAGE_KEY, ownerManagedGuildId);
      return ownerManagedGuildId;
    }

    return normalizeGuildId(getStorage(GUILD_STORAGE_KEY, ''));
  });

  const [guilds, setGuilds] = useState([]);
  const [guildError, setGuildError] = useState('');
  const [guildsLoading, setGuildsLoading] = useState(false);

  const setSelectedGuild = useCallback((value) => {
    const ownerManagedGuildId = getOwnerManagedGuildId();

    if (ownerManagedGuildId) {
      setSelectedGuildState(ownerManagedGuildId);
      setStorage(GUILD_STORAGE_KEY, ownerManagedGuildId);
      return;
    }

    const guildId = normalizeGuildId(value);

    setSelectedGuildState(guildId);

    if (guildId) {
      setStorage(GUILD_STORAGE_KEY, guildId);
    } else {
      removeStorage(GUILD_STORAGE_KEY);
    }
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
        const ownerManagedGuildId = getOwnerManagedGuildId();

        if (ownerManagedGuildId) {
          setStorage(GUILD_STORAGE_KEY, ownerManagedGuildId);
          return ownerManagedGuildId;
        }

        const currentGuildId = normalizeGuildId(currentValue);
        const storedGuildId = normalizeGuildId(getStorage(GUILD_STORAGE_KEY, ''));
        const preferredGuildId = currentGuildId || storedGuildId;

        const stillExists = nextGuilds.some(
          (guild) => normalizeGuildId(guild) === preferredGuildId,
        );

        if (stillExists) {
          setStorage(GUILD_STORAGE_KEY, preferredGuildId);
          return preferredGuildId;
        }

        const fallbackGuildId = normalizeGuildId(nextGuilds[0]);

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

      const ownerManagedGuildId = getOwnerManagedGuildId();

      if (ownerManagedGuildId) {
        setSelectedGuildState(ownerManagedGuildId);
        setStorage(GUILD_STORAGE_KEY, ownerManagedGuildId);
      } else {
        setSelectedGuildState('');
        removeStorage(GUILD_STORAGE_KEY);
      }
    } finally {
      setGuildsLoading(false);
    }
  }, []);

  useEffect(() => {
    const ownerManagedGuildId = getOwnerManagedGuildId();

    if (ownerManagedGuildId) {
      if (selectedGuild !== ownerManagedGuildId) {
        setSelectedGuildState(ownerManagedGuildId);
      }

      setStorage(GUILD_STORAGE_KEY, ownerManagedGuildId);
      return;
    }

    const safeGuildId = normalizeGuildId(selectedGuild);

    if (safeGuildId) {
      setStorage(GUILD_STORAGE_KEY, safeGuildId);
    } else {
      removeStorage(GUILD_STORAGE_KEY);
    }
  }, [selectedGuild]);

  const selectedGuildData = useMemo(() => {
    const selectedGuildId = normalizeGuildId(selectedGuild);

    return (
      guilds.find((guild) => normalizeGuildId(guild) === selectedGuildId) ||
      null
    );
  }, [guilds, selectedGuild]);

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
