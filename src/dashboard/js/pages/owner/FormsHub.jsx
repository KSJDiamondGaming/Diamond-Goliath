import React from 'react';

import useOwnerGuilds from '../../hooks/useOwnerGuilds.js';
import ownerApi from '../../services/ownerApi.js';

const FORM_AREAS = [
  {
    title: 'Forms',
    description: 'Create, edit, disable and manage universal form templates per guild.',
    status: 'API Ready',
  },
  {
    title: 'Submissions',
    description: 'Review incoming form submissions before they become tickets or logged decisions.',
    status: 'API Ready',
  },
  {
    title: 'Analytics',
    description: 'Track form usage, completion rates, submissions and ticket conversion activity.',
    status: 'Partial Data',
  },
  {
    title: 'Settings',
    description: 'Configure permissions, cooldowns, submission actions and form-to-ticket workflows.',
    status: 'API Ready',
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

const WORKFLOW_STEPS = [
  'Form template created',
  'User submits form',
  'Submission stored in modules.forms',
  'Submission action evaluated',
  'Private review ticket created',
  'Staff review and decision logged',
  'Analytics updated',
];

const ACTION_TYPES = [
  'Create Ticket',
  'Log Submission Only',
  'Notify Staff',
  'DM User',
  'Require Manual Review',
  'Auto-Assign Panel',
];

function getGuildId(guild = {}) {
  return String(guild.guildId || guild.id || '');
}

function getGuildName(guild = {}) {
  return guild.name || guild.guildName || 'Unknown Guild';
}

export default function FormsHub({ theme }) {
  const { guilds, selectedGuild, setSelectedGuild, loading, error } = useOwnerGuilds();
  const [overview, setOverview] = React.useState(null);
  const [formsLoading, setFormsLoading] = React.useState(false);
  const [formsError, setFormsError] = React.useState('');

  const selectedGuildRecord = guilds.find((guild) => getGuildId(guild) === selectedGuild);
  const selectedGuildName = selectedGuildRecord ? getGuildName(selectedGuildRecord) : 'No guild selected';
  const analytics = overview?.analytics || {};

  React.useEffect(() => {
    if (!selectedGuild) {
      setOverview(null);
      return;
    }

    let cancelled = false;

    async function loadFormsOverview() {
      try {
        setFormsLoading(true);
        setFormsError('');

        const payload = await ownerApi.getFormsOverview(selectedGuild);

        if (!cancelled) {
          setOverview(payload?.overview || null);
        }
      } catch (err) {
        if (!cancelled) {
          setOverview(null);
          setFormsError(err.message || 'Failed to load forms overview.');
        }
      } finally {
        if (!cancelled) {
          setFormsLoading(false);
        }
      }
    }

    loadFormsOverview();

    return () => {
      cancelled = true;
    };
  }, [selectedGuild]);

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
          Universal forms dashboard with live overview data from modules.forms.
        </p>
      </section>

      {error ? (
        <section style={{ ...card, color: '#fca5a5' }}>
          {error}
        </section>
      ) : null}

      {formsError ? (
        <section style={{ ...card, color: '#fca5a5' }}>
          {formsError}
        </section>
      ) : null}

      <section style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <strong>Selected Guild</strong>
          <div style={{ color: theme.mutedText, marginTop: 4 }}>{selectedGuildName}</div>
        </div>

        <select
          value={selectedGuild}
          onChange={(event) => setSelectedGuild(event.target.value)}
          disabled={loading || guilds.length === 0}
          style={{
            border: '1px solid ' + theme.cardBorder,
            background: 'rgba(15,23,42,0.55)',
            color: theme.cardText,
            borderRadius: 12,
            padding: '10px 12px',
            minWidth: 260,
            fontWeight: 800,
          }}
        >
          {guilds.map((guild) => (
            <option key={getGuildId(guild)} value={getGuildId(guild)}>
              {getGuildName(guild)}
            </option>
          ))}
        </select>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
          gap: 14,
        }}
      >
        <StatCard title="Connected Guilds" value={loading ? 'Loading' : String(guilds.length)} theme={theme} />
        <StatCard title="Active Forms" value={formsLoading ? 'Loading' : String(overview?.enabledFormCount ?? 0)} theme={theme} />
        <StatCard title="Total Forms" value={formsLoading ? 'Loading' : String(overview?.formCount ?? 0)} theme={theme} />
        <StatCard title="Submissions" value={formsLoading ? 'Loading' : String(overview?.submissionCount ?? 0)} theme={theme} />
        <StatCard title="Pending Review" value={formsLoading ? 'Loading' : String(overview?.pendingSubmissionCount ?? 0)} theme={theme} />
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

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Forms → Tickets Workflow</h3>
          <p style={{ marginTop: 0, color: theme.mutedText }}>
            Locked universal flow for form submissions that create staff review tickets.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {WORKFLOW_STEPS.map((step, index) => (
              <WorkflowRow key={step} number={index + 1} label={step} theme={theme} />
            ))}
          </div>
        </section>

        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Submission Actions</h3>
          <p style={{ marginTop: 0, color: theme.mutedText }}>
            First dashboard-ready action types for the universal forms engine.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ACTION_TYPES.map((action) => (
              <Pill key={action} label={action} theme={theme} />
            ))}
          </div>
        </section>
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Forms Analytics</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          <MiniMetric title="Approved" value={analytics.approved ?? 0} theme={theme} />
          <MiniMetric title="Denied" value={analytics.denied ?? 0} theme={theme} />
          <MiniMetric title="Panels" value={overview?.panelCount ?? 0} theme={theme} />
          <MiniMetric title="Deployed Panels" value={overview?.deployedPanelCount ?? 0} theme={theme} />
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

function WorkflowRow({ number, label, theme }) {
  return (
    <div
      style={{
        border: '1px solid ' + theme.cardBorder,
        borderRadius: 12,
        padding: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span style={{ color: '#c4b5fd', fontWeight: 900 }}>{number}</span>
      <span>{label}</span>
    </div>
  );
}

function MiniMetric({ title, value, theme }) {
  return (
    <div style={{ border: '1px solid ' + theme.cardBorder, borderRadius: 14, padding: 12 }}>
      <div style={{ color: theme.mutedText, fontSize: 12 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900 }}>{value}</div>
    </div>
  );
}
