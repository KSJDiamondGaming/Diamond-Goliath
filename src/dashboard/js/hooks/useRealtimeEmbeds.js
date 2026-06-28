import { useEffect, useMemo, useState } from 'react';

import {
  joinGuildRoom,
  listenForEmbedUpdated,
  listenForEmbedStatusUpdated,
  listenForEmbedDeleted,
  listenForRealtimeFeed,
} from '../services/socketClient';

const MAX_EVENTS = 100;

function addEvent(events, event) {
  return [event, ...events].slice(0, MAX_EVENTS);
}

export function useRealtimeEmbeds(guildId) {
  const [events, setEvents] = useState([]);
  const [lastEmbedEvent, setLastEmbedEvent] = useState(null);
  const [lastStatusEvent, setLastStatusEvent] = useState(null);
  const [lastDeletedEvent, setLastDeletedEvent] = useState(null);

  useEffect(() => {
    if (!guildId) return undefined;

    joinGuildRoom(guildId);

    const unsubscribers = [
      listenForEmbedUpdated((event) => {
        setLastEmbedEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForEmbedStatusUpdated((event) => {
        setLastStatusEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForEmbedDeleted((event) => {
        setLastDeletedEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForRealtimeFeed((event) => {
        if (String(event?.event || event?.type || '').startsWith('embed')) {
          setEvents((prev) => addEvent(prev, event));
        }
      }),
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

    lastEmbedEvent,
    lastStatusEvent,
    lastDeletedEvent,
  };
}

export default useRealtimeEmbeds;
