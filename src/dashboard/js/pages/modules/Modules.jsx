import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import ModuleCard from '../../ui/ModuleCard.jsx';
import { MODULE_CATEGORIES, MODULE_STATUSES, futureModules, moduleRegistry } from '../../shared/moduleRegistry.js';

function StatCard({ theme, label, value, hint }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.34)', borderRadius: 18, padding: 16 }}>
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950, color: theme.cardText }}>{value}</div>
      {hint ? <div style={{ marginTop: 4, color: theme.mutedText, fontSize: 12 }}>{hint}</div> : null}
    </div>
  );
}

function getGuildName(guild, selectedGuild) {
  return guild?.guildName || guild?.rawName || guild?.name || selectedGuild || 'No server selected';
}

export default function Modules({ theme, selectedGuild, selectedGuildData }) {
  const navigate = useNavigate();

  const modules = useMemo(() => (
    [...moduleRegistry].sort((a, b) => (a.priority || 999) - (b.priority || 999))
  ), []);

  const groups = useMemo(() => (
    Object.values(MODULE_CATEGORIES)
      .map((category) => ({ category, modules: modules.filter((module) => module.category === category) }))
      .filter((group) => group.modules.length > 0)
  ), [modules]);

  const stats = useMemo(() => ({
    total: modules.length,
    live: modules.filter((module) => module.status === MODULE_STATUSES.live).length,
    backendReady: modules.filter((module) => module.status === MODULE_STATUSES.backendReady).length,
    pending: modules.filter((module) => [MODULE_STATUSES.uiPending, MODULE_STATUSES.planned].includes(module.status)).length,
  }), [modules]);

  const cardStyle = {
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 22,
    boxShadow: theme.shadow,
  };

  function handleOpenModule(module) {
    if (!module?.route) return;
    const existingRoutes = new Set(['/automod', '/forms', '/generalSettings', '/logs', '/messages', '/restore', '/security']);
    if (existingRoutes.has(module.route)) navigate(module.route);
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{ ...cardStyle, padding: 24, position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.08) 46%, rgba(52,211,153,0.14))' }}>
        <div style={{ position: 'relative', display: 'grid', gap: 18 }}>
          <div>
            <p style={{ margin: '0 0 8px', color: '#93c5fd', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Goliath Modules Hub</p>
            <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: '-0.04em' }}>Modules</h1>
            <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 820 }}>One central grid for every Goliath feature. This page connects guild management to future module dashboards.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
            <StatCard theme={theme} label="Total Modules" value={stats.total} hint="Registered in hub" />
            <StatCard theme={theme} label="Live Routes" value={stats.live} hint="Openable now" />
            <StatCard theme={theme} label="Backend Ready" value={stats.backendReady} hint="UI polish next" />
            <StatCard theme={theme} label="Pending" value={stats.pending} hint="Roadmap modules" />
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 18 }}>
        <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Active Context</div>
        <div style={{ marginTop: 5, fontWeight: 950 }}>{getGuildName(selectedGuildData, selectedGuild)}</div>
        {!selectedGuild ? <div style={{ marginTop: 6, color: '#fde68a', fontSize: 13, fontWeight: 900 }}>Select a server from the navbar to manage modules.</div> : null}
      </section>

      {groups.map((group) => (
        <section key={group.category} style={{ display: 'grid', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: theme.cardText }}>{group.category}</h2>
            <p style={{ margin: '4px 0 0', color: theme.mutedText, fontSize: 13 }}>{group.modules.length} module{group.modules.length === 1 ? '' : 's'}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 14 }}>
            {group.modules.map((module) => (
              <ModuleCard key={module.key} module={module} theme={theme} onOpen={handleOpenModule} />
            ))}
          </div>
        </section>
      ))}

      <section style={{ ...cardStyle, padding: 18, display: 'grid', gap: 12 }}>
        <div>
          <strong>Future Modules</strong>
          <div style={{ color: theme.mutedText, fontSize: 13, marginTop: 4 }}>These roadmap items will move into the main grid as storage, APIs or dashboard routes are added.</div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {futureModules.map((name) => (
            <span key={name} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(148,163,184,0.08)', color: theme.mutedText, borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 850 }}>{name}</span>
          ))}
        </div>
      </section>
    </div>
  );
}
