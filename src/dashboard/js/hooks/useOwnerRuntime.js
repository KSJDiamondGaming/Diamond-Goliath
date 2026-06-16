import { useEffect, useState } from 'react';

import ownerApi from '../services/ownerApi.js';

export default function useOwnerRuntime() {
  const [runtime, setRuntime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadRuntime() {
      try {
        setLoading(true);
        setError('');

        const payload = await ownerApi.getRuntime();

        if (!cancelled) {
          setRuntime(payload?.runtime || null);
        }
      } catch (err) {
        if (!cancelled) {
          setRuntime(null);
          setError(err.message || 'Failed to load runtime.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadRuntime();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    runtime,
    loading,
    error,
  };
}
