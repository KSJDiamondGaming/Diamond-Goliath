import React from 'react';

import useOwnerGuilds from '../../hooks/useOwnerGuilds.js';

const FORM_AREAS = [
  {
    title: 'Forms',
    description: 'Create, edit, disable and manage universal form templates per guild.',
    status: 'UI Foundation',
  },
  {
    title: 'Submissions',
    description: 'Review incoming form submissions before they become tickets or logged decisions.',
    status: 'Pending API',
  },
  {
    title: 'Analytics',
    description: 'Track form usage, completion rates, submissions and ticket conversion activity.',
    status: 'Pending API',
  },
  {
    title: 'Settings',
    description: 'Configure permissions, cooldowns, submission actions and form-to-ticket workflows.',
    status: 'UI Foundation',
  },
];

const FORM_TEMPLATES = [
  'Appeal Form',
  'Staff Application',
  'Partner Application',
  'Report User',
  'Support Request',
  'Custom Blank Form',
];

const QUESTION_TYPES = [
  'Short Text',
  'Long Text',
  'Number',
  'Dropdown',
  'Checkbox',
  'Yes / No',
  'User Mention',
  'Role Mention',
  'Attachment / Link',
];

export default function FormsHub({ theme }) {
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
        <p style={{ margin: 0, color: '#8b5cf6', fontWeight: 900, textTransform: 'uppercase' }}>
          Global Forms
        </p>

        <h1 style={{ margin: '8px 0 0', fontSize: 34 }}>
          Forms Hub
        </h1>

        <p style={{ marginTop: 8, color: theme.mutedText }}>
          Universal forms dashboard foundation for templates, submissions, analytics and form-to-ticket workflows.
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
          gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
          gap: 14,
        }}
      >
        <StatCard title="Connected Guilds" value={loading ? 'Loading' : String(guilds.length)} theme={theme} />
        <StatCard title="Active Forms" value="Pending API" theme={theme} />
        <StatCard title="Submissions Today" value="Pending API" theme={theme} />
        <StatCard title="Tickets Created" value="Pending API" theme={theme} />
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
        {FORM_AREAS.map((area) => (
          <FeatureCard key={area.title} item={area} theme={theme} />
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Universal Templates</h3>
          <p style={{ marginTop: 0, color: theme.mutedText }}>
            Every workflow starts from the same universal forms engine. No hardcoded appeal, report or application systems.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {FORM_TEMPLATES.map((template) => (
              <Pill key={template} label={template} theme={theme} />
            ))}
          </div>
        </section>

        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Question Builder Types</h3>
          <p style={{ marginTop: 0, color: theme.mutedText }}>
            Locked question type list for the first form builder UI pass.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {QUESTION_TYPES.map((type) => (
              <Pill key={type} label={type} theme={theme} />
            ))}
          </div>
        </section>
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Recent Form Activity</h3>

        <div
          style={{
            border: '1px dashed ' + theme.cardBorder,
            borderRadius: 14,
            padding: 20,
            color: theme.mutedText,
          }}
        >
          Global form analytics feed coming soon. This panel is ready for submissions, ticket creation events and decision logs.
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

function FeatureCard({ item, theme }) {
  return (
    <div
      style={{
        border: '1px solid ' + theme.cardBorder,
        background: theme.cardBg,
        borderRadius: 18,
        padding: 18,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <strong>{item.title}</strong>
        <span style={{ color: '#c4b5fd', fontSize: 12, fontWeight: 900 }}>{item.status}</span>
      </div>
      <p style={{ marginBottom: 0, color: theme.mutedText, lineHeight: 1.5 }}>{item.description}</p>
    </div>
  );
}

function Pill({ label, theme }) {
  return (
    <span
      style={{
        border: '1px solid ' + theme.cardBorder,
        background: 'rgba(139,92,246,0.12)',
        color: '#ddd6fe',
        borderRadius: 999,
        padding: '7px 10px',
        fontSize: 12,
        fontWeight: 850,
      }}
    >
      {label}
    </span>
  );
}
