import React, { useMemo } from 'react';

function formatDuration(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number <= 0) return 'None';
  if (number >= 3600000) return `${Math.round(number / 3600000)}h`;
  if (number >= 60000) return `${Math.round(number / 60000)}m`;

  return `${Math.round(number / 1000)}s`;
}

function panelId(panel = {}) {
  return panel.panelId || panel.id || panel.name || `${panel.channelId || 'panel'}-${panel.messageId || 'draft'}`;
}

function panelName(panel = {}) {
  return panel.name || panel.title || panel.appearance?.title || 'Unnamed Panel';
}

function panelType(panel = {}) {
  return panel.ticketType || panel.type || 'support';
}

function panelLimit(panel = {}) {
  return panel.ticketLimit || panel.maxOpenTicketsPerUser || panel.maxActiveTicketsPerUser || 'Unlimited';
}

function panelCooldown(panel = {}) {
  return panel.cooldown || panel.cooldownMs || 0;
}

function staffRoleCount(panel = {}) {
  if (Array.isArray(panel.staffRoles)) return panel.staffRoles.length;
  if (Array.isArray(panel.staffRoleIds)) return panel.staffRoleIds.length;
  return 0;
}

function isDeployed(panel = {}) {
  return Boolean(panel.deployed || (panel.channelId && panel.messageId));
}

function StatusPill({ deployed }) {
  const tone = deployed ? '#86efac' : '#fcd34d';
  const label = deployed ? 'Deployed' : 'Draft';

  return (
    <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {label}
    </span>
  );
}

function MiniMetric({ theme, title, value, hint, accent = '#93c5fd' }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 14, padding: 12, background: 'rgba(15,23,42,0.22)' }}>
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 950, color: accent }}>{value}</div>
      {hint ? <div style={{ marginTop: 4, color: theme.mutedText, fontSize: 12 }}>{hint}</div> : null}
    </div>
  );
}

function HealthPill({ theme, panel }) {
  const deployed = isDeployed(panel);
  const hasChannel = Boolean(panel.channelId);
  const hasStaff = staffRoleCount(panel) > 0;
  const tone = deployed && hasChannel && hasStaff ? '#86efac' : deployed && hasChannel ? '#fcd34d' : '#fca5a5';
  const label = deployed && hasChannel && hasStaff ? 'Healthy' : deployed && hasChannel ? 'Needs Staff Roles' : 'Needs Deploy';

  return (
    <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {label}
    </span>
  );
}

function PanelCard({ theme, panel }) {
  const deployed = isDeployed(panel);
  const roles = staffRoleCount(panel);
  const limit = panelLimit(panel);
  const cooldown = formatDuration(panelCooldown(panel));

  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 14, background: 'rgba(15,23,42,0.24)', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ overflowWrap: 'anywhere' }}>{panelName(panel)}</strong>
          <div style={{ color: theme.mutedText, marginTop: 4, fontSize: 13, textTransform: 'capitalize' }}>{panelType(panel)} panel</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <HealthPill theme={theme} panel={panel} />
          <StatusPill deployed={deployed} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, color: theme.mutedText, fontSize: 13 }}>
        <div><strong style={{ color: theme.cardText }}>Channel:</strong> {panel.channelId || 'Not selected'}</div>
        <div><strong style={{ color: theme.cardText }}>Message:</strong> {panel.messageId || 'Not deployed'}</div>
        <div><strong style={{ color: theme.cardText }}>Limit:</strong> {limit}</div>
        <div><strong style={{ color: theme.cardText }}>Cooldown:</strong> {cooldown}</div>
        <div><strong style={{ color: theme.cardText }}>Staff Roles:</strong> {roles}</div>
        <div><strong style={{ color: theme.cardText }}>Archive:</strong> {panel.archiveCategoryId || 'Default'}</div>
      </div>

      <div style={{ borderTop: `1px solid ${theme.cardBorder}`, paddingTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 8 }}>
        <span style={{ color: theme.mutedText, fontSize: 12 }}>🎫 Claim: {panel.autoAssignStaff ? 'Auto assign enabled' : 'Manual claim'}</span>
        <span style={{ color: theme.mutedText, fontSize: 12 }}>🧾 Transcripts: {panel.transcriptsChannelId || panel.transcriptsEnabled ? 'Enabled' : 'Default settings'}</span>
        <span style={{ color: theme.mutedText, fontSize: 12 }}>🔔 Staff Notify: {panel.notifyStaffOnOpen === false ? 'Off' : 'On'}</span>
      </div>
    </div>
  );
}

function WorkflowCard({ theme, title, description, items = [] }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.20)', borderRadius: 16, padding: 14, display: 'grid', gap: 10 }}>
      <strong style={{ color: theme.cardText }}>{title}</strong>
      <span style={{ color: theme.mutedText, fontSize: 13, lineHeight: 1.5 }}>{description}</span>
      <div style={{ display: 'grid', gap: 6 }}>
        {items.map((item) => <span key={item} style={{ color: theme.mutedText, fontSize: 12 }}>✓ {item}</span>)}
      </div>
    </div>
  );
}

export default function TicketPanelManagement({ theme, panels = [], overview = {} }) {
  const safePanels = Array.isArray(panels) ? panels : [];
  const metrics = useMemo(() => {
    const deployedCount = safePanels.filter(isDeployed).length;
    const panelCount = Number(overview.panelCount ?? safePanels.length ?? 0);
    const undeployedCount = Math.max(0, panelCount - Number(overview.deployedPanelCount ?? deployedCount));
    const staffRoles = safePanels.reduce((total, panel) => total + staffRoleCount(panel), 0);
    const healthyCount = safePanels.filter((panel) => isDeployed(panel) && panel.channelId && staffRoleCount(panel) > 0).length;

    return { panelCount, deployedCount: overview.deployedPanelCount ?? deployedCount, undeployedCount, staffRoles, healthyCount };
  }, [overview, safePanels]);

  return (
    <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 22, padding: 20, boxShadow: theme.shadow, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ticket Panel Management</div>
          <h3 style={{ margin: '6px 0 0' }}>Panels & Workflow Health</h3>
          <p style={{ margin: '8px 0 0', color: theme.mutedText, lineHeight: 1.5 }}>
            Review deployed ticket panels, channel/message records, access setup, cooldowns, per-user limits and staff workflow readiness.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
        <MiniMetric theme={theme} title="Total Panels" value={metrics.panelCount} />
        <MiniMetric theme={theme} title="Deployed" value={metrics.deployedCount} accent="#86efac" />
        <MiniMetric theme={theme} title="Draft" value={metrics.undeployedCount} accent="#fcd34d" />
        <MiniMetric theme={theme} title="Healthy" value={metrics.healthyCount} hint="Deployed + staff roles" accent="#86efac" />
        <MiniMetric theme={theme} title="Staff Roles" value={metrics.staffRoles} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12 }}>
        <WorkflowCard theme={theme} title="Staff Workflow" description="Panel setup should route users into private ticket channels with clear staff ownership." items={['Claim / close / reopen ready', 'Staff roles visible per panel', 'Open ticket limits visible']} />
        <WorkflowCard theme={theme} title="Transcript Workflow" description="Transcript visibility prepares the dashboard for the upcoming transcript browser." items={['Closed tickets can store transcripts', 'Archive categories visible', 'Transcript channel readiness surfaced']} />
        <WorkflowCard theme={theme} title="Forms Bridge" description="Panels remain compatible with the universal Forms → Tickets workflow." items={['Support, appeals, reports and applications', 'Per-panel ticket type tracking', 'Dashboard review workflow ready']} />
      </div>

      {safePanels.length ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {safePanels.map((panel) => <PanelCard key={panelId(panel)} theme={theme} panel={panel} />)}
        </div>
      ) : (
        <div style={{ color: theme.mutedText }}>No ticket panels returned by the API yet.</div>
      )}
    </section>
  );
}
