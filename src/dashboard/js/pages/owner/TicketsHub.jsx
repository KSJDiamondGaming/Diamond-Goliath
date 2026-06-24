import React from 'react';

import useOwnerGuilds from '../../hooks/useOwnerGuilds.js';
import ownerApi from '../../services/ownerApi.js';

const TICKET_AREAS = [
  {
    title: 'Ticket Panels',
    description: 'Manage deployed panels, redeploy status, appearance, role access and per-panel limits.',
    status: 'API Ready',
  },
  {
    title: 'Tickets',
    description: 'View open, claimed, archived, reopened and closed tickets across connected guilds.',
    status: 'API Ready',
  },
  {
    title: 'Transcripts',
    description: 'Browse generated transcripts and prepare for transcript channel/user copy delivery.',
    status: 'Partial Data',
  },
  {
    title: 'Analytics',
    description: 'Track ticket volume, closure rate, claim activity, response time and panel usage.',
    status: 'Partial Data',
  },
  {
    title: 'Settings',
    description: 'Configure cooldowns, one-active rules, logs, transcripts and form-to-ticket workflows.',
    status: 'API Ready',
  },
];

const TICKET_WORKFLOWS = [
  'Support Ticket',
  'Appeal Ticket',
  'Application Ticket',
  'Report Ticket',
  'Custom Ticket',
];

const PANEL_CONTROLS = [
  'Deploy Panel',
  'Redeploy Panel',
  'Undeploy Panel',
  'Refresh Panel',
  'Appearance',
  'Role Access',
  'Ticket Limits',
  'Cooldowns',
  'Transcripts',
  'Logs',
];

function getGuildId(guild = {}) {
  return String(guild.guildId || guild.id || '');
}

function getGuildName(guild = {}) {
  return guild.name || guild.guildName || 'Unknown Guild';
}

function normalizeTickets(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.tickets)) return payload.tickets;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function ticketStatus(ticket = {}) {
  return String(ticket.status || 'open').toLowerCase();
}

function isFormTicket(ticket = {}) {
  return ticket.source === 'form' || Boolean(ticket.formSubmissionId) || Boolean(ticket.metadata?.submissionId);
}

function isMissingTicketChannel(ticket = {}) {
  const status = ticketStatus(ticket);
  if (['closed', 'archived', 'deleted'].includes(status)) return false;
  return !ticket.discordChannelId && !ticket.channelId;
}

function countTickets(tickets = [], predicate) {
  return tickets.filter(predicate).length;
}

export default function TicketsHub({ theme }) {
  const { guilds, selectedGuild, setSelectedGuild, loading, error } = useOwnerGuilds();
  const [overview, setOverview] = React.useState(null);
  const [tickets, setTickets] = React.useState([]);
  const [ticketsLoading, setTicketsLoading] = React.useState(false);
  const [ticketsError, setTicketsError] = React.useState('');

  const selectedGuildRecord = guilds.find((guild) => getGuildId(guild) === selectedGuild);
  const selectedGuildName = selectedGuildRecord ? getGuildName(selectedGuildRecord) : 'No guild selected';

  React.useEffect(() => {
    if (!selectedGuild) {
      setOverview(null);
      setTickets([]);
      return;
    }

    let cancelled = false;

    async function loadTicketsOverview() {
      try {
        setTicketsLoading(true);
        setTicketsError('');

        const [overviewPayload, ticketsPayload] = await Promise.all([
          ownerApi.getTicketsOverview(selectedGuild),
          ownerApi.getTickets(selectedGuild),
        ]);

        if (!cancelled) {
          setOverview(overviewPayload?.overview || null);
          setTickets(normalizeTickets(ticketsPayload));
        }
      } catch (err) {
        if (!cancelled) {
          setOverview(null);
          setTickets([]);
          setTicketsError(err.message || 'Failed to load tickets overview.');
        }
      } finally {
        if (!cancelled) {
          setTicketsLoading(false);
        }
      }
    }

    loadTicketsOverview();

    return () => {
      cancelled = true;
    };
  }, [selectedGuild]);

  const formTicketCount = overview?.formTicketCount ?? countTickets(tickets, isFormTicket);
  const missingChannelCount = overview?.missingChannelRecordCount ?? countTickets(tickets, isMissingTicketChannel);
  const deletedCount = overview?.deletedCount ?? countTickets(tickets, (ticket) => ticketStatus(ticket) === 'deleted' || ticket.deletedAt);
  const activeCount = overview?.activeCount ?? countTickets(tickets, (ticket) => ['open', 'claimed'].includes(ticketStatus(ticket)));

  const card = {
    border: '1px solid ' + theme.cardBorder,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 20,
    padding: 18,
    boxShadow: theme.shadow,
  };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={card}>
        <p style={{ margin: 0, color: '#f59e0b', fontWeight: 900, textTransform: 'uppercase' }}>
          Global Tickets
        </p>

        <h1 style={{ margin: '8px 0 0', fontSize: 34 }}>
          Tickets Hub
        </h1>

        <p style={{ marginTop: 8, color: theme.mutedText }}>
          Universal ticket dashboard with live overview data from guild ticket storage.
        </p>
      </section>

      {error ? (
        <section style={{ ...card, color: '#fca5a5' }}>
          {error}
        </section>
      ) : null}

      {ticketsError ? (
        <section style={{ ...card, color: '#fca5a5' }}>
          {ticketsError}
        </section>
      ) : null}

      <section style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <strong>Selected Guild</strong>
          <div style={{ color: theme.mutedText, marginTop: 4 }}>{selectedGuildName}</div>
        </div>

        <select
          value={selectedGuild}
          onChange={(event) => setSelectedGuild(event.target.value)}
          disabled={loading || guilds.length === 0}
          style={{
            border: '1px solid ' + theme.cardBorder,
            background: 'rgba(15,23,42,0.55)',
            color: theme.cardText,
            borderRadius: 12,
            padding: '10px 12px',
            minWidth: 260,
            fontWeight: 800,
          }}
        >
          {guilds.map((guild) => (
            <option key={getGuildId(guild)} value={getGuildId(guild)}>
              {getGuildName(guild)}
            </option>
          ))}
        </select>
      </section>

      <section style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <strong>Ticket Health</strong>
          <div style={{ color: theme.mutedText, marginTop: 4 }}>
            {missingChannelCount ? 'Recovery attention is needed for missing ticket channels.' : 'No active missing ticket channels detected.'}
          </div>
        </div>
        <span style={{
          border: `1px solid ${missingChannelCount ? '#fca5a5' : '#86efac'}`,
          color: missingChannelCount ? '#fca5a5' : '#86efac',
          borderRadius: 999,
          padding: '7px 10px',
          fontSize: 12,
          fontWeight: 950,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          {missingChannelCount ? 'Recovery Needed' : 'Healthy'}
        </span>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
          gap: 14,
        }}
      >
        <StatCard title="Connected Guilds" value={loading ? 'Loading' : String(guilds.length)} theme={theme} />
        <StatCard title="Open Tickets" value={ticketsLoading ? 'Loading' : String(overview?.openCount ?? 0)} theme={theme} />
        <StatCard title="Claimed Tickets" value={ticketsLoading ? 'Loading' : String(overview?.claimedCount ?? 0)} theme={theme} />
        <StatCard title="Closed Tickets" value={ticketsLoading ? 'Loading' : String(overview?.closedCount ?? 0)} theme={theme} />
        <StatCard title="Archived Tickets" value={ticketsLoading ? 'Loading' : String(overview?.archivedCount ?? 0)} theme={theme} />
        <StatCard title="Transcripts" value={ticketsLoading ? 'Loading' : String(overview?.transcriptCount ?? 0)} theme={theme} />
        <StatCard title="Active Tickets" value={ticketsLoading ? 'Loading' : String(activeCount)} theme={theme} />
        <StatCard title="Form Tickets" value={ticketsLoading ? 'Loading' : String(formTicketCount)} theme={theme} />
        <StatCard title="Missing Channels" value={ticketsLoading ? 'Loading' : String(missingChannelCount)} theme={theme} accent={missingChannelCount ? '#fca5a5' : '#86efac'} />
        <StatCard title="Deleted Tickets" value={ticketsLoading ? 'Loading' : String(deletedCount)} theme={theme} />
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
        {TICKET_AREAS.map((area) => (
          <FeatureCard key={area.title} item={area} theme={theme} />
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Universal Ticket Workflows</h3>
          <p style={{ marginTop: 0, color: theme.mutedText }}>
            All ticket types use the same universal ticket engine. No hardcoded support, appeal or report systems.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {TICKET_WORKFLOWS.map((workflow) => (
              <Pill key={workflow} label={workflow} theme={theme} />
            ))}
          </div>
        </section>

        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Panel Controls</h3>
          <p style={{ marginTop: 0, color: theme.mutedText }}>
            Dashboard-ready control list for panel management and ticket configuration.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PANEL_CONTROLS.map((control) => (
              <Pill key={control} label={control} theme={theme} />
            ))}
          </div>
        </section>
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Ticket Analytics</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          <MiniMetric title="Total Tickets" value={overview?.ticketCount ?? tickets.length} theme={theme} />
          <MiniMetric title="Active Tickets" value={activeCount} theme={theme} />
          <MiniMetric title="Closed Today" value={overview?.closedTodayCount ?? 0} theme={theme} />
          <MiniMetric title="Panels" value={overview?.panelCount ?? 0} theme={theme} />
          <MiniMetric title="Deployed Panels" value={overview?.deployedPanelCount ?? 0} theme={theme} />
          <MiniMetric title="Forms Bridge" value={formTicketCount} theme={theme} />
          <MiniMetric title="Recovery Risk" value={missingChannelCount} theme={theme} />
        </div>
      </section>
    </div>
  );
}

function StatCard({ title, value, theme, accent }) {
  return (
    <div
      style={{
        border: '1px solid ' + theme.cardBorder,
        background: theme.cardBg,
        borderRadius: 18,
        padding: 18,
      }}
    >
      <div style={{ color: theme.mutedText }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8, color: accent || theme.cardText }}>{value}</div>
    </div>
  );
}

function FeatureCard({ item, theme }) {
  return (
    <div
      style={{
        border: '1px solid ' + theme.cardBorder,
        background: theme.cardBg,
        borderRadius: 18,
        padding: 18,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <strong>{item.title}</strong>
        <span style={{ color: '#fde68a', fontSize: 12, fontWeight: 900 }}>{item.status}</span>
      </div>
      <p style={{ marginBottom: 0, color: theme.mutedText, lineHeight: 1.5 }}>{item.description}</p>
    </div>
  );
}

function Pill({ label, theme }) {
  return (
    <span
      style={{
        border: '1px solid ' + theme.cardBorder,
        background: 'rgba(245,158,11,0.12)',
        color: '#fde68a',
        borderRadius: 999,
        padding: '7px 10px',
        fontSize: 12,
        fontWeight: 850,
      }}
    >
      {label}
    </span>
  );
}

function MiniMetric({ title, value, theme }) {
  return (
    <div style={{ border: '1px solid ' + theme.cardBorder, borderRadius: 14, padding: 12 }}>
      <div style={{ color: theme.mutedText, fontSize: 12 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900 }}>{value}</div>
    </div>
  );
}
