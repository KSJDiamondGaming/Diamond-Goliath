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

function TicketRow({ theme, ticket }) {
  const title = ticket.title || ticket.subject || ticket.type || `Ticket ${ticket.ticketId || ticket.id || ''}`;
  const id = ticket.ticketId || ticket.id || 'unknown';
  const creator = ticket.creatorTag || ticket.creatorName || ticket.creatorId || 'Unknown creator';
  const assigned = ticket.assignedUserId || ticket.claimedBy || ticket.claimedById || 'Unassigned';

  return (
    <article style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.28)', borderRadius: 18, padding: 16, display: 'grid', gap: 12 }}>
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
    </article>
  );
}

export default function Tickets({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [overview, setOverview] = useState({});
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        api.getTicketsOverview(guildId),
        api.getTickets(guildId),
      ]);
      setOverview(overviewPayload.overview || {});
      setTickets(normalizeTickets(ticketsPayload));
    } catch (loadError) {
      setError(loadError.message || 'Failed to load tickets dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [guildId]);

  const filteredTickets = useMemo(() => {
    if (filter === 'all') return tickets;
    if (filter === 'active') return tickets.filter((ticket) => ['open', 'claimed'].includes(String(ticket.status || '').toLowerCase()));
    return tickets.filter((ticket) => String(ticket.status || '').toLowerCase() === filter);
  }, [tickets, filter]);

  if (!guildId) {
    return <div style={{ ...cardStyle, padding: 24 }}>Select a server from the navbar to manage tickets.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{ ...cardStyle, padding: 24, background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.08) 46%, rgba(168,85,247,0.14))' }}>
        <p style={{ margin: '0 0 8px', color: '#93c5fd', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Goliath Support Suite</p>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: '-0.04em' }}>Tickets</h1>
        <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 860 }}>Review open tickets, claims, closures, archived tickets and transcript coverage from one dashboard.</p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12 }}>
        <StatCard theme={theme} label="Status" value={overview.enabled === false ? 'Disabled' : 'Enabled'} hint={loading ? 'Loading...' : 'Ticket module'} />
        <StatCard theme={theme} label="Active" value={overview.activeCount ?? 0} hint="Open + claimed" />
        <StatCard theme={theme} label="Open" value={overview.openCount ?? 0} hint="Awaiting staff" />
        <StatCard theme={theme} label="Claimed" value={overview.claimedCount ?? 0} hint="Owned by staff" />
        <StatCard theme={theme} label="Closed" value={overview.closedCount ?? 0} hint={`${overview.closedTodayCount ?? 0} closed today`} />
        <StatCard theme={theme} label="Transcripts" value={overview.transcriptCount ?? 0} hint="Saved transcripts" />
      </section>

      {(error) ? <section style={{ ...cardStyle, padding: 16, color: '#fca5a5', fontWeight: 850 }}>{error}</section> : null}

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
        ) : filteredTickets.map((ticket) => (
          <TicketRow key={ticket.ticketId || ticket.id || `${ticket.createdAt}-${ticket.title}`} theme={theme} ticket={ticket} />
        ))}
      </section>
    </div>
  );
}
