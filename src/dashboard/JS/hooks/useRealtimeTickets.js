import { useEffect, useMemo, useState } from 'react';

import {
  joinGuildRoom,
  listenForTicketCreated,
  listenForTicketUpdated,
  listenForTicketClosed,
  listenForTicketClaimed,
  listenForTicketReopened,
  listenForTicketArchived,
  listenForTicketDeleted,
  listenForTimelineEntry,
  listenForPanelCreated,
  listenForPanelUpdated,
  listenForPanelDeleted,
  listenForPanelDeployed,
  listenForAnalyticsUpdated,
  listenForRealtimeFeed,
} from '../socketClient';

const MAX_EVENTS = 100;

function addEvent(events, event) {
  return [event, ...events].slice(0, MAX_EVENTS);
}

export function useRealtimeTickets(guildId) {
  const [events, setEvents] = useState([]);
  const [lastTicketEvent, setLastTicketEvent] = useState(null);
  const [lastPanelEvent, setLastPanelEvent] = useState(null);
  const [lastTimelineEntry, setLastTimelineEntry] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    if (!guildId) return undefined;

    joinGuildRoom(guildId);

    const unsubscribers = [
      listenForTicketCreated((event) => {
        setLastTicketEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForTicketUpdated((event) => {
        setLastTicketEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForTicketClosed((event) => {
        setLastTicketEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForTicketClaimed((event) => {
        setLastTicketEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForTicketReopened((event) => {
        setLastTicketEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForTicketArchived((event) => {
        setLastTicketEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForTicketDeleted((event) => {
        setLastTicketEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForTimelineEntry((event) => {
        setLastTimelineEntry(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForPanelCreated((event) => {
        setLastPanelEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForPanelUpdated((event) => {
        setLastPanelEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForPanelDeleted((event) => {
        setLastPanelEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForPanelDeployed((event) => {
        setLastPanelEvent(event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForAnalyticsUpdated((event) => {
        setAnalytics(event?.data || event);
        setEvents((prev) => addEvent(prev, event));
      }),

      listenForRealtimeFeed((event) => {
        setEvents((prev) => addEvent(prev, event));
      }),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [guildId]);

  const latestEvent = events[0] || null;

  const stats = useMemo(() => {
    return {
      totalEvents: events.length,
      hasEvents: events.length > 0,
      latestEvent,
    };
  }, [events, latestEvent]);

  return {
    events,
    latestEvent,
    stats,

    lastTicketEvent,
    lastPanelEvent,
    lastTimelineEntry,
    analytics,
  };
}

export default useRealtimeTickets;