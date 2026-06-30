import React from 'react';

import useOwnerRuntime from '../../hooks/useOwnerRuntime.js';
import RuntimeHealthPanel from './runtime/RuntimeHealthPanel.jsx';

function formatBytes(bytes = 0) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  const mb = value / 1024 / 1024;
  return mb < 1024 ? Math.round(mb) + ' MB' : (mb / 1024).toFixed(2) + ' GB';
}

function formatUptime(seconds = 0) {
  const total = Math.floor(Number(seconds) || 0);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return days + 'd ' + hours + 'h';
  if (hours) return hours + 'h ' + minutes + 'm';
  return minutes + 'm';
}

function statusColor(status) {
  if (status === 'online') return '#22c55e';
  if (status === 'offline') return '#ef4444';
  return '#f59e0b';
}

function percent(used = 0, total = 0) {
  if (!Number(total)) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(used) / Number(total)) * 100)));
}

export default function RuntimeMonitor({ theme }) {
  const { runtime, loading, error, refresh } = useOwnerRuntime();
  const card = { border: '1px solid ' + theme.cardBorder, background: theme.cardBg, color: theme.cardText, borderRadius: 20, padding: 18, boxShadow: theme.shadow, minWidth: 0, overflow: 'hidden' };

  const environments = runtime?.environments || [];
  const summary = runtime?.summary || {};
  const proc = runtime?.process || {};
  const system = runtime?.system || {};
  const memory = runtime?.memory || system.memory || {};
  const procMemory = memory.process || {};
  const discord = runtime?.discord || {};
  const services = runtime?.services || {};
  const modules = runtime?.modules || [];
  const paths = runtime?.runtimePaths || {};

  return (
    <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
      <section style={{ ...card, background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(15,23,42,0.08), rgba(34,197,94,0.10))' }}>
        <p style={{ margin: 0, color: '#93c5fd', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Owner Runtime</p>
        <h1 style={{ margin: '8px 0 0', fontSize: 'clamp(30px, 4vw, 44px)' }}>Runtime Centre</h1>
        <p style={{ margin: '8px 0 0', color: theme.mutedText }}>Operational visibility for DEV, BETA and PRODUCTION.</p>
      </section>

      {error ? <section style={{ ...card, color: '#fca5a5' }}>{error}</section> : null}

      <RuntimeHealthPanel theme={theme} runtime={runtime || {}} loading={loading} onRefresh={refresh} />

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14 }}>
        <Stat theme={theme} title="Environments" value={`${summary.online || 0}/${summary.total || environments.length || 0}`} detail={`${summary.offline || 0} offline`} />
        <Stat theme={theme} title="Guilds" value={summary.guilds || discord.guildCount || 0} detail="Connected servers" />
        <Stat theme={theme} title="Members" value={(summary.members || discord.memberCount || 0).toLocaleString()} detail="Visible members" />
        <Stat theme={theme} title="Gateway Ping" value={`${discord.wsPing || 0}ms`} detail={discord.ready ? 'Ready' : 'Not ready'} />
        <Stat theme={theme} title="Uptime" value={formatUptime(proc.uptime || runtime?.uptime)} detail={`PID ${proc.pid || 'unknown'}`} />
      </section>

      <section style={card}>
        <h2 style={{ margin: 0 }}>Environment Status</h2>
        <p style={{ margin: '6px 0 14px', color: theme.mutedText }}>Aggregated runtime status across configured ports.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
          {environments.length ? environments.map((env) => <Environment key={env.environment || env.mode} env={env} theme={theme} />) : <Muted theme={theme}>No environment payloads returned yet.</Muted>}
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(310px,1fr))', gap: 14 }}>
        <Panel theme={theme} title="System Resources">
          <Meter theme={theme} label="System Memory" value={percent(memory.used, memory.total)} detail={`${formatBytes(memory.used)} / ${formatBytes(memory.total)}`} />
          <Meter theme={theme} label="Process Heap" value={percent(procMemory.heapUsed, procMemory.heapTotal)} detail={`${formatBytes(procMemory.heapUsed)} / ${formatBytes(procMemory.heapTotal)}`} />
          <Row theme={theme} label="Host" value={system.hostname || runtime?.hostname || 'Unknown'} />
          <Row theme={theme} label="CPU Cores" value={String(system.cpuCount || runtime?.cpuCount || 'Unknown')} />
          <Row theme={theme} label="Load Average" value={(system.loadAverage || []).map((v) => Number(v).toFixed(2)).join(' / ') || 'Unknown'} />
        </Panel>

        <Panel theme={theme} title="Process & Build">
          <Row theme={theme} label="Environment" value={runtime?.mode || runtime?.environment || 'Unknown'} />
          <Row theme={theme} label="Package" value={`${proc.packageName || 'goliath'} @ ${proc.version || 'unknown'}`} />
          <Row theme={theme} label="Node" value={proc.nodeVersion || runtime?.nodeVersion || 'Unknown'} />
          <Row theme={theme} label="Platform" value={`${proc.platform || runtime?.platform || 'unknown'} ${proc.arch || ''}`} />
          <Row theme={theme} label="Commit" value={proc.commitSha || runtime?.commitSha || 'Unavailable'} />
          <Row theme={theme} label="Build Time" value={proc.buildTime || 'Unavailable'} />
        </Panel>

        <Panel theme={theme} title="Discord Gateway">
          <Row theme={theme} label="Ready" value={discord.ready ? 'Yes' : loading ? 'Loading' : 'No'} />
          <Row theme={theme} label="Bot" value={discord.username || 'Unknown'} />
          <Row theme={theme} label="Gateway Ping" value={`${discord.wsPing || 0}ms`} />
          <Row theme={theme} label="Guilds" value={String(discord.guildCount || 0)} />
          <Row theme={theme} label="Ready At" value={discord.readyAt || 'Unknown'} />
        </Panel>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(310px,1fr))', gap: 14 }}>
        <Panel theme={theme} title="Service Health">
          {Object.entries(services).length ? Object.entries(services).map(([key, value]) => <Service key={key} theme={theme} label={key} value={value} />) : <Muted theme={theme}>No service data returned.</Muted>}
        </Panel>

        <Panel theme={theme} title="Runtime Paths">
          {Object.entries(paths).length ? Object.entries(paths).map(([key, value]) => <Path key={key} theme={theme} name={key} info={value} />) : <Muted theme={theme}>No runtime path data returned.</Muted>}
        </Panel>
      </section>

      <section style={card}>
        <h2 style={{ margin: 0 }}>Module Runtime Summary</h2>
        <p style={{ margin: '6px 0 14px', color: theme.mutedText }}>Enabled and disabled module counts from loaded guild JSON data.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
          {modules.length ? modules.map((mod) => <Module key={mod.key} theme={theme} mod={mod} />) : <Muted theme={theme}>No module summary returned yet.</Muted>}
        </div>
      </section>
    </div>
  );
}

function Stat({ theme, title, value, detail }) {
  return <div style={{ border: '1px solid ' + theme.cardBorder, background: theme.cardBg, borderRadius: 18, padding: 16, boxShadow: theme.shadow }}><div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{title}</div><div style={{ marginTop: 8, fontSize: 25, fontWeight: 950 }}>{value}</div><div style={{ marginTop: 5, color: theme.mutedText, fontSize: 13 }}>{detail}</div></div>;
}

function Panel({ theme, title, children }) {
  return <section style={{ border: '1px solid ' + theme.cardBorder, background: theme.cardBg, color: theme.cardText, borderRadius: 20, padding: 18, boxShadow: theme.shadow, minWidth: 0 }}><h2 style={{ margin: '0 0 14px' }}>{title}</h2><div style={{ display: 'grid', gap: 10 }}>{children}</div></section>;
}

function Environment({ env, theme }) {
  const status = env.status || 'offline';
  return <div style={{ border: `1px solid ${statusColor(status)}55`, background: `${statusColor(status)}12`, borderRadius: 16, padding: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{env.environment || env.mode || 'Unknown'}</strong><span style={{ color: statusColor(status), fontWeight: 950 }}>{status}</span></div><div style={{ marginTop: 10, color: theme.mutedText, fontSize: 13, lineHeight: 1.6 }}>Port: {env.port || env.sourcePort || 'unknown'}<br />Guilds: {env.discord?.guildCount ?? '—'}<br />Members: {(env.discord?.memberCount || 0).toLocaleString()}<br />Uptime: {formatUptime(env.process?.uptime)}<br />Ping: {env.discord?.wsPing ?? '—'}ms{env.error ? <><br /><span style={{ color: '#fca5a5' }}>{env.error}</span></> : null}</div></div>;
}

function Meter({ theme, label, value, detail }) {
  return <div><div style={{ display: 'flex', justifyContent: 'space-between', color: theme.mutedText, fontSize: 13, fontWeight: 900 }}><span>{label}</span><span>{value}%</span></div><div style={{ marginTop: 7, height: 10, borderRadius: 999, background: 'rgba(148,163,184,0.18)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${value}%`, background: '#60a5fa' }} /></div><div style={{ marginTop: 5, color: theme.mutedText, fontSize: 12 }}>{detail}</div></div>;
}

function Row({ label, value, theme }) {
  return <div style={{ border: '1px solid ' + theme.cardBorder, background: 'rgba(15,23,42,0.35)', borderRadius: 13, padding: 11 }}><div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 800 }}>{label}</div><div style={{ marginTop: 4, fontWeight: 900, overflowWrap: 'anywhere' }}>{value}</div></div>;
}

function Service({ label, value, theme }) {
  const status = String(value || '').toLowerCase();
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, border: '1px solid ' + theme.cardBorder, background: 'rgba(15,23,42,0.35)', borderRadius: 13, padding: 11 }}><strong>{label.replace(/([A-Z])/g, ' $1')}</strong><span style={{ color: statusColor(status === 'available' ? 'online' : status), fontWeight: 950 }}>{value}</span></div>;
}

function Path({ name, info, theme }) {
  return <div style={{ border: '1px solid ' + (info.exists ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'), background: info.exists ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', borderRadius: 13, padding: 11 }}><strong>{name}</strong><div style={{ marginTop: 5, color: info.exists ? '#86efac' : '#fca5a5', fontWeight: 900 }}>{info.exists ? 'Exists' : 'Missing'}</div><div style={{ marginTop: 5, color: theme.mutedText, fontSize: 12, overflowWrap: 'anywhere' }}>{info.path}</div></div>;
}

function Module({ mod, theme }) {
  return <div style={{ border: '1px solid ' + theme.cardBorder, background: 'rgba(15,23,42,0.28)', borderRadius: 13, padding: 12 }}><strong>{mod.key}</strong><div style={{ marginTop: 7, color: theme.mutedText, fontSize: 13, lineHeight: 1.5 }}>Enabled: {mod.enabled || 0}<br />Disabled: {mod.disabled || 0}<br />Configured: {mod.configured || 0}</div></div>;
}

function Muted({ theme, children }) {
  return <div style={{ color: theme.mutedText, lineHeight: 1.5 }}>{children}</div>;
}
