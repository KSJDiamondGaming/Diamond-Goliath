import { useCallback, useEffect, useState } from 'react';

import ownerApi from '../services/ownerApi.js';

export default function useOwnerSecurity(guildId) {
  const [security, setSecurity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!guildId) {
      setSecurity(null);
      return null;
    }

    try {
      setLoading(true);
      setError('');

      const payload = await ownerApi.getSecurity(guildId);
      setSecurity(payload || null);
      return payload || null;
    } catch (err) {
      setSecurity(null);
      setError(err.message || 'Failed to load security data.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    let cancelled = false;

    async function loadSecurity() {
      if (!guildId) {
        setSecurity(null);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const payload = await ownerApi.getSecurity(guildId);

        if (!cancelled) {
          setSecurity(payload || null);
        }
      } catch (err) {
        if (!cancelled) {
          setSecurity(null);
          setError(err.message || 'Failed to load security data.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSecurity();

    return () => {
      cancelled = true;
    };
  }, [guildId]);

  return {
    security,
    loading,
    error,
    refresh,
  };
}
