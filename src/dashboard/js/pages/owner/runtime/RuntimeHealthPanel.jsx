import React, { useMemo } from 'react';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function number(value = 0) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(used = 0, total = 0) {
  const max = number(total);
  if (!max) return 0;
  return Math.max(0, Math.min(100, Math.round((number(used) / max) * 100)));
}

function formatBytes(bytes = 0) {
  const value = number(bytes);
  if (value <= 0) return '0 MB';
  const mb = value / 1024 / 1024;
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatUptime(seconds = 0) {
  const total = Math.floor(number(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function statusTone(status = '') {
  const clean = String(status || '').toLowerCase();
  if (['online', 'healthy', 'available', 'ready'].includes(clean)) return '#86efac';
  if (['degraded', 'warning', 'pending'].includes(clean)) return '#fcd34d';
  if (['offline', 'failed', 'error', 'missing'].includes(clean)) return '#fca5a5';
  return '#93c5fd';
}

function card(theme) {
  return {
    border: `1px solid ${theme.cardBorder}`,
    background: 'rgba(15,23,42,0.24)',
    borderRadius: 16,
    padding: 14,
    display: 'grid',
    gap: 8,
    minWidth: 0,
  };
}

function buildChecks(runtime = {}) {
  const environments = asArray(runtime.environments);
  const services = asObject(runtime.services);
  const paths = asObject(runtime.runtimePaths);
  const memory = runtime.memory || runtime.system?.memory || {};
  const procMemory = memory.process || {};
  const discord = runtime.discord || {};
  const checks = [];

  const offline = environments.filter((env) => String(env.status || '').toLowerCase() === 'offline');
  if (offline.length) checks.push({ level: 'danger', title: 'Environment offline', detail: `${offline.length} environment${offline.length === 1 ? '' : 's'} unavailable: ${offline.map((env) => env.environment || env.mode).join(', ')}` });
  else checks.push({ level: 'success', title: 'Environment reachability', detail: 'All returned environments are reachable.' });

  const degraded = environments.filter((env) => String(env.status || '').toLowerCase() === 'degraded');
  if (degraded.length) checks.push({ level: 'warning', title: 'Degraded runtime', detail: `${degraded.length} environment${degraded.length === 1 ? '' : 's'} are degraded.` });

  const memoryUse = percent(memory.used, memory.total);
  if (memoryUse >= 85) checks.push({ level: 'danger', title: 'System memory pressure', detail: `${memoryUse}% system memory in use.` });
  else if (memoryUse >= 70) checks.push({ level: 'warning', title: 'System memory rising', detail: `${memoryUse}% system memory in use.` });
  else checks.push({ level: 'success', title: 'System memory healthy', detail: `${memoryUse}% system memory in use.` });

  const heapUse = percent(procMemory.heapUsed, procMemory.heapTotal);
  if (heapUse >= 85) checks.push({ level: 'danger', title: 'Heap pressure', detail: `${heapUse}% process heap used.` });
  else if (heapUse >= 70) checks.push({ level: 'warning', title: 'Heap usage rising', detail: `${heapUse}% process heap used.` });
  else checks.push({ level: 'success', title: 'Heap healthy', detail: `${heapUse}% process heap used.` });

  if (!discord.ready) checks.push({ level: 'danger', title: 'Discord gateway not ready', detail: 'Client is not reporting ready state.' });
  else if (number(discord.wsPing) > 300) checks.push({ level: 'warning', title: 'Gateway latency high', detail: `Discord gateway ping is ${discord.wsPing}ms.` });
  else checks.push({ level: 'success', title: 'Discord gateway ready', detail: `Gateway ping ${discord.wsPing || 0}ms.` });

  Object.entries(services).forEach(([name, value]) => {
    const clean = String(value || '').toLowerCase();
    if (['offline', 'failed', 'error', 'missing'].includes(clean)) checks.push({ level: 'danger', title: `${name} unavailable`, detail: `Service reports ${value}.` });
    if (['degraded', 'warning'].includes(clean)) checks.push({ level: 'warning', title: `${name} degraded`, detail: `Service reports ${value}.` });
  });

  const missingPaths = Object.entries(paths).filter(([, info]) => info && info.exists === false);
  if (missingPaths.length) checks.push({ level: 'warning', title: 'Runtime folders missing', detail: `${missingPaths.map(([key]) => key).join(', ')} missing.` });

  return checks;
}

function scoreFromChecks(checks = []) {
  let score = 100;
  checks.forEach((check) => {
    if (check.level === 'danger') score -= 18;
    if (check.level === 'warning') score -= 8;
  });
  return Math.max(0, Math.min(100, score));
}

function scoreTone(score) {
  if (score >= 85) return '#86efac';
  if (score >= 65) return '#fcd34d';
  return '#fca5a5';
}

function MiniStat({ theme, label, value, detail, accent = '#93c5fd' }) {
  return (
    <div style={card(theme)}>
      <span style={{ color: theme.mutedText, fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <strong style={{ color: accent, fontSize: 24 }}>{value}</strong>
      {detail ? <span style={{ color: theme.mutedText, fontSize: 12 }}>{detail}</span> : null}
    </div>
  );
}

function CheckRow({ theme, check }) {
  const tone = check.level === 'danger' ? '#fca5a5' : check.level === 'warning' ? '#fcd34d' : '#86efac';
  return (
    <div style={{ border: `1px solid ${tone}55`, background: `${tone}12`, borderRadius: 13, padding: 11, display: 'grid', gap: 4 }}>
      <strong style={{ color: tone }}>{check.title}</strong>
      <span style={{ color: theme.mutedText, fontSize: 13, lineHeight: 1.45 }}>{check.detail}</span>
    </div>
  );
}

function EnvironmentRow({ theme, env }) {
  const tone = statusTone(env.status || 'offline');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 10, alignItems: 'center', borderBottom: `1px solid ${theme.cardBorder}`, padding: '9px 0' }}>
      <strong style={{ overflowWrap: 'anywhere' }}>{env.environment || env.mode || 'Unknown'}</strong>
      <span style={{ color: theme.mutedText, fontSize: 12 }}>Port {env.port || env.sourcePort || '—'}</span>
      <span style={{ color: tone, fontSize: 12, fontWeight: 950, textTransform: 'uppercase' }}>{env.status || 'offline'}</span>
      <span style={{ color: theme.mutedText, fontSize: 12, gridColumn: '1 / -1' }}>Guilds: {env.discord?.guildCount ?? '—'} · Members: {number(env.discord?.memberCount).toLocaleString()} · Uptime: {formatUptime(env.process?.uptime)} · Ping: {env.discord?.wsPing ?? '—'}ms</span>
    </div>
  );
}

export default function RuntimeHealthPanel({ theme, runtime = {}, loading = false, onRefresh }) {
  const data = useMemo(() => {
    const checks = buildChecks(runtime || {});
    const score = scoreFromChecks(checks);
    const environments = asArray(runtime?.environments);
    const memory = runtime?.memory || runtime?.system?.memory || {};
    const procMemory = memory.process || {};
    const discord = runtime?.discord || {};
    const summary = runtime?.summary || {};

    return {
      checks,
      score,
      environments,
      memoryUse: percent(memory.used, memory.total),
      heapUse: percent(procMemory.heapUsed, procMemory.heapTotal),
      rss: procMemory.rss,
      discord,
      summary,
      online: summary.online ?? environments.filter((env) => String(env.status).toLowerCase() === 'online').length,
      degraded: summary.degraded ?? environments.filter((env) => String(env.status).toLowerCase() === 'degraded').length,
      offline: summary.offline ?? environments.filter((env) => String(env.status).toLowerCase() === 'offline').length,
    };
  }, [runtime]);

  return (
    <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 22, padding: 20, boxShadow: theme.shadow, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Runtime Monitor</div>
          <h3 style={{ margin: '6px 0 0' }}>Operations Health</h3>
          <p style={{ margin: '8px 0 0', color: theme.mutedText, lineHeight: 1.5 }}>Health scoring, environment reachability, gateway readiness and resource pressure.</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.35)', color: theme.cardText, borderRadius: 12, padding: '10px 12px', fontWeight: 950, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.55 : 1 }}>{loading ? 'Refreshing...' : 'Refresh'}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(min(100%, 220px), 0.45fr) minmax(0, 1fr)', gap: 14, alignItems: 'stretch' }}>
        <div style={{ ...card(theme), placeItems: 'center', textAlign: 'center' }}>
          <span style={{ color: theme.mutedText, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Health Score</span>
          <strong style={{ color: scoreTone(data.score), fontSize: 56, lineHeight: 1 }}>{data.score}</strong>
          <span style={{ color: theme.mutedText, fontSize: 13 }}>{data.checks.filter((check) => check.level !== 'success').length || 'No'} active warnings</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 145px), 1fr))', gap: 10 }}>
          <MiniStat theme={theme} label="Online" value={data.online} detail="environments" accent="#86efac" />
          <MiniStat theme={theme} label="Degraded" value={data.degraded} detail="environments" accent={data.degraded ? '#fcd34d' : '#86efac'} />
          <MiniStat theme={theme} label="Offline" value={data.offline} detail="environments" accent={data.offline ? '#fca5a5' : '#86efac'} />
          <MiniStat theme={theme} label="Memory" value={`${data.memoryUse}%`} detail={formatBytes(runtime?.memory?.used || runtime?.system?.memory?.used)} accent={data.memoryUse >= 85 ? '#fca5a5' : data.memoryUse >= 70 ? '#fcd34d' : '#86efac'} />
          <MiniStat theme={theme} label="Heap" value={`${data.heapUse}%`} detail="process heap" accent={data.heapUse >= 85 ? '#fca5a5' : data.heapUse >= 70 ? '#fcd34d' : '#86efac'} />
          <MiniStat theme={theme} label="Gateway" value={`${data.discord.wsPing || 0}ms`} detail={data.discord.ready ? 'ready' : 'not ready'} accent={data.discord.ready ? '#86efac' : '#fca5a5'} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 14 }}>
        <div style={card(theme)}>
          <strong>Operational Checks</strong>
          {data.checks.map((check, index) => <CheckRow key={`${check.title}-${index}`} theme={theme} check={check} />)}
        </div>
        <div style={card(theme)}>
          <strong>Environment Comparison</strong>
          {data.environments.length ? data.environments.map((env) => <EnvironmentRow key={env.environment || env.mode || env.port} theme={theme} env={env} />) : <span style={{ color: theme.mutedText }}>No environment data returned.</span>}
        </div>
      </div>
    </section>
  );
}
