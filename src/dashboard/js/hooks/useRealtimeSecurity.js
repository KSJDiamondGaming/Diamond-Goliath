import { useEffect, useMemo, useState } from 'react';

import {
  joinGuildRoom,
  listenForGuildUpdate,
  listenForRealtimeFeed,
} from '../services/socketClient.js';

const MAX_EVENTS = 100;

function addEvent(events, event) {
  return [event, ...events].slice(0, MAX_EVENTS);
}

function isSecurityEvent(event = {}) {
  const name = String(event?.event || event?.type || '').toLowerCase();

  return (
    name.startsWith('security.') ||
    name.startsWith('security:') ||
    event?.module === 'security' ||
    event?.scope === 'security'
  );
}

export function useRealtimeSecurity(guildId = null) {
  const [events, setEvents] = useState([]);
  const [lastSecurityEvent, setLastSecurityEvent] = useState(null);

  useEffect(() => {
    if (guildId) {
      joinGuildRoom(guildId);
    }

    const handleSecurityEvent = (event) => {
      if (!isSecurityEvent(event)) return;

      setLastSecurityEvent(event);
      setEvents((prev) => addEvent(prev, event));
    };

    const unsubscribers = [
      listenForGuildUpdate((data, payloadEvent) => {
        handleSecurityEvent(payloadEvent || data);
      }),
      listenForRealtimeFeed(handleSecurityEvent),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [guildId]);

  const latestEvent = events[0] || null;

  const stats = useMemo(() => ({
    totalEvents: events.length,
    hasEvents: events.length > 0,
    latestEvent,
  }), [events, latestEvent]);

  return {
    events,
    latestEvent,
    stats,
    lastSecurityEvent,
  };
}

export default useRealtimeSecurity;
