import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import PageShell, {
  LoadingPanel,
  Notice,
  PrimaryButton,
  SectionCard,
  StatGrid,
  SummaryStat,
} from '../components/PageShell';
import { PAGE_LAYOUTS, SECTION_DEFS } from '../ui';

const DEFAULT_FORM = {
  antiSpam: { enabled: false, maxMessages: 6, intervalSeconds: 8, punishment: 'delete' },
  antiLink: { enabled: false, punishment: 'delete' },
  antiInvite: { enabled: false, punishment: 'delete' },
  capsAbuse: { enabled: false, minLength: 10, percentage: 70, punishment: 'delete' },
  badWords: { enabled: false, words: '', punishment: 'delete' },
  repeatedMessages: { enabled: false, maxRepeats: 3, punishment: 'delete' },
  logs: { enabled: true, channelId: '' },
};

const PAGE_KEY = 'automod';

export default function AutoMod({ selectedGuild, theme }) {
  const page = PAGE_LAYOUTS[PAGE_KEY] || {
    title: 'AutoMod',
    description: 'Manage automod settings.',
    sections: [],
  };

  const [loading, setLoading] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [logChannels, setLogChannels] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function loadConfig() {
      if (!selectedGuild) {
        if (mounted) {
          setForm(DEFAULT_FORM);
          setLogChannels([]);
          setError('');
          setSaveMessage('');
          setChannelsLoading(false);
          setSaving(false);
        }
        return;
      }

      try {
        setLoading(true);
        setError('');
        setSaveMessage('');

        const data = await api.getAutoModConfig(selectedGuild);

        if (!mounted) return;

        setForm({
          antiSpam: {
            enabled: Boolean(data?.antiSpam?.enabled),
            maxMessages: Number(data?.antiSpam?.maxMessages ?? 6),
            intervalSeconds: Number(data?.antiSpam?.intervalSeconds ?? 8),
            punishment: data?.antiSpam?.punishment || 'delete',
          },
          antiLink: {
            enabled: Boolean(data?.antiLink?.enabled),
            punishment: data?.antiLink?.punishment || 'delete',
          },
          antiInvite: {
            enabled: Boolean(data?.antiInvite?.enabled),
            punishment: data?.antiInvite?.punishment || 'delete',
          },
          capsAbuse: {
            enabled: Boolean(data?.capsAbuse?.enabled),
            minLength: Number(data?.capsAbuse?.minLength ?? 10),
            percentage: Number(data?.capsAbuse?.percentage ?? 70),
            punishment: data?.capsAbuse?.punishment || 'delete',
          },
          badWords: {
            enabled: Boolean(data?.badWords?.enabled),
            words: Array.isArray(data?.badWords?.words)
              ? data.badWords.words.join(', ')
              : data?.badWords?.words || '',
            punishment: data?.badWords?.punishment || 'delete',
          },
          repeatedMessages: {
            enabled: Boolean(data?.repeatedMessages?.enabled),
            maxRepeats: Number(data?.repeatedMessages?.maxRepeats ?? 3),
            punishment: data?.repeatedMessages?.punishment || 'delete',
          },
          logs: {
            enabled: data?.logs?.enabled !== false,
            channelId: data?.logs?.channelId || '',
          },
        });
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setForm(DEFAULT_FORM);
        setError('Could not load automod config.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadConfig();

    return () => {
      mounted = false;
    };
  }, [selectedGuild]);

  useEffect(() => {
    let mounted = true;

    async function loadChannels() {
      if (!selectedGuild) {
        if (mounted) {
          setLogChannels([]);
          setChannelsLoading(false);
        }
        return;
      }

      try {
        setChannelsLoading(true);
        const channels = await api.getGuildChannels(selectedGuild);
        if (!mounted) return;
        setLogChannels(Array.isArray(channels) ? channels : []);
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setLogChannels([]);
      } finally {
        if (mounted) setChannelsLoading(false);
      }
    }

    loadChannels();

    return () => {
      mounted = false;
    };
  }, [selectedGuild]);

  const handleToggle = useCallback((section, field = 'enabled') => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: !prev[section][field],
      },
    }));
  }, []);

  const handleChange = useCallback((section, field, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  }, []);

  const enabledCount = useMemo(() => {
    const keys = ['antiSpam', 'antiLink', 'antiInvite', 'capsAbuse', 'badWords', 'repeatedMessages'];
    return keys.filter((key) => form[key]?.enabled).length;
  }, [form]);

  const handleSave = useCallback(async () => {
    if (!selectedGuild) {
      setSaveMessage('❌ Select a guild first.');
      return;
    }

    try {
      setSaving(true);
      setSaveMessage('');
      setError('');

      const payload = {
        antiSpam: {
          enabled: form.antiSpam.enabled,
          maxMessages: Number(form.antiSpam.maxMessages),
          intervalSeconds: Number(form.antiSpam.intervalSeconds),
          punishment: form.antiSpam.punishment,
        },
        antiLink: {
          enabled: form.antiLink.enabled,
          punishment: form.antiLink.punishment,
        },
        antiInvite: {
          enabled: form.antiInvite.enabled,
          punishment: form.antiInvite.punishment,
        },
        capsAbuse: {
          enabled: form.capsAbuse.enabled,
          minLength: Number(form.capsAbuse.minLength),
          percentage: Number(form.capsAbuse.percentage),
          punishment: form.capsAbuse.punishment,
        },
        badWords: {
          enabled: form.badWords.enabled,
          words: form.badWords.words.split(',').map((w) => w.trim()).filter(Boolean),
          punishment: form.badWords.punishment,
        },
        repeatedMessages: {
          enabled: form.repeatedMessages.enabled,
          maxRepeats: Number(form.repeatedMessages.maxRepeats),
          punishment: form.repeatedMessages.punishment,
        },
        logs: {
          enabled: form.logs.enabled,
          channelId: form.logs.channelId || null,
        },
      };

      await api.saveAutoModConfig(selectedGuild, payload);
      setSaveMessage('✅ AutoMod config saved successfully.');
    } catch (err) {
      console.error(err);
      setSaveMessage('❌ Failed to save automod config.');
    } finally {
      setSaving(false);
    }
  }, [selectedGuild, form]);

  return (
    <PageShell
      title={page.title || 'AutoMod'}
      subtitle={page.description || 'Manage anti-spam, link filtering, invite protection, and logging.'}
      theme={theme}
    >
      {!selectedGuild ? (
        <Notice theme={theme} tone="info">
          Select a guild to edit automod settings.
        </Notice>
      ) : null}

      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {saveMessage ? (
        <Notice theme={theme} tone={saveMessage.startsWith('❌') ? 'danger' : 'success'}>
          {saveMessage}
        </Notice>
      ) : null}

      <StatGrid>
        <SummaryStat theme={theme} label="Enabled Rules" value={`${enabledCount}/6`} />
        <SummaryStat
          theme={theme}
          label="Logs"
          value={form.logs.enabled ? 'Enabled' : 'Disabled'}
          accent={form.logs.enabled ? '#16a34a' : '#ef4444'}
        />
      </StatGrid>

      <SectionCard
        theme={theme}
        title={SECTION_DEFS?.rules?.title || 'Rules'}
        subtitle={SECTION_DEFS?.rules?.description || 'Manage core automod rules.'}
        padding="20px"
      >
        {loading ? (
          <LoadingPanel theme={theme} text="Loading automod config..." />
        ) : (
          <div style={{ display: 'grid', gap: '14px' }}>
            <ToggleRow label="Anti Spam" checked={form.antiSpam.enabled} onChange={() => handleToggle('antiSpam')} theme={theme} />
            <ToggleRow label="Anti Link" checked={form.antiLink.enabled} onChange={() => handleToggle('antiLink')} theme={theme} />
            <ToggleRow label="Anti Invite" checked={form.antiInvite.enabled} onChange={() => handleToggle('antiInvite')} theme={theme} />
            <ToggleRow label="Caps Abuse" checked={form.capsAbuse.enabled} onChange={() => handleToggle('capsAbuse')} theme={theme} />
            <ToggleRow label="Bad Words" checked={form.badWords.enabled} onChange={() => handleToggle('badWords')} theme={theme} />
            <ToggleRow label="Repeated Messages" checked={form.repeatedMessages.enabled} onChange={() => handleToggle('repeatedMessages')} theme={theme} />
            <ToggleRow label="AutoMod Logs" checked={form.logs.enabled} onChange={() => handleToggle('logs')} theme={theme} />

            <div>
              <p style={fieldLabel(theme)}>Log Channel</p>
              <select
                value={form.logs.channelId}
                onChange={(e) => handleChange('logs', 'channelId', e.target.value)}
                style={inputStyle(theme)}
                disabled={channelsLoading || logChannels.length === 0}
              >
                <option value="">
                  {channelsLoading
                    ? 'Loading channels...'
                    : logChannels.length === 0
                      ? 'No text channels found'
                      : 'Select a log channel'}
                </option>
                {logChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    #{channel.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <PrimaryButton onClick={handleSave} disabled={!selectedGuild || saving}>
                {saving ? 'Saving...' : 'Save AutoMod'}
              </PrimaryButton>
            </div>
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}

const ToggleRow = memo(function ToggleRow({ label, checked, onChange, theme }) {
  return (
    <div
      style={{
        background: theme.softBg,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: '14px',
        padding: '14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <span style={{ color: theme.cardText, fontWeight: 700 }}>{label}</span>
      <button
        type="button"
        onClick={onChange}
        style={{
          padding: '8px 12px',
          borderRadius: '999px',
          border: checked ? '1px solid rgba(34,197,94,0.3)' : `1px solid ${theme.cardBorder}`,
          background: checked ? 'rgba(34,197,94,0.14)' : theme.softBg,
          color: checked ? '#16a34a' : theme.cardText,
          fontWeight: 800,
          cursor: 'pointer',
        }}
      >
        {checked ? 'Enabled' : 'Disabled'}
      </button>
    </div>
  );
});

function fieldLabel(theme) {
  return {
    margin: '0 0 6px 0',
    fontSize: '12px',
    fontWeight: 700,
    color: theme.mutedText,
    textTransform: 'uppercase',
  };
}

function inputStyle(theme) {
  return {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '12px',
    border: `1px solid ${theme.inputBorder}`,
    background: theme.inputBg,
    color: theme.inputText,
    outline: 'none',
    fontSize: '14px',
    boxSizing: 'border-box',
  };
}