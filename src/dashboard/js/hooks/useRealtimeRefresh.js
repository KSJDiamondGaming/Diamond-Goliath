import { useEffect, useMemo, useRef, useState } from 'react';

import {
  joinGuildRoom,
  listenForGuildUpdate,
  listenForRealtimeFeed,
} from '../services/socketClient';

function normalisePrefixes(prefixes = []) {
  return Array.isArray(prefixes)
    ? prefixes.map((prefix) => String(prefix || '').trim()).filter(Boolean)
    : [String(prefixes || '').trim()].filter(Boolean);
}

function eventMatches(event, prefixes = []) {
  const names = [
    event?.event,
    event?.type,
  ]
    .filter(Boolean)
    .map((value) => String(value));

  if (!prefixes.length) return true;

  return names.some((name) =>
    prefixes.some((prefix) => name === prefix || name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}_`))
  );
}

export function useRealtimeRefresh({
  guildId,
  prefixes = [],
  onRefresh,
  delay = 450,
} = {}) {
  const [latestEvent, setLatestEvent] = useState(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const timeoutRef = useRef(null);
  const prefixList = useMemo(() => normalisePrefixes(prefixes), [prefixes]);

  useEffect(() => {
    if (!guildId || typeof onRefresh !== 'function') return undefined;

    joinGuildRoom(guildId);

    function scheduleRefresh(event) {
      if (!eventMatches(event, prefixList)) return;

      setLatestEvent(event);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setRefreshCount((count) => count + 1);
        onRefresh(event);
      }, delay);
    }

    const unsubscribers = [
      listenForGuildUpdate(scheduleRefresh),
      listenForRealtimeFeed(scheduleRefresh),
    ];

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [guildId, onRefresh, delay, prefixList]);

  return {
    latestEvent,
    refreshCount,
    hasRealtimeEvent: Boolean(latestEvent),
  };
}

export default useRealtimeRefresh;
