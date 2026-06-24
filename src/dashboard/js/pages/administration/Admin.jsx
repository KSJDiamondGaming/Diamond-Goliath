import React, { useMemo } from 'react';
import PageShell, {
  EmptyState,
  SectionCard,
  StatGrid,
  SummaryStat,
} from '../../shared/PageShell';
import { PAGE_LAYOUTS } from '../../ui/layout';
import { createSharedComponentStyles } from '../../ui/components';

function panel(theme, extra = {}) {
  return {
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 20,
    boxShadow: theme.shadow,
    minWidth: 0,
    overflow: 'hidden',
    ...extra,
  };
}

function badge(theme, label, tone = 'blue') {
  const accents = {
    blue: '#60a5fa',
    green: '#34d399',
    amber: '#facc15',
    purple: '#c084fc',
  };

  const color = accents[tone] || accents.blue;

  return (
    <span
      style={{
        border: `1px solid ${color}55`,
        background: `${color}14`,
        color,
        borderRadius: 999,
        padding: '6px 10px',
        fontSize: 12,
        fontWeight: 950,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function ControlCard({ theme, icon, title, text, status, tone }) {
  return (
    <div style={panel(theme, { padding: 16, display: 'grid', gap: 12 })}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <div style={{ fontSize: 24 }}>{icon}</div>
          <strong style={{ fontSize: 16 }}>{title}</strong>
        </div>
        {badge(theme, status, tone)}
      </div>
      <p style={{ margin: 0, color: theme.mutedText, lineHeight: 1.55, fontSize: 13 }}>{text}</p>
    </div>
  );
}

function ChecklistRow({ theme, label, value, accent = '#34d399' }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        alignItems: 'center',
        border: `1px solid ${theme.cardBorder}`,
        background: 'rgba(15,23,42,0.20)',
        borderRadius: 14,
        padding: '12px 13px',
      }}
    >
      <span style={{ color: theme.cardText, fontWeight: 850 }}>{label}</span>
      <span style={{ color: accent, fontWeight: 950 }}>{value}</span>
    </div>
  );
}

export default function Admin({ selectedGuild, theme }) {
  const styles = useMemo(() => createSharedComponentStyles(theme), [theme]);

  const page = PAGE_LAYOUTS.admin || {
    title: 'Admin',
    description: 'Core system configuration.',
    emptyDescription: 'Select a server to manage admin settings.',
  };

  return (
    <PageShell
      title={page.title}
      subtitle={
        selectedGuild
          ? page.description
          : page.emptyDescription
      }
      theme={theme}
    >
      {!selectedGuild && (
        <EmptyState theme={theme} text="Select a server to manage admin settings." />
      )}

      {selectedGuild && (
        <div style={{ ...styles.futurePage, gap: 18 }}>
          <SectionCard theme={theme}>
            <div
              style={{
                display: 'grid',
                gap: 18,
                padding: 'clamp(18px, 2.6vw, 24px)',
                border: `1px solid ${theme.primaryBorder || theme.cardBorder}`,
                borderRadius: 18,
                background:
                  'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.10) 55%, rgba(168,85,247,0.14))',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: '0 0 8px', color: '#93c5fd', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 12 }}>
                    Goliath Administration
                  </p>
                  <h2 style={{ margin: 0, fontSize: 'clamp(24px, 3vw, 34px)', letterSpacing: '-0.04em' }}>
                    ⚙️ Admin Control Center
                  </h2>
                  <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 760 }}>
                    A central command view for system readiness, configuration health, permission safety and live operational status. Module setup remains in the sidebar pages.
                  </p>
                </div>
                {badge(theme, 'Online', 'green')}
              </div>

              <StatGrid min="min(180px, 100%)">
                <SummaryStat theme={theme} label="Runtime" value="DEV" accent="#60a5fa" description="Current environment" />
                <SummaryStat theme={theme} label="Socket Layer" value="Live" accent="#34d399" description="Realtime dashboard sync" />
                <SummaryStat theme={theme} label="Guild Config" value="JSON" accent="#c084fc" description="One guild file source" />
                <SummaryStat theme={theme} label="Control Mode" value="Safe" accent="#facc15" description="No duplicated settings" />
              </StatGrid>
            </div>
          </SectionCard>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 16 }}>
            <ControlCard
              theme={theme}
              icon="🧠"
              title="Configuration Health"
              text="Tracks whether core settings, prefixes, permissions and guild metadata are available before deeper admin actions are used."
              status="Ready"
              tone="green"
            />
            <ControlCard
              theme={theme}
              icon="📡"
              title="Realtime Sync Layer"
              text="Monitors the dashboard socket bridge used by tickets, forms, embeds, cases, roles, channels and security updates."
              status="Live"
              tone="blue"
            />
            <ControlCard
              theme={theme}
              icon="🛡️"
              title="Permission Guard"
              text="Keeps bot access safe for managed channels, ticket categories, role sync, moderation tools and recovery actions."
              status="Guarded"
              tone="purple"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))', gap: 16 }}>
            <section style={panel(theme, { padding: 18, display: 'grid', gap: 14 })}>
              <div>
                <strong style={{ fontSize: 17 }}>✅ System Readiness</strong>
                <p style={{ margin: '6px 0 0', color: theme.mutedText, lineHeight: 1.5, fontSize: 13 }}>
                  Quick owner/staff confidence checks before editing live systems.
                </p>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <ChecklistRow theme={theme} label="Dashboard API" value="Connected" />
                <ChecklistRow theme={theme} label="Socket.IO" value="Ready" />
                <ChecklistRow theme={theme} label="Guild Runtime File" value="Loaded" />
                <ChecklistRow theme={theme} label="Permission Guard" value="Active" />
              </div>
            </section>

            <section style={panel(theme, { padding: 18, display: 'grid', gap: 14 })}>
              <div>
                <strong style={{ fontSize: 17 }}>🧾 Admin Activity Snapshot</strong>
                <p style={{ margin: '6px 0 0', color: theme.mutedText, lineHeight: 1.5, fontSize: 13 }}>
                  This panel is reserved for admin audit events, sync notices and future owner approvals.
                </p>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <ChecklistRow theme={theme} label="Recent config changes" value="Coming" accent="#93c5fd" />
                <ChecklistRow theme={theme} label="Admin action log" value="Planned" accent="#c084fc" />
                <ChecklistRow theme={theme} label="Safety approvals" value="Planned" accent="#facc15" />
                <ChecklistRow theme={theme} label="Restore checkpoints" value="Linked" accent="#34d399" />
              </div>
            </section>
          </div>
        </div>
      )}
    </PageShell>
  );
}
