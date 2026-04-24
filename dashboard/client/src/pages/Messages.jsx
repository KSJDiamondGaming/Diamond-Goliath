import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import PageShell, {
  EmptyState,
  LoadingPanel,
  Notice,
  PrimaryButton,
  SectionCard,
  StatGrid,
  SummaryStat,
} from '../components/PageShell';
import { PAGE_LAYOUTS, SECTION_DEFS } from '../ui';

const PAGE_KEY = 'messages';

const DEFAULT_FORM = {
  welcome: {
    enabled: false,
    channelId: '',
    message: '',
  },
  leave: {
    enabled: false,
    channelId: '',
    message: '',
  },
};

export default function Messages({ selectedGuild, theme }) {
  const [loading, setLoading] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [channels, setChannels] = useState([]);

  const page = PAGE_LAYOUTS[PAGE_KEY] || {
    title: 'Welcome & Leave',
    description: 'Manage join and leave messages for the selected server.',
    emptyDescription: 'Select a server to manage welcome and leave messages.',
    sections: [
      { id: 'welcome', type: 'config' },
      { id: 'leave', type: 'config' },
    ],
  };

  useEffect(() => {
    let mounted = true;

    async function loadMessages() {
      if (!selectedGuild) {
        if (mounted) {
          setForm(DEFAULT_FORM);
          setError('');
          setSaveMessage('');
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setError('');
        setSaveMessage('');

        const data = await api.getMessages(selectedGuild);

        if (!mounted) return;

        const guildConfig =
          data?.[selectedGuild] ||
          data?.guilds?.[selectedGuild] ||
          data?.configs?.[selectedGuild] ||
          data?.messageConfigs?.[selectedGuild] ||
          {};

        setForm({
          welcome: {
            enabled: Boolean(guildConfig?.welcome?.enabled ?? guildConfig?.welcomeMessage?.enabled ?? false),
            channelId: guildConfig?.welcome?.channelId || guildConfig?.welcomeMessage?.channelId || '',
            message: guildConfig?.welcome?.message || guildConfig?.welcomeMessage?.message || '',
          },
          leave: {
            enabled: Boolean(guildConfig?.leave?.enabled ?? guildConfig?.leaveMessage?.enabled ?? false),
            channelId: guildConfig?.leave?.channelId || guildConfig?.leaveMessage?.channelId || '',
            message: guildConfig?.leave?.message || guildConfig?.leaveMessage?.message || '',
          },
        });
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setForm(DEFAULT_FORM);
        setError('Could not load message config.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadMessages();

    return () => {
      mounted = false;
    };
  }, [selectedGuild]);

  useEffect(() => {
    let mounted = true;

    async function loadChannels() {
      if (!selectedGuild) {
        if (mounted) {
          setChannels([]);
          setChannelsLoading(false);
        }
        return;
      }

      try {
        setChannelsLoading(true);
        const result = await api.getGuildChannels(selectedGuild);
        if (!mounted) return;
        const channelList = Array.isArray(result) ? result : [];
        setChannels(channelList.filter((channel) => isTextChannel(channel)));
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setChannels([]);
      } finally {
        if (mounted) setChannelsLoading(false);
      }
    }

    loadChannels();

    return () => {
      mounted = false;
    };
  }, [selectedGuild]);

  const enabledCount = useMemo(() => {
    let count = 0;
    if (form.welcome.enabled) count += 1;
    if (form.leave.enabled) count += 1;
    return count;
  }, [form]);

  const handleToggle = useCallback((section) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        enabled: !prev[section].enabled,
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
        welcome: {
          enabled: form.welcome.enabled,
          channelId: form.welcome.channelId || null,
          message: form.welcome.message,
        },
        leave: {
          enabled: form.leave.enabled,
          channelId: form.leave.channelId || null,
          message: form.leave.message,
        },
      };

      await api.saveMessages(selectedGuild, payload);
      setSaveMessage('✅ Message config saved successfully.');
    } catch (err) {
      console.error(err);
      setSaveMessage('❌ Failed to save message config.');
    } finally {
      setSaving(false);
    }
  }, [selectedGuild, form]);

  if (!selectedGuild) {
    return (
      <PageShell
        title={page.title || 'Welcome & Leave'}
        subtitle={page.emptyDescription || 'Select a server to manage welcome and leave messages.'}
        theme={theme}
      >
        <EmptyState theme={theme} text="Select a guild from the sidebar to continue." />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={page.title || 'Welcome & Leave'}
      subtitle={page.description || 'Manage join and leave messages for the selected server.'}
      theme={theme}
    >
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {saveMessage ? (
        <Notice theme={theme} tone={saveMessage.startsWith('❌') ? 'danger' : 'success'}>
          {saveMessage}
        </Notice>
      ) : null}

      <StatGrid>
        <SummaryStat theme={theme} label="Enabled Flows" value={`${enabledCount}/2`} />
        <SummaryStat
          theme={theme}
          label="Welcome"
          value={form.welcome.enabled ? 'Enabled' : 'Disabled'}
          accent={form.welcome.enabled ? '#16a34a' : '#ef4444'}
        />
        <SummaryStat
          theme={theme}
          label="Leave"
          value={form.leave.enabled ? 'Enabled' : 'Disabled'}
          accent={form.leave.enabled ? '#16a34a' : '#ef4444'}
        />
      </StatGrid>

      <SectionCard
        theme={theme}
        title={SECTION_DEFS?.welcome?.title || 'Welcome Message'}
        subtitle={SECTION_DEFS?.welcome?.description || 'Configure the welcome message sent when a new user joins.'}
        padding="20px"
      >
        {loading ? (
          <LoadingPanel theme={theme} text="Loading message config..." />
        ) : (
          <MessageEditor
            theme={theme}
            title="Welcome"
            form={form.welcome}
            channels={channels}
            channelsLoading={channelsLoading}
            onToggle={() => handleToggle('welcome')}
            onChange={(field, value) => handleChange('welcome', field, value)}
          />
        )}
      </SectionCard>

      <SectionCard
        theme={theme}
        title={SECTION_DEFS?.leave?.title || 'Leave Message'}
        subtitle={SECTION_DEFS?.leave?.description || 'Configure the leave message sent when a user leaves the server.'}
        padding="20px"
      >
        {loading ? (
          <LoadingPanel theme={theme} text="Loading message config..." />
        ) : (
          <MessageEditor
            theme={theme}
            title="Leave"
            form={form.leave}
            channels={channels}
            channelsLoading={channelsLoading}
            onToggle={() => handleToggle('leave')}
            onChange={(field, value) => handleChange('leave', field, value)}
          />
        )}
      </SectionCard>

      <div>
        <PrimaryButton onClick={handleSave} disabled={!selectedGuild || saving}>
          {saving ? 'Saving...' : 'Save Messages'}
        </PrimaryButton>
      </div>
    </PageShell>
  );
}

const MessageEditor = memo(function MessageEditor({
  theme,
  title,
  form,
  channels,
  channelsLoading,
  onToggle,
  onChange,
}) {
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
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
        <span style={{ color: theme.cardText, fontWeight: 700 }}>{title} Enabled</span>
        <button
          type="button"
          onClick={onToggle}
          style={{
            padding: '8px 12px',
            borderRadius: '999px',
            border: form.enabled ? '1px solid rgba(34,197,94,0.3)' : `1px solid ${theme.cardBorder}`,
            background: form.enabled ? 'rgba(34,197,94,0.14)' : theme.softBg,
            color: form.enabled ? '#16a34a' : theme.cardText,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {form.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      <div>
        <p style={fieldLabel(theme)}>Channel</p>
        <select
          value={form.channelId}
          onChange={(e) => onChange('channelId', e.target.value)}
          style={inputStyle(theme)}
          disabled={channelsLoading || channels.length === 0}
        >
          <option value="">
            {channelsLoading
              ? 'Loading channels...'
              : channels.length === 0
                ? 'No text channels found'
                : 'Select a channel'}
          </option>

          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              #{channel.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p style={fieldLabel(theme)}>Message</p>
        <textarea
          value={form.message}
          onChange={(e) => onChange('message', e.target.value)}
          style={textareaStyle(theme)}
          placeholder={
            title === 'Welcome'
              ? 'Welcome {user} to {server}!'
              : 'Goodbye {user}.'
          }
        />
      </div>
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

function textareaStyle(theme) {
  return {
    width: '100%',
    minHeight: '120px',
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

function isTextChannel(channel) {
  const type = channel?.type;
  return type === 0 || type === 'GUILD_TEXT' || type === 'text';
}