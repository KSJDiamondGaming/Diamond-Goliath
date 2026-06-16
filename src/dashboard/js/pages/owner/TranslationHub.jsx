import React from 'react';

import useOwnerGuilds from '../../hooks/useOwnerGuilds.js';

export default function TranslationHub({ theme }) {
  const { guilds, loading, error } = useOwnerGuilds();

  const card = {
    border: '1px solid ' + theme.cardBorder,
    background: theme.cardBg,
    color: theme.cardText,
    borderRadius: 20,
    padding: 18,
    boxShadow: theme.shadow,
  };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={card}>
        <p style={{ margin: 0, color: '#06b6d4', fontWeight: 900, textTransform: 'uppercase' }}>
          Global Translation
        </p>

        <h1 style={{ margin: '8px 0 0', fontSize: 34 }}>
          Translation Hub
        </h1>

        <p style={{ marginTop: 8, color: theme.mutedText }}>
          Monitor translation channels, language threads, providers and multilingual activity across all guilds.
        </p>
      </section>

      {error ? (
        <section style={{ ...card, color: '#fca5a5' }}>
          {error}
        </section>
      ) : null}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))',
          gap: 14,
        }}
      >
        <StatCard title="Connected Guilds" value={loading ? 'Loading' : String(guilds.length)} theme={theme} />
        <StatCard title="Translation Channels" value="Pending API" theme={theme} />
        <StatCard title="Language Threads" value="Pending API" theme={theme} />
        <StatCard title="Active Languages" value="Pending API" theme={theme} />
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Translation Providers</h3>

        <div style={{ display: 'grid', gap: 10 }}>
          <ProviderRow name="OpenAI Provider" status="Pending" theme={theme} />
          <ProviderRow name="DeepL Provider" status="Pending" theme={theme} />
          <ProviderRow name="Google Provider" status="Pending" theme={theme} />
        </div>
      </section>
    </div>
  );
}

function StatCard({ title, value, theme }) {
  return (
    <div
      style={{
        border: '1px solid ' + theme.cardBorder,
        background: theme.cardBg,
        borderRadius: 18,
        padding: 18,
      }}
    >
      <div style={{ color: theme.mutedText }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8 }}>{value}</div>
    </div>
  );
}

function ProviderRow({ name, status, theme }) {
  return (
    <div
      style={{
        border: '1px solid ' + theme.cardBorder,
        borderRadius: 14,
        padding: 14,
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <strong>{name}</strong>
      <span style={{ color: '#f59e0b', fontWeight: 900 }}>{status}</span>
    </div>
  );
}
