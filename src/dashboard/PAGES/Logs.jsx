import { useEffect, useMemo, useState } from 'react';
import { api, joinGuildRoom, listenForGuildUpdate } from '../api';
import PageShell, {
  EmptyState,
  LoadingPanel,
  Notice,
  PrimaryButton,
} from '../components/PageShell';
import { PAGE_LAYOUTS, createLogsPageStyles } from '../ui';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const DEFAULT_LOGS = {
  enabled: true,
  channels: {
    general: null,
    moderation: null,
    admin: null,
    automod: null,
    member: null,
    messageDelete: null,
    messageEdit: null,
    voice: null,
  },
  events: {
    moderationActions: true,
    adminActions: true,
    automodActions: true,

    memberJoin: true,
    memberLeave: true,
    memberUpdate: true,

    messageDelete: true,
    messageEdit: true,

    roleCreate: true,
    roleDelete: true,
    roleUpdate: true,

    channelCreate: true,
    channelDelete: true,
    channelUpdate: true,

    voiceJoin: true,
    voiceLeave: true,
    voiceMove: true,
  },
};

function getGuildId(selectedGuild) {
  if (!selectedGuild) return '';
  if (typeof selectedGuild === 'string') return selectedGuild;
  return selectedGuild.id || selectedGuild.guildId || '';
}

function normalizeLogs(config = {}) {
  return {
    ...DEFAULT_LOGS,
    ...config,
    channels: {
      ...DEFAULT_LOGS.channels,
      ...(config.channels || {}),
      messageDelete:
        config.channels?.messageDelete ||
        config.channels?.message ||
        null,
      messageEdit:
        config.channels?.messageEdit ||
        config.channels?.message ||
        null,
    },
    events: {
      ...DEFAULT_LOGS.events,
      ...(config.events || {}),
    },
  };
}

export default function Logs({ selectedGuild, theme }) {
  const styles = useMemo(() => createLogsPageStyles(theme), [theme]);
  const page = PAGE_LAYOUTS.logs;
  const guildId = getGuildId(selectedGuild);

  const [channels, setChannels] = useState([]);
  const [logs, setLogs] = useState(DEFAULT_LOGS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      if (!guildId) {
        if (mounted) {
          setLogs(DEFAULT_LOGS);
          setChannels([]);
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

        const [logsRes, channelsRes] = await Promise.all([
          api.getLogConfig(guildId),
          api.getGuildChannels(guildId),
        ]);

        if (!mounted) return;

        setLogs(normalizeLogs(logsRes?.config || logsRes || {}));
        setChannels(Array.isArray(channelsRes) ? channelsRes : []);
      } catch (err) {
        console.error(err);

        if (!mounted) return;

        setError('Failed to load log settings.');
        setChannels([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [guildId]);

  useEffect(() => {
  if (!guildId) return undefined;

  joinGuildRoom(guildId);

  return listenForGuildUpdate(guildId, 'logs', (data, payload) => {
    setLogs(normalizeLogs(data));

    setSaveMessage(
      payload.source === 'dashboard'
        ? '✅ Logs synced live.'
        : '🔄 Logs updated live.',
    );
  });
}, [guildId]);

  function updateChannel(channelKey, value) {
    setLogs((prev) =>
      normalizeLogs({
        ...prev,
        channels: {
          ...prev.channels,
          [channelKey]: value || null,
        },
      }),
    );
  }

  function updateEvent(eventKey, enabled) {
    setLogs((prev) =>
      normalizeLogs({
        ...prev,
        events: {
          ...prev.events,
          [eventKey]: enabled,
        },
      }),
    );
  }

  async function handleSave() {
    if (!guildId) return;

    try {
      setSaving(true);
      setError('');
      setSaveMessage('');

      const saved = await api.saveLogConfig(guildId, logs);

      if (saved?.config) {
        setLogs(normalizeLogs(saved.config));
      }

      setSaveMessage('✅ Logs saved successfully.');
    } catch (err) {
      console.error(err);
      setError('Failed to save logs.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell
      title={page.title}
      subtitle={selectedGuild ? page.description : page.emptyDescription}
      theme={theme}
      actions={
        <PrimaryButton onClick={handleSave} disabled={!guildId || saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </PrimaryButton>
      }
    >
      {!selectedGuild ? (
        <EmptyState theme={theme} text="Select a guild to manage logs." />
      ) : null}

      {error ? (
        <Notice theme={theme} tone="danger">
          {error}
        </Notice>
      ) : null}

      {saveMessage ? (
        <Notice
          theme={theme}
          tone={saveMessage.startsWith('❌') ? 'danger' : 'success'}
        >
          {saveMessage}
        </Notice>
      ) : null}

      {selectedGuild && loading ? (
        <LoadingPanel theme={theme} text="Loading logs..." />
      ) : null}

      {selectedGuild && !loading ? (
        <div style={styles.grid}>
          {LOG_GROUPS.map((group) => (
            <div key={group.key} style={styles.logCard}>
              <div style={styles.logHeader}>
                <h3 style={styles.logTitle}>{group.label}</h3>
                <p style={styles.logDescription}>{group.description}</p>
              </div>

              <div style={styles.logBody}>
                {group.items.map((item) => {
                  const enabled = logs.events?.[item.eventKey] !== false;
                  const selectedChannel = logs.channels?.[item.channelKey] || '';

                  return (
                    <div key={item.key} style={styles.row}>
                      <div style={styles.rowHeader}>
                        <h4 style={styles.rowTitle}>{item.label}</h4>

                        <button
                          type="button"
                          style={styles.badge(enabled)}
                          onClick={() => updateEvent(item.eventKey, !enabled)}
                        >
                          {enabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>

                      <p style={styles.rowText}>{item.description}</p>

                      <select
                        style={styles.channelSelect}
                        value={selectedChannel}
                        onChange={(event) =>
                          updateChannel(item.channelKey, event.target.value)
                        }
                      >
                        <option value="">Select channel</option>

                        {channels.map((channel) => (
                          <option key={channel.id} value={channel.id}>
                            #{channel.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}

const LOG_GROUPS = [
  {
    key: 'moderation',
    label: 'Moderation Logs',
    description: 'Bans, kicks, warnings etc.',
    items: [
      {
        key: 'modLog',
        label: 'Mod Log',
        description: 'All moderation actions.',
        channelKey: 'moderation',
        eventKey: 'moderationActions',
      },
      {
        key: 'automodLog',
        label: 'AutoMod Log',
        description: 'AutoMod actions and blocked messages.',
        channelKey: 'automod',
        eventKey: 'automodActions',
      },
    ],
  },
  {
    key: 'messages',
    label: 'Message Logs',
    description: 'Track deleted and edited messages.',
    items: [
      {
        key: 'messageDelete',
        label: 'Deleted Messages',
        description: 'Messages deleted in the server.',
        channelKey: 'messageDelete',
        eventKey: 'messageDelete',
      },
      {
        key: 'messageEdit',
        label: 'Edited Messages',
        description: 'Messages edited in the server.',
        channelKey: 'messageEdit',
        eventKey: 'messageEdit',
      },
    ],
  },
];