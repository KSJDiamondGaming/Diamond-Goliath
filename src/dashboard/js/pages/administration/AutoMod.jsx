import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../services/apiClient';
import { joinGuildRoom, listenForGuildUpdate } from '../../services/socketClient';
import PageShell, {
  LoadingPanel,
  Notice,
  PrimaryButton,
  SectionCard,
  StatGrid,
  SummaryStat,
} from '../../shared/PageShell';
import { PAGE_LAYOUTS } from '../../ui/layout';
import { createAutoModPageStyles } from '../../ui/components';

const PAGE_KEY = 'automod';
const RULE_KEYS = ['antiSpam', 'antiLink', 'antiInvite', 'capsAbuse', 'badWords', 'repeatedMessages'];
const PUNISHMENT_OPTIONS = [
  ['delete', 'Delete message'],
  ['warn', 'Warn user'],
  ['dm', 'Warn user by DM'],
  ['timeout', 'Timeout user'],
  ['kick', 'Kick user'],
  ['ban', 'Ban user'],
];

const DEFAULT_FORM = {
  antiSpam: { enabled: false, maxMessages: 6, intervalSeconds: 8, punishment: ['delete'] },
  antiLink: { enabled: false, punishment: ['delete'], allowedDomains: '', blockedDomains: '' },
  antiInvite: { enabled: false, punishment: ['delete'] },
  capsAbuse: { enabled: false, minLength: 10, percentage: 70, punishment: ['delete'] },
  badWords: { enabled: false, words: '', punishment: ['delete'] },
  repeatedMessages: { enabled: false, maxRepeats: 3, intervalSeconds: 10, punishment: ['delete'] },
  logs: { enabled: true, channelId: '' },
};

function normalizePunishments(value) {
  const values = Array.isArray(value) ? value : value ? [value] : ['delete'];
  const cleaned = values.map((item) => (item === 'warn-dm' ? 'dm' : item)).filter(Boolean);
  return cleaned.length ? [...new Set(cleaned)] : ['delete'];
}

function normalizeAutoModForm(data = {}) {
  return {
    antiSpam: {
      enabled: Boolean(data?.antiSpam?.enabled),
      maxMessages: Number(data?.antiSpam?.maxMessages ?? 6),
      intervalSeconds: Number(data?.antiSpam?.intervalSeconds ?? 8),
      punishment: normalizePunishments(data?.antiSpam?.punishments || data?.antiSpam?.punishment),
    },
    antiLink: {
      enabled: Boolean(data?.antiLink?.enabled),
      punishment: normalizePunishments(data?.antiLink?.punishments || data?.antiLink?.punishment),
      allowedDomains: Array.isArray(data?.antiLink?.allowedDomains) ? data.antiLink.allowedDomains.join(', ') : data?.antiLink?.allowedDomains || '',
      blockedDomains: Array.isArray(data?.antiLink?.blockedDomains) ? data.antiLink.blockedDomains.join(', ') : data?.antiLink?.blockedDomains || '',
    },
    antiInvite: {
      enabled: Boolean(data?.antiInvite?.enabled),
      punishment: normalizePunishments(data?.antiInvite?.punishments || data?.antiInvite?.punishment),
    },
    capsAbuse: {
      enabled: Boolean(data?.capsAbuse?.enabled),
      minLength: Number(data?.capsAbuse?.minLength ?? 10),
      percentage: Number(data?.capsAbuse?.percentage ?? 70),
      punishment: normalizePunishments(data?.capsAbuse?.punishments || data?.capsAbuse?.punishment),
    },
    badWords: {
      enabled: Boolean(data?.badWords?.enabled),
      words: Array.isArray(data?.badWords?.words) ? data.badWords.words.join(', ') : data?.badWords?.words || '',
      punishment: normalizePunishments(data?.badWords?.punishments || data?.badWords?.punishment),
    },
    repeatedMessages: {
      enabled: Boolean(data?.repeatedMessages?.enabled),
      maxRepeats: Number(data?.repeatedMessages?.maxRepeats ?? 3),
      intervalSeconds: Number(data?.repeatedMessages?.intervalSeconds ?? 10),
      punishment: normalizePunishments(data?.repeatedMessages?.punishments || data?.repeatedMessages?.punishment),
    },
    logs: { enabled: data?.logs?.enabled !== false, channelId: data?.logs?.channelId || '' },
  };
}

function parseList(value, domainMode = false) {
  return String(value || '')
    .split(/[\n,]/)
    .map((item) => item.trim().toLowerCase())
    .map((item) => domainMode ? item.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') : item)
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function buildRulePayload(rule) {
  const punishments = normalizePunishments(rule.punishment);
  return { ...rule, punishment: punishments[0], punishments };
}

function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)} style={{
      border: checked ? '1px solid rgba(34,197,94,.45)' : '1px solid rgba(239,68,68,.45)',
      background: checked ? 'rgba(34,197,94,.14)' : 'rgba(239,68,68,.14)',
      color: checked ? '#86efac' : '#fca5a5', borderRadius: 999, padding: '8px 12px',
      fontWeight: 900, cursor: disabled ? 'not-allowed' : 'pointer',
    }}>{checked ? 'Enabled' : 'Disabled'}</button>
  );
}

function Field({ label, value, onChange, type = 'text', min, max, styles }) {
  return <label style={{ display: 'grid', gap: 7 }}><span style={styles.label}>{label}</span><input type={type} min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} style={styles.input} /></label>;
}

function TextArea({ label, value, onChange, placeholder, styles }) {
  return <label style={{ display: 'grid', gap: 7 }}><span style={styles.label}>{label}</span><textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} style={styles.textarea} /></label>;
}

function Punishments({ value, onChange, styles }) {
  const selected = normalizePunishments(value);
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {PUNISHMENT_OPTIONS.map(([optionValue, label]) => {
        const active = selected.includes(optionValue);
        return <button key={optionValue} type="button" onClick={() => {
          const next = active ? selected.filter((item) => item !== optionValue) : [...selected, optionValue];
          onChange(next.length ? next : ['delete']);
        }} style={{ ...styles.input, width: 'auto', cursor: 'pointer', background: active ? 'rgba(59,130,246,.16)' : styles.input.background }}>{label}</button>;
      })}
    </div>
  );
}

function RuleCard({ title, description, enabled, onEnabledChange, punishment, onPunishmentChange, children, theme, styles }) {
  return (
    <div style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 16, display: 'grid', gap: 14, background: theme.softBg }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div><h3 style={{ margin: 0, color: theme.cardText, fontSize: 16 }}>{title}</h3><p style={{ margin: '5px 0 0', color: theme.mutedText, fontSize: 13 }}>{description}</p></div>
        <Toggle checked={enabled} onChange={onEnabledChange} />
      </div>
      {punishment ? <div style={{ display: 'grid', gap: 8 }}><span style={styles.label}>Actions</span><Punishments value={punishment} onChange={onPunishmentChange} styles={styles} /></div> : null}
      {children}
    </div>
  );
}

export default function AutoMod({ selectedGuild, theme }) {
  const styles = useMemo(() => createAutoModPageStyles(theme), [theme]);
  const page = PAGE_LAYOUTS[PAGE_KEY] || { title: 'AutoMod', description: 'Configure automated moderation rules and logging.' };
  const [loading, setLoading] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [logChannels, setLogChannels] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!selectedGuild) {
        if (mounted) { setForm(DEFAULT_FORM); setError(''); setSaveMessage(''); setLoading(false); }
        return;
      }
      try {
        setLoading(true); setError(''); setSaveMessage('');
        const data = await api.getAutoModConfig(selectedGuild);
        if (mounted) setForm(normalizeAutoModForm(data));
      } catch (err) {
        console.error(err);
        if (mounted) { setForm(DEFAULT_FORM); setError('Could not load AutoMod config.'); }
      } finally { if (mounted) setLoading(false); }
    }
    load();
    return () => { mounted = false; };
  }, [selectedGuild]);

  useEffect(() => {
    let mounted = true;
    async function loadChannels() {
      if (!selectedGuild) { if (mounted) setLogChannels([]); return; }
      try {
        setChannelsLoading(true);
        const channels = await api.getGuildChannels(selectedGuild);
        if (mounted) setLogChannels(Array.isArray(channels) ? channels : []);
      } catch (err) {
        console.error(err);
        if (mounted) setLogChannels([]);
      } finally { if (mounted) setChannelsLoading(false); }
    }
    loadChannels();
    return () => { mounted = false; };
  }, [selectedGuild]);

  useEffect(() => {
    if (!selectedGuild) return undefined;
    joinGuildRoom(selectedGuild);
    return listenForGuildUpdate('automod', (data, payload = {}) => {
      setForm(normalizeAutoModForm(data));
      setSaveMessage(payload.source === 'dashboard' ? '✅ AutoMod synced live.' : '🔄 AutoMod updated live.');
    });
  }, [selectedGuild]);

  const updateSection = useCallback((section, field, value) => {
    setForm((current) => ({ ...current, [section]: { ...current[section], [field]: value } }));
  }, []);

  const enabledCount = RULE_KEYS.filter((key) => form[key]?.enabled).length;

  const handleSave = useCallback(async () => {
    if (!selectedGuild) { setSaveMessage('❌ Select a guild first.'); return; }
    try {
      setSaving(true); setSaveMessage(''); setError('');
      const payload = {
        antiSpam: buildRulePayload({ ...form.antiSpam, maxMessages: Number(form.antiSpam.maxMessages), intervalSeconds: Number(form.antiSpam.intervalSeconds) }),
        antiLink: buildRulePayload({ ...form.antiLink, allowedDomains: parseList(form.antiLink.allowedDomains, true), blockedDomains: parseList(form.antiLink.blockedDomains, true) }),
        antiInvite: buildRulePayload(form.antiInvite),
        capsAbuse: buildRulePayload({ ...form.capsAbuse, minLength: Number(form.capsAbuse.minLength), percentage: Number(form.capsAbuse.percentage) }),
        badWords: buildRulePayload({ ...form.badWords, words: parseList(form.badWords.words) }),
        repeatedMessages: buildRulePayload({ ...form.repeatedMessages, maxRepeats: Number(form.repeatedMessages.maxRepeats), intervalSeconds: Number(form.repeatedMessages.intervalSeconds) }),
        logs: { enabled: form.logs.enabled, channelId: form.logs.channelId || '' },
      };
      const saved = await api.saveAutoModConfig(selectedGuild, payload);
      if (saved?.config) setForm(normalizeAutoModForm(saved.config));
      setSaveMessage('✅ AutoMod config saved successfully.');
    } catch (err) {
      console.error(err); setSaveMessage('❌ Failed to save AutoMod config.');
    } finally { setSaving(false); }
  }, [form, selectedGuild]);

  return (
    <PageShell title={page.title || 'AutoMod'} subtitle={page.description || 'Configure automated moderation rules and logging.'} theme={theme}>
      {!selectedGuild ? <Notice theme={theme} tone="info">Select a guild to edit AutoMod settings.</Notice> : null}
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {saveMessage ? <Notice theme={theme} tone={saveMessage.startsWith('❌') ? 'danger' : 'success'}>{saveMessage}</Notice> : null}

      <StatGrid>
        <SummaryStat theme={theme} label="Enabled Rules" value={`${enabledCount}/6`} />
        <SummaryStat theme={theme} label="Logging" value={form.logs.enabled ? 'Enabled' : 'Disabled'} accent={form.logs.enabled ? theme.success : theme.danger} />
        <SummaryStat theme={theme} label="Log Channel" value={form.logs.channelId ? 'Configured' : 'Not set'} />
      </StatGrid>

      <SectionCard theme={theme} title="Rules" subtitle="Manage core AutoMod rules." padding="20px">
        {loading ? <LoadingPanel theme={theme} text="Loading AutoMod config..." /> : (
          <div style={{ display: 'grid', gap: 14 }}>
            <RuleCard title="Anti Spam" description="Stops users sending too many messages too quickly." enabled={form.antiSpam.enabled} onEnabledChange={(value) => updateSection('antiSpam', 'enabled', value)} punishment={form.antiSpam.punishment} onPunishmentChange={(value) => updateSection('antiSpam', 'punishment', value)} theme={theme} styles={styles}>
              <div style={styles.ruleMiniGrid}><Field styles={styles} label="Max Messages" type="number" min="1" value={form.antiSpam.maxMessages} onChange={(value) => updateSection('antiSpam', 'maxMessages', value)} /><Field styles={styles} label="Interval Seconds" type="number" min="1" value={form.antiSpam.intervalSeconds} onChange={(value) => updateSection('antiSpam', 'intervalSeconds', value)} /></div>
            </RuleCard>
            <RuleCard title="Anti Link" description="Controls posted links with whitelist and blacklist checks." enabled={form.antiLink.enabled} onEnabledChange={(value) => updateSection('antiLink', 'enabled', value)} punishment={form.antiLink.punishment} onPunishmentChange={(value) => updateSection('antiLink', 'punishment', value)} theme={theme} styles={styles}>
              <TextArea styles={styles} label="Allowed Domains / Whitelist" value={form.antiLink.allowedDomains} onChange={(value) => updateSection('antiLink', 'allowedDomains', value)} placeholder="youtube.com, youtu.be" />
              <TextArea styles={styles} label="Blocked Domains / Blacklist" value={form.antiLink.blockedDomains} onChange={(value) => updateSection('antiLink', 'blockedDomains', value)} placeholder="scam-site.example" />
            </RuleCard>
            <RuleCard title="Anti Invite" description="Blocks Discord invite links from being posted." enabled={form.antiInvite.enabled} onEnabledChange={(value) => updateSection('antiInvite', 'enabled', value)} punishment={form.antiInvite.punishment} onPunishmentChange={(value) => updateSection('antiInvite', 'punishment', value)} theme={theme} styles={styles} />
            <RuleCard title="Caps Abuse" description="Detects messages with excessive capital letters." enabled={form.capsAbuse.enabled} onEnabledChange={(value) => updateSection('capsAbuse', 'enabled', value)} punishment={form.capsAbuse.punishment} onPunishmentChange={(value) => updateSection('capsAbuse', 'punishment', value)} theme={theme} styles={styles}>
              <div style={styles.ruleMiniGrid}><Field styles={styles} label="Minimum Length" type="number" min="1" value={form.capsAbuse.minLength} onChange={(value) => updateSection('capsAbuse', 'minLength', value)} /><Field styles={styles} label="Caps Percentage" type="number" min="1" max="100" value={form.capsAbuse.percentage} onChange={(value) => updateSection('capsAbuse', 'percentage', value)} /></div>
            </RuleCard>
            <RuleCard title="Bad Words" description="Blocks configured banned words and phrases." enabled={form.badWords.enabled} onEnabledChange={(value) => updateSection('badWords', 'enabled', value)} punishment={form.badWords.punishment} onPunishmentChange={(value) => updateSection('badWords', 'punishment', value)} theme={theme} styles={styles}>
              <TextArea styles={styles} label="Blocked Words" value={form.badWords.words} onChange={(value) => updateSection('badWords', 'words', value)} placeholder="word1, word2, phrase" />
            </RuleCard>
            <RuleCard title="Repeated Messages" description="Stops users repeating the same message too many times." enabled={form.repeatedMessages.enabled} onEnabledChange={(value) => updateSection('repeatedMessages', 'enabled', value)} punishment={form.repeatedMessages.punishment} onPunishmentChange={(value) => updateSection('repeatedMessages', 'punishment', value)} theme={theme} styles={styles}>
              <div style={styles.ruleMiniGrid}><Field styles={styles} label="Max Repeats" type="number" min="1" value={form.repeatedMessages.maxRepeats} onChange={(value) => updateSection('repeatedMessages', 'maxRepeats', value)} /><Field styles={styles} label="Interval Seconds" type="number" min="1" value={form.repeatedMessages.intervalSeconds} onChange={(value) => updateSection('repeatedMessages', 'intervalSeconds', value)} /></div>
            </RuleCard>
            <RuleCard title="AutoMod Logs" description="Send AutoMod action logs to a Discord channel." enabled={form.logs.enabled} onEnabledChange={(value) => updateSection('logs', 'enabled', value)} theme={theme} styles={styles}>
              <label style={{ display: 'grid', gap: 7 }}><span style={styles.label}>Log Channel</span><select value={form.logs.channelId} onChange={(event) => updateSection('logs', 'channelId', event.target.value)} style={styles.input} disabled={channelsLoading || !logChannels.length}><option value="">{channelsLoading ? 'Loading channels...' : logChannels.length ? 'Select a log channel' : 'No text channels found'}</option>{logChannels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select></label>
            </RuleCard>
            <div style={styles.saveRow}><PrimaryButton onClick={handleSave} disabled={!selectedGuild || saving}>{saving ? 'Saving...' : 'Save AutoMod Settings'}</PrimaryButton></div>
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
