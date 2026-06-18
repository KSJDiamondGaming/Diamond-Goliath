import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../../services/apiClient.js';
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

export default function Modules({ theme, selectedGuild, selectedGuildData }) {
  const navigate = useNavigate();
  const guildId = getGuildId(selectedGuild, selectedGuildData);

  const [moduleState, setModuleState] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState('');

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
    [...moduleRegistry].sort((a, b) => (a.priority || 999) - (b.priority || 999))
  ), []);

  const modules = useMemo(() => mergeModuleState(registryModules, moduleState), [registryModules, moduleState]);

  const groups = useMemo(() => (
    Object.values(MODULE_CATEGORIES)
      .map((category) => ({ category, modules: modules.filter((module) => module.category === category) }))
      .filter((group) => group.modules.length > 0)
  ), [modules]);

  const stats = useMemo(() => ({
    total: modules.length,
    enabled: modules.filter((module) => module.enabled).length,
    live: modules.filter((module) => module.status === MODULE_STATUSES.live).length,
    backendReady: modules.filter((module) => module.status === MODULE_STATUSES.backendReady).length,
  }), [modules]);

  const cardStyle = {
    border: `1px solid ${theme.cardBorder}`,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 22,
    boxShadow: theme.shadow,
  };

  function handleOpenModule(module) {
    if (!module?.route || module.enabled !== true) return;
    const existingRoutes = new Set(['/automod', '/forms', '/generalSettings', '/logs', '/messages', '/restore', '/security']);
    if (existingRoutes.has(module.route)) navigate(module.route);
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
            <p style={{ margin: '10px 0 0', color: theme.mutedText, lineHeight: 1.6, maxWidth: 840 }}>Enable or disable each Goliath module for this guild. Enabled modules show a cog so their own settings page can be opened.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
            <StatCard theme={theme} label="Total Modules" value={stats.total} hint="Registered in hub" />
            <StatCard theme={theme} label="Enabled" value={stats.enabled} hint="Saved to guild JSON" />
            <StatCard theme={theme} label="Live Routes" value={stats.live} hint="Config pages ready" />
            <StatCard theme={theme} label="Backend Ready" value={stats.backendReady} hint="UI polish next" />
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 18 }}>
        <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Active Context</div>
        <div style={{ marginTop: 5, fontWeight: 950 }}>{getGuildName(selectedGuildData, selectedGuild)}</div>
        <div style={{ marginTop: 5, color: theme.mutedText, fontSize: 13 }}>
          {guildId ? `Saving module states to modules.{moduleKey}.enabled in guild ${guildId}.json` : 'Select a server from the navbar to manage modules.'}
          {loading ? ' · Loading states...' : ''}
        </div>
        {error ? <div style={{ marginTop: 8, color: '#fca5a5', fontSize: 13, fontWeight: 850 }}>{error}</div> : null}
      </section>

      {groups.map((group) => (
        <section key={group.category} style={{ display: 'grid', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: theme.cardText }}>{group.category}</h2>
            <p style={{ margin: '4px 0 0', color: theme.mutedText, fontSize: 13 }}>{group.modules.length} module{group.modules.length === 1 ? '' : 's'}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 14 }}>
            {group.modules.map((module) => (
              <ModuleCard
                key={module.key}
                module={module}
                theme={theme}
                onOpen={handleOpenModule}
                onToggle={handleToggleModule}
                saving={savingKey === module.key}
              />
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
