import React from 'react';

function formatDuration(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number <= 0) return 'None';
  if (number >= 3600000) return `${Math.round(number / 3600000)}h`;
  if (number >= 60000) return `${Math.round(number / 60000)}m`;

  return `${Math.round(number / 1000)}s`;
}

function StatusPill({ theme, deployed }) {
  const tone = deployed ? '#86efac' : '#fcd34d';
  const label = deployed ? 'Deployed' : 'Draft';

  return (
    <span
      style={{
        border: `1px solid ${tone}`,
        color: tone,
        borderRadius: 999,
        padding: '5px 9px',
        fontSize: 12,
        fontWeight: 950,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {label}
    </span>
  );
}

function MiniMetric({ theme, title, value }) {
  return (
    <div
      style={{
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: 14,
        padding: 12,
        background: 'rgba(15,23,42,0.22)',
      }}
    >
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 950 }}>{value}</div>
    </div>
  );
}

export default function TicketPanelManagement({ theme, panels = [], overview = {} }) {
  const safePanels = Array.isArray(panels) ? panels : [];
  const deployedCount = safePanels.filter((panel) => panel.deployed).length;
  const panelCount = Number(overview.panelCount ?? safePanels.length ?? 0);
  const undeployedCount = Math.max(0, panelCount - Number(overview.deployedPanelCount ?? deployedCount));
  const staffRoleCount = safePanels.reduce(
    (total, panel) => total + (Array.isArray(panel.staffRoles) ? panel.staffRoles.length : 0),
    0,
  );

  return (
    <section
      style={{
        border: `1px solid ${theme.cardBorder}`,
        background: theme.cardBg,
        color: theme.cardText,
        borderRadius: 22,
        padding: 20,
        boxShadow: theme.shadow,
        display: 'grid',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Ticket Panel Management
          </div>
          <h3 style={{ margin: '6px 0 0' }}>Panels</h3>
          <p style={{ margin: '8px 0 0', color: theme.mutedText, lineHeight: 1.5 }}>
            Review deployed ticket panels, channels, message records, role access counts and ticket limits.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
        <MiniMetric theme={theme} title="Total Panels" value={panelCount} />
        <MiniMetric theme={theme} title="Deployed" value={overview.deployedPanelCount ?? deployedCount} />
        <MiniMetric theme={theme} title="Undeployed" value={undeployedCount} />
        <MiniMetric theme={theme} title="Staff Roles" value={staffRoleCount} />
      </div>

      {safePanels.length ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {safePanels.map((panel) => {
            const roleCount = Array.isArray(panel.staffRoles) ? panel.staffRoles.length : 0;

            return (
              <div
                key={panel.id || panel.name || `${panel.channelId || 'panel'}-${panel.messageId || 'draft'}`}
                style={{
                  border: `1px solid ${theme.cardBorder}`,
                  borderRadius: 16,
                  padding: 14,
                  background: 'rgba(15,23,42,0.24)',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div>
                    <strong>{panel.name || 'Unnamed Panel'}</strong>
                    <div style={{ color: theme.mutedText, marginTop: 4, fontSize: 13 }}>
                      {panel.type || 'support'} panel
                    </div>
                  </div>

                  <StatusPill theme={theme} deployed={Boolean(panel.deployed)} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, color: theme.mutedText, fontSize: 13 }}>
                  <div><strong style={{ color: theme.cardText }}>Channel:</strong> {panel.channelId || 'Not deployed'}</div>
                  <div><strong style={{ color: theme.cardText }}>Message:</strong> {panel.messageId || 'Not set'}</div>
                  <div><strong style={{ color: theme.cardText }}>Limit:</strong> {panel.ticketLimit || 'Unlimited'}</div>
                  <div><strong style={{ color: theme.cardText }}>Cooldown:</strong> {formatDuration(panel.cooldown)}</div>
                  <div><strong style={{ color: theme.cardText }}>Staff Roles:</strong> {roleCount}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ color: theme.mutedText }}>No ticket panels returned by the API yet.</div>
      )}
    </section>
  );
}
