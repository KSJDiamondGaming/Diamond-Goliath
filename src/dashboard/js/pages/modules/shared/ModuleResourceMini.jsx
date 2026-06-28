import React, { useEffect, useState } from 'react';
import { api } from '../../../services/apiClient.js';

function idFrom(selectedGuild, selectedGuildData) {
  return String(selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '').split(':').pop().trim();
}

function Stat({ theme, label, value }) {
  return <div style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,.34)', borderRadius: 18, padding: 16 }}><div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900 }}>{label}</div><div style={{ fontSize: 28, fontWeight: 950 }}>{value}</div></div>;
}

export default function ModuleResourceMini({ theme, selectedGuild, selectedGuildData, title, description }) {
  const guildId = idFrom(selectedGuild, selectedGuildData);
  const [data, setData] = useState({});
  const [note, setNote] = useState('');
  const box = { border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 22, boxShadow: theme.shadow };

  async function load(sync = false) {
    if (!guildId) return;
    setNote(sync ? 'Refreshing shared Discord resources...' : 'Loading shared Discord resources...');
    try {
      const payload = await api.request(`/api/discord/${guildId}/resources${sync ? '/sync' : ''}`, sync ? { method: 'POST' } : {});
      setData(payload || {});
      setNote(sync ? 'Shared Discord resources refreshed into guild JSON.' : '');
    } catch (error) {
      setNote(error.message || 'Could not load shared Discord resources.');
    }
  }

  useEffect(() => { load(false); }, [guildId]);

  if (!guildId) return <section style={{ ...box, padding: 24 }}>Select a server to manage {title}.</section>;

  return <div style={{ display: 'grid', gap: 18 }}>
    <section style={{ ...box, padding: 24 }}><h1 style={{ margin: 0 }}>{title}</h1><p style={{ color: theme.mutedText }}>{description}</p></section>
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}><Stat theme={theme} label="Channels" value={(data.channels || []).length} /><Stat theme={theme} label="Categories" value={(data.categories || []).length} /><Stat theme={theme} label="Roles" value={(data.roles || []).length} /><Stat theme={theme} label="Emojis" value={(data.emojis || []).length} /></section>
    {note ? <section style={{ ...box, padding: 16, color: theme.mutedText }}>{note}</section> : null}
    <section style={{ ...box, padding: 22 }}><h2>Overview</h2><p style={{ color: theme.mutedText }}>Reads cached Discord metadata from guild JSON.</p><button type="button" onClick={() => load(true)}>Refresh Discord Resources</button></section>
    <section style={{ ...box, padding: 22 }}><h2>Settings</h2><p style={{ color: theme.mutedText }}>Ready to use shared channels, roles, categories and emojis.</p></section>
    <section style={{ ...box, padding: 22 }}><h2>Analytics</h2><p style={{ color: theme.mutedText }}>Ready for module counters.</p></section>
    <section style={{ ...box, padding: 22 }}><h2>Discord Resources</h2><p style={{ color: theme.mutedText }}>Last sync: {data.lastSync || 'Not synced yet'}</p></section>
  </div>;
}
