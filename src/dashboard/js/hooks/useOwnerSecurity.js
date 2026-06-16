import { useEffect, useState } from 'react';

import ownerApi from '../services/ownerApi.js';

export default function useOwnerSecurity(guildId) {
  const [security, setSecurity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!guildId) {
      setSecurity(null);
      return;
    }

    let cancelled = false;

    async function loadSecurity() {
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
          setError(
            err.message ||
            'Failed to load security data.',
          );
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
  };
}
