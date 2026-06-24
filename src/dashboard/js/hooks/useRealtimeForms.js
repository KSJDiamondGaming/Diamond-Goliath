import { useEffect, useMemo, useState } from 'react';

import {
  joinGuildRoom,
  listenForFormUpdated,
  listenForFormSubmitted,
  listenForFormSubmissionUpdated,
  listenForFormPanelUpdated,
  listenForFormAnalyticsUpdated,
  listenForRealtimeFeed,
} from '../services/socketClient';

const MAX_EVENTS = 100;

function addEvent(events, event) {
  return [event, ...events].slice(0, MAX_EVENTS);
}

export function useRealtimeForms(guildId) {
  const [events, setEvents] = useState([]);
  const [lastFormEvent, setLastFormEvent] = useState(null);
  const [lastSubmissionEvent, setLastSubmissionEvent] = useState(null);
  const [lastPanelEvent, setLastPanelEvent] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    if (!guildId) return undefined;

    joinGuildRoom(guildId);

    const unsubscribers = [
      listenForFormUpdated((event) => {
        setLastFormEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForFormSubmitted((event) => {
        setLastSubmissionEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForFormSubmissionUpdated((event) => {
        setLastSubmissionEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForFormPanelUpdated((event) => {
        setLastPanelEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForFormAnalyticsUpdated((event) => {
        setAnalytics(event?.data || event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForRealtimeFeed((event) => {
        if (String(event?.event || event?.type || '').startsWith('form')) {
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

    lastFormEvent,
    lastSubmissionEvent,
    lastPanelEvent,
    analytics,
  };
}

export default useRealtimeForms;
