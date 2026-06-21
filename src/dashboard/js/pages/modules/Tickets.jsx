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
  return ticket.ticketId || ticket.id || ticket.displayId || ticket.channelId || '';
}

function ticketTitle(ticket = {}) {
  return ticket.title || ticket.subject || ticket.type || `Ticket ${ticketId(ticket) || 'Unknown'}`;
}

function getCreator(ticket = {}) {
  return ticket.creatorTag || ticket.creatorName || ticket.creatorId || ticket.userId || 'Unknown creator';
}

function getAssigned(ticket = {}) {
  return ticket.assignedUserId || ticket.claimedBy || ticket.claimedById || 'Unassigned';
}

function formatDate(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleString();
}

function statusTone(status, theme) {
  const value = String(status || 'unknown').toLowerCase();
  if (value === 'open') return '#86efac';
  if (value === 'claimed') return '#93c5fd';
  if (value === 'closed') return '#fcd34d';
  if (value === 'archived') return '#c4b5fd';
  return theme.mutedText;
}

function priorityTone(priority, theme) {
  const value = String(priority || 'normal').toLowerCase();
  if (value === 'urgent') return '#fca5a5';
  if (value === 'high') return '#fcd34d';
  if (value === 'low') return '#86efac';
  return theme.mutedText;
}

function StatCard({ theme, label, value, hint, accent = '#93c5fd' }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.34)', borderRadius: 18, padding: 16 }}>
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950, color: accent }}>{value}</div>
      {hint ? <div style={{ marginTop: 4, color: theme.mutedText, fontSize: 12 }}>{hint}</div> : null}
    </div>
  );
}

function StatusPill({ theme, status }) {
  const value = String(status || 'unknown').toLowerCase();
  const tone = statusTone(value, theme);

  return (
    <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {value}
    </span>
  );
}

function TicketRow({ theme, ticket, selected, onSelect }) {
  const id = ticketId(ticket) || 'unknown';
  const priority = String(ticket.priority || 'normal').toLowerCase();

  return (
    <button type="button" onClick={() => onSelect(ticket)} style={{ textAlign: 'left', border: `1px solid ${selected ? '#93c5fd' : theme.cardBorder}`, background: selected ? 'rgba(59,130,246,0.16)' : 'rgba(15,23,42,0.28)', borderRadius: 18, padding: 16, display: 'grid', gap: 12, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>#{id}</div>
          <h3 style={{ margin: '5px 0 0', color: theme.cardText }}>{ticketTitle(ticket)}</h3>
        </div>
        <StatusPill theme={theme} status={ticket.status} />
      </div>

      {ticket.description ? <p style={{ margin: 0, color: theme.mutedText, lineHeight: 1.55 }}>{String(ticket.description).slice(0, 220)}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, color: theme.mutedText, fontSize: 13 }}>
        <div><strong style={{ color: theme.cardText }}>Creator:</strong> {getCreator(ticket)}</div>
        <div><strong style={{ color: theme.cardText }}>Assigned:</strong> {getAssigned(ticket)}</div>
        <div><strong style={{ color: theme.cardText }}>Priority:</strong> <span style={{ color: priorityTone(priority, theme), fontWeight: 950, textTransform: 'uppercase' }}>{priority}</span></div>
        <div><strong style={{ color: theme.cardText }}>Created:</strong> {formatDate(ticket.createdAt)}</div>
      </div>
    </button>
  );
}

function TicketDetail({ theme, ticket, acting, onAction }) {
  if (!ticket) {
    return (
      <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.mutedText, borderRadius: 22, padding: 22, boxShadow: theme.shadow }}>
        Select a ticket to view details, ownership and available staff actions.
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
          <h2 style={{ margin: '6px 0 0' }}>{ticketTitle(ticket)}</h2>
        </div>
        <StatusPill theme={theme} status={ticket.status} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10, color: theme.mutedText, fontSize: 13 }}>
        <div><strong style={{ color: theme.cardText }}>ID:</strong> {id || 'Unknown'}</div>
        <div><strong style={{ color: theme.cardText }}>Creator:</strong> {getCreator(ticket)}</div>
        <div><strong style={{ color: theme.cardText }}>Assigned:</strong> {getAssigned(ticket)}</div>
        <div><strong style={{ color: theme.cardText }}>Type:</strong> {ticket.type || 'support'}</div>
        <div><strong style={{ color: theme.cardText }}>Transcript:</strong> {ticket.transcript ? 'Saved' : 'Not saved'}</div>
        <div><strong style={{ color: theme.cardText }}>Updated:</strong> {formatDate(ticket.updatedAt || ticket.lastActivityAt)}</div>
      </div>

      {ticket.description ? <p style={{ margin: 0, color: theme.mutedText, lineHeight: 1.6 }}>{ticket.description}</p> : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button type="button" disabled={acting || status !== 'open'} onClick={() => onAction('claim', ticket)} style={buttonStyle(!acting && status === 'open', 'rgba(37,99,235,0.22)')}>Claim</button>
        <button type="button" disabled={acting || !['open', 'claimed'].includes(status)} onClick={() => onAction('close', ticket)} style={buttonStyle(!acting && ['open', 'claimed'].includes(status), 'rgba(202,138,4,0.22)')}>Close</button>
        <button type="button" disabled={acting || status !== 'closed'} onClick={() => onAction('reopen', ticket)} style={buttonStyle(!acting && status === 'closed', 'rgba(22,163,74,0.22)')}>Reopen</button>
        <button type="button" disabled={acting || status !== 'closed'} onClick={() => onAction('archive', ticket)} style={buttonStyle(!acting && status === 'closed', 'rgba(124,58,237,0.22)')}>Archive</button>
      </div>
    </section>
  );
}

function MiniMetric({ theme, title, value }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12, background: 'rgba(15,23,42,0.22)' }}>
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 950 }}>{value}</div>
    </div>
  );
}

function RecentActivity({ theme, tickets = [] }) {
  const recent = [...tickets]
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0))
    .slice(0, 5);

  return (
    <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 22, padding: 20, boxShadow: theme.shadow }}>
      <h3 style={{ margin: '0 0 12px' }}>Recent Ticket Activity</h3>
      {recent.length ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {recent.map((ticket) => (
            <div key={ticketId(ticket) || `${ticket.createdAt}-${ticket.title}`} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12, background: 'rgba(15,23,42,0.22)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <strong>{ticketTitle(ticket)}</strong>
                <StatusPill theme={theme} status={ticket.status} />
              </div>
              <div style={{ color: theme.mutedText, marginTop: 6, fontSize: 13 }}>{formatDate(ticket.updatedAt || ticket.createdAt)}</div>
            </div>
          ))}
        </div>
      ) : <div style={{ color: theme.mutedText }}>No recent ticket activity yet.</div>}
    </section>
  );
}

export default function Tickets({ theme, selectedGuild, selectedGuildData, user }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [overview, setOverview] = useState({});
  const [tickets, setTickets] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [filter, setFilter] = useState('active');
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState('newest');
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

      if (selectedTicketId && !nextTickets.some((ticket) => ticketId(ticket) === selectedTicketId)) {
        setSelectedTicketId('');
      }
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
    const lowerQuery = query.trim().toLowerCase();

    let output = tickets.filter((ticket) => {
      const status = String(ticket.status || '').toLowerCase();
      if (filter === 'active' && !['open', 'claimed'].includes(status)) return false;
      if (!['all', 'active'].includes(filter) && status !== filter) return false;

      if (!lowerQuery) return true;

      return [ticketId(ticket), ticketTitle(ticket), getCreator(ticket), getAssigned(ticket), ticket.type, ticket.priority, ticket.description]
        .some((value) => String(value || '').toLowerCase().includes(lowerQuery));
    });

    output = [...output].sort((a, b) => {
      if (sortMode === 'oldest') return Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0);
      if (sortMode === 'priority') {
        const score = { urgent: 4, high: 3, normal: 2, low: 1 };
        return (score[String(b.priority || 'normal').toLowerCase()] || 0) - (score[String(a.priority || 'normal').toLowerCase()] || 0);
      }
      return Date.parse(b.createdAt || b.updatedAt || 0) - Date.parse(a.createdAt || a.updatedAt || 0);
    });

    return output;
  }, [tickets, filter, query, sortMode]);

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
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: '0 0 8px', color: '#93c5fd', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Goliath Support Suite</p>
            <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: '-0.04em' }}>Tickets</h1>
            <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 860 }}>Review live ticket queues, inspect ownership, spot urgent work and take staff actions from one dashboard.</p>
          </div>

          <button type="button" onClick={load} disabled={loading} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(37,99,235,0.22)', color: theme.cardText, borderRadius: 999, padding: '10px 14px', fontWeight: 950, cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? 'Refreshing...' : 'Refresh Tickets'}
          </button>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12 }}>
        <StatCard theme={theme} label="Status" value={overview.enabled === false ? 'Disabled' : 'Enabled'} hint={loading ? 'Loading...' : 'Ticket module'} />
        <StatCard theme={theme} label="Active" value={overview.activeCount ?? 0} hint="Open + claimed" accent="#86efac" />
        <StatCard theme={theme} label="Open" value={overview.openCount ?? 0} hint="Awaiting staff" accent="#86efac" />
        <StatCard theme={theme} label="Claimed" value={overview.claimedCount ?? 0} hint="Owned by staff" />
        <StatCard theme={theme} label="Closed" value={overview.closedCount ?? 0} hint={`${overview.closedTodayCount ?? 0} closed today`} accent="#fcd34d" />
        <StatCard theme={theme} label="Transcripts" value={overview.transcriptCount ?? 0} hint="Saved transcripts" accent="#c4b5fd" />
      </section>

      {(error || notice) ? <section style={{ ...cardStyle, padding: 16, color: error ? '#fca5a5' : '#86efac', fontWeight: 850 }}>{error || notice}</section> : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))', gap: 18 }}>
        <TicketDetail theme={theme} ticket={selectedTicket} acting={acting} onAction={handleTicketAction} />
        <RecentActivity theme={theme} tickets={tickets} />
      </section>

      <section style={{ ...cardStyle, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px' }}>Panel Deployment Summary</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
          <MiniMetric theme={theme} title="Panels" value={overview.panelCount ?? 0} />
          <MiniMetric theme={theme} title="Deployed" value={overview.deployedPanelCount ?? 0} />
          <MiniMetric theme={theme} title="Archived" value={overview.archivedCount ?? 0} />
          <MiniMetric theme={theme} title="Closed Today" value={overview.closedTodayCount ?? 0} />
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 18, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ticket Queue</div>
            <div style={{ marginTop: 5, fontWeight: 950 }}>{filteredTickets.length} shown / {tickets.length} total</div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['active', 'open', 'claimed', 'closed', 'archived', 'all'].map((option) => (
              <button key={option} type="button" onClick={() => setFilter(option)} style={{ border: `1px solid ${filter === option ? '#93c5fd' : theme.cardBorder}`, background: filter === option ? 'rgba(59,130,246,0.24)' : 'rgba(15,23,42,0.35)', color: theme.cardText, borderRadius: 999, padding: '9px 12px', fontWeight: 900, cursor: 'pointer', textTransform: 'capitalize' }}>{option}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 10 }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tickets by ID, creator, title, type or priority..." style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.45)', color: theme.cardText, borderRadius: 14, padding: '11px 12px', fontWeight: 800 }} />
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value)} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.45)', color: theme.cardText, borderRadius: 14, padding: '11px 12px', fontWeight: 800 }}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="priority">Priority first</option>
          </select>
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
