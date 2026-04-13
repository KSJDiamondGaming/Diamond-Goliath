import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import DashboardPage, {
  PrimaryButton,
  SectionCard,
  StatGrid,
} from '../components/DashboardPage';

const DEFAULT_FORM = {
  antiSpam: {
    enabled: false,
    maxMessages: 6,
    intervalSeconds: 8,
    punishment: 'delete',
  },
  antiLink: {
    enabled: false,
    punishment: 'delete',
  },
  antiInvite: {
    enabled: false,
    punishment: 'delete',
  },
  capsAbuse: {
    enabled: false,
    minLength: 10,
    percentage: 70,
    punishment: 'delete',
  },
  badWords: {
    enabled: false,
    words: '',
    punishment: 'delete',
  },
  repeatedMessages: {
    enabled: false,
    maxRepeats: 3,
    punishment: 'delete',
  },
  logs: {
    enabled: true,
    channelId: '',
  },
};

export default function AutoMod({ selectedGuild, theme }) {
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
        setError('Could not load automod config. You can still edit locally and save once the backend route exists.');
      } finally {
        if (mounted) {
          setLoading(false);
        }
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
        setError((prev) => prev || 'Could not load server channels for the log dropdown.');
      } finally {
        if (mounted) {
          setChannelsLoading(false);
        }
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
    const keys = [
      'antiSpam',
      'antiLink',
      'antiInvite',
      'capsAbuse',
      'badWords',
      'repeatedMessages',
    ];

    return keys.filter((key) => form[key]?.enabled).length;
  }, [form]);

  const totalRules = 6;

  const handleSave = useCallback(async () => {
    console.log('🔥 Save AutoMod clicked');
    console.log('Guild:', selectedGuild);
    console.log('Form:', form);

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
          words: form.badWords.words
            .split(',')
            .map((word) => word.trim())
            .filter(Boolean),
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

      console.log('📤 Sending payload:', payload);

      const res = await api.saveAutoModConfig(selectedGuild, payload);

      console.log('✅ API response:', res);

      setSaveMessage('✅ AutoMod config saved successfully.');
    } catch (err) {
      console.error('❌ Save failed:', err);
      setSaveMessage('❌ Failed to save automod config.');
    } finally {
      setSaving(false);
    }
  }, [selectedGuild, form]);

  return (
    <DashboardPage
      title="AutoMod"
      subtitle={
        selectedGuild
          ? 'Manage anti-spam, link filtering, invite protection, caps abuse, bad words, repeated messages, and logging.'
          : 'Select a server to manage automod settings.'
      }
      theme={theme}
    >
      {!selectedGuild ? (
        <div
          style={{
            background: theme.cardBg,
            border: `1px solid ${theme.cardBorder}`,
            borderRadius: '18px',
            padding: '18px',
            color: theme.mutedText,
            boxShadow: theme.shadow,
          }}
        >
          Select a guild to edit automod settings.
        </div>
      ) : null}

      {error ? <p style={{ color: '#ef4444', margin: 0 }}>{error}</p> : null}

      {saveMessage && (
        <p
          style={{
            color: saveMessage.startsWith('❌') ? '#ef4444' : '#22c55e',
            margin: 0,
            fontWeight: 600,
          }}
        >
          {saveMessage}
        </p>
      )}

      <StatGrid>
        <StatCard title="Enabled Rules" value={`${enabledCount}/${totalRules}`} theme={theme} />
        <StatCard
          title="Logs"
          value={form.logs.enabled ? 'Enabled' : 'Disabled'}
          theme={theme}
          color={form.logs.enabled ? '#16a34a' : '#ef4444'}
        />
      </StatGrid>

      {loading ? (
        <SectionCard theme={theme} title="Loading AutoMod" padding="20px">
          <p style={{ margin: 0, color: theme.mutedText }}>Loading automod config...</p>
        </SectionCard>
      ) : (
        <div style={{ display: 'grid', gap: '20px' }}>
          <RuleCard
            title="Anti-Spam"
            description="Delete or punish users sending too many messages too fast."
            section={form.antiSpam}
            theme={theme}
            onToggle={() => handleToggle('antiSpam')}
          >
            <FieldRow theme={theme} label="Max Messages">
              <input
                type="number"
                min="2"
                value={form.antiSpam.maxMessages}
                onChange={(e) => handleChange('antiSpam', 'maxMessages', e.target.value)}
                style={inputStyle(theme)}
              />
            </FieldRow>

            <FieldRow theme={theme} label="Interval Seconds">
              <input
                type="number"
                min="1"
                value={form.antiSpam.intervalSeconds}
                onChange={(e) => handleChange('antiSpam', 'intervalSeconds', e.target.value)}
                style={inputStyle(theme)}
              />
            </FieldRow>

            <FieldRow theme={theme} label="Punishment">
              <select
                value={form.antiSpam.punishment}
                onChange={(e) => handleChange('antiSpam', 'punishment', e.target.value)}
                style={inputStyle(theme)}
              >
                <option value="delete">Delete Message</option>
                <option value="warn">Warn</option>
                <option value="timeout">Timeout</option>
              </select>
            </FieldRow>
          </RuleCard>

          <RuleCard
            title="Anti-Link"
            description="Block normal external links from being posted."
            section={form.antiLink}
            theme={theme}
            onToggle={() => handleToggle('antiLink')}
          >
            <FieldRow theme={theme} label="Punishment">
              <select
                value={form.antiLink.punishment}
                onChange={(e) => handleChange('antiLink', 'punishment', e.target.value)}
                style={inputStyle(theme)}
              >
                <option value="delete">Delete Message</option>
                <option value="warn">Warn</option>
                <option value="timeout">Timeout</option>
              </select>
            </FieldRow>
          </RuleCard>

          <RuleCard
            title="Anti-Invite"
            description="Block Discord invite links from being posted."
            section={form.antiInvite}
            theme={theme}
            onToggle={() => handleToggle('antiInvite')}
          >
            <FieldRow theme={theme} label="Punishment">
              <select
                value={form.antiInvite.punishment}
                onChange={(e) => handleChange('antiInvite', 'punishment', e.target.value)}
                style={inputStyle(theme)}
              >
                <option value="delete">Delete Message</option>
                <option value="warn">Warn</option>
                <option value="timeout">Timeout</option>
              </select>
            </FieldRow>
          </RuleCard>

          <RuleCard
            title="Caps Abuse"
            description="Block messages with too much uppercase text."
            section={form.capsAbuse}
            theme={theme}
            onToggle={() => handleToggle('capsAbuse')}
          >
            <FieldRow theme={theme} label="Minimum Length">
              <input
                type="number"
                min="1"
                value={form.capsAbuse.minLength}
                onChange={(e) => handleChange('capsAbuse', 'minLength', e.target.value)}
                style={inputStyle(theme)}
              />
            </FieldRow>

            <FieldRow theme={theme} label="Caps Percentage">
              <input
                type="number"
                min="1"
                max="100"
                value={form.capsAbuse.percentage}
                onChange={(e) => handleChange('capsAbuse', 'percentage', e.target.value)}
                style={inputStyle(theme)}
              />
            </FieldRow>

            <FieldRow theme={theme} label="Punishment">
              <select
                value={form.capsAbuse.punishment}
                onChange={(e) => handleChange('capsAbuse', 'punishment', e.target.value)}
                style={inputStyle(theme)}
              >
                <option value="delete">Delete Message</option>
                <option value="warn">Warn</option>
                <option value="timeout">Timeout</option>
              </select>
            </FieldRow>
          </RuleCard>

          <RuleCard
            title="Bad Words Filter"
            description="Comma-separated blocked words list."
            section={form.badWords}
            theme={theme}
            onToggle={() => handleToggle('badWords')}
          >
            <FieldRow theme={theme} label="Blocked Words">
              <textarea
                value={form.badWords.words}
                onChange={(e) => handleChange('badWords', 'words', e.target.value)}
                style={textareaStyle(theme)}
                placeholder="word1, word2, word3"
              />
            </FieldRow>

            <FieldRow theme={theme} label="Punishment">
              <select
                value={form.badWords.punishment}
                onChange={(e) => handleChange('badWords', 'punishment', e.target.value)}
                style={inputStyle(theme)}
              >
                <option value="delete">Delete Message</option>
                <option value="warn">Warn</option>
                <option value="timeout">Timeout</option>
              </select>
            </FieldRow>
          </RuleCard>

          <RuleCard
            title="Repeated Messages"
            description="Detect repeated message spam or floods."
            section={form.repeatedMessages}
            theme={theme}
            onToggle={() => handleToggle('repeatedMessages')}
          >
            <FieldRow theme={theme} label="Max Repeats">
              <input
                type="number"
                min="2"
                value={form.repeatedMessages.maxRepeats}
                onChange={(e) => handleChange('repeatedMessages', 'maxRepeats', e.target.value)}
                style={inputStyle(theme)}
              />
            </FieldRow>

            <FieldRow theme={theme} label="Punishment">
              <select
                value={form.repeatedMessages.punishment}
                onChange={(e) => handleChange('repeatedMessages', 'punishment', e.target.value)}
                style={inputStyle(theme)}
              >
                <option value="delete">Delete Message</option>
                <option value="warn">Warn</option>
                <option value="timeout">Timeout</option>
              </select>
            </FieldRow>
          </RuleCard>

          <SectionCard
            theme={theme}
            title="AutoMod Logs"
            subtitle="Choose whether automod logs are enabled and where they should be sent."
            padding="20px"
          >
            <div style={{ display: 'grid', gap: '14px' }}>
              <ToggleRow
                label="Enable Logs"
                checked={form.logs.enabled}
                onChange={() => handleToggle('logs')}
                theme={theme}
              />

              <FieldRow theme={theme} label="Log Channel">
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
              </FieldRow>
            </div>
          </SectionCard>

          <div>
            <PrimaryButton onClick={handleSave} disabled={!selectedGuild || saving}>
              {saving ? 'Saving...' : 'Save AutoMod'}
            </PrimaryButton>
          </div>
        </div>
      )}
    </DashboardPage>
  );
}

const RuleCard = memo(function RuleCard({
  title,
  description,
  section,
  theme,
  onToggle,
  children,
}) {
  return (
    <SectionCard
      theme={theme}
      title={title}
      subtitle={description}
      padding="20px"
      actions={
        <TogglePill
          checked={section.enabled}
          onChange={onToggle}
          theme={theme}
        />
      }
    >
      <div style={{ display: 'grid', gap: '14px' }}>{children}</div>
    </SectionCard>
  );
});

const FieldRow = memo(function FieldRow({ label, children, theme }) {
  return (
    <div>
      <p
        style={{
          margin: '0 0 6px 0',
          fontSize: '12px',
          fontWeight: 700,
          color: theme.mutedText,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </p>
      {children}
    </div>
  );
});

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
      <TogglePill checked={checked} onChange={onChange} theme={theme} />
    </div>
  );
});

const TogglePill = memo(function TogglePill({ checked, onChange, theme }) {
  return (
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
  );
});

const StatCard = memo(function StatCard({ title, value, theme, color }) {
  return (
    <div
      style={{
        background: theme.cardBg,
        border: `1px solid ${theme.cardBorder}`,
        padding: '20px',
        borderRadius: '18px',
        boxShadow: theme.shadow,
        minWidth: '180px',
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: '12px',
          fontWeight: 700,
          color: theme.mutedText,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: '24px',
          fontWeight: 800,
          margin: '10px 0 0 0',
          color: color || theme.cardText,
        }}
      >
        {value}
      </p>
    </div>
  );
});

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

function textareaStyle(theme) {
  return {
    width: '100%',
    minHeight: '110px',
    padding: '10px 12px',
    borderRadius: '12px',
    border: `1px solid ${theme.inputBorder}`,
    background: theme.inputBg,
    color: theme.inputText,
    outline: 'none',
    fontSize: '14px',
    boxSizing: 'border-box',
    resize: 'vertical',
    lineHeight: 1.6,
  };
}