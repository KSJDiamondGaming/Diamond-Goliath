import React from 'react';
import useOwnerGuilds from '../../hooks/useOwnerGuilds.js';

const HUB_AREAS = [
  { title: 'Channels', description: 'Manage translation-enabled channels across guilds.', status: 'UI Foundation' },
  { title: 'Threads', description: 'Monitor language thread mappings and activity.', status: 'UI Foundation' },
  { title: 'Languages', description: 'Track supported languages and user preferences.', status: 'Pending API' },
  { title: 'Analytics', description: 'View translation volume and usage metrics.', status: 'Pending API' },
];

export default function TranslationHub({ theme }) {
  const { guilds, loading, error } = useOwnerGuilds();
  const card = { border: '1px solid ' + theme.cardBorder, background: theme.cardBg, color: theme.cardText, borderRadius: 20, padding: 18, boxShadow: theme.shadow };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={card}>
        <p style={{ margin: 0, color: '#06b6d4', fontWeight: 900, textTransform: 'uppercase' }}>Global Translation</p>
        <h1 style={{ margin: '8px 0 0', fontSize: 34 }}>Translation Hub</h1>
        <p style={{ marginTop: 8, color: theme.mutedText }}>Translation channels, language threads, providers and multilingual activity.</p>
      </section>

      {error ? <section style={{ ...card, color: '#fca5a5' }}>{error}</section> : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
        <StatCard title='Connected Guilds' value={loading ? 'Loading' : String(guilds.length)} theme={theme} />
        <StatCard title='Translation Channels' value='Pending API' theme={theme} />
        <StatCard title='Language Threads' value='Pending API' theme={theme} />
        <StatCard title='Active Languages' value='Pending API' theme={theme} />
        <StatCard title='Messages Translated' value='Pending API' theme={theme} />
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
        {HUB_AREAS.map((area) => <div key={area.title} style={card}><div style={{display:'flex',justifyContent:'space-between'}}><strong>{area.title}</strong><span>{area.status}</span></div><p style={{color:theme.mutedText}}>{area.description}</p></div>)}
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Translation Providers</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          <ProviderRow name='OpenAI Provider' status='Priority 1' theme={theme} />
          <ProviderRow name='DeepL Provider' status='Priority 2' theme={theme} />
          <ProviderRow name='Google Provider' status='Priority 3' theme={theme} />
        </div>
      </section>
    </div>
  );
}

function StatCard({ title, value, theme }) { return <div style={{ border:'1px solid '+theme.cardBorder, background:theme.cardBg,borderRadius:18,padding:18 }}><div style={{color:theme.mutedText}}>{title}</div><div style={{fontSize:24,fontWeight:900,marginTop:8}}>{value}</div></div>; }
function ProviderRow({ name, status, theme }) { return <div style={{ border:'1px solid '+theme.cardBorder,borderRadius:14,padding:14,display:'flex',justifyContent:'space-between'}}><strong>{name}</strong><span style={{color:'#22c55e',fontWeight:900}}>{status}</span></div>; }
