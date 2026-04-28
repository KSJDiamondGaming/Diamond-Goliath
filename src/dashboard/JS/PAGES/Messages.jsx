import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import PageShell, {
  EmptyState,
  LoadingPanel,
  Notice,
  PrimaryButton,
} from '../shared/PageShell';
import { PAGE_LAYOUTS, createMessagesPageStyles } from '../ui';

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
  const styles = useMemo(() => createMessagesPageStyles(theme), [theme]);

  const [loading, setLoading] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [channels, setChannels] = useState([]);

  const page = PAGE_LAYOUTS[PAGE_KEY];

  const enabledCount = useMemo(() => {
    let count = 0;
    if (form.welcome.enabled) count++;
    if (form.leave.enabled) count++;
    return count;
  }, [form]);

  useEffect(() => {
    let mounted = true;

    async function loadMessages() {
      if (!selectedGuild) {
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
            enabled: Boolean(guildConfig?.welcome?.enabled),
            channelId: guildConfig?.welcome?.channelId || '',
            message: guildConfig?.welcome?.message || '',
          },
          leave: {
            enabled: Boolean(guildConfig?.leave?.enabled),
            channelId: guildConfig?.leave?.channelId || '',
            message: guildConfig?.leave?.message || '',
          },
        });
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setError('Could not load message config.');
        setForm(DEFAULT_FORM);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadMessages();
    return () => (mounted = false);
  }, [selectedGuild]);

  useEffect(() => {
    let mounted = true;

    async function loadChannels() {
      if (!selectedGuild) {
        setChannels([]);
        return;
      }

      try {
        setChannelsLoading(true);

        const result = await api.getGuildChannels(selectedGuild);
        if (!mounted) return;

        setChannels(
          (result || []).filter((c) => Number(c?.type) === 0)
        );
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setChannels([]);
      } finally {
        if (mounted) setChannelsLoading(false);
      }
    }

    loadChannels();
    return () => (mounted = false);
  }, [selectedGuild]);

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
    if (!selectedGuild) return;

    try {
      setSaving(true);
      setSaveMessage('');
      setError('');

      await api.saveMessages(selectedGuild, form);

      setSaveMessage('✅ Saved');
    } catch (err) {
      console.error(err);
      setSaveMessage('❌ Failed to save');
    } finally {
      setSaving(false);
    }
  }, [selectedGuild, form]);

  return (
    <PageShell
      title={page?.title || 'Welcome & Leave'}
      subtitle={page?.description}
      theme={theme}
      actions={
        selectedGuild && (
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </PrimaryButton>
        )
      }
    >
      {!selectedGuild && (
        <EmptyState theme={theme} text="Select a server first." />
      )}

      {error && (
        <Notice theme={theme} tone="danger">
          {error}
        </Notice>
      )}

      {saveMessage && (
        <Notice theme={theme} tone="success">
          {saveMessage}
        </Notice>
      )}

      {selectedGuild && (
        <div style={styles.page}>
          {/* STATS */}
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <p style={styles.statLabel}>Enabled Flows</p>
              <p style={styles.statValue}>{enabledCount}/2</p>
            </div>

            <div style={styles.statCard}>
              <p style={styles.statLabel}>Welcome</p>
              <p style={form.welcome.enabled ? styles.statValueSuccess : styles.statValueDanger}>
                {form.welcome.enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>

            <div style={styles.statCard}>
              <p style={styles.statLabel}>Leave</p>
              <p style={form.leave.enabled ? styles.statValueSuccess : styles.statValueDanger}>
                {form.leave.enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>

          {/* CONTENT */}
          {loading ? (
            <LoadingPanel theme={theme} text="Loading..." />
          ) : (
            <div style={styles.grid}>
              <MessagePanel
                styles={styles}
                title="Welcome Message"
                form={form.welcome}
                channels={channels}
                channelsLoading={channelsLoading}
                onToggle={() => handleToggle('welcome')}
                onChange={(f, v) => handleChange('welcome', f, v)}
              />

              <MessagePanel
                styles={styles}
                title="Leave Message"
                form={form.leave}
                channels={channels}
                channelsLoading={channelsLoading}
                onToggle={() => handleToggle('leave')}
                onChange={(f, v) => handleChange('leave', f, v)}
              />
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}

const MessagePanel = memo(function MessagePanel({
  styles,
  title,
  form,
  channels,
  channelsLoading,
  onToggle,
  onChange,
}) {
  return (
    <section style={styles.panel}>
      <h3 style={styles.panelTitle}>{title}</h3>

      <button onClick={onToggle} style={styles.switchTrack(form.enabled)}>
        <span style={styles.switchThumb(form.enabled)} />
      </button>

      <select
        value={form.channelId}
        onChange={(e) => onChange('channelId', e.target.value)}
        style={styles.input}
        disabled={channelsLoading}
      >
        <option value="">Select channel</option>
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
          </option>
        ))}
      </select>

      <textarea
        value={form.message}
        onChange={(e) => onChange('message', e.target.value)}
        style={styles.textarea}
      />
    </section>
  );
});