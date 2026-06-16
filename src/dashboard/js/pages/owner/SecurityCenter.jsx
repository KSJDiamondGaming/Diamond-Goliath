import React from 'react';
import useOwnerGuilds from '../../hooks/useOwnerGuilds.js';
import useOwnerSecurity from '../../hooks/useOwnerSecurity.js';

export default function SecurityCenter({ theme }) {
  const { guilds, selectedGuild, loading: guildsLoading } = useOwnerGuilds();
  const { security, loading, error } = useOwnerSecurity(selectedGuild);

  const card = { border: '1px solid ' + theme.cardBorder, background: theme.cardBg, color: theme.cardText, borderRadius: 20, padding: 18, boxShadow: theme.shadow };

  const selectedGuildName = guilds.find((g) => String(g.guildId || g.id) === selectedGuild)?.name || 'No guild selected';
  const incidents = Array.isArray(security?.incidents) ? security.incidents : [];

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={card}>
        <p style={{ margin: 0, color: '#ef4444', fontWeight: 900, textTransform: 'uppercase' }}>Global Security</p>
        <h1 style={{ margin: '8px 0 0', fontSize: 34 }}>Security Center</h1>
        <p style={{ marginTop: 8, color: theme.mutedText }}>Cross-guild security monitoring, incidents, lockdowns and quarantines.</p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
        <SecurityCard title='Selected Guild' value={guildsLoading ? 'Loading' : selectedGuildName} theme={theme} />
        <SecurityCard title='Active Lockdowns' value={String(security?.lockdowns?.length || 0)} theme={theme} />
        <SecurityCard title='Quarantines' value={String(security?.quarantines?.length || 0)} theme={theme} />
        <SecurityCard title='Incidents' value={String(incidents.length)} theme={theme} />
        <SecurityCard title='Webhook Events' value={String(security?.webhookEvents?.length || 0)} theme={theme} />
        <SecurityCard title='Channel Events' value={String(security?.channelEvents?.length || 0)} theme={theme} />
      </section>

      {error ? <section style={{ ...card, color: '#fca5a5' }}>{error}</section> : null}

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Recent Security Events</h3>
        {loading ? <div>Loading security data...</div> : incidents.length ? incidents.map((incident, index) => <div key={incident.id || index} style={{ border: '1px solid ' + theme.cardBorder, borderRadius: 14, padding: 12, marginBottom: 10 }}><strong>{incident.type || 'Security Event'}</strong><div style={{ color: theme.mutedText }}>{incident.environment || incident.guildId || selectedGuildName}</div></div>) : <div style={{ color: theme.mutedText }}>No recent security events found.</div>}
      </section>
    </div>
  );
}

function SecurityCard({ title, value, theme }) {
  return <div style={{ border: '1px solid ' + theme.cardBorder, background: theme.cardBg, borderRadius: 18, padding: 18 }}><div style={{ color: theme.mutedText }}>{title}</div><div style={{ fontSize: 24, fontWeight: 900, marginTop: 8 }}>{value}</div></div>;
}
