import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient.js';

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
}

function normalizeTickets(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.tickets)) return payload.tickets;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function ticketId(ticket = {}) {
  return ticket.ticketId || ticket.id || ticket.channelId || '';
}

function formatDate(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleString();
}

function StatCard({ theme, label, value, hint }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.34)', borderRadius: 18, padding: 16 }}>
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950, color: theme.cardText }}>{value}</div>
      {hint ? <div style={{ marginTop: 4, color: theme.mutedText, fontSize: 12 }}>{hint}</div> : null}
    </div>
  );
}

function StatusPill({ theme, status }) {
  const normalized = String(status || 'unknown').toLowerCase();
  const tone = normalized === 'open'
    ? '#86efac'
    : normalized === 'claimed'
      ? '#93c5fd'
      : normalized === 'closed'
        ? '#fcd34d'
        : normalized === 'archived'
          ? '#c4b5fd'
          : theme.mutedText;

  return (
    <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {normalized}
    </span>
  );
}

function TicketRow({ theme, ticket, selected, onSelect }) {
  const title = ticket.title || ticket.subject || ticket.type || `Ticket ${ticketId(ticket)}`;
  const id = ticketId(ticket) || 'unknown';
  const creator = ticket.creatorTag || ticket.creatorName || ticket.creatorId || 'Unknown creator';
  const assigned = ticket.assignedUserId || ticket.claimedBy || ticket.claimedById || 'Unassigned';

  return (
    <button type="button" onClick={() => onSelect(ticket)} style={{ textAlign: 'left', border: `1px solid ${selected ? '#93c5fd' : theme.cardBorder}`, background: selected ? 'rgba(59,130,246,0.16)' : 'rgba(15,23,42,0.28)', borderRadius: 18, padding: 16, display: 'grid', gap: 12, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>#{id}</div>
          <h3 style={{ margin: '5px 0 0', color: theme.cardText }}>{title}</h3>
        </div>
        <StatusPill theme={theme} status={ticket.status} />
      </div>
      {ticket.description ? <p style={{ margin: 0, color: theme.mutedText, lineHeight: 1.55 }}>{String(ticket.description).slice(0, 220)}</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10, color: theme.mutedText, fontSize: 13 }}>
        <div><strong style={{ color: theme.cardText }}>Creator:</strong> {creator}</div>
        <div><strong style={{ color: theme.cardText }}>Assigned:</strong> {assigned}</div>
        <div><strong style={{ color: theme.cardText }}>Priority:</strong> {ticket.priority || 'normal'}</div>
        <div><strong style={{ color: theme.cardText }}>Created:</strong> {formatDate(ticket.createdAt)}</div>
      </div>
    </button>
  );
}

function TicketDetail({ theme, ticket, acting, onAction }) {
  if (!ticket) {
    return (
      <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.mutedText, borderRadius: 22, padding: 22, boxShadow: theme.shadow }}>
        Select a ticket to view details and actions.
      </section>
    );
  }

  const status = String(ticket.status || '').toLowerCase();
  const id = ticketId(ticket);

  const buttonStyle = (enabled, background) => ({
    border: `1px solid ${theme.cardBorder}`,
    background,
    color: theme.cardText,
    borderRadius: 14,
    padding: '10px 12px',
    fontWeight: 950,
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.55,
  });

  return (
    <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 22, padding: 22, boxShadow: theme.shadow, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Selected Ticket</div>
          <h2 style={{ margin: '6px 0 0' }}>{ticket.title || ticket.type || `Ticket ${id}`}</h2>
        </div>
        <StatusPill theme={theme} status={ticket.status} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10, color: theme.mutedText, fontSize: 13 }}>
        <div><strong style={{ color: theme.cardText }}>ID:</strong> {id || 'Unknown'}</div>
        <div><strong style={{ color: theme.cardText }}>Creator:</strong> {ticket.creatorTag || ticket.creatorName || ticket.creatorId || 'Unknown'}</div>
        <div><strong style={{ color: theme.cardText }}>Assigned:</strong> {ticket.assignedUserId || ticket.claimedBy || ticket.claimedById || 'Unassigned'}</div>
        <div><strong style={{ color: theme.cardText }}>Transcript:</strong> {ticket.transcript ? 'Saved' : 'Not saved'}</div>
      </div>
      {ticket.description ? <p style={{ margin: 0, color: theme.mutedText, lineHeight: 1.6 }}>{ticket.description}</p> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button type="button" disabled={acting || status !== 'open'} onClick={() => onAction('claim', ticket)} style={buttonStyle(!acting && status === 'open', 'rgba(37,99,235,0.22)')}>Claim</button>
        <button type="button" disabled={acting || !['open', 'claimed'].includes(status)} onClick={() => onAction('close', ticket)} style={buttonStyle(!acting && ['open', 'claimed'].includes(status), 'rgba(202,138,4,0.22)')}>Close</button>
        <button type="button" disabled={acting || status !== 'closed'} onClick={() => onAction('reopen', ticket)} style={buttonStyle(!acting && status === 'closed', 'rgba(22,163,74,0.22)')}>Reopen</button>
      </div>
    </section>
  );
}

export default function Tickets({ theme, selectedGuild, selectedGuildData, user }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [overview, setOverview] = useState({});
  const [tickets, setTickets] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const cardStyle = useMemo(() => ({
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 22,
    boxShadow: theme.shadow,
  }), [theme]);

  async function load() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    try {
      const [overviewPayload, ticketsPayload] = await Promise.all([
        api.request(`/api/tickets/${guildId}/overview`),
        api.request(`/api/tickets/${guildId}`),
      ]);
      const nextTickets = normalizeTickets(ticketsPayload);
      setOverview(overviewPayload.overview || {});
      setTickets(nextTickets);
      if (selectedTicketId && !nextTickets.some((ticket) => ticketId(ticket) === selectedTicketId)) setSelectedTicketId('');
    } catch (loadError) {
      setError(loadError.message || 'Failed to load tickets dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [guildId]);

  const selectedTicket = useMemo(() => tickets.find((ticket) => ticketId(ticket) === selectedTicketId) || null, [tickets, selectedTicketId]);

  const filteredTickets = useMemo(() => {
    if (filter === 'all') return tickets;
    if (filter === 'active') return tickets.filter((ticket) => ['open', 'claimed'].includes(String(ticket.status || '').toLowerCase()));
    return tickets.filter((ticket) => String(ticket.status || '').toLowerCase() === filter);
  }, [tickets, filter]);

  async function handleTicketAction(action, ticket) {
    const id = ticketId(ticket);
    if (!guildId || !id) return;

    setActing(true);
    setError('');
    setNotice('');

    try {
      const actorId = user?.id || selectedGuildData?.userId || 'dashboard';
      const payload = action === 'close'
        ? { actorId, reason: 'Closed from Goliath dashboard.' }
        : { actorId };
      const result = await api.request(`/api/tickets/${guildId}/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (result.ticket) {
        setTickets((current) => current.map((item) => (ticketId(item) === id ? result.ticket : item)));
        setSelectedTicketId(ticketId(result.ticket));
      }
      setNotice(`Ticket ${action} complete.`);
      await load();
    } catch (actionError) {
      setError(actionError.message || `Failed to ${action} ticket.`);
    } finally {
      setActing(false);
    }
  }

  if (!guildId) return <div style={{ ...cardStyle, padding: 24 }}>Select a server from the navbar to manage tickets.</div>;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{ ...cardStyle, padding: 24, background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.08) 46%, rgba(168,85,247,0.14))' }}>
        <p style={{ margin: '0 0 8px', color: '#93c5fd', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Goliath Support Suite</p>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: '-0.04em' }}>Tickets</h1>
        <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 860 }}>Review ticket queues, inspect details and take staff actions from one dashboard.</p>
      </section>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12 }}>
        <StatCard theme={theme} label="Status" value={overview.enabled === false ? 'Disabled' : 'Enabled'} hint={loading ? 'Loading...' : 'Ticket module'} />
        <StatCard theme={theme} label="Active" value={overview.activeCount ?? 0} hint="Open + claimed" />
        <StatCard theme={theme} label="Open" value={overview.openCount ?? 0} hint="Awaiting staff" />
        <StatCard theme={theme} label="Claimed" value={overview.claimedCount ?? 0} hint="Owned by staff" />
        <StatCard theme={theme} label="Closed" value={overview.closedCount ?? 0} hint={`${overview.closedTodayCount ?? 0} closed today`} />
        <StatCard theme={theme} label="Transcripts" value={overview.transcriptCount ?? 0} hint="Saved transcripts" />
      </section>
      {(error || notice) ? <section style={{ ...cardStyle, padding: 16, color: error ? '#fca5a5' : '#86efac', fontWeight: 850 }}>{error || notice}</section> : null}
      <TicketDetail theme={theme} ticket={selectedTicket} acting={acting} onAction={handleTicketAction} />
      <section style={{ ...cardStyle, padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ticket Queue</div>
          <div style={{ marginTop: 5, fontWeight: 950 }}>{filteredTickets.length} shown / {tickets.length} total</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['active', 'open', 'claimed', 'closed', 'archived', 'all'].map((option) => (
            <button key={option} type="button" onClick={() => setFilter(option)} style={{ border: `1px solid ${filter === option ? '#93c5fd' : theme.cardBorder}`, background: filter === option ? 'rgba(59,130,246,0.24)' : 'rgba(15,23,42,0.35)', color: theme.cardText, borderRadius: 999, padding: '9px 12px', fontWeight: 900, cursor: 'pointer', textTransform: 'capitalize' }}>{option}</button>
          ))}
          <button type="button" onClick={load} disabled={loading} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(37,99,235,0.22)', color: theme.cardText, borderRadius: 999, padding: '9px 12px', fontWeight: 950, cursor: 'pointer' }}>{loading ? 'Refreshing...' : 'Refresh'}</button>
        </div>
      </section>
      <section style={{ ...cardStyle, padding: 22, display: 'grid', gap: 12 }}>
        {filteredTickets.length === 0 ? (
          <div style={{ color: theme.mutedText, padding: 14 }}>No tickets match this filter yet.</div>
        ) : filteredTickets.map((ticket) => {
          const id = ticketId(ticket);
          return <TicketRow key={id || `${ticket.createdAt}-${ticket.title}`} theme={theme} ticket={ticket} selected={id === selectedTicketId} onSelect={(selected) => setSelectedTicketId(ticketId(selected))} />;
        })}
      </section>
    </div>
  );
}
