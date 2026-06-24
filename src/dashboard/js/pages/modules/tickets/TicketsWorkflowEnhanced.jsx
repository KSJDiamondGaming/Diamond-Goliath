import React, { useEffect, useState } from 'react';

import { api } from '../../../services/apiClient.js';
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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!guildId) {
        setOverview(null);
        setTickets([]);
        return;
      }

      const [overviewPayload, ticketsPayload] = await Promise.all([
        api.getTicketOverview(guildId),
        api.getTickets(guildId),
      ]).catch(() => [null, null]);

      if (cancelled) return;
      setOverview(overviewPayload?.overview || null);
      setTickets(normalizeTicketList(ticketsPayload));
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [guildId]);

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {overview ? <TicketWorkflowSummary theme={theme} overview={overview} tickets={tickets} /> : null}
      <LegacyTickets
        {...props}
        selectedGuild={guildId || selectedGuild}
        selectedGuildData={selectedGuildData ? { ...selectedGuildData, id: guildId, guildId } : selectedGuildData}
      />
    </div>
  );
}
