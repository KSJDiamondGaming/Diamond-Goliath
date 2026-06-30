import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../../services/apiClient.js';
import useRealtimeTickets from '../../../hooks/useRealtimeTickets.js';
import LegacyTickets from '../Tickets.jsx';
import TicketReviewWorkspace from './TicketReviewWorkspace.jsx';
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

function normalizeRoleList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.roles)) return payload.roles;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function ticketId(ticket = {}) {
  return ticket.ticketId || ticket.id || ticket.displayId || ticket.channelId || '';
}

function getActorId(props = {}) {
  return props.currentUser?.id || props.user?.id || props.selectedGuildData?.userId || 'dashboard';
}

function cardStyle(theme) {
  return {
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 22,
    boxShadow: theme.shadow,
  };
}

export default function TicketsWorkflowEnhanced(props) {
  const { selectedGuild, selectedGuildData, theme } = props;
  const guildId = cleanGuildId(selectedGuild, selectedGuildData);
  const [overview, setOverview] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const realtime = useRealtimeTickets(guildId);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticketId(ticket) === selectedTicketId) || tickets[0] || null,
    [selectedTicketId, tickets],
  );

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!guildId) {
      setOverview(null);
      setTickets([]);
      setRoles([]);
      setSelectedTicketId('');
      return;
    }

    try {
      if (quiet) setRefreshing(true);
      setError('');

      const [overviewPayload, ticketsPayload, rolesPayload] = await Promise.all([
        api.getTicketOverview ? api.getTicketOverview(guildId) : api.request(`/api/tickets/${guildId}/overview`),
        api.getTickets ? api.getTickets(guildId) : api.request(`/api/tickets/${guildId}`),
        api.getGuildRoles ? api.getGuildRoles(guildId).catch(() => []) : Promise.resolve([]),
      ]).catch(() => [null, null, []]);

      const nextTickets = normalizeTicketList(ticketsPayload);
      setOverview(overviewPayload?.overview || null);
      setTickets(nextTickets);
      setRoles(normalizeRoleList(rolesPayload));

      if (selectedTicketId && !nextTickets.some((ticket) => ticketId(ticket) === selectedTicketId)) {
        setSelectedTicketId('');
      }
    } catch (loadError) {
      setError(loadError.message || 'Failed to load ticket workspace.');
    } finally {
      if (quiet) setRefreshing(false);
    }
  }, [guildId, selectedTicketId]);

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

  async function runTicketRequest(ticket, endpoint, options = {}) {
    const id = ticketId(ticket);
    if (!guildId || !id) return null;

    setActing(true);
    setError('');
    setNotice('');

    try {
      const result = await api.request(`/api/tickets/${guildId}/${id}${endpoint}`, options);
      if (result?.ticket) {
        setTickets((current) => current.map((item) => (ticketId(item) === id ? result.ticket : item)));
        setSelectedTicketId(ticketId(result.ticket));
      }
      await load({ quiet: true });
      return result;
    } catch (requestError) {
      setError(requestError.message || 'Ticket action failed.');
      return null;
    } finally {
      setActing(false);
    }
  }

  async function handleAction(action, ticket) {
    const actorId = getActorId(props);
    const payload = action === 'close'
      ? { actorId, reason: 'Closed from Goliath dashboard.' }
      : { actorId };

    const result = await runTicketRequest(ticket, `/${action}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (result) setNotice(`Ticket ${action} complete.`);
  }

  async function handleAssign(ticket, assignedUserId) {
    const result = await runTicketRequest(ticket, '/assign', {
      method: 'POST',
      body: JSON.stringify({ actorId: getActorId(props), assignedUserId }),
    });

    if (result) setNotice('Ticket assignment updated.');
  }

  async function handleStatus(ticket, status) {
    const result = await runTicketRequest(ticket, '/status', {
      method: 'PATCH',
      body: JSON.stringify({ actorId: getActorId(props), status }),
    });

    if (result) setNotice(`Ticket status changed to ${status}.`);
  }

  async function handleNote(ticket, note) {
    const result = await runTicketRequest(ticket, '/note', {
      method: 'POST',
      body: JSON.stringify({ actorId: getActorId(props), note }),
    });

    if (result) setNotice('Ticket note added.');
  }

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

      {(error || notice) ? (
        <section style={{ ...cardStyle(theme), padding: 16, color: error ? '#fca5a5' : '#86efac', fontWeight: 850 }}>
          {error || notice}
        </section>
      ) : null}

      <TicketReviewWorkspace
        theme={theme}
        ticket={selectedTicket}
        acting={acting}
        roles={roles}
        onAction={handleAction}
        onAssign={handleAssign}
        onStatus={handleStatus}
        onNote={handleNote}
      />

      <LegacyTickets
        {...props}
        selectedGuild={guildId || selectedGuild}
        selectedGuildData={selectedGuildData ? { ...selectedGuildData, id: guildId, guildId } : selectedGuildData}
      />
    </div>
  );
}
