import React, { useMemo } from 'react';

const fallbackTheme = {
  cardBorder: 'rgba(148,163,184,0.22)',
  cardBg: 'rgba(15,23,42,0.42)',
  cardText: '#e5e7eb',
  mutedText: '#94a3b8',
  shadow: '0 18px 50px rgba(0,0,0,0.25)',
};

function view(theme) {
  return { ...fallbackTheme, ...(theme || {}) };
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function env(guild) {
  return String(guild?.environment || guild?.runtimeMode || 'UNKNOWN').toUpperCase();
}

function isConnected(guild) {
  return Boolean(guild?.botConnected || guild?.connected || guild?.isConnected);
}

function Stat({ theme, label, value, hint, accent = '#93c5fd' }) {
  const t = view(theme);
  return (
    <div style={{ border: `1px solid ${t.cardBorder}`, background: 'rgba(15,23,42,0.24)', borderRadius: 16, padding: 14 }}>
      <div style={{ color: t.mutedText, fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ color: accent, fontSize: 26, fontWeight: 950, marginTop: 6 }}>{value}</div>
      {hint ? <div style={{ color: t.mutedText, fontSize: 12, marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

export default function OwnerAnalyticsPanel({ theme, guilds = [], runtime = {} }) {
  const t = view(theme);
  const data = useMemo(() => {
    const all = list(guilds);
    const envs = list(runtime?.environments);
    const members = all.reduce((sum, guild) => sum + number(guild.memberCount), 0);
    const connected = all.filter(isConnected).length;
    const dev = all.filter((guild) => env(guild) === 'DEV').length;
    const beta = all.filter((guild) => env(guild) === 'BETA').length;
    const prod = all.filter((guild) => env(guild) === 'PRODUCTION').length;
    const online = envs.filter((item) => String(item.status || '').toLowerCase() === 'online').length;
    const offline = envs.filter((item) => String(item.status || '').toLowerCase() === 'offline').length;
    const top = [...all].sort((a, b) => number(b.memberCount) - number(a.memberCount)).slice(0, 5);
    return { all, members, connected, dev, beta, prod, online, offline, top };
  }, [guilds, runtime]);

  return (
    <section style={{ border: `1px solid ${t.cardBorder}`, background: t.cardBg, color: t.cardText, borderRadius: 22, padding: 20, boxShadow: t.shadow, display: 'grid', gap: 16 }}>
      <div>
        <div style={{ color: t.mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Owner Analytics</div>
        <h3 style={{ margin: '6px 0 0' }}>Cross-Server Analytics</h3>
        <p style={{ margin: '8px 0 0', color: t.mutedText }}>Global server footprint, member totals and runtime availability.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: 10 }}>
        <Stat theme={t} label="Servers" value={data.all.length.toLocaleString()} hint="registered" />
        <Stat theme={t} label="Members" value={data.members.toLocaleString()} hint="visible total" accent="#86efac" />
        <Stat theme={t} label="Connected" value={`${data.connected}/${data.all.length}`} hint="bot status" accent={data.connected === data.all.length ? '#86efac' : '#fcd34d'} />
        <Stat theme={t} label="Runtime" value={`${data.online} online`} hint={`${data.offline} offline`} accent={data.offline ? '#fca5a5' : '#86efac'} />
        <Stat theme={t} label="DEV" value={data.dev} hint="development" accent="#60a5fa" />
        <Stat theme={t} label="PROD" value={data.prod} hint={`${data.beta} beta`} accent="#22c55e" />
      </div>

      <div style={{ border: `1px solid ${t.cardBorder}`, background: 'rgba(15,23,42,0.24)', borderRadius: 16, padding: 14 }}>
        <strong>Top Servers</strong>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {data.top.length ? data.top.map((guild) => (
            <div key={`${env(guild)}-${guild.guildId || guild.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: `1px solid ${t.cardBorder}`, paddingBottom: 8 }}>
              <span>{guild.guildName || guild.name || guild.guildId || guild.id}</span>
              <strong>{number(guild.memberCount).toLocaleString()}</strong>
            </div>
          )) : <span style={{ color: t.mutedText }}>No server analytics available yet.</span>}
        </div>
      </div>
    </section>
  );
}
