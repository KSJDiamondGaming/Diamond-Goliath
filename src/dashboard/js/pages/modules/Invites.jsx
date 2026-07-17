import React, { useEffect, useMemo, useState } from 'react';
import EmptyState from '../../shared/EmptyState.jsx';
import { api } from '../../services/apiClient.js';
import { ChannelSelect, RoleSelect } from '../../ui/DiscordResourceSelects.jsx';

const guildIdOf = (selectedGuild, data) => String(data?.guildId || data?.id || selectedGuild || '').split(':').pop().trim();
const list = (payload, key) => Array.isArray(payload?.[key]) ? payload[key] : Array.isArray(payload) ? payload : [];
const emptyReward = { roleId: '', invites: 5 };

function button(theme, tone = 'default') {
  const bg = { primary: 'rgba(37,99,235,.24)', success: 'rgba(22,163,74,.24)', danger: 'rgba(220,38,38,.24)', default: 'rgba(15,23,42,.45)' };
  return { border: `1px solid ${theme.cardBorder}`, background: bg[tone], color: theme.cardText, borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' };
}
function field(theme) { return { width: '100%', border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,.45)', color: theme.cardText, borderRadius: 12, padding: '10px 12px' }; }
function Card({ theme, children }) { return <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 20, boxShadow: theme.shadow, padding: 20 }}>{children}</section>; }
function Stat({ theme, label, value }) { return <Card theme={theme}><div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{label}</div><div style={{ fontSize: 28, fontWeight: 950, marginTop: 7 }}>{value}</div></Card>; }

export default function Invites({ theme, selectedGuild, selectedGuildData }) {
  const guildId = guildIdOf(selectedGuild, selectedGuildData);
  const [config, setConfig] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [history, setHistory] = useState([]);
  const [health, setHealth] = useState(null);
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);
  const [reward, setReward] = useState(emptyReward);
  const [bonus, setBonus] = useState({ userId: '', value: 0 });
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const settings = config?.settings || {};
  const analytics = config?.analytics || {};
  const cardGrid = useMemo(() => ({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }), []);

  async function load() {
    if (!guildId) return;
    setError('');
    try {
      const [main, hist, healthData, channelData, roleData] = await Promise.all([
        api.request(`/api/invites/${guildId}`),
        api.request(`/api/invites/${guildId}/history?limit=100`),
        api.request(`/api/invites/${guildId}/health`),
        api.getGuildChannels(guildId),
        api.getGuildRoles(guildId),
      ]);
      setConfig(main.config || {}); setLeaderboard(main.leaderboard || []); setHistory(hist.history || []); setHealth(healthData.health || null);
      setChannels(list(channelData, 'channels')); setRoles(list(roleData, 'roles'));
    } catch (e) { setError(e.message || 'Failed to load Invite Studio.'); }
  }
  useEffect(() => { load(); }, [guildId]);

  async function action(name, fn, success) {
    setBusy(name); setError(''); setNotice('');
    try { await fn(); setNotice(success || 'Action completed.'); await load(); }
    catch (e) { setError(e.message || 'Invite Studio action failed.'); }
    finally { setBusy(''); }
  }
  function saveSettings(patch) { return action('settings', () => api.request(`/api/invites/${guildId}/settings`, { method: 'PATCH', body: JSON.stringify({ settings: { ...settings, ...patch } }) }), 'Settings saved.'); }
  function addReward() {
    if (!reward.roleId) return;
    const rewards = [...(settings.rewardRoles || []).filter((r) => r.roleId !== reward.roleId), { roleId: reward.roleId, invites: Number(reward.invites || 1) }].sort((a,b) => a.invites-b.invites);
    saveSettings({ rewardRoles: rewards }); setReward(emptyReward);
  }
  function removeReward(roleId) { saveSettings({ rewardRoles: (settings.rewardRoles || []).filter((r) => r.roleId !== roleId) }); }

  if (!guildId) return <EmptyState theme={theme} icon="✉️" title="Select a server" description="Select a server to manage Invite Studio." />;
  return <div style={{ display: 'grid', gap: 16 }}>
    <Card theme={theme}><h1 style={{ margin: 0 }}>Invite Studio</h1><p style={{ color: theme.mutedText, marginBottom: 0 }}>Track invite attribution, active referrals, departures, rewards, managed invites, history and health.</p></Card>
    <div style={cardGrid}><Stat theme={theme} label="Status" value={config?.enabled ? 'Enabled' : 'Disabled'} /><Stat theme={theme} label="Tracked" value={analytics.tracked || 0} /><Stat theme={theme} label="Active Inviters" value={leaderboard.length} /><Stat theme={theme} label="Unknown" value={analytics.unknown || 0} /><Stat theme={theme} label="Health" value={health?.healthy ? 'Healthy' : 'Attention'} /></div>
    {(error || notice) && <Card theme={theme}><strong style={{ color: error ? '#fca5a5' : '#86efac' }}>{error || notice}</strong></Card>}

    <Card theme={theme}><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <button style={button(theme,'primary')} disabled={busy} onClick={() => action('enabled', () => api.request(`/api/invites/${guildId}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled: !config?.enabled }) }), 'Module status updated.')}>{config?.enabled ? 'Disable' : 'Enable'}</button>
      <button style={button(theme,'success')} disabled={busy} onClick={() => action('sync', () => api.request(`/api/invites/${guildId}/sync`, { method: 'POST' }), 'Invite cache synchronized.')}>Sync Invites</button>
      <button style={button(theme,'primary')} disabled={busy} onClick={() => action('repair', () => api.request(`/api/invites/${guildId}/repair`, { method: 'POST' }), 'Repair completed.')}>Repair</button>
      <a style={{ ...button(theme), textDecoration: 'none' }} href={`/api/invites/${guildId}/export`}>Export</a>
      <button style={button(theme,'danger')} disabled={busy} onClick={() => window.confirm('Reset all Invite Studio data?') && action('reset', () => api.request(`/api/invites/${guildId}/reset`, { method: 'POST' }), 'Invite Studio reset.')}>Reset</button>
    </div></Card>

    <Card theme={theme}><h2>Tracking & managed invite</h2><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))', gap:12 }}>
      <ChannelSelect theme={theme} resources={channels} value={settings.managedInviteChannelId || ''} onChange={(value) => saveSettings({ managedInviteChannelId: value })} label="Managed invite channel" />
      <ChannelSelect theme={theme} resources={channels} value={settings.logChannelId || ''} onChange={(value) => saveSettings({ logChannelId: value })} label="Invite log channel" />
      <label><input type="checkbox" checked={settings.trackingEnabled !== false} onChange={(e) => saveSettings({ trackingEnabled: e.target.checked })}/> Track joins</label>
      <label><input type="checkbox" checked={settings.removeOnLeave !== false} onChange={(e) => saveSettings({ removeOnLeave: e.target.checked })}/> Remove active credit on leave</label>
      <label><input type="checkbox" checked={settings.ignoreBots !== false} onChange={(e) => saveSettings({ ignoreBots: e.target.checked })}/> Ignore bots</label>
      <label><input type="checkbox" checked={settings.autoRepair !== false} onChange={(e) => saveSettings({ autoRepair: e.target.checked })}/> Auto-repair managed invite</label>
    </div><div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:14 }}>
      <button style={button(theme,'success')} disabled={busy || !settings.managedInviteChannelId} onClick={() => action('managed', () => api.request(`/api/invites/${guildId}/managed-invite`, { method:'POST', body: JSON.stringify({ channelId: settings.managedInviteChannelId }) }), 'Managed invite created.')}>Create / Regenerate</button>
      <button style={button(theme)} disabled={busy} onClick={() => action('validate', () => api.request(`/api/invites/${guildId}/managed-invite/validate`, { method:'POST' }), 'Managed invite validated.')}>Validate</button>
      {settings.managedInviteCode && <code>discord.gg/{settings.managedInviteCode}</code>}
    </div></Card>

    <Card theme={theme}><h2>Reward roles</h2><div style={{ display:'grid',gridTemplateColumns:'2fr 1fr auto',gap:10,alignItems:'end' }}><RoleSelect theme={theme} resources={roles} value={reward.roleId} onChange={(roleId)=>setReward((r)=>({...r,roleId}))} label="Reward role"/><label>Invites<input style={field(theme)} type="number" min="1" value={reward.invites} onChange={(e)=>setReward((r)=>({...r,invites:Number(e.target.value)}))}/></label><button style={button(theme,'success')} onClick={addReward}>Add</button></div>
      <div style={{ display:'grid',gap:8,marginTop:12 }}>{(settings.rewardRoles || []).map((r)=><div key={r.roleId} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',gap:10 }}><span><strong>{r.invites}</strong> invites → {roles.find((x)=>String(x.id)===String(r.roleId))?.name || r.roleId}</span><button style={button(theme,'danger')} onClick={()=>removeReward(r.roleId)}>Remove</button></div>)}</div>
    </Card>

    <Card theme={theme}><h2>Bonus adjustment</h2><div style={{ display:'grid',gridTemplateColumns:'2fr 1fr auto',gap:10 }}><input style={field(theme)} placeholder="Discord user ID" value={bonus.userId} onChange={(e)=>setBonus({...bonus,userId:e.target.value})}/><input style={field(theme)} type="number" value={bonus.value} onChange={(e)=>setBonus({...bonus,value:Number(e.target.value)})}/><button style={button(theme,'primary')} disabled={!bonus.userId} onClick={()=>action('bonus',()=>api.request(`/api/invites/${guildId}/inviters/${bonus.userId}/bonus`,{method:'PATCH',body:JSON.stringify({bonus:bonus.value})}),'Bonus updated.')}>Apply</button></div></Card>

    <Card theme={theme}><h2>Leaderboard</h2><div style={{ overflowX:'auto' }}><table style={{ width:'100%',borderCollapse:'collapse' }}><thead><tr><th align="left">Inviter</th><th>Active</th><th>Total</th><th>Left</th><th>Fake</th><th>Bonus</th><th>Score</th></tr></thead><tbody>{leaderboard.map((x)=><tr key={x.inviterId}><td><code>{x.inviterId}</code></td><td align="center">{x.active}</td><td align="center">{x.total}</td><td align="center">{x.left}</td><td align="center">{x.fake}</td><td align="center">{x.bonus}</td><td align="center"><strong>{x.score}</strong></td></tr>)}</tbody></table></div></Card>
    <Card theme={theme}><h2>Recent history</h2><div style={{ display:'grid',gap:8 }}>{history.slice(0,50).map((x)=><div key={x.id} style={{ borderBottom:`1px solid ${theme.cardBorder}`,paddingBottom:8 }}><strong>{x.type}</strong> · {x.memberId || x.inviteCode || 'system'} · {new Date(x.at).toLocaleString()}</div>)}</div></Card>
  </div>;
}
