import { useEffect, useState } from 'react';

export default function useOwnerBackups() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadBackups() {
      try {
        setLoading(true);
        setError('');

        // Future backup API
        const payload = {
          backups: [],
        };

        if (!cancelled) {
          setBackups(payload.backups || []);
        }
      } catch (err) {
        if (!cancelled) {
          setBackups([]);
          setError(
            err.message ||
            'Failed to load backup data.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadBackups();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    backups,
    loading,
    error,
  };
}
