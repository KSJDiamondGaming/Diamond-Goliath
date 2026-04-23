import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import PageShell, {
  EmptyState,
  LoadingPanel,
  Notice,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  StatGrid,
  SummaryStat,
} from '../components/PageShell';
import { PAGE_LAYOUTS } from '../ui';

const PAGE_KEY = 'logs';

const DEFAULT_FORM = {
  modLogChannelId: '',
  memberLogChannelId: '',
  messageLogChannelId: '',
  automodLogChannelId: '',
};

const LOG_GROUPS = [
  {
    key: 'modLogChannelId',
    title: 'Moderation Logs',
    description: 'Bans, kicks, timeouts, warns, and case activity.',
    types: ['ban', 'kick', 'timeout', 'warn', 'cases', 'moderation'],
  },
  {
    key: 'memberLogChannelId',
    title: 'Member Logs',
    description: 'Joins, leaves, role changes, and member lifecycle activity.',
    types: ['join', 'leave', 'roles', 'members'],
  },
  {
    key: 'messageLogChannelId',
    title: 'Message Logs',
    description: 'Deleted messages, edited messages, and message events.',
    types: ['message delete', 'message edit', 'messages'],
  },
  {
    key: 'automodLogChannelId',
    title: 'AutoMod Logs',
    description: 'Spam, links, invites, filtered words, and automod actions.',
    types: ['spam', 'links', 'invites', 'bad words', 'automod'],
  },
];

function Logs({ selectedGuild, theme }) {
  const [loading, setLoading] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [channels, setChannels] = useState([]);

  const page = PAGE_LAYOUTS[PAGE_KEY] || {
    title: 'Logs',
    description: 'Assign log channels for the selected server and quickly filter log groups.',
    emptyDescription: 'Select a server to manage log channels.',
    sections: [{ id: 'logManager', type: 'config' }],
  };

  useEffect(() => {
    let mounted = true;

    async function loadLogs() {
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

        const [configData, automodData] = await Promise.all([
          api.getConfig(selectedGuild),
          api.getAutoModConfig(selectedGuild),
        ]);

        if (!mounted) return;

        const automodChannelId =
          automodData?.logs?.channelId ||
          automodData?.logChannelId ||
          configData?.automodLogChannelId ||
          '';

        setForm({
          modLogChannelId: configData?.modLogChannelId || configData?.modlogChannelId || '',
          memberLogChannelId: configData?.memberLogChannelId || '',
          messageLogChannelId: configData?.messageLogChannelId || '',
          automodLogChannelId: automodChannelId,
        });
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setForm(DEFAULT_FORM);
        setError('Could not load log settings.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadLogs();

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

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return LOG_GROUPS;

    return LOG_GROUPS.filter((group) => {
      const haystack = [
        group.title,
        group.description,
        ...(group.types || []),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [search]);

  const assignedCount = useMemo(() => {
    return Object.values(form).filter(Boolean).length;
  }, [form]);

  const handleChange = useCallback((field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleClear = useCallback((field) => {
    setForm((prev) => ({
      ...prev,
      [field]: '',
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

      await Promise.all([
        api.updateConfig(selectedGuild, {
          modLogChannelId: form.modLogChannelId || null,
          memberLogChannelId: form.memberLogChannelId || null,
          messageLogChannelId: form.messageLogChannelId || null,
          automodLogChannelId: form.automodLogChannelId || null,
        }),
        api.saveAutoModConfig(selectedGuild, {
          logs: {
            enabled: true,
            channelId: form.automodLogChannelId || null,
          },
        }),
      ]);

      setSaveMessage('✅ Log channels saved successfully.');
    } catch (err) {
      console.error(err);
      setSaveMessage('❌ Failed to save log channels.');
    } finally {
      setSaving(false);
    }
  }, [selectedGuild, form]);

  if (!selectedGuild) {
    return (
      <PageShell
        title={page.title || 'Logs'}
        subtitle={page.emptyDescription || 'Select a server to manage log channels.'}
        theme={theme}
      >
        <EmptyState theme={theme} text="Select a guild from the sidebar to continue." />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={page.title || 'Logs'}
      subtitle={
        page.description ||
        'Assign log channels for the selected server and quickly filter log groups.'
      }
      theme={theme}
      actions={
        <PrimaryButton onClick={handleSave} disabled={!selectedGuild || saving}>
          {saving ? 'Saving...' : 'Save Logs'}
        </PrimaryButton>
      }
    >
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
      {saveMessage ? (
        <Notice theme={theme} tone={saveMessage.startsWith('❌') ? 'danger' : 'success'}>
          {saveMessage}
        </Notice>
      ) : null}

      <StatGrid>
        <SummaryStat theme={theme} label="Assigned" value={`${assignedCount}/4`} />
        <SummaryStat theme={theme} label="Visible Groups" value={filteredGroups.length} />
        <SummaryStat theme={theme} label="Text Channels" value={channels.length} />
      </StatGrid>

      <SectionCard
        theme={theme}
        title="Log Manager"
        subtitle="Search log groups, then assign the channel each group should use."
        padding="20px"
      >
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{ position: 'relative' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search log groups or log types..."
              style={searchInputStyle(theme)}
            />
            <div style={searchIconStyle(theme)}>⌕</div>
          </div>

          {loading ? (
            <LoadingPanel theme={theme} text="Loading log settings..." />
          ) : filteredGroups.length === 0 ? (
            <EmptyState theme={theme} text="No log groups match that search." />
          ) : (
            <div style={{ display: 'grid', gap: '14px' }}>
              {filteredGroups.map((group) => {
                const assignedChannel = channels.find(
                  (channel) => channel.id === form[group.key]
                );

                return (
                  <div
                    key={group.key}
                    style={{
                      background: theme.softBg,
                      border: `1px solid ${theme.cardBorder}`,
                      borderRadius: '18px',
                      padding: '16px',
                      display: 'grid',
                      gap: '14px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '14px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'grid', gap: '6px', minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <h3
                            style={{
                              margin: 0,
                              color: theme.cardText,
                              fontSize: '17px',
                              fontWeight: 800,
                            }}
                          >
                            {group.title}
                          </h3>

                          <span
                            style={{
                              padding: '4px 10px',
                              borderRadius: '999px',
                              border: `1px solid ${theme.cardBorder}`,
                              background: theme.cardBg,
                              color: theme.mutedText,
                              fontSize: '12px',
                              fontWeight: 800,
                            }}
                          >
                            {group.types.length} types
                          </span>
                        </div>

                        <p
                          style={{
                            margin: 0,
                            color: theme.mutedText,
                            fontSize: '14px',
                            lineHeight: 1.55,
                          }}
                        >
                          {group.description}
                        </p>
                      </div>

                      <div
                        style={{
                          color: form[group.key] ? '#22c55e' : theme.mutedText,
                          fontSize: '13px',
                          fontWeight: 700,
                        }}
                      >
                        {assignedChannel ? `Assigned: #${assignedChannel.name}` : 'Unassigned'}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: '10px' }}>
                      <div
                        style={{
                          display: 'flex',
                          gap: '10px',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        <select
                          value={form[group.key]}
                          onChange={(e) => handleChange(group.key, e.target.value)}
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

                        <SecondaryButton
                          theme={theme}
                          onClick={() => handleClear(group.key)}
                          disabled={!form[group.key]}
                        >
                          Clear
                        </SecondaryButton>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {group.types.map((type) => (
                          <span
                            key={type}
                            style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              color: theme.mutedText,
                              background: theme.cardBg,
                              border: `1px solid ${theme.cardBorder}`,
                              borderRadius: '999px',
                              padding: '5px 9px',
                            }}
                          >
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>
    </PageShell>
  );
}

function isTextChannel(channel) {
  const type = channel?.type;
  return type === 0 || type === 'GUILD_TEXT' || type === 'text';
}

function inputStyle(theme) {
  return {
    width: '100%',
    minWidth: '260px',
    flex: 1,
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

function searchInputStyle(theme) {
  return {
    width: '100%',
    padding: '12px 44px 12px 14px',
    borderRadius: '14px',
    border: `1px solid ${theme.inputBorder}`,
    background: theme.inputBg,
    color: theme.inputText,
    outline: 'none',
    fontSize: '14px',
    boxSizing: 'border-box',
  };
}

function searchIconStyle(theme) {
  return {
    position: 'absolute',
    top: '50%',
    right: '14px',
    transform: 'translateY(-50%)',
    color: theme.mutedText,
    pointerEvents: 'none',
    fontSize: '16px',
    lineHeight: 1,
  };
}

export default memo(Logs);