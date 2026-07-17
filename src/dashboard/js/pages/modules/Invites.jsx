import React, { useEffect, useMemo, useState } from 'react';
import EmptyState from '../../shared/EmptyState.jsx';
import { api } from '../../services/apiClient.js';
import { ChannelSelect, RoleSelect } from '../../ui/DiscordResourceSelects.jsx';

const guildIdOf = (selectedGuild, data) => String(data?.guildId || data?.id || selectedGuild || '').split(':').pop().trim();
const list = (payload, key) => Array.isArray(payload?.[key]) ? payload[key] : Array.isArray(payload) ? payload : [];
const emptyReward = { roleId: '', invites: 5 };
const emptyDraft = { channelId: '', roleIds: [], maxAge: 2592000, maxUses: 0, temporary: false };
const expiryOptions = [[1800,'30 minutes'],[3600,'1 hour'],[21600,'6 hours'],[43200,'12 hours'],[86400,'1 day'],[604800,'7 days'],[2592000,'30 days'],[0,'Never']];
const useOptions = [[0,'No limit'],[1,'1 use'],[5,'5 uses'],[10,'10 uses'],[25,'25 uses'],[50,'50 uses'],[100,'100 uses']];

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
  const [inviteLinks, setInviteLinks] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [history, setHistory] = useState([]);
  const [health, setHealth] = useState(null);
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);
  const [reward, setReward] = useState(emptyReward);
  const [draft, setDraft] = useState(emptyDraft);
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
        api.request(`/api/invites/${guildId}`), api.request(`/api/invites/${guildId}/history?limit=100`), api.request(`/api/invites/${guildId}/health`), api.getGuildChannels(guildId), api.getGuildRoles(guildId),
      ]);
      setConfig(main.config || {}); setInviteLinks(main.inviteLinks || []); setLeaderboard(main.leaderboard || []); setHistory(hist.history || []); setHealth(healthData.health || null);
      setChannels(list(channelData, 'channels')); setRoles(list(roleData, 'roles'));
    } catch (e) { setError(e.message || 'Failed to load Invite Studio.'); }
  }
  useEffect(() => { load(); }, [guildId]);

  async function action(name, fn, success) {
    setBusy(name); setError(''); setNotice('');
    try { const result = await fn(); setNotice(success || 'Action completed.'); await load(); return result; }
    catch (e) { setError(e.message || 'Invite Studio action failed.'); return null; }
    finally { setBusy(''); }
  }
  function saveSettings(patch) { return action('settings', () => api.request(`/api/invites/${guildId}/settings`, { method: 'PATCH', body: JSON.stringify({ settings: { ...settings, ...patch } }) }), 'Settings saved.'); }
  function addReward() {
    if (!reward.roleId) return;
    const rewards = [...(settings.rewardRoles || []).filter((r) => r.roleId !== reward.roleId), { roleId: reward.roleId, invites: Number(reward.invites || 1) }].sort((a,b) => a.invites-b.invites);
    saveSettings({ rewardRoles: rewards }); setReward(emptyReward);
  }
  function toggleRole(roleId) { setDraft((current) => ({ ...current, roleIds: current.roleIds.includes(roleId) ? current.roleIds.filter((id) => id !== roleId) : [...current.roleIds, roleId].slice(0, 25) })); }
  async function createLink() {
    if (!draft.channelId) { setError('Choose an invite channel.'); return; }
    const result = await action('create-link', () => api.request(`/api/invites/${guildId}/links`, { method: 'POST', body: JSON.stringify(draft) }), 'Invite link generated.');
    if (result?.invite?.url) setNotice(`Invite created: ${result.invite.url}`);
    if (result) setDraft(emptyDraft);
  }
  function removeReward(roleId) { saveSettings({ rewardRoles: (settings.rewardRoles || []).filter((r) => r.roleId !== roleId) }); }

  if (!guildId) return <EmptyState theme={theme} icon="✉️" title="Select a server" description="Select a server to manage Invite Studio." />;
  return <div style={{ display: 'grid', gap: 16 }}>
    <Card theme={theme}><h1 style={{ margin: 0 }}>Invite Studio</h1><p style={{ color: theme.mutedText, marginBottom: 0 }}>Create Discord-style invite links with optional roles, then track attribution, active referrals, departures and rewards.</p></Card>
    <div style={cardGrid}><Stat theme={theme} label="Status" value={config?.enabled ? 'Enabled' : 'Disabled'} /><Stat theme={theme} label="Invite Links" value={inviteLinks.length} /><Stat theme={theme} label="Roles Granted" value={analytics.inviteRolesGranted || 0} /><Stat theme={theme} label="Tracked" value={analytics.tracked || 0} /><Stat theme={theme} label="Health" value={health?.healthy ? 'Healthy' : 'Attention'} /></div>
    {(error || notice) && <Card theme={theme}><strong style={{ color: error ? '#fca5a5' : '#86efac' }}>{error || notice}</strong></Card>}

    <Card theme={theme}><h2 style={{ marginTop: 0 }}>Create invite link</h2><p style={{ color: theme.mutedText }}>Choose the same core settings Discord provides. Members joining through this link receive the selected roles automatically.</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
        <ChannelSelect theme={theme} resources={channels} value={draft.channelId} onChange={(channelId)=>setDraft((d)=>({...d,channelId}))} label="Invite channel" />
        <label style={{ display:'grid',gap:8 }}><span style={{ color:theme.mutedText,fontSize:12,fontWeight:900,textTransform:'uppercase' }}>Expire after</span><select style={field(theme)} value={draft.maxAge} onChange={(e)=>setDraft((d)=>({...d,maxAge:Number(e.target.value)}))}>{expiryOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label style={{ display:'grid',gap:8 }}><span style={{ color:theme.mutedText,fontSize:12,fontWeight:900,textTransform:'uppercase' }}>Max number of uses</span><select style={field(theme)} value={draft.maxUses} onChange={(e)=>setDraft((d)=>({...d,maxUses:Number(e.target.value)}))}>{useOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <div style={{ marginTop:14 }}><div style={{ color:theme.mutedText,fontSize:12,fontWeight:900,textTransform:'uppercase',marginBottom:8 }}>Roles (optional)</div><div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8,maxHeight:220,overflowY:'auto',border:`1px solid ${theme.cardBorder}`,borderRadius:14,padding:12 }}>{roles.filter((role)=>role.name !== '@everyone' && !role.managed).map((role)=><label key={role.id} style={{ display:'flex',gap:8,alignItems:'center' }}><input type="checkbox" checked={draft.roleIds.includes(String(role.id))} onChange={()=>toggleRole(String(role.id))}/><span>{role.name}</span></label>)}</div></div>
      <label style={{ display:'flex',gap:10,alignItems:'center',marginTop:14 }}><input type="checkbox" checked={draft.temporary} onChange={(e)=>setDraft((d)=>({...d,temporary:e.target.checked}))}/><span><strong>Grant temporary membership</strong><br/><small style={{ color:theme.mutedText }}>Discord removes temporary members when they disconnect unless a role has been assigned.</small></span></label>
      <div style={{ display:'flex',justifyContent:'flex-end',gap:10,marginTop:16 }}><button style={button(theme)} onClick={()=>setDraft(emptyDraft)}>Cancel</button><button style={button(theme,'primary')} disabled={busy || !draft.channelId} onClick={createLink}>Generate a New Link</button></div>
    </Card>

    <Card theme={theme}><h2 style={{ marginTop:0 }}>Active invite links</h2><div style={{ overflowX:'auto' }}><table style={{ width:'100%',borderCollapse:'collapse' }}><thead><tr><th align="left">Invite code</th><th>Uses</th><th>Expires</th><th align="left">Roles</th><th></th></tr></thead><tbody>{inviteLinks.map((link)=><tr key={link.code}><td><code>{link.code}</code></td><td align="center">{link.uses}{link.maxUses ? `/${link.maxUses}` : ''}</td><td align="center">{link.expiresAt ? new Date(link.expiresAt).toLocaleString() : 'Never'}</td><td>{link.roleIds.length ? link.roleIds.map((id)=>roles.find((r)=>String(r.id)===String(id))?.name || id).join(', ') : 'None'}</td><td align="right"><button style={button(theme,'danger')} disabled={busy} onClick={()=>window.confirm(`Delete invite ${link.code}?`) && action('delete-link',()=>api.request(`/api/invites/${guildId}/links/${link.code}`,{method:'DELETE'}),'Invite deleted.')}>Delete</button></td></tr>)}</tbody></table>{!inviteLinks.length && <p style={{ color:theme.mutedText }}>No Invite Studio links have been created.</p>}</div></Card>

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
    </div></Card>

    <Card theme={theme}><h2>Reward roles</h2><div style={{ display:'grid',gridTemplateColumns:'2fr 1fr auto',gap:10,alignItems:'end' }}><RoleSelect theme={theme} resources={roles} value={reward.roleId} onChange={(roleId)=>setReward((r)=>({...r,roleId}))} label="Reward role"/><label>Invites<input style={field(theme)} type="number" min="1" value={reward.invites} onChange={(e)=>setReward((r)=>({...r,invites:Number(e.target.value)}))}/></label><button style={button(theme,'success')} onClick={addReward}>Add</button></div>
      <div style={{ display:'grid',gap:8,marginTop:12 }}>{(settings.rewardRoles || []).map((r)=><div key={r.roleId} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',gap:10 }}><span><strong>{r.invites}</strong> invites → {roles.find((x)=>String(x.id)===String(r.roleId))?.name || r.roleId}</span><button style={button(theme,'danger')} onClick={()=>removeReward(r.roleId)}>Remove</button></div>)}</div>
    </Card>

    <Card theme={theme}><h2>Bonus adjustment</h2><div style={{ display:'grid',gridTemplateColumns:'2fr 1fr auto',gap:10 }}><input style={field(theme)} placeholder="Discord user ID" value={bonus.userId} onChange={(e)=>setBonus({...bonus,userId:e.target.value})}/><input style={field(theme)} type="number" value={bonus.value} onChange={(e)=>setBonus({...bonus,value:Number(e.target.value)})}/><button style={button(theme,'primary')} disabled={!bonus.userId} onClick={()=>action('bonus',()=>api.request(`/api/invites/${guildId}/inviters/${bonus.userId}/bonus`,{method:'PATCH',body:JSON.stringify({bonus:bonus.value})}),'Bonus updated.')}>Apply</button></div></Card>
    <Card theme={theme}><h2>Leaderboard</h2><div style={{ overflowX:'auto' }}><table style={{ width:'100%',borderCollapse:'collapse' }}><thead><tr><th align="left">Inviter</th><th>Active</th><th>Total</th><th>Left</th><th>Fake</th><th>Bonus</th><th>Score</th></tr></thead><tbody>{leaderboard.map((x)=><tr key={x.inviterId}><td><code>{x.inviterId}</code></td><td align="center">{x.active}</td><td align="center">{x.total}</td><td align="center">{x.left}</td><td align="center">{x.fake}</td><td align="center">{x.bonus}</td><td align="center"><strong>{x.score}</strong></td></tr>)}</tbody></table></div></Card>
    <Card theme={theme}><h2>Recent history</h2><div style={{ display:'grid',gap:8 }}>{history.slice(0,50).map((x)=><div key={x.id} style={{ borderBottom:`1px solid ${theme.cardBorder}`,paddingBottom:8 }}><strong>{x.type}</strong> · {x.memberId || x.inviteCode || 'system'} · {new Date(x.at).toLocaleString()}</div>)}</div></Card>
  </div>;
}