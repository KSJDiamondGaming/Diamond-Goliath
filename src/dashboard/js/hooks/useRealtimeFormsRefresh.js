import { useEffect, useRef, useState } from 'react';

import { useRealtimeForms } from './useRealtimeForms.js';

export function useRealtimeFormsRefresh(guildId, onRefresh, delay = 350) {
  const realtime = useRealtimeForms(guildId);
  const [refreshing, setRefreshing] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!guildId || !realtime.latestEvent || typeof onRefresh !== 'function') {
      return undefined;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      timeoutRef.current = null;

      try {
        setRefreshing(true);
        await onRefresh({ quiet: true, event: realtime.latestEvent });
      } finally {
        setRefreshing(false);
      }
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [guildId, realtime.latestEvent, onRefresh, delay]);

  return {
    ...realtime,
    refreshing,
  };
}

export default useRealtimeFormsRefresh;
