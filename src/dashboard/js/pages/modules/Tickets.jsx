import React, { useEffect, useMemo, useState } from 'react';

import TicketPanelManagement from './TicketPanelManagement.jsx';
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
  return ticket.creatorTag || ticket.creatorName || ticket.metadata?.creatorTag || ticket.metadata?.submitterTag || ticket.creatorId || ticket.userId || 'Unknown creator';
}

function getAssigned(ticket = {}) {
  return ticket.assignedUserId || ticket.claimedBy || ticket.claimedById || 'Unassigned';
}

function getTicketStatus(ticket = {}) {
  return String(ticket.status || 'open').toLowerCase();
}

function isDeletedTicket(ticket = {}) {
  return getTicketStatus(ticket) === 'deleted' || Boolean(ticket.deletedAt);
}

function isFormTicket(ticket = {}) {
  return ticket.source === 'form' || Boolean(ticket.formSubmissionId) || Boolean(ticket.metadata?.submissionId);
}

function hasMissingChannel(ticket = {}) {
  const status = getTicketStatus(ticket);
  if (['closed', 'archived', 'deleted'].includes(status)) return false;
  return !ticket.discordChannelId && !ticket.channelId;
}

function getSubmissionId(ticket = {}) {
  return ticket.formSubmissionId || ticket.metadata?.submissionId || ticket.submissionId || null;
}

function getFormId(ticket = {}) {
  return ticket.metadata?.formId || ticket.sourceId || ticket.formId || null;
}

function getChannelId(ticket = {}) {
  return ticket.discordChannelId || ticket.channelId || null;
}

function getMessageId(ticket = {}) {
  return ticket.discordMessageId || ticket.messageId || null;
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
  if (value === 'deleted') return '#fca5a5';
  return theme.mutedText;
}

function priorityTone(priority, theme) {
  const value = String(priority || 'normal').toLowerCase();
  if (value === 'urgent') return '#fca5a5';
  if (value === 'high') return '#fcd34d';
  if (value === 'low') return '#86efac';
  return theme.mutedText;
}

function countTickets(tickets, status) {
  return tickets.filter((ticket) => getTicketStatus(ticket) === status).length;
}

function uniqueCount(values) {
  return new Set(values.filter(Boolean).map((value) => String(value))).size;
}

function topEntries(map, limit = 5) {
  return Object.entries(map)
    .sort(([, a], [, b]) => Number(b || 0) - Number(a || 0))
    .slice(0, limit);
}

function StatCard({ theme, label, value, hint, accent = '#93c5fd' }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.34)', borderRadius: 18, padding: 16 }}>
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950, color: accent, overflowWrap: 'anywhere' }}>{value}</div>
      {hint ? <div style={{ marginTop: 4, color: theme.mutedText, fontSize: 12, overflowWrap: 'anywhere' }}>{hint}</div> : null}
    </div>
  );
}

function DetailRow({ theme, label, value, hint, tone }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.28)', borderRadius: 14, padding: 13, display: 'grid', gap: 4 }}>
      <div style={{ color: theme.mutedText, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ color: tone || theme.cardText, fontWeight: 950, overflowWrap: 'anywhere' }}>{value || 'None'}</div>
      {hint ? <div style={{ color: theme.mutedText, fontSize: 12, overflowWrap: 'anywhere' }}>{hint}</div> : null}
    </div>
  );
}

function SectionHeader({ theme, title, description }) {
  return (
    <div>
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ticket Dashboard</div>
      <h3 style={{ margin: '6px 0 0' }}>{title}</h3>
      {description ? <p style={{ margin: '8px 0 0', color: theme.mutedText, lineHeight: 1.5 }}>{description}</p> : null}
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

function Badge({ tone = '#93c5fd', children }) {
  return (
    <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: 999, padding: '4px 8px', fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {children}
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {isFormTicket(ticket) ? <Badge tone="#c4b5fd">Form</Badge> : null}
          {hasMissingChannel(ticket) ? <Badge tone="#fca5a5">Missing Channel</Badge> : null}
          <StatusPill theme={theme} status={ticket.status} />
        </div>
      </div>

      {ticket.description ? <p style={{ margin: 0, color: theme.mutedText, lineHeight: 1.55 }}>{String(ticket.description).slice(0, 220)}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, color: theme.mutedText, fontSize: 13 }}>
        <div><strong style={{ color: theme.cardText }}>Creator:</strong> {getCreator(ticket)}</div>
        <div><strong style={{ color: theme.cardText }}>Assigned:</strong> {getAssigned(ticket)}</div>
        <div><strong style={{ color: theme.cardText }}>Priority:</strong> <span style={{ color: priorityTone(priority, theme), fontWeight: 950, textTransform: 'uppercase' }}>{priority}</span></div>
        <div><strong style={{ color: theme.cardText }}>Channel:</strong> {getChannelId(ticket) || 'Missing'}</div>
        <div><strong style={{ color: theme.cardText }}>Created:</strong> {formatDate(ticket.createdAt)}</div>
      </div>
    </button>
  );
}

function TicketDetail({ theme, ticket, acting, onAction }) {
  if (!ticket) {
    return (
      <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.mutedText, borderRadius: 22, padding: 22, boxShadow: theme.shadow }}>
        Select a ticket to view details, ownership, workflow links and available staff actions.
      </section>
    );
  }

  const status = getTicketStatus(ticket);
  const id = ticketId(ticket);
  const active = ['open', 'claimed', 'waiting_user', 'in_review', 'approved', 'denied'].includes(status);
  const closed = status === 'closed';
  const deleted = isDeletedTicket(ticket);

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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {isFormTicket(ticket) ? <Badge tone="#c4b5fd">Form Ticket</Badge> : null}
          {hasMissingChannel(ticket) ? <Badge tone="#fca5a5">Recovery Needed</Badge> : null}
          <StatusPill theme={theme} status={ticket.status} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
        <DetailRow theme={theme} label="Ticket ID" value={id || 'Unknown'} />
        <DetailRow theme={theme} label="Display ID" value={ticket.displayId || 'None'} />
        <DetailRow theme={theme} label="Creator" value={getCreator(ticket)} />
        <DetailRow theme={theme} label="Assigned" value={getAssigned(ticket)} />
        <DetailRow theme={theme} label="Type" value={ticket.type || 'support'} />
        <DetailRow theme={theme} label="Priority" value={ticket.priority || 'normal'} tone={priorityTone(ticket.priority, theme)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 10 }}>
        <DetailRow theme={theme} label="Source" value={ticket.source || 'discord'} />
        <DetailRow theme={theme} label="Source ID" value={ticket.sourceId || 'None'} />
        <DetailRow theme={theme} label="Form ID" value={getFormId(ticket)} />
        <DetailRow theme={theme} label="Submission ID" value={getSubmissionId(ticket)} />
        <DetailRow theme={theme} label="Channel ID" value={getChannelId(ticket)} tone={hasMissingChannel(ticket) ? '#fca5a5' : undefined} />
        <DetailRow theme={theme} label="Control Message" value={getMessageId(ticket)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
        <DetailRow theme={theme} label="Created" value={formatDate(ticket.createdAt)} />
        <DetailRow theme={theme} label="Updated" value={formatDate(ticket.updatedAt || ticket.lastActivityAt)} />
        <DetailRow theme={theme} label="Closed" value={formatDate(ticket.closedAt)} />
        <DetailRow theme={theme} label="Archived" value={formatDate(ticket.archivedAt)} />
        <DetailRow theme={theme} label="Deleted" value={formatDate(ticket.deletedAt)} />
        <DetailRow theme={theme} label="Transcript" value={ticket.transcriptUrl || ticket.transcriptId || ticket.transcript ? 'Saved' : 'Not saved'} />
      </div>

      {ticket.description ? <p style={{ margin: 0, color: theme.mutedText, lineHeight: 1.6 }}>{ticket.description}</p> : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button type="button" disabled={acting || deleted || status !== 'open'} onClick={() => onAction('claim', ticket)} style={buttonStyle(!acting && !deleted && status === 'open', 'rgba(37,99,235,0.22)')}>Claim</button>
        <button type="button" disabled={acting || deleted || !active} onClick={() => onAction('close', ticket)} style={buttonStyle(!acting && !deleted && active, 'rgba(202,138,4,0.22)')}>Close</button>
        <button type="button" disabled={acting || deleted || !['closed', 'archived'].includes(status)} onClick={() => onAction('reopen', ticket)} style={buttonStyle(!acting && !deleted && ['closed', 'archived'].includes(status), 'rgba(22,163,74,0.22)')}>Reopen</button>
        <button type="button" disabled={acting || deleted || !closed} onClick={() => onAction('archive', ticket)} style={buttonStyle(!acting && !deleted && closed, 'rgba(124,58,237,0.22)')}>Archive</button>
      </div>
    </section>
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

function TicketAnalytics({ theme, tickets = [], overview = {}, cardStyle }) {
  const byType = tickets.reduce((map, ticket) => {
    const key = String(ticket.type || 'support').toLowerCase();
    return { ...map, [key]: (map[key] || 0) + 1 };
  }, {});

  const byPriority = tickets.reduce((map, ticket) => {
    const key = String(ticket.priority || 'normal').toLowerCase();
    return { ...map, [key]: (map[key] || 0) + 1 };
  }, {});

  const assignedTickets = tickets.filter((ticket) => !['', 'Unassigned', 'unassigned'].includes(String(getAssigned(ticket) || '')));
  const staffCount = uniqueCount(assignedTickets.map(getAssigned));
  const creatorCount = uniqueCount(tickets.map(getCreator));
  const transcriptCount = overview.transcriptCount ?? tickets.filter((ticket) => ticket.transcript || ticket.transcriptUrl || ticket.transcriptId).length;

  return (
    <section style={{ ...cardStyle, padding: 20, display: 'grid', gap: 14 }}>
      <SectionHeader theme={theme} title="Ticket Analytics" description="Computed from the current ticket list plus modules.tickets overview data." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
        <DetailRow theme={theme} label="Total Tickets" value={overview.totalCount ?? tickets.length} />
        <DetailRow theme={theme} label="Unique Creators" value={creatorCount} />
        <DetailRow theme={theme} label="Assigned Staff" value={staffCount} />
        <DetailRow theme={theme} label="Transcripts" value={transcriptCount} />
        <DetailRow theme={theme} label="Form Tickets" value={overview.formTicketCount ?? tickets.filter(isFormTicket).length} />
        <DetailRow theme={theme} label="Missing Channels" value={overview.missingChannelRecordCount ?? tickets.filter(hasMissingChannel).length} tone={(overview.missingChannelRecordCount ?? tickets.filter(hasMissingChannel).length) ? '#fca5a5' : undefined} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12 }}>
        <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 14, background: 'rgba(15,23,42,0.22)' }}>
          <h4 style={{ margin: '0 0 10px' }}>Ticket Types</h4>
          {topEntries(byType).length ? topEntries(byType).map(([type, count]) => <DetailRow key={type} theme={theme} label={type} value={count} />) : <div style={{ color: theme.mutedText }}>No ticket types yet.</div>}
        </div>

        <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 14, background: 'rgba(15,23,42,0.22)' }}>
          <h4 style={{ margin: '0 0 10px' }}>Priority Mix</h4>
          {topEntries(byPriority).length ? topEntries(byPriority).map(([priority, count]) => <DetailRow key={priority} theme={theme} label={priority} value={count} />) : <div style={{ color: theme.mutedText }}>No priority data yet.</div>}
        </div>
      </div>
    </section>
  );
}

function StaffActivity({ theme, tickets = [], cardStyle }) {
  const claimedMap = tickets.reduce((map, ticket) => {
    const assigned = getAssigned(ticket);
    if (!assigned || String(assigned).toLowerCase() === 'unassigned') return map;
    return { ...map, [assigned]: (map[assigned] || 0) + 1 };
  }, {});

  const closedMap = tickets.reduce((map, ticket) => {
    const status = getTicketStatus(ticket);
    if (!['closed', 'archived'].includes(status)) return map;
    const assigned = getAssigned(ticket);
    if (!assigned || String(assigned).toLowerCase() === 'unassigned') return map;
    return { ...map, [assigned]: (map[assigned] || 0) + 1 };
  }, {});

  return (
    <section style={{ ...cardStyle, padding: 20, display: 'grid', gap: 14 }}>
      <SectionHeader theme={theme} title="Staff Activity" description="Claim and closure visibility from current ticket ownership data." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12 }}>
        <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 14, background: 'rgba(15,23,42,0.22)' }}>
          <h4 style={{ margin: '0 0 10px' }}>Claims / Ownership</h4>
          {topEntries(claimedMap).length ? topEntries(claimedMap).map(([staff, count]) => <DetailRow key={staff} theme={theme} label={staff} value={count} />) : <div style={{ color: theme.mutedText }}>No claimed tickets yet.</div>}
        </div>

        <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 14, background: 'rgba(15,23,42,0.22)' }}>
          <h4 style={{ margin: '0 0 10px' }}>Closed / Archived</h4>
          {topEntries(closedMap).length ? topEntries(closedMap).map(([staff, count]) => <DetailRow key={staff} theme={theme} label={staff} value={count} />) : <div style={{ color: theme.mutedText }}>No closure ownership yet.</div>}
        </div>
      </div>
    </section>
  );
}

function FormsIntegrationCard({ theme, overview = {}, cardStyle }) {
  return (
    <section style={{ ...cardStyle, padding: 20, display: 'grid', gap: 14 }}>
      <SectionHeader theme={theme} title="Forms → Tickets Workflow" description="Universal form submissions creating staff-review tickets." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 10 }}>
        <DetailRow theme={theme} label="Ticket Module" value={overview.enabled === false ? 'Disabled' : 'Enabled'} />
        <DetailRow theme={theme} label="Form Tickets" value={overview.formTicketCount ?? 0} />
        <DetailRow theme={theme} label="Missing Channels" value={overview.missingChannelRecordCount ?? 0} tone={overview.missingChannelRecordCount ? '#fca5a5' : undefined} />
        <DetailRow theme={theme} label="Panels" value={overview.panelCount ?? 0} />
      </div>
    </section>
  );
}

export default function Tickets({ theme, selectedGuild, selectedGuildData, user, currentUser }) {
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

  const panels = Array.isArray(overview.panels) ? overview.panels : [];

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

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticketId(ticket) === selectedTicketId) || null,
    [tickets, selectedTicketId],
  );

  const statusCounts = useMemo(() => ({
    open: countTickets(tickets, 'open'),
    claimed: countTickets(tickets, 'claimed'),
    closed: countTickets(tickets, 'closed'),
    archived: countTickets(tickets, 'archived'),
    deleted: tickets.filter(isDeletedTicket).length,
    form: tickets.filter(isFormTicket).length,
    missing: tickets.filter(hasMissingChannel).length,
    urgent: tickets.filter((ticket) => String(ticket.priority || '').toLowerCase() === 'urgent').length,
  }), [tickets]);

  const filteredTickets = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();

    let output = tickets.filter((ticket) => {
      const status = getTicketStatus(ticket);
      if (filter === 'active' && !['open', 'claimed', 'waiting_user', 'in_review', 'approved', 'denied'].includes(status)) return false;
      if (filter === 'form' && !isFormTicket(ticket)) return false;
      if (filter === 'missing' && !hasMissingChannel(ticket)) return false;
      if (filter === 'deleted' && !isDeletedTicket(ticket)) return false;
      if (!['all', 'active', 'form', 'missing', 'deleted'].includes(filter) && status !== filter) return false;
      if (!lowerQuery) return true;

      return [
        ticketId(ticket),
        ticketTitle(ticket),
        getCreator(ticket),
        getAssigned(ticket),
        ticket.type,
        ticket.priority,
        ticket.description,
        ticket.source,
        ticket.sourceId,
        getFormId(ticket),
        getSubmissionId(ticket),
        getChannelId(ticket),
        getMessageId(ticket),
      ].some((value) => String(value || '').toLowerCase().includes(lowerQuery));
    });

    output = [...output].sort((a, b) => {
      if (sortMode === 'oldest') return Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0);

      if (sortMode === 'priority') {
        const score = { urgent: 4, high: 3, normal: 2, low: 1 };
        return (score[String(b.priority || 'normal').toLowerCase()] || 0) - (score[String(a.priority || 'normal').toLowerCase()] || 0);
      }

      if (sortMode === 'updated') return Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0);

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
      const actorId = currentUser?.id || user?.id || selectedGuildData?.userId || 'dashboard';
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

  if (!guildId) {
    return <div style={{ ...cardStyle, padding: 24 }}>Select a server from the navbar to manage tickets.</div>;
  }

  const filterOptions = ['active', 'open', 'claimed', 'closed', 'archived', 'deleted', 'form', 'missing', 'all'];

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{ ...cardStyle, padding: 24, background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.08) 46%, rgba(168,85,247,0.14))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: '0 0 8px', color: '#93c5fd', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Goliath Support Suite</p>
            <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: '-0.04em' }}>Tickets</h1>
            <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 860 }}>Review live queues, form-created tickets, recovery gaps, ownership and staff actions from one dashboard.</p>
          </div>

          <button type="button" onClick={load} disabled={loading} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(37,99,235,0.22)', color: theme.cardText, borderRadius: 999, padding: '10px 14px', fontWeight: 950, cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? 'Refreshing...' : 'Refresh Tickets'}
          </button>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12 }}>
        <StatCard theme={theme} label="Status" value={overview.enabled === false ? 'Disabled' : 'Enabled'} hint={loading ? 'Loading...' : 'Ticket module'} />
        <StatCard theme={theme} label="Active" value={overview.activeCount ?? (statusCounts.open + statusCounts.claimed)} hint="Open + claimed" accent="#86efac" />
        <StatCard theme={theme} label="Open" value={overview.openCount ?? statusCounts.open} hint="Awaiting staff" accent="#86efac" />
        <StatCard theme={theme} label="Claimed" value={overview.claimedCount ?? statusCounts.claimed} hint="Owned by staff" />
        <StatCard theme={theme} label="Closed" value={overview.closedCount ?? statusCounts.closed} hint={`${overview.closedTodayCount ?? 0} closed today`} accent="#fcd34d" />
        <StatCard theme={theme} label="Archived" value={overview.archivedCount ?? statusCounts.archived} hint={`${overview.archivedTodayCount ?? 0} archived today`} accent="#c4b5fd" />
        <StatCard theme={theme} label="Deleted" value={overview.deletedCount ?? statusCounts.deleted} hint={`${overview.deletedTodayCount ?? 0} deleted today`} accent="#fca5a5" />
        <StatCard theme={theme} label="Form Tickets" value={overview.formTicketCount ?? statusCounts.form} hint="Forms bridge" accent="#c4b5fd" />
        <StatCard theme={theme} label="Missing Channels" value={overview.missingChannelRecordCount ?? statusCounts.missing} hint="Needs recovery" accent={(overview.missingChannelRecordCount ?? statusCounts.missing) ? '#fca5a5' : '#86efac'} />
        <StatCard theme={theme} label="Urgent" value={statusCounts.urgent} hint="Priority queue" accent="#fca5a5" />
        <StatCard theme={theme} label="Transcripts" value={overview.transcriptCount ?? tickets.filter((ticket) => ticket.transcript || ticket.transcriptUrl || ticket.transcriptId).length} hint="Saved transcripts" accent="#c4b5fd" />
      </section>

      {(error || notice) ? <section style={{ ...cardStyle, padding: 16, color: error ? '#fca5a5' : '#86efac', fontWeight: 850 }}>{error || notice}</section> : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))', gap: 18 }}>
        <TicketDetail theme={theme} ticket={selectedTicket} acting={acting} onAction={handleTicketAction} />
        <RecentActivity theme={theme} tickets={tickets} />
      </section>

      <TicketAnalytics theme={theme} tickets={tickets} overview={overview} cardStyle={cardStyle} />
      <StaffActivity theme={theme} tickets={tickets} cardStyle={cardStyle} />
      <FormsIntegrationCard theme={theme} overview={overview} cardStyle={cardStyle} />

      <TicketPanelManagement theme={theme} panels={panels} overview={overview} />

      <section style={{ ...cardStyle, padding: 18, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ticket Queue</div>
            <div style={{ marginTop: 5, fontWeight: 950 }}>{filteredTickets.length} shown / {tickets.length} total</div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {filterOptions.map((option) => (
              <button key={option} type="button" onClick={() => setFilter(option)} style={{ border: `1px solid ${filter === option ? '#93c5fd' : theme.cardBorder}`, background: filter === option ? 'rgba(59,130,246,0.24)' : 'rgba(15,23,42,0.35)', color: theme.cardText, borderRadius: 999, padding: '9px 12px', fontWeight: 900, cursor: 'pointer', textTransform: 'capitalize' }}>{option === 'form' ? 'Forms' : option === 'missing' ? 'Missing Channel' : option}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 10 }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by ID, creator, form, submission, channel, type or priority..." style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.45)', color: theme.cardText, borderRadius: 14, padding: '11px 12px', fontWeight: 800 }} />
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value)} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.45)', color: theme.cardText, borderRadius: 14, padding: '11px 12px', fontWeight: 800 }}>
            <option value="newest">Newest first</option>
            <option value="updated">Recently updated</option>
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
