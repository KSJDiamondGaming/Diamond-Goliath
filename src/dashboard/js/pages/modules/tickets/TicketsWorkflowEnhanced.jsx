import React, { useCallback, useEffect, useState } from 'react';

import { api } from '../../../services/apiClient.js';
import useRealtimeTickets from '../../../hooks/useRealtimeTickets.js';
import LegacyTickets from '../Tickets.jsx';
import TicketWorkflowSummary from './TicketWorkflowSummary.jsx';

function cleanGuildId(selectedGuild, selectedGuildData) {
  const value = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(value).split(':').pop().trim();
}

function normalizeTicketList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.tickets)) return payload.tickets;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export default function TicketsWorkflowEnhanced(props) {
  const { selectedGuild, selectedGuildData, theme } = props;
  const guildId = cleanGuildId(selectedGuild, selectedGuildData);
  const [overview, setOverview] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const realtime = useRealtimeTickets(guildId);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!guildId) {
      setOverview(null);
      setTickets([]);
      return;
    }

    try {
      if (quiet) setRefreshing(true);

      const [overviewPayload, ticketsPayload] = await Promise.all([
        api.getTicketOverview(guildId),
        api.getTickets(guildId),
      ]).catch(() => [null, null]);

      setOverview(overviewPayload?.overview || null);
      setTickets(normalizeTicketList(ticketsPayload));
    } finally {
      if (quiet) setRefreshing(false);
    }
  }, [guildId]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      if (cancelled) return;
      await load();
    }

    loadInitial();

    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!guildId || !realtime.latestEvent) return undefined;

    const timeout = setTimeout(() => {
      load({ quiet: true });
    }, 350);

    return () => clearTimeout(timeout);
  }, [guildId, realtime.latestEvent, load]);

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {overview ? (
        <TicketWorkflowSummary
          theme={theme}
          overview={overview}
          tickets={tickets}
          realtime={realtime}
          refreshing={refreshing}
        />
      ) : null}

      <LegacyTickets
        {...props}
        selectedGuild={guildId || selectedGuild}
        selectedGuildData={selectedGuildData ? { ...selectedGuildData, id: guildId, guildId } : selectedGuildData}
      />
    </div>
  );
}
