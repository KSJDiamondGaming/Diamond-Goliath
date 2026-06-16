import { useEffect, useState } from 'react';

import ownerApi from '../services/ownerApi.js';

export default function useOwnerGuilds() {
  const [guilds, setGuilds] = useState([]);
  const [selectedGuild, setSelectedGuild] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadGuilds() {
      try {
        setLoading(true);
        setError('');

        const payload = await ownerApi.getGuilds();

        const nextGuilds = Array.isArray(payload?.guilds)
          ? payload.guilds
          : [];

        if (!cancelled) {
          setGuilds(nextGuilds);

          setSelectedGuild((current) => {
            const exists = nextGuilds.some(
              (guild) => String(guild.guildId || guild.id) === current,
            );

            if (exists) {
              return current;
            }

            return String(
              nextGuilds[0]?.guildId ||
              nextGuilds[0]?.id ||
              '',
            );
          });
        }
      } catch (err) {
        if (!cancelled) {
          setGuilds([]);
          setSelectedGuild('');
          setError(
            err.message ||
            'Failed to load owner guilds.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadGuilds();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    guilds,
    selectedGuild,
    setSelectedGuild,
    loading,
    error,
  };
}
