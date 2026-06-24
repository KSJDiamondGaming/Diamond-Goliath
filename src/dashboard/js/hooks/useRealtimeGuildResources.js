import { useEffect, useMemo, useState } from 'react';

import {
  joinGuildRoom,
  onSocketEvents,
  listenForRealtimeFeed,
} from '../services/socketClient';

const MAX_EVENTS = 100;

const RESOURCE_EVENTS = [
  'role.created',
  'role.updated',
  'role.deleted',
  'channel.created',
  'channel.updated',
  'channel.deleted',
];

function addEvent(events, event) {
  return [event, ...events].slice(0, MAX_EVENTS);
}

function isResourceEvent(event) {
  const name = String(event?.event || event?.type || '');

  return (
    name.startsWith('role.') ||
    name.startsWith('channel.') ||
    event?.module === 'roles' ||
    event?.module === 'channels' ||
    event?.scope === 'roles' ||
    event?.scope === 'channels'
  );
}

export function useRealtimeGuildResources(guildId) {
  const [events, setEvents] = useState([]);
  const [lastRoleEvent, setLastRoleEvent] = useState(null);
  const [lastChannelEvent, setLastChannelEvent] = useState(null);

  useEffect(() => {
    if (!guildId) return undefined;

    joinGuildRoom(guildId);

    const handleResourceEvent = (event) => {
      const name = String(event?.event || event?.type || '');

      if (name.startsWith('role.') || event?.module === 'roles' || event?.scope === 'roles') {
        setLastRoleEvent(event);
      }

      if (name.startsWith('channel.') || event?.module === 'channels' || event?.scope === 'channels') {
        setLastChannelEvent(event);
      }

      setEvents((prev) => addEvent(prev, event));
    };

    const unsubscribers = [
      onSocketEvents(RESOURCE_EVENTS, handleResourceEvent),
      listenForRealtimeFeed((event) => {
        if (isResourceEvent(event)) {
          handleResourceEvent(event);
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

    lastRoleEvent,
    lastChannelEvent,
  };
}

export default useRealtimeGuildResources;
