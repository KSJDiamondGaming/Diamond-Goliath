import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient.js';
import PageShell, { SectionCard, EmptyState, LoadingPanel, Notice, SecondaryButton, StatGrid, SummaryStat } from '../../shared/PageShell';

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Never' : date.toLocaleString();
}

function cleanStatus(value, fallback = 'draft') {
  return String(value || fallback).toLowerCase();
}

function DetailRow({ theme, label, value, hint }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.28)', borderRadius: 14, padding: 13, display: 'grid', gap: 4 }}>
      <div style={{ color: theme.mutedText, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ color: theme.cardText, fontWeight: 950, overflowWrap: 'anywhere' }}>{value || 'None'}</div>
      {hint ? <div style={{ color: theme.mutedText, fontSize: 12, overflowWrap: 'anywhere' }}>{hint}</div> : null}
    </div>
  );
}

function StatusPill({ theme, status }) {
  const value = cleanStatus(status);
  const tone = value === 'active' || value === 'deployed'
    ? '#86efac'
    : value === 'error' || value === 'missing'
      ? '#fca5a5'
      : '#fcd34d';

  return (
    <span style={{ border: `1px solid ${tone}`, color: tone, borderRadius: 999, padding: '5px 9px', fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {value}
    </span>
  );
}

function PanelCard({ theme, panel }) {
  const mappings = asArray(panel.mappings || panel.roles || panel.options || panel.items);
  const deployed = Boolean(panel.messageId && panel.channelId);

  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.26)', borderRadius: 18, padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{panel.id || panel.panelId || 'reaction_panel'}</div>
          <h3 style={{ margin: '5px 0 0', color: theme.cardText }}>{panel.name || panel.title || 'Reaction Role Panel'}</h3>
        </div>
        <StatusPill theme={theme} status={panel.status || (deployed ? 'deployed' : 'draft')} />
      </div>

      {panel.description ? <p style={{ margin: 0, color: theme.mutedText, lineHeight: 1.55 }}>{panel.description}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10 }}>
        <DetailRow theme={theme} label="Channel" value={panel.channelId || 'Not deployed'} />
        <DetailRow theme={theme} label="Message" value={panel.messageId || 'Not deployed'} />
        <DetailRow theme={theme} label="Mappings" value={mappings.length} />
        <DetailRow theme={theme} label="Updated" value={formatDate(panel.updatedAt || panel.createdAt)} />
      </div>
    </div>
  );
}

function MappingCard({ theme, mapping, index }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.24)', borderRadius: 14, padding: 13, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ color: theme.cardText }}>{mapping.emoji || mapping.emojiName || `Mapping ${index + 1}`}</strong>
        <StatusPill theme={theme} status={mapping.enabled === false ? 'disabled' : 'active'} />
      </div>
      <div style={{ color: theme.mutedText, fontSize: 13, lineHeight: 1.5 }}>
        <div><strong style={{ color: theme.cardText }}>Role:</strong> {mapping.roleName || mapping.roleId || 'No role'}</div>
        <div><strong style={{ color: theme.cardText }}>Panel:</strong> {mapping.panelId || mapping.panelName || 'Unknown panel'}</div>
        <div><strong style={{ color: theme.cardText }}>Mode:</strong> {mapping.mode || mapping.behaviour || 'toggle'}</div>
      </div>
    </div>
  );
}

export default function ReactionRoles({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const panels = useMemo(() => asArray(config.panels || config.messages || config.deployments), [config]);
  const mappings = useMemo(() => {
    const direct = asArray(config.mappings || config.roleMappings || config.roles || config.options);
    const fromPanels = panels.flatMap((panel) => asArray(panel.mappings || panel.roles || panel.options || panel.items).map((mapping) => ({ ...mapping, panelId: mapping.panelId || panel.id || panel.panelId, panelName: panel.name || panel.title })));
    return direct.length ? direct : fromPanels;
  }, [config, panels]);

  const analytics = config.analytics || {};
  const deployedPanels = panels.filter((panel) => panel.channelId && panel.messageId).length;
  const roleCount = new Set(mappings.map((mapping) => mapping.roleId || mapping.roleName).filter(Boolean)).size;
  const emojiCount = new Set(mappings.map((mapping) => mapping.emoji || mapping.emojiName || mapping.emojiId).filter(Boolean)).size;

  async function load() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    setNotice('');

    try {
      const payload = await api.getGuildModules(guildId);
      const modules = payload.modules || {};
      setConfig(modules.reactionRoles || { enabled: false, panels: {}, mappings: {}, analytics: {} });
    } catch (loadError) {
      setError(loadError.message || 'Failed to load Reaction Roles.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [guildId]);

  async function toggleEnabled() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    setNotice('');

    try {
      const enabled = config.enabled !== true;
      const result = await api.setGuildModuleEnabled(guildId, 'reactionRoles', enabled);
      setConfig(result.modules?.reactionRoles || { ...config, enabled });
      setNotice(`Reaction Roles ${enabled ? 'enabled' : 'disabled'}.`);
    } catch (saveError) {
      setError(saveError.message || 'Failed to update Reaction Roles status.');
    } finally {
      setLoading(false);
    }
  }

  if (!guildId) {
    return (
      <PageShell title="Reaction Roles" subtitle="Select a server to manage reaction role panels." theme={theme}>
        <EmptyState theme={theme} text="Select a server to manage reaction roles." />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Reaction Roles"
      subtitle="Create role menus, emoji mappings and reaction role panels."
      theme={theme}
      guild={{ id: guildId, name: 'Reaction Roles' }}
      actions={<SecondaryButton theme={theme} onClick={toggleEnabled} disabled={loading}>{config.enabled === true ? 'Disable' : 'Enable'}</SecondaryButton>}
    >
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {notice ? <Notice theme={theme} tone="success">{notice}</Notice> : null}
      {loading ? <LoadingPanel theme={theme} text="Loading Reaction Roles..." /> : null}

      <StatGrid min="min(190px, 100%)">
        <SummaryStat theme={theme} label="Status" value={config.enabled === true ? 'Enabled' : 'Disabled'} accent={config.enabled === true ? '#22c55e' : '#f59e0b'} description="modules.reactionRoles.enabled" />
        <SummaryStat theme={theme} label="Panels" value={panels.length} accent="#3b82f6" description="Reaction role panels" />
        <SummaryStat theme={theme} label="Deployed" value={deployedPanels} accent="#a855f7" description="Panels with message IDs" />
        <SummaryStat theme={theme} label="Roles" value={roleCount} accent="#22c55e" description="Mapped roles" />
        <SummaryStat theme={theme} label="Emojis" value={emojiCount} accent="#f59e0b" description="Mapped emojis" />
      </StatGrid>

      <SectionCard theme={theme} title="Analytics" subtitle="Assignment analytics from modules.reactionRoles.analytics.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12 }}>
          <DetailRow theme={theme} label="Assigned" value={analytics.assigned ?? analytics.added ?? 0} />
          <DetailRow theme={theme} label="Removed" value={analytics.removed ?? 0} />
          <DetailRow theme={theme} label="Failures" value={analytics.failed ?? analytics.failures ?? 0} />
          <DetailRow theme={theme} label="Last Assignment" value={formatDate(analytics.lastAssignedAt || analytics.lastAddedAt)} />
          <DetailRow theme={theme} label="Last Removal" value={formatDate(analytics.lastRemovedAt)} />
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Panel Health" subtitle="Tracked message/channel metadata for existing reaction role panels.">
        <div style={{ display: 'grid', gap: 12 }}>
          {panels.length ? panels.map((panel, index) => (
            <PanelCard key={panel.id || panel.panelId || `${panel.channelId || 'panel'}-${index}`} theme={theme} panel={panel} />
          )) : <EmptyState theme={theme} text="No reaction role panels stored yet. Next backend build will add panel create/deploy/update actions under modules.reactionRoles." />}
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Emoji → Role Mappings" subtitle="Current role mappings detected from panels or direct mapping storage.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12 }}>
          {mappings.length ? mappings.map((mapping, index) => (
            <MappingCard key={mapping.id || mapping.mappingId || `${mapping.roleId || 'role'}-${index}`} theme={theme} mapping={mapping} index={index} />
          )) : <EmptyState theme={theme} text="No emoji role mappings stored yet." />}
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Management Roadmap" subtitle="This page is now ready for the backend panel builder actions.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
          <DetailRow theme={theme} label="Create Panel" value="Next" hint="Create reaction role panel records in modules.reactionRoles.panels." />
          <DetailRow theme={theme} label="Deploy Panel" value="Next" hint="Send/update Discord messages and store channelId/messageId." />
          <DetailRow theme={theme} label="Edit Existing" value="Next" hint="Update existing Discord panel messages instead of reposting." />
          <DetailRow theme={theme} label="Analytics" value="Ready" hint="Assigned, removed and failed counts are surfaced here." />
        </div>
      </SectionCard>
    </PageShell>
  );
}
