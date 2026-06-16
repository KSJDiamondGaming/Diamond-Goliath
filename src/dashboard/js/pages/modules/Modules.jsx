import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import ModuleCard from '../../ui/ModuleCard.jsx';
import { futureModules, moduleRegistry } from '../../shared/moduleRegistry.js';

export default function Modules({ theme, selectedGuild }) {
  const navigate = useNavigate();

  const modules = useMemo(
    () => [...moduleRegistry].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const cardStyle = {
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 22,
    boxShadow: theme.shadow,
  };

  function handleOpenModule(module) {
    if (!module?.route) return;

    const existingRoutes = new Set(['/forms', '/messages']);

    if (existingRoutes.has(module.route)) {
      navigate(module.route);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section
        style={{
          ...cardStyle,
          padding: 24,
          position: 'relative',
          overflow: 'hidden',
          background:
            'linear-gradient(135deg, rgba(59,130,246,0.16), rgba(15,23,42,0.08) 48%, rgba(52,211,153,0.12))',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: -90,
            top: -90,
            width: 230,
            height: 230,
            borderRadius: 999,
            background: 'rgba(59,130,246,0.18)',
            filter: 'blur(4px)',
          }}
        />

        <div style={{ position: 'relative' }}>
          <p
            style={{
              margin: '0 0 8px',
              color: '#93c5fd',
              fontWeight: 950,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Goliath Modules
          </p>

          <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '-0.04em' }}>
            Modules
          </h1>

          <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 760 }}>
            A clean home for optional Goliath features. Phase 1 is a simple dashboard grid. Live module state will be added later.
          </p>
        </div>
      </section>

      {!selectedGuild ? (
        <section style={{ ...cardStyle, padding: 18, color: theme.mutedText }}>
          Select a server from the navbar to view available modules.
        </section>
      ) : null}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
          gap: 14,
        }}
      >
        {modules.map((module) => (
          <ModuleCard
            key={module.key}
            module={module}
            theme={theme}
            onOpen={handleOpenModule}
          />
        ))}
      </section>

      <section style={{ ...cardStyle, padding: 18, display: 'grid', gap: 12 }}>
        <div>
          <strong>Future Modules</strong>
          <div style={{ color: theme.mutedText, fontSize: 13, marginTop: 4 }}>
            Planned modules will be added here when their dashboard pages are ready.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {futureModules.map((name) => (
            <span
              key={name}
              style={{
                border: `1px solid ${theme.cardBorder}`,
                background: 'rgba(148,163,184,0.08)',
                color: theme.mutedText,
                borderRadius: 999,
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: 850,
              }}
            >
              {name}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

