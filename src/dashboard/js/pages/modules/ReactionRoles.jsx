import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient.js';
import PageShell, { SectionCard, EmptyState, LoadingPanel, Notice, SecondaryButton, StatGrid, SummaryStat } from '../../shared/PageShell';
import { ChannelSelect, RoleSelect } from '../../ui/DiscordResourceSelects.jsx';

function getGuildId(selectedGuild, selectedGuildData) {
  const id = selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '';
  return String(id).split(':').pop().trim();
}

function normalizeList(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function inputStyle(theme) {
  return { width: '100%', boxSizing: 'border-box', border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.38)', color: theme.cardText, borderRadius: 12, padding: '11px 12px' };
}

function ActionButton({ theme, children, danger = false, ...props }) {
  return <button type="button" {...props} style={{ border: `1px solid ${danger ? '#ef4444' : theme.cardBorder}`, background: danger ? 'rgba(239,68,68,0.14)' : 'rgba(59,130,246,0.14)', color: danger ? '#fca5a5' : theme.cardText, borderRadius: 12, padding: '10px 13px', fontWeight: 900, cursor: props.disabled ? 'not-allowed' : 'pointer', opacity: props.disabled ? 0.55 : 1 }}>{children}</button>;
}

const newMapping = () => ({ emoji: '', roleId: '', label: '', mode: 'toggle', removeOnUnreact: true, enabled: true });

function MessageCard({ theme, message, selected, onSelect }) {
  const summary = message.content || message.embedDescription || message.embedTitle || 'Message with no text content';
  return (
    <button type="button" onClick={() => onSelect(message)} style={{ textAlign: 'left', width: '100%', border: `1px solid ${selected ? '#60a5fa' : theme.cardBorder}`, background: selected ? 'rgba(59,130,246,0.16)' : 'rgba(15,23,42,0.28)', color: theme.cardText, borderRadius: 16, padding: 14, cursor: 'pointer', display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><strong>#{message.channelName || message.channelId}</strong><span style={{ color: theme.mutedText }}>{message.authorName}{message.bot ? ' · Bot' : ''}</span></div>
      {message.embedTitle ? <div style={{ fontWeight: 900 }}>Embed: {message.embedTitle}</div> : null}
      <div style={{ color: theme.mutedText, whiteSpace: 'pre-wrap' }}>{summary.slice(0, 420)}{summary.length > 420 ? '…' : ''}</div>
      <div style={{ color: theme.mutedText, fontSize: 12 }}>{message.hasEmbeds ? `${message.embedCount} embed(s) · ` : ''}{message.reactionCount} reaction(s) · {message.createdAt ? new Date(message.createdAt).toLocaleString() : 'Unknown date'}</div>
    </button>
  );
}

export default function ReactionRoles({ theme, selectedGuild, selectedGuildData }) {
  const guildId = getGuildId(selectedGuild, selectedGuildData);
  const [config, setConfig] = useState({ enabled: true, panels: {}, analytics: {} });
  const [health, setHealth] = useState({ healthy: true, panels: [] });
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [results, setResults] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [filters, setFilters] = useState({ channelId: '', query: '', messageId: '', authorId: '', botsOnly: false, embedsOnly: false, pinnedOnly: false });
  const [form, setForm] = useState({ name: 'Reaction Roles', mappings: [newMapping()] });

  const panels = useMemo(() => Object.values(config.panels || {}), [config]);
  const mappings = useMemo(() => panels.flatMap((panel) => panel.mappings || []), [panels]);

  async function load() {
    if (!guildId) return;
    setLoading(true); setError('');
    try {
      const [payload, channelPayload, rolePayload] = await Promise.all([
        api.request(`/api/reaction-roles/${guildId}/overview`),
        api.getGuildChannels(guildId),
        api.getGuildRoles(guildId),
      ]);
      setConfig(payload.config || { enabled: true, panels: {}, analytics: {} });
      setHealth(payload.health || { healthy: true, panels: [] });
      setChannels(normalizeList(channelPayload, 'channels'));
      setRoles(normalizeList(rolePayload, 'roles'));
    } catch (loadError) { setError(loadError.message || 'Failed to load Reaction Roles.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [guildId]);

  async function searchMessages() {
    setSearching(true); setError(''); setNotice('');
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => { if (value !== '' && value !== false) params.set(key, String(value)); });
      params.set('scanLimit', filters.channelId ? '200' : '75');
      params.set('resultLimit', '50');
      const payload = await api.request(`/api/reaction-roles/${guildId}/messages/search?${params.toString()}`);
      setResults(payload.messages || []);
      setNotice(`${payload.messages?.length || 0} message(s) found across ${payload.scannedChannels || 0} channel(s).`);
    } catch (searchError) { setError(searchError.message || 'Message search failed.'); }
    finally { setSearching(false); }
  }

  function updateMapping(index, patch) {
    setForm((current) => ({ ...current, mappings: current.mappings.map((mapping, i) => i === index ? { ...mapping, ...patch } : mapping) }));
  }

  async function attach() {
    const validMappings = form.mappings.filter((mapping) => mapping.emoji.trim() && mapping.roleId);
    if (!selectedMessage || !validMappings.length) return;
    setLoading(true); setError(''); setNotice('');
    try {
      const payload = await api.request(`/api/reaction-roles/${guildId}/attach`, {
        method: 'POST',
        body: JSON.stringify({ name: form.name, channelId: selectedMessage.channelId, messageId: selectedMessage.id, mappings: validMappings.map((mapping) => ({ ...mapping, removeOnUnreact: mapping.mode === 'toggle' })) }),
      });
      setConfig(payload.config || config);
      setNotice(`Attached ${validMappings.length} reaction role(s) to the selected message without changing its content.`);
      setSelectedMessage(null); setResults([]); setForm({ name: 'Reaction Roles', mappings: [newMapping()] });
      await load();
    } catch (saveError) { setError(saveError.message || 'Failed to attach Reaction Roles.'); }
    finally { setLoading(false); }
  }

  async function toggleEnabled() {
    setLoading(true);
    try {
      const payload = await api.request(`/api/reaction-roles/${guildId}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled: config.enabled === false }) });
      setConfig(payload.config || config); setNotice(`Reaction Roles ${config.enabled === false ? 'enabled' : 'disabled'}.`);
    } catch (saveError) { setError(saveError.message); }
    finally { setLoading(false); }
  }

  async function repair(panelId = null) {
    setLoading(true); setError('');
    try {
      const path = panelId ? `/api/reaction-roles/${guildId}/panels/${encodeURIComponent(panelId)}/repair` : `/api/reaction-roles/${guildId}/repair`;
      await api.request(path, { method: 'POST' }); setNotice(panelId ? 'Message reactions repaired.' : 'All tracked messages checked and repaired.'); await load();
    } catch (repairError) { setError(repairError.message); }
    finally { setLoading(false); }
  }

  async function detach(panelId, clearReactions = false) {
    setLoading(true); setError('');
    try {
      await api.request(`/api/reaction-roles/${guildId}/panels/${encodeURIComponent(panelId)}?clearReactions=${clearReactions}`, { method: 'DELETE' });
      setNotice('Reaction-role function detached. The original message was not deleted or edited.'); await load();
    } catch (detachError) { setError(detachError.message); }
    finally { setLoading(false); }
  }

  if (!guildId) return <PageShell title="Reaction Roles" subtitle="Attach self-service roles to any Discord message." theme={theme}><EmptyState theme={theme} text="Select a server first." /></PageShell>;

  return (
    <PageShell title="Reaction Roles" subtitle="Find any accessible message or embed in the guild and attach emoji-to-role functions without replacing its content." theme={theme} guild={{ id: guildId, name: 'Reaction Roles' }} actions={<SecondaryButton theme={theme} onClick={toggleEnabled} disabled={loading}>{config.enabled === false ? 'Enable' : 'Disable'}</SecondaryButton>}>
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {notice ? <Notice theme={theme} tone="success">{notice}</Notice> : null}
      {loading ? <LoadingPanel theme={theme} text="Updating Reaction Roles..." /> : null}

      <StatGrid min="min(180px, 100%)"><SummaryStat theme={theme} label="Status" value={config.enabled === false ? 'Disabled' : 'Enabled'} accent={config.enabled === false ? '#f59e0b' : '#22c55e'} /><SummaryStat theme={theme} label="Messages" value={panels.length} accent="#3b82f6" /><SummaryStat theme={theme} label="Mappings" value={mappings.length} accent="#a855f7" /><SummaryStat theme={theme} label="Health" value={health.healthy ? 'Healthy' : 'Attention'} accent={health.healthy ? '#22c55e' : '#ef4444'} /><SummaryStat theme={theme} label="Assigned" value={config.analytics?.assigned || 0} accent="#22c55e" /></StatGrid>

      <SectionCard theme={theme} title="1. Find a Message" subtitle="Search one channel or the entire guild. You can filter by text, message ID, author, embeds, bots or pinned messages.">
        <div style={{ display: 'grid', gap: 12 }}>
          <ChannelSelect theme={theme} resources={channels} value={filters.channelId} onChange={(value) => setFilters({ ...filters, channelId: value || '' })} label="Channel (optional — leave blank to search the guild)" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}><input style={inputStyle(theme)} value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Contains text" /><input style={inputStyle(theme)} value={filters.messageId} onChange={(event) => setFilters({ ...filters, messageId: event.target.value })} placeholder="Exact message ID" /><input style={inputStyle(theme)} value={filters.authorId} onChange={(event) => setFilters({ ...filters, authorId: event.target.value })} placeholder="Author ID" /></div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: theme.mutedText }}><label><input type="checkbox" checked={filters.embedsOnly} onChange={(event) => setFilters({ ...filters, embedsOnly: event.target.checked })} /> Embeds only</label><label><input type="checkbox" checked={filters.botsOnly} onChange={(event) => setFilters({ ...filters, botsOnly: event.target.checked })} /> Bot messages only</label><label><input type="checkbox" checked={filters.pinnedOnly} onChange={(event) => setFilters({ ...filters, pinnedOnly: event.target.checked })} /> Pinned only</label></div>
          <div><ActionButton theme={theme} onClick={searchMessages} disabled={searching}>{searching ? 'Searching…' : 'Search Messages'}</ActionButton></div>
          <div style={{ display: 'grid', gap: 10 }}>{results.map((message) => <MessageCard key={`${message.channelId}:${message.id}`} theme={theme} message={message} selected={selectedMessage?.id === message.id} onSelect={setSelectedMessage} />)}</div>
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="2. Attach Reaction Roles" subtitle={selectedMessage ? `Selected message ${selectedMessage.id} in #${selectedMessage.channelName || selectedMessage.channelId}.` : 'Select a message above first.'}>
        <div style={{ display: 'grid', gap: 12 }}>
          <input style={inputStyle(theme)} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Tracking name" />
          {form.mappings.map((mapping, index) => <div key={index} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 14, display: 'grid', gap: 10 }}><div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px,0.35fr) minmax(180px,1fr) minmax(180px,0.7fr)', gap: 10 }}><input style={inputStyle(theme)} value={mapping.emoji} onChange={(event) => updateMapping(index, { emoji: event.target.value })} placeholder="Emoji" /><RoleSelect theme={theme} resources={roles} value={mapping.roleId} onChange={(value) => updateMapping(index, { roleId: value || '' })} label="Role" /><select style={inputStyle(theme)} value={mapping.mode} onChange={(event) => updateMapping(index, { mode: event.target.value })}><option value="toggle">Add + remove on unreact</option><option value="add">Add only</option><option value="remove">Remove role</option></select></div><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><input style={inputStyle(theme)} value={mapping.label} onChange={(event) => updateMapping(index, { label: event.target.value })} placeholder="Optional label" />{form.mappings.length > 1 ? <ActionButton theme={theme} danger onClick={() => setForm({ ...form, mappings: form.mappings.filter((_, i) => i !== index) })}>Remove</ActionButton> : null}</div></div>)}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><ActionButton theme={theme} onClick={() => setForm({ ...form, mappings: [...form.mappings, newMapping()] })}>+ Add Emoji → Role</ActionButton><ActionButton theme={theme} onClick={attach} disabled={loading || !selectedMessage || !form.mappings.some((mapping) => mapping.emoji.trim() && mapping.roleId)}>Attach to Selected Message</ActionButton></div>
        </div>
      </SectionCard>

      <SectionCard theme={theme} title="Tracked Messages" subtitle="Repair or detach functionality without deleting the original Discord message."><div style={{ display: 'grid', gap: 12 }}>{panels.length ? panels.map((panel) => { const panelHealth = health.panels?.find((item) => item.panelId === panel.panelId); return <div key={panel.panelId} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 14, display: 'grid', gap: 10 }}><div><strong style={{ color: theme.cardText }}>{panel.name}</strong> <span style={{ color: panelHealth?.healthy === false ? '#fca5a5' : '#86efac' }}>{panelHealth?.healthy === false ? 'Needs attention' : 'Healthy'}</span></div><div style={{ color: theme.mutedText, fontSize: 13 }}>Channel: {panel.channelId} · Message: {panel.messageId} · {panel.mappings?.length || 0} mapping(s)</div>{panelHealth?.issues?.length ? <div style={{ color: '#fca5a5' }}>{panelHealth.issues.join(' · ')}</div> : null}<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><ActionButton theme={theme} onClick={() => repair(panel.panelId)} disabled={loading}>Repair</ActionButton><ActionButton theme={theme} danger onClick={() => detach(panel.panelId, false)} disabled={loading}>Detach</ActionButton><ActionButton theme={theme} danger onClick={() => detach(panel.panelId, true)} disabled={loading}>Detach + Remove Bot Reactions</ActionButton></div></div>; }) : <EmptyState theme={theme} text="No messages attached yet." />}</div></SectionCard>
      <SectionCard theme={theme} title="Maintenance" subtitle="Re-add missing reactions and re-check messages and roles."><ActionButton theme={theme} onClick={() => repair()} disabled={loading}>Repair All</ActionButton></SectionCard>
    </PageShell>
  );
}
