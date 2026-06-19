import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../../services/apiClient.js';
import ModuleCard from '../../ui/ModuleCard.jsx';
import { MODULE_STATUSES, moduleRegistry } from '../../shared/moduleRegistry.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'enabled', label: 'Enabled' },
  { key: 'backendReady', label: 'Backend Ready' },
  { key: 'live', label: 'Live' },
  { key: 'comingSoon', label: 'Coming Soon' },
];

function StatCard({ theme, label, value, hint }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.34)', borderRadius: 18, padding: 16 }}>
      <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950, color: theme.cardText }}>{value}</div>
      {hint ? <div style={{ marginTop: 4, color: theme.mutedText, fontSize: 12 }}>{hint}</div> : null}
    </div>
  );
}

function FilterButton({ theme, active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? '#93c5fd' : theme.cardBorder}`,
        background: active ? 'rgba(59,130,246,0.24)' : 'rgba(15,23,42,0.35)',
        color: theme.cardText,
        borderRadius: 999,
        padding: '9px 12px',
        fontWeight: 900,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function getGuildName(guild, selectedGuild) {
  return guild?.guildName || guild?.rawName || guild?.name || selectedGuild || 'No server selected';
}

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
}

function mergeModuleState(registryModules, moduleState) {
  return registryModules.map((module) => {
    const saved = moduleState?.[module.key];
    const savedEnabled = typeof saved === 'boolean'
      ? saved
      : saved && typeof saved === 'object'
        ? saved.enabled === true
        : module.enabled === true;

    return {
      ...module,
      enabled: savedEnabled,
      savedConfig: saved && typeof saved === 'object' ? saved : {},
    };
  });
}

function filterModules(modules, search, filter) {
  const query = search.trim().toLowerCase();

  return modules.filter((module) => {
    const matchesSearch = !query || [module.name, module.key, module.summary, module.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));

    if (!matchesSearch) return false;

    if (filter === 'enabled') return module.enabled === true;
    if (filter === 'backendReady') return module.status === MODULE_STATUSES.backendReady;
    if (filter === 'live') return module.status === MODULE_STATUSES.live;
    if (filter === 'comingSoon') return [MODULE_STATUSES.planned, MODULE_STATUSES.uiPending].includes(module.status);

    return true;
  });
}

export default function Modules({ theme, selectedGuild, selectedGuildData }) {
  const navigate = useNavigate();
  const guildId = getGuildId(selectedGuild, selectedGuildData);

  const [moduleState, setModuleState] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let active = true;

    async function loadModules() {
      if (!guildId) {
        setModuleState({});
        return;
      }

      setLoading(true);
      setError('');

      try {
        const result = await api.getGuildModules(guildId);
        if (!active) return;
        setModuleState(result.modules || {});
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || 'Failed to load guild module states.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadModules();

    return () => {
      active = false;
    };
  }, [guildId]);

  const registryModules = useMemo(() => (
    [...moduleRegistry].sort((a, b) => a.name.localeCompare(b.name))
  ), []);

  const modules = useMemo(() => (
    mergeModuleState(registryModules, moduleState).sort((a, b) => a.name.localeCompare(b.name))
  ), [registryModules, moduleState]);

  const visibleModules = useMemo(() => (
    filterModules(modules, search, filter)
  ), [modules, search, filter]);

  const stats = useMemo(() => ({
    total: modules.length,
    enabled: modules.filter((module) => module.enabled).length,
    backendReady: modules.filter((module) => module.status === MODULE_STATUSES.backendReady).length,
    comingSoon: modules.filter((module) => [MODULE_STATUSES.planned, MODULE_STATUSES.uiPending].includes(module.status)).length,
  }), [modules]);

  const cardStyle = {
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 22,
    boxShadow: theme.shadow,
  };

  function handleOpenModule(module) {
    if (!module?.route) {
      setError(`${module?.name || 'This module'} does not have a dashboard page yet.`);
      return;
    }

    if (module.enabled !== true) {
      setError(`Enable ${module.name} before opening its dashboard page.`);
      return;
    }

    setError('');
    navigate(module.route);
  }

  async function handleToggleModule(module, enabled) {
    if (!guildId || !module?.key) return;

    const previousState = moduleState;
    const nextModuleConfig = {
      ...(typeof previousState[module.key] === 'object' ? previousState[module.key] : {}),
      enabled,
    };

    setSavingKey(module.key);
    setError('');
    setModuleState({ ...previousState, [module.key]: nextModuleConfig });

    try {
      const result = await api.setGuildModuleEnabled(guildId, module.key, enabled);
      setModuleState(result.modules || { ...previousState, [module.key]: nextModuleConfig });
    } catch (saveError) {
      setModuleState(previousState);
      setError(saveError.message || 'Failed to save module state.');
    } finally {
      setSavingKey('');
    }
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{ ...cardStyle, padding: 24, position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.08) 46%, rgba(52,211,153,0.14))' }}>
        <div style={{ position: 'relative', display: 'grid', gap: 18 }}>
          <div>
            <p style={{ margin: '0 0 8px', color: '#93c5fd', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Goliath Modules Hub</p>
            <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 42px)', letterSpacing: '-0.04em' }}>Modules</h1>
            <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 840 }}>Enable a module, then open it from this grid. Module pages stay hidden from the sidebar to keep navigation clean.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
            <StatCard theme={theme} label="Feature Modules" value={stats.total} hint="Grid launcher" />
            <StatCard theme={theme} label="Enabled" value={stats.enabled} hint="Saved to guild JSON" />
            <StatCard theme={theme} label="Backend Ready" value={stats.backendReady} hint="Storage/API ready" />
            <StatCard theme={theme} label="Coming Soon" value={stats.comingSoon} hint="Roadmap placeholders" />
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 18, display: 'grid', gap: 14 }}>
        <div>
          <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Active Context</div>
          <div style={{ marginTop: 5, fontWeight: 950 }}>{getGuildName(selectedGuildData, selectedGuild)}</div>
          <div style={{ marginTop: 5, color: theme.mutedText, fontSize: 13 }}>
            {guildId ? `Saving feature module states to modules.{moduleKey}.enabled in guild ${guildId}.json` : 'Select a server from the navbar to manage modules.'}
            {loading ? ' · Loading states...' : ''}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search modules..."
            style={{
              width: '100%',
              border: `1px solid ${theme.cardBorder}`,
              background: 'rgba(15,23,42,0.35)',
              color: theme.cardText,
              borderRadius: 16,
              padding: '12px 14px',
              fontWeight: 850,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {FILTERS.map((item) => (
              <FilterButton key={item.key} theme={theme} active={filter === item.key} onClick={() => setFilter(item.key)}>
                {item.label}
              </FilterButton>
            ))}
          </div>
        </div>

        {error ? <div style={{ color: '#fca5a5', fontSize: 13, fontWeight: 850 }}>{error}</div> : null}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 14 }}>
        {visibleModules.length === 0 ? (
          <div style={{ ...cardStyle, padding: 22, color: theme.mutedText }}>
            No modules match this search or filter.
          </div>
        ) : visibleModules.map((module) => (
          <ModuleCard
            key={module.key}
            module={module}
            theme={theme}
            onOpen={handleOpenModule}
            onToggle={handleToggleModule}
            saving={savingKey === module.key}
          />
        ))}
      </section>
    </div>
  );
}
