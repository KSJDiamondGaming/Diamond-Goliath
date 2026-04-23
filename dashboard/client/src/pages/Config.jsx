
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

const PAGE_KEY = 'config';

const DEFAULT_FORM = {
  modLogChannelId: '',
  memberLogChannelId: '',
  messageLogChannelId: '',
  automodLogChannelId: '',
  prefix: '/',
  muteRoleId: '',
  staffRoleId: '',
  appealUrl: '',
  dashboardEnabled: true,
};

export default function Config({ selectedGuild, theme }) {
  const [loading, setLoading] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [channels, setChannels] = useState([]);

  const page = PAGE_LAYOUTS[PAGE_KEY] || {
    title: 'Config',
    description: 'Manage dashboard and moderation configuration for the selected server.',
    emptyDescription: 'Select a server to manage config.',
    sections: [
      { id: 'generalConfig', type: 'config' },
      { id: 'logConfig', type: 'config' },
    ],
  };

  useEffect(() => {
    let mounted = true;

    async function loadConfig() {
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

        const data = await api.getConfig(selectedGuild);

        if (!mounted) return;

        setForm({
          modLogChannelId: data?.modLogChannelId || data?.modlogChannelId || '',
          memberLogChannelId: data?.memberLogChannelId || '',
          messageLogChannelId: data?.messageLogChannelId || '',
          automodLogChannelId: data?.automodLogChannelId || '',
          prefix: data?.prefix || '/',
          muteRoleId: data?.muteRoleId || '',
          staffRoleId: data?.staffRoleId || '',
          appealUrl: data?.appealUrl || '',
          dashboardEnabled: data?.dashboardEnabled !== false,
        });
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setForm(DEFAULT_FORM);
        setError('Could not load config.');
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

  const handleChange = useCallback((field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleToggle = useCallback((field) => {
    setForm((prev) => ({
      ...prev,
      [field]: !prev[field],
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

      await api.updateConfig(selectedGuild, {
        modLogChannelId: form.modLogChannelId || null,
        memberLogChannelId: form.memberLogChannelId || null,
        messageLogChannelId: form.messageLogChannelId || null,
        automodLogChannelId: form.automodLogChannelId || null,
        prefix: form.prefix || '/',
        muteRoleId: form.muteRoleId || null,
        staffRoleId: form.staffRoleId || null,
        appealUrl: form.appealUrl || '',
        dashboardEnabled: Boolean(form.dashboardEnabled),
      });

      setSaveMessage('✅ Config saved successfully.');
    } catch (err) {
      console.error(err);
      setSaveMessage('❌ Failed to save config.');
    } finally {
      setSaving(false);
    }
  }, [selectedGuild, form]);

  const configuredLogs = useMemo(() => {
    return [
      form.modLogChannelId,
      form.memberLogChannelId,
      form.messageLogChannelId,
      form.automodLogChannelId,
    ].filter(Boolean).length;
  }, [form]);

  if (!selectedGuild) {
    return (
      <PageShell
        title={page.title || 'Config'}
        subtitle={page.emptyDescription || 'Select a server to manage config.'}
        theme={theme}
      >
        <EmptyState theme={theme} text="Select a guild from the sidebar to continue." />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={page.title || 'Config'}
      subtitle={page.description || 'Manage dashboard and moderation configuration for the selected server.'}
      theme={theme}
    >
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {saveMessage ? (
        <Notice theme={theme} tone={saveMessage.startsWith('❌') ? 'danger' : 'success'}>
          {saveMessage}
        </Notice>
      ) : null}

      <StatGrid>
        <SummaryStat theme={theme} label="Prefix" value={form.prefix || '/'} />
        <SummaryStat theme={theme} label="Log Channels" value={`${configuredLogs}/4`} />
        <SummaryStat
          theme={theme}
          label="Dashboard"
          value={form.dashboardEnabled ? 'Enabled' : 'Disabled'}
          accent={form.dashboardEnabled ? '#22c55e' : '#ef4444'}
        />
      </StatGrid>

      <SectionCard
        theme={theme}
        title={SECTION_DEFS?.generalConfig?.title || 'General Config'}
        subtitle={SECTION_DEFS?.generalConfig?.description || 'Core dashboard, moderation, and server-wide configuration.'}
        padding="20px"
      >
        {loading ? (
          <LoadingPanel theme={theme} text="Loading config..." />
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            <Field theme={theme} label="Command Prefix">
              <input
                value={form.prefix}
                onChange={(e) => handleChange('prefix', e.target.value)}
                style={inputStyle(theme)}
                placeholder="/"
                maxLength={5}
              />
            </Field>

            <Field theme={theme} label="Mute Role ID">
              <input
                value={form.muteRoleId}
                onChange={(e) => handleChange('muteRoleId', e.target.value)}
                style={inputStyle(theme)}
                placeholder="Mute role ID"
              />
            </Field>

            <Field theme={theme} label="Staff Role ID">
              <input
                value={form.staffRoleId}
                onChange={(e) => handleChange('staffRoleId', e.target.value)}
                style={inputStyle(theme)}
                placeholder="Staff role ID"
              />
            </Field>

            <Field theme={theme} label="Appeal URL">
              <input
                value={form.appealUrl}
                onChange={(e) => handleChange('appealUrl', e.target.value)}
                style={inputStyle(theme)}
                placeholder="https://..."
              />
            </Field>

            <ToggleRow
              label="Enable Dashboard Access"
              checked={form.dashboardEnabled}
              onChange={() => handleToggle('dashboardEnabled')}
              theme={theme}
            />
          </div>
        )}
      </SectionCard>

      <SectionCard
        theme={theme}
        title={SECTION_DEFS?.logConfig?.title || 'Log Channels'}
        subtitle={SECTION_DEFS?.logConfig?.description || 'Choose where different bot logs should be sent.'}
        padding="20px"
      >
        {loading ? (
          <LoadingPanel theme={theme} text="Loading log channels..." />
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            <ChannelField
              theme={theme}
              label="Moderation Log Channel"
              value={form.modLogChannelId}
              onChange={(value) => handleChange('modLogChannelId', value)}
              channels={channels}
              channelsLoading={channelsLoading}
            />
            <ChannelField
              theme={theme}
              label="Member Log Channel"
              value={form.memberLogChannelId}
              onChange={(value) => handleChange('memberLogChannelId', value)}
              channels={channels}
              channelsLoading={channelsLoading}
            />
            <ChannelField
              theme={theme}
              label="Message Log Channel"
              value={form.messageLogChannelId}
              onChange={(value) => handleChange('messageLogChannelId', value)}
              channels={channels}
              channelsLoading={channelsLoading}
            />
            <ChannelField
              theme={theme}
              label="AutoMod Log Channel"
              value={form.automodLogChannelId}
              onChange={(value) => handleChange('automodLogChannelId', value)}
              channels={channels}
              channelsLoading={channelsLoading}
            />
          </div>
        )}
      </SectionCard>

      <div>
        <PrimaryButton onClick={handleSave} disabled={!selectedGuild || saving}>
          {saving ? 'Saving...' : 'Save Config'}
        </PrimaryButton>
      </div>
    </PageShell>
  );
}

const Field = memo(function Field({ theme, label, children }) {
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

const ChannelField = memo(function ChannelField({
  theme,
  label,
  value,
  onChange,
  channels,
  channelsLoading,
}) {
  return (
    <Field theme={theme} label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
    </Field>
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

function isTextChannel(channel) {
  const type = channel?.type;
  return type === 0 || type === 'GUILD_TEXT' || type === 'text';
}