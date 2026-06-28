import React, { useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient';
import PageShell, { EmptyState, LoadingPanel, Notice, PrimaryButton, StatGrid, SummaryStat } from '../../shared/PageShell';

function guildIdFrom(selectedGuild, selectedGuildData) {
  return String(selectedGuildData?.guildId || selectedGuildData?.id || selectedGuild || '').split(':').pop().trim();
}

function Card({ theme, children }) {
  return <section style={{ border: `1px solid ${theme.cardBorder}`, background: theme.cardBg, color: theme.cardText, borderRadius: 22, boxShadow: theme.shadow, padding: 18 }}>{children}</section>;
}

function Input(props) {
  return <input {...props} style={{ width: '100%', border: '1px solid rgba(148,163,184,0.22)', background: 'rgba(15,23,42,0.76)', color: 'inherit', borderRadius: 12, padding: '12px 13px', outline: 'none', fontWeight: 800, ...(props.style || {}) }} />;
}

function Select(props) {
  return <select {...props} style={{ width: '100%', border: '1px solid rgba(148,163,184,0.22)', background: 'rgba(15,23,42,0.95)', color: 'inherit', borderRadius: 12, padding: '12px 13px', outline: 'none', fontWeight: 800, ...(props.style || {}) }} />;
}

function field(theme, label, node) {
  return <label style={{ display: 'grid', gap: 8, color: theme.cardText, fontWeight: 900, fontSize: 13 }}><span>{label}</span>{node}</label>;
}

export default function Polls({ theme, selectedGuild, selectedGuildData }) {
  const guildId = guildIdFrom(selectedGuild, selectedGuildData);
  const [channels, setChannels] = useState([]);
  const [config, setConfig] = useState(null);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState({ question: '', description: '', channelId: '', options: ['Option 1', 'Option 2'] });

  const polls = useMemo(() => Array.isArray(config?.polls) ? config.polls : [], [config]);

  async function load() {
    if (!guildId) return;
    setLoading(true);
    setError('');
    try {
      const [pollData, resources] = await Promise.all([
        api.getPolls(guildId),
        api.request(`/api/discord/${guildId}/resources`).catch(() => ({ channels: [] })),
      ]);
      setConfig(pollData.config || null);
      setOverview(pollData.overview || null);
      setChannels((resources.channels || []).filter((channel) => channel.type === 0 || channel.type === 5 || channel.type === 'GuildText' || channel.type === 'GuildAnnouncement'));
      setDraft((current) => ({ ...current, channelId: current.channelId || pollData.config?.settings?.defaultChannelId || '' }));
    } catch (loadError) {
      setError(loadError.message || 'Failed to load polls.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [guildId]);

  async function createPoll() {
    setSaving(true);
    setError('');
    try {
      await api.createPoll(guildId, {
        question: draft.question,
        description: draft.description,
        channelId: draft.channelId,
        options: draft.options.filter((value) => value.trim()).map((label) => ({ label })),
      });
      setDraft({ question: '', description: '', channelId: config?.settings?.defaultChannelId || '', options: ['Option 1', 'Option 2'] });
      setMessage('Poll created.');
      await load();
    } catch (saveError) {
      setError(saveError.message || 'Failed to create poll.');
    } finally {
      setSaving(false);
    }
  }

  async function deployPoll(poll) {
    setSaving(true);
    setError('');
    try {
      await api.deployPoll(guildId, poll.id, { channelId: poll.channelId || config?.settings?.defaultChannelId });
      setMessage('Poll deployed to Discord.');
      await load();
    } catch (saveError) {
      setError(saveError.message || 'Failed to deploy poll.');
    } finally {
      setSaving(false);
    }
  }

  async function closePoll(poll) {
    setSaving(true);
    setError('');
    try {
      await api.setPollStatus(guildId, poll.id, 'closed');
      setMessage('Poll closed.');
      await load();
    } catch (saveError) {
      setError(saveError.message || 'Failed to close poll.');
    } finally {
      setSaving(false);
    }
  }

  async function deletePoll(poll) {
    setSaving(true);
    setError('');
    try {
      await api.deletePoll(guildId, poll.id);
      setMessage('Poll deleted.');
      await load();
    } catch (saveError) {
      setError(saveError.message || 'Failed to delete poll.');
    } finally {
      setSaving(false);
    }
  }

  if (!guildId) return <EmptyState theme={theme} title="Select a guild" text="Select a guild to manage polls." />;
  if (loading && !config) return <LoadingPanel theme={theme} text="Loading polls..." />;

  return (
    <PageShell title="Polls" subtitle="Create, deploy, close and review Discord community polls." theme={theme} guild={{ id: guildId, name: selectedGuildData?.name || selectedGuildData?.guildName || 'Polls' }} actions={<PrimaryButton onClick={load} disabled={loading}>Refresh</PrimaryButton>}>
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {message ? <Notice theme={theme} tone="success">{message}</Notice> : null}

      <StatGrid min="160px">
        <SummaryStat theme={theme} label="Total" value={overview?.total || 0} accent="#60a5fa" description="Stored polls" />
        <SummaryStat theme={theme} label="Active" value={overview?.active || 0} accent="#22c55e" description="Open polls" />
        <SummaryStat theme={theme} label="Closed" value={overview?.closed || 0} accent="#94a3b8" description="Finished polls" />
        <SummaryStat theme={theme} label="Responses" value={overview?.responses || 0} accent="#f59e0b" description="Button responses" />
      </StatGrid>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16 }}>
        <Card theme={theme}>
          <h2 style={{ margin: '0 0 12px' }}>Create Poll</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {field(theme, 'Question', <Input value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} placeholder="What should we do next?" />)}
            {field(theme, 'Description', <Input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Optional context" />)}
            {field(theme, 'Channel', <Select value={draft.channelId} onChange={(event) => setDraft({ ...draft, channelId: event.target.value })}><option value="">Select a channel</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}</Select>)}
            {draft.options.map((option, index) => field(theme, `Option ${index + 1}`, <Input key={index} value={option} onChange={(event) => setDraft({ ...draft, options: draft.options.map((value, optionIndex) => optionIndex === index ? event.target.value : value) })} />))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setDraft({ ...draft, options: [...draft.options, `Option ${draft.options.length + 1}`] })} disabled={draft.options.length >= 10} style={{ border: `1px solid ${theme.cardBorder}`, background: theme.softBg, color: theme.cardText, borderRadius: 12, padding: '10px 12px', fontWeight: 900 }}>Add Option</button>
              <button type="button" onClick={() => setDraft({ ...draft, options: draft.options.slice(0, Math.max(2, draft.options.length - 1)) })} disabled={draft.options.length <= 2} style={{ border: `1px solid ${theme.cardBorder}`, background: theme.softBg, color: theme.cardText, borderRadius: 12, padding: '10px 12px', fontWeight: 900 }}>Remove Option</button>
            </div>
            <PrimaryButton onClick={createPoll} disabled={saving || !draft.question.trim()}>{saving ? 'Saving...' : 'Create Poll'}</PrimaryButton>
          </div>
        </Card>

        <Card theme={theme}>
          <h2 style={{ margin: '0 0 12px' }}>Saved Polls</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {polls.length ? polls.map((poll) => (
              <div key={poll.id} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.52)', borderRadius: 16, padding: 14, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>{poll.question}</strong><span style={{ color: poll.status === 'active' ? '#86efac' : '#cbd5e1', fontWeight: 950 }}>{poll.status}</span></div>
                <div style={{ color: theme.mutedText, fontSize: 13 }}>Responses: {poll.totalVotes || 0}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {poll.status === 'draft' ? <PrimaryButton onClick={() => deployPoll(poll)} disabled={saving}>Deploy</PrimaryButton> : null}
                  {poll.status === 'active' ? <button type="button" onClick={() => closePoll(poll)} disabled={saving} style={{ border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.12)', color: '#fca5a5', borderRadius: 12, padding: '10px 12px', fontWeight: 900 }}>Close</button> : null}
                  <button type="button" onClick={() => deletePoll(poll)} disabled={saving} style={{ border: `1px solid ${theme.cardBorder}`, background: theme.softBg, color: theme.cardText, borderRadius: 12, padding: '10px 12px', fontWeight: 900 }}>Delete</button>
                </div>
              </div>
            )) : <EmptyState theme={theme} title="No polls yet" text="Create a poll to deploy it to Discord." />}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
