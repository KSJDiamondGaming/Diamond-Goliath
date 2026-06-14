import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { api } from '../services/apiClient';

import PageShell, {
  EmptyState,
  LoadingPanel,
  Notice,
  PrimaryButton,
  SectionCard,
  StatGrid,
  SummaryStat,
} from '../shared/PageShell';

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

function getGuildId(selectedGuild) {
  if (!selectedGuild) return '';

  if (typeof selectedGuild === 'string') {
    return selectedGuild;
  }

  return selectedGuild.id || selectedGuild.guildId || '';
}

function Toggle({ enabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 56,
        height: 32,
        border: 'none',
        borderRadius: 999,
        cursor: 'pointer',
        position: 'relative',
        background: enabled
          ? 'rgba(34,197,94,0.24)'
          : 'rgba(239,68,68,0.18)',
        transition: 'all 0.2s ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 4,
          left: enabled ? 30 : 4,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: '#ffffff',
          transition: 'all 0.2s ease',
        }}
      />
    </button>
  );
}

function Select({ theme, children, ...props }) {
  return (
    <select
      {...props}
      style={{
        width: '100%',
        border: `1px solid ${theme.cardBorder}`,
        background: 'rgba(10,18,35,0.96)',
        color: theme.cardText,
        borderRadius: 14,
        padding: '12px 14px',
        outline: 'none',
        fontWeight: 700,
      }}
    >
      {children}
    </select>
  );
}

function Textarea({ theme, ...props }) {
  return (
    <textarea
      {...props}
      style={{
        width: '100%',
        minHeight: 150,
        resize: 'vertical',
        border: `1px solid ${theme.cardBorder}`,
        background: 'rgba(10,18,35,0.96)',
        color: theme.cardText,
        borderRadius: 14,
        padding: 14,
        outline: 'none',
        fontWeight: 600,
        lineHeight: 1.6,
      }}
    />
  );
}

export default function Messages({ selectedGuild, theme }) {
  const guildId = getGuildId(selectedGuild);

  const [loading, setLoading] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  const [form, setForm] = useState(DEFAULT_FORM);
  const [channels, setChannels] = useState([]);

  const enabledCount = useMemo(() => {
    let count = 0;

    if (form.welcome.enabled) count += 1;
    if (form.leave.enabled) count += 1;

    return count;
  }, [form]);

  useEffect(() => {
    let mounted = true;

    async function loadMessages() {
      if (!guildId) {
        if (mounted) {
          setForm(DEFAULT_FORM);
          setError('');
          setSaveMessage('');
        }

        return;
      }

      try {
        setLoading(true);
        setError('');
        setSaveMessage('');

        const data = await api.getMessages(guildId);

        if (!mounted) return;

        setForm({
          welcome: {
            enabled: Boolean(data?.welcome?.enabled),
            channelId: data?.welcome?.channelId || '',
            message: data?.welcome?.message || '',
          },

          leave: {
            enabled: Boolean(data?.leave?.enabled),
            channelId: data?.leave?.channelId || '',
            message: data?.leave?.message || '',
          },
        });
      } catch (err) {
        console.error(err);

        if (!mounted) return;

        setError('Could not load message configuration.');
        setForm(DEFAULT_FORM);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadMessages();

    return () => {
      mounted = false;
    };
  }, [guildId]);

  useEffect(() => {
    let mounted = true;

    async function loadChannels() {
      if (!guildId) {
        setChannels([]);
        return;
      }

      try {
        setChannelsLoading(true);

        const result = await api.getGuildChannels(guildId);

        if (!mounted) return;

        setChannels(
          (Array.isArray(result) ? result : []).filter(
            (channel) => Number(channel?.type) === 0,
          ),
        );
      } catch (err) {
        console.error(err);

        if (!mounted) return;

        setChannels([]);
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
  }, [guildId]);

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
    if (!guildId) return;

    try {
      setSaving(true);
      setSaveMessage('');
      setError('');

      await api.saveMessages(guildId, {
        welcomeEnabled: form.welcome.enabled,
        welcomeChannelId: form.welcome.channelId,
        welcomeMessage: form.welcome.message,

        leaveEnabled: form.leave.enabled,
        leaveChannelId: form.leave.channelId,
        leaveMessage: form.leave.message,
      });

      setSaveMessage('✅ Messages saved successfully.');
    } catch (err) {
      console.error(err);
      setError('Failed to save messages.');
    } finally {
      setSaving(false);
    }
  }, [guildId, form]);

  return (
    <PageShell
      title="Welcome & Leave"
      subtitle="Manage join and leave messages for the selected server."
      theme={theme}
      guild={{
        id: guildId,
        name: 'Welcome & Leave',
      }}
      actions={
        guildId ? (
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </PrimaryButton>
        ) : null
      }
    >
      {!guildId ? (
        <EmptyState theme={theme} text="Select a server first." />
      ) : null}

      {error ? (
        <Notice theme={theme} tone="danger">
          {error}
        </Notice>
      ) : null}

      {saveMessage ? (
        <Notice theme={theme} tone="success">
          {saveMessage}
        </Notice>
      ) : null}

      {guildId ? (
        <StatGrid min="220px">
          <SummaryStat
            theme={theme}
            label="Enabled Flows"
            value={`${enabledCount}/2`}
            accent="#3b82f6"
            description="Enabled automated message systems"
          />

          <SummaryStat
            theme={theme}
            label="Welcome"
            value={form.welcome.enabled ? 'Enabled' : 'Disabled'}
            accent={form.welcome.enabled ? '#22c55e' : '#ef4444'}
            description="Welcome message system"
          />

          <SummaryStat
            theme={theme}
            label="Leave"
            value={form.leave.enabled ? 'Enabled' : 'Disabled'}
            accent={form.leave.enabled ? '#22c55e' : '#ef4444'}
            description="Leave message system"
          />
        </StatGrid>
      ) : null}

      {guildId && loading ? (
        <LoadingPanel theme={theme} text="Loading message configuration..." />
      ) : null}

      {guildId && !loading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 24,
          }}
        >
          <MessagePanel
            theme={theme}
            title="Welcome Message"
            form={form.welcome}
            channels={channels}
            channelsLoading={channelsLoading}
            onToggle={() => handleToggle('welcome')}
            onChange={(field, value) => handleChange('welcome', field, value)}
          />

          <MessagePanel
            theme={theme}
            title="Leave Message"
            form={form.leave}
            channels={channels}
            channelsLoading={channelsLoading}
            onToggle={() => handleToggle('leave')}
            onChange={(field, value) => handleChange('leave', field, value)}
          />
        </div>
      ) : null}
    </PageShell>
  );
}

const MessagePanel = memo(function MessagePanel({
  theme,
  title,
  form,
  channels,
  channelsLoading,
  onToggle,
  onChange,
}) {
  return (
    <SectionCard
      theme={theme}
      title={title}
      actions={<Toggle enabled={form.enabled} onClick={onToggle} />}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <Select
          theme={theme}
          value={form.channelId}
          onChange={(event) => onChange('channelId', event.target.value)}
          disabled={channelsLoading}
        >
          <option value="">
            {channelsLoading ? 'Loading channels...' : 'Select channel'}
          </option>

          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              #{channel.name}
            </option>
          ))}
        </Select>

        <Textarea
          theme={theme}
          value={form.message}
          onChange={(event) => onChange('message', event.target.value)}
          placeholder="Enter your message..."
        />
      </div>
    </SectionCard>
  );
});