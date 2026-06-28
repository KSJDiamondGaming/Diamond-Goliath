import { useEffect, useMemo, useState } from 'react';

import {
  joinGuildRoom,
  listenForCaseCreated,
  listenForCaseUpdated,
  listenForCaseStatusUpdated,
  listenForCaseNoteUpdated,
  listenForRealtimeFeed,
} from '../services/socketClient';

const MAX_EVENTS = 100;

function addEvent(events, event) {
  return [event, ...events].slice(0, MAX_EVENTS);
}

export function useRealtimeCases(guildId) {
  const [events, setEvents] = useState([]);
  const [lastCaseEvent, setLastCaseEvent] = useState(null);
  const [lastStatusEvent, setLastStatusEvent] = useState(null);
  const [lastNoteEvent, setLastNoteEvent] = useState(null);

  useEffect(() => {
    if (!guildId) return undefined;

    joinGuildRoom(guildId);

    const unsubscribers = [
      listenForCaseCreated((event) => {
        setLastCaseEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForCaseUpdated((event) => {
        setLastCaseEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForCaseStatusUpdated((event) => {
        setLastStatusEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForCaseNoteUpdated((event) => {
        setLastNoteEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForRealtimeFeed((event) => {
        if (String(event?.event || event?.type || '').startsWith('case')) {
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

    lastCaseEvent,
    lastStatusEvent,
    lastNoteEvent,
  };
}

export default useRealtimeCases;
