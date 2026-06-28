import { useCallback, useEffect, useRef, useState } from 'react';

import {
  joinGuildRoom,
  listenForGuildUpdate,
  listenForRealtimeFeed,
} from '../services/socketClient';

function normalisePrefixes(prefixes = []) {
  return (Array.isArray(prefixes) ? prefixes : [prefixes])
    .map((prefix) => String(prefix || '').trim().toLowerCase())
    .filter(Boolean);
}

function eventMatches(event, prefixes = []) {
  if (!prefixes.length) return true;

  const names = [
    event?.event,
    event?.type,
    event?.module,
    event?.scope,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return names.some((name) =>
    prefixes.some((prefix) =>
      name === prefix ||
      name.startsWith(`${prefix}.`) ||
      name.startsWith(`${prefix}_`) ||
      name.includes(prefix)
    )
  );
}

export function useOwnerRealtimeModuleRefresh({
  guildId,
  prefixes = [],
  onRefresh,
  delay = 500,
} = {}) {
  const timeoutRef = useRef(null);
  const refreshRef = useRef(onRefresh);
  const [latestEvent, setLatestEvent] = useState(null);
  const [refreshCount, setRefreshCount] = useState(0);

  refreshRef.current = onRefresh;

  const prefixList = normalisePrefixes(prefixes);

  const scheduleRefresh = useCallback(
    (event) => {
      if (!eventMatches(event, prefixList)) return;

      setLatestEvent(event);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setRefreshCount((count) => count + 1);
        refreshRef.current?.(event);
      }, delay);
    },
    [delay, prefixList.join('|')],
  );

  useEffect(() => {
    if (!guildId || typeof refreshRef.current !== 'function') {
      return undefined;
    }

    joinGuildRoom(guildId);

    const unsubscribers = [
      listenForGuildUpdate(guildId, null, scheduleRefresh),
      listenForRealtimeFeed(scheduleRefresh),
    ];

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [guildId, scheduleRefresh]);

  return {
    latestEvent,
    refreshCount,
    hasRealtimeEvent: Boolean(latestEvent),
  };
}

export default useOwnerRealtimeModuleRefresh;
