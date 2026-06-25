import React, { useEffect, useMemo, useState } from 'react';

import {
  joinGuildRoom,
  listenForGuildUpdate,
} from '../../services/socketClient';

import { api } from '../../services/apiClient';

import PageShell, {
  SectionCard,
  StatGrid,
  SummaryStat,
  EmptyState,
  LoadingPanel,
  Notice,
  PrimaryButton,
} from '../../shared/PageShell';

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

const CHANNEL_LABELS = {
  general: 'General',
  moderation: 'Moderation',
  admin: 'Admin',
  automod: 'AutoMod',
  member: 'Member',
  messageDelete: 'Deleted Messages',
  messageEdit: 'Edited Messages',
  voice: 'Voice',
};

function getGuildId(selectedGuild) {
  if (!selectedGuild) return '';
  if (typeof selectedGuild === 'string') return selectedGuild;
  return selectedGuild.id || selectedGuild.guildId || '';
}

function normalizeLogs(config = {}) {
  const safeConfig = config && typeof config === 'object' ? config : {};
  const safeChannels = safeConfig.channels && typeof safeConfig.channels === 'object' ? safeConfig.channels : {};
  const safeEvents = safeConfig.events && typeof safeConfig.events === 'object' ? safeConfig.events : {};

  return {
    ...DEFAULT_LOGS,
    ...safeConfig,
    enabled: safeConfig.enabled !== false,
    channels: {
      ...DEFAULT_LOGS.channels,
      ...safeChannels,
      messageDelete: safeChannels.messageDelete || safeChannels.message || null,
      messageEdit: safeChannels.messageEdit || safeChannels.message || null,
    },
    events: {
      ...DEFAULT_LOGS.events,
      ...safeEvents,
    },
  };
}

function cleanChannels(channels = []) {
  return (Array.isArray(channels) ? channels : [])
    .filter((channel) => channel?.id && channel?.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function StatusPill({ theme, enabled, children }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${enabled ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)'}`,
        background: enabled ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
        color: enabled ? '#86efac' : '#fca5a5',
        borderRadius: 999,
        padding: '6px 10px',
        fontSize: 12,
        fontWeight: 950,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {children || (enabled ? 'Enabled' : 'Disabled')}
    </span>
  );
}

function MiniButton({ theme, children, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${theme.cardBorder}`,
        background: disabled ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.78)',
        color: disabled ? theme.mutedText : theme.cardText,
        borderRadius: 12,
        padding: '9px 11px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12,
        fontWeight: 900,
      }}
    >
      {children}
    </button>
  );
}

function LogRow({
  theme,
  item,
  enabled,
  channel,
  channels,
  globallyDisabled,
  onToggle,
  onChannelChange,
}) {
  return (
    <div
      style={{
        background: enabled && !globallyDisabled ? theme.softBg : 'rgba(15,23,42,0.42)',
        border: `1px solid ${enabled && !globallyDisabled ? theme.cardBorder : 'rgba(148,163,184,0.12)'}`,
        borderRadius: 16,
        padding: 14,
        display: 'grid',
        gap: 12,
        minWidth: 0,
        opacity: globallyDisabled ? 0.72 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'grid', gap: 5, minWidth: 0, flex: '1 1 220px' }}>
          <h4 style={{ margin: 0, color: theme.cardText, fontSize: 15, fontWeight: 950, lineHeight: 1.25 }}>
            {item.label}
          </h4>

          <p style={{ margin: 0, color: theme.mutedText, fontSize: 13, lineHeight: 1.45 }}>
            {item.description}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggle}
          disabled={globallyDisabled}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: globallyDisabled ? 'not-allowed' : 'pointer',
            padding: 0,
          }}
        >
          <StatusPill theme={theme} enabled={enabled} />
        </button>
      </div>

      <select
        value={channel}
        onChange={(event) => onChannelChange(event.target.value)}
        disabled={globallyDisabled || !enabled}
        style={{
          width: '100%',
          border: `1px solid ${theme.cardBorder}`,
          background: globallyDisabled || !enabled ? 'rgba(15,23,42,0.45)' : 'rgba(10,18,35,0.96)',
          color: globallyDisabled || !enabled ? theme.mutedText : theme.cardText,
          borderRadius: 12,
          padding: '10px 12px',
          outline: 'none',
          fontWeight: 800,
          minWidth: 0,
          cursor: globallyDisabled || !enabled ? 'not-allowed' : 'pointer',
        }}
      >
        <option value="">Select channel</option>

        {channels.map((channelData) => (
          <option key={channelData.id} value={channelData.id}>
            #{channelData.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function ChannelMap({ theme, logs, channels }) {
  const channelLookup = useMemo(() => {
    const next = new Map();
    channels.forEach((channel) => next.set(String(channel.id), channel));
    return next;
  }, [channels]);

  const entries = Object.entries(logs.channels || {});

  return (
    <SectionCard
      theme={theme}
      title="Channel Map"
      subtitle="Current destination channels for every log stream."
      padding="16px"
    >
      <div style={{ display: 'grid', gap: 10 }}>
        {entries.map(([key, channelId]) => {
          const channel = channelId ? channelLookup.get(String(channelId)) : null;

          return (
            <div
              key={key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                border: `1px solid ${theme.cardBorder}`,
                background: theme.softBg,
                borderRadius: 14,
                padding: '11px 12px',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: theme.cardText, fontWeight: 900 }}>
                {CHANNEL_LABELS[key] || key}
              </span>

              <span style={{ color: channel ? '#bfdbfe' : theme.mutedText, fontWeight: 850 }}>
                {channel ? `#${channel.name}` : 'Not set'}
              </span>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

export default function Logs({ selectedGuild, theme }) {
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
        setChannels(cleanChannels(channelsRes));
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setError(err.message || 'Failed to load log settings.');
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

    return listenForGuildUpdate(guildId, 'logs', (data, payload = {}) => {
      setLogs(normalizeLogs(data));
      setSaveMessage(payload.source === 'dashboard' ? '✅ Logs synced live.' : '🔄 Logs updated live.');
    });
  }, [guildId]);

  const allItems = useMemo(() => LOG_GROUPS.flatMap((group) => group.items), []);

  const enabledEvents = useMemo(
    () => allItems.filter((item) => logs.events?.[item.eventKey] !== false).length,
    [allItems, logs.events],
  );

  const configuredChannels = useMemo(
    () => Object.values(logs.channels || {}).filter(Boolean).length,
    [logs.channels],
  );

  const missingRequiredChannels = useMemo(
    () => allItems.filter((item) => logs.events?.[item.eventKey] !== false && !logs.channels?.[item.channelKey]).length,
    [allItems, logs.channels, logs.events],
  );

  function setLogEnabled(enabled) {
    setLogs((prev) => normalizeLogs({ ...prev, enabled }));
  }

  function updateChannel(channelKey, value) {
    setLogs((prev) => normalizeLogs({
      ...prev,
      channels: {
        ...prev.channels,
        [channelKey]: value || null,
      },
    }));
  }

  function updateEvent(eventKey, enabled) {
    setLogs((prev) => normalizeLogs({
      ...prev,
      events: {
        ...prev.events,
        [eventKey]: enabled,
      },
    }));
  }

  function setAllEvents(enabled) {
    setLogs((prev) => normalizeLogs({
      ...prev,
      events: Object.fromEntries(allItems.map((item) => [item.eventKey, enabled])),
    }));
  }

  function clearChannels() {
    setLogs((prev) => normalizeLogs({
      ...prev,
      channels: Object.fromEntries(Object.keys(DEFAULT_LOGS.channels).map((key) => [key, null])),
    }));
  }

  function applyFallbackChannel(channelKey) {
    const fallback = logs.channels?.[channelKey];
    if (!fallback) return;

    setLogs((prev) => normalizeLogs({
      ...prev,
      channels: Object.fromEntries(Object.keys(DEFAULT_LOGS.channels).map((key) => [key, prev.channels?.[key] || fallback])),
    }));
  }

  async function handleSave() {
    if (!guildId) return;

    try {
      setSaving(true);
      setError('');
      setSaveMessage('');

      const saved = await api.saveLogConfig(guildId, normalizeLogs(logs));

      if (saved?.config) {
        setLogs(normalizeLogs(saved.config));
      }

      setSaveMessage('✅ Logs saved successfully.');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save logs.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell
      title="Logs"
      subtitle="Control moderation, member, message, server, and voice logging from one clean command centre."
      theme={theme}
      guild={{ id: guildId, name: 'Logs' }}
      actions={(
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <MiniButton theme={theme} onClick={() => setLogEnabled(!logs.enabled)} disabled={!guildId || saving}>
            {logs.enabled ? 'Disable Logs' : 'Enable Logs'}
          </MiniButton>

          <PrimaryButton onClick={handleSave} disabled={!guildId || saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </PrimaryButton>
        </div>
      )}
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
        <Notice theme={theme} tone={saveMessage.startsWith('❌') ? 'danger' : 'success'}>
          {saveMessage}
        </Notice>
      ) : null}

      {selectedGuild && loading ? (
        <LoadingPanel theme={theme} text="Loading log centre..." />
      ) : null}

      {selectedGuild && !loading ? (
        <>
          <StatGrid min="190px">
            <SummaryStat
              theme={theme}
              label="Logging"
              value={logs.enabled ? 'Enabled' : 'Disabled'}
              accent={logs.enabled ? theme.success : theme.danger}
              description="Global logging system state"
            />

            <SummaryStat
              theme={theme}
              label="Configured Channels"
              value={configuredChannels}
              accent="#3b82f6"
              description="Assigned logging destinations"
            />

            <SummaryStat
              theme={theme}
              label="Enabled Events"
              value={`${enabledEvents}/${allItems.length}`}
              accent="#f59e0b"
              description="Tracked logging events"
            />

            <SummaryStat
              theme={theme}
              label="Missing Routes"
              value={missingRequiredChannels}
              accent={missingRequiredChannels ? '#f97316' : '#22c55e'}
              description="Enabled events without a channel"
            />
          </StatGrid>

          {!logs.enabled ? (
            <Notice theme={theme} tone="warning">
              Logging is currently disabled. Event toggles and channel selections are kept, but Goliath should not post log events until logging is enabled again.
            </Notice>
          ) : null}

          {missingRequiredChannels ? (
            <Notice theme={theme} tone="warning">
              {missingRequiredChannels} enabled log event{missingRequiredChannels === 1 ? '' : 's'} still need a channel before the setup is fully covered.
            </Notice>
          ) : null}

          <SectionCard
            theme={theme}
            title="Quick Setup"
            subtitle="Fast controls for first-time setup and clean resets."
            padding="16px"
          >
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <MiniButton theme={theme} onClick={() => setAllEvents(true)} disabled={!logs.enabled}>
                Enable All Events
              </MiniButton>

              <MiniButton theme={theme} onClick={() => setAllEvents(false)} disabled={!logs.enabled}>
                Disable All Events
              </MiniButton>

              <MiniButton theme={theme} onClick={() => applyFallbackChannel('general')} disabled={!logs.channels?.general}>
                Fill Missing From General
              </MiniButton>

              <MiniButton theme={theme} onClick={() => applyFallbackChannel('moderation')} disabled={!logs.channels?.moderation}>
                Fill Missing From Moderation
              </MiniButton>

              <MiniButton theme={theme} onClick={clearChannels}>
                Clear Channels
              </MiniButton>
            </div>
          </SectionCard>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,390px),1fr))', gap: 14 }}>
            {LOG_GROUPS.map((group) => {
              const groupEnabled = group.items.filter((item) => logs.events?.[item.eventKey] !== false).length;

              return (
                <SectionCard
                  key={group.key}
                  theme={theme}
                  title={group.label}
                  subtitle={`${group.description} ${groupEnabled}/${group.items.length} enabled.`}
                  padding="16px"
                >
                  <div style={{ display: 'grid', gap: 12 }}>
                    {group.items.map((item) => {
                      const enabled = logs.events?.[item.eventKey] !== false;
                      const selectedChannel = logs.channels?.[item.channelKey] || '';

                      return (
                        <LogRow
                          key={item.key}
                          theme={theme}
                          item={item}
                          enabled={enabled}
                          channel={selectedChannel}
                          channels={channels}
                          globallyDisabled={!logs.enabled}
                          onToggle={() => updateEvent(item.eventKey, !enabled)}
                          onChannelChange={(value) => updateChannel(item.channelKey, value)}
                        />
                      );
                    })}
                  </div>
                </SectionCard>
              );
            })}
          </div>

          <ChannelMap theme={theme} logs={logs} channels={channels} />
        </>
      ) : null}
    </PageShell>
  );
}

const LOG_GROUPS = [
  {
    key: 'moderation',
    label: 'Moderation Logs',
    description: 'Bans, kicks, warnings, timeouts, and automod activity.',
    items: [
      {
        key: 'modLog',
        label: 'Moderation Actions',
        description: 'Bans, kicks, warnings, timeouts, case updates, and staff moderation actions.',
        channelKey: 'moderation',
        eventKey: 'moderationActions',
      },
      {
        key: 'automodLog',
        label: 'AutoMod Actions',
        description: 'Blocked messages, automod triggers, filters, and protection events.',
        channelKey: 'automod',
        eventKey: 'automodActions',
      },
    ],
  },
  {
    key: 'admin',
    label: 'Admin Logs',
    description: 'Track important server administration changes.',
    items: [
      {
        key: 'adminActions',
        label: 'Admin Actions',
        description: 'Dashboard saves, config changes, and high-level administrative actions.',
        channelKey: 'admin',
        eventKey: 'adminActions',
      },
      {
        key: 'roleCreate',
        label: 'Role Created',
        description: 'New Discord roles created in the guild.',
        channelKey: 'admin',
        eventKey: 'roleCreate',
      },
      {
        key: 'roleDelete',
        label: 'Role Deleted',
        description: 'Discord roles removed from the guild.',
        channelKey: 'admin',
        eventKey: 'roleDelete',
      },
      {
        key: 'roleUpdate',
        label: 'Role Updated',
        description: 'Role name, colour, permission, and hierarchy changes.',
        channelKey: 'admin',
        eventKey: 'roleUpdate',
      },
    ],
  },
  {
    key: 'members',
    label: 'Member Logs',
    description: 'Track member joins, leaves, and profile updates.',
    items: [
      {
        key: 'memberJoin',
        label: 'Member Joined',
        description: 'New members joining the server.',
        channelKey: 'member',
        eventKey: 'memberJoin',
      },
      {
        key: 'memberLeave',
        label: 'Member Left',
        description: 'Members leaving or being removed from the server.',
        channelKey: 'member',
        eventKey: 'memberLeave',
      },
      {
        key: 'memberUpdate',
        label: 'Member Updated',
        description: 'Nickname, role, timeout, and profile-related member changes.',
        channelKey: 'member',
        eventKey: 'memberUpdate',
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
        description: 'Messages deleted anywhere in the server.',
        channelKey: 'messageDelete',
        eventKey: 'messageDelete',
      },
      {
        key: 'messageEdit',
        label: 'Edited Messages',
        description: 'Messages edited anywhere in the server.',
        channelKey: 'messageEdit',
        eventKey: 'messageEdit',
      },
    ],
  },
  {
    key: 'channels',
    label: 'Channel Logs',
    description: 'Track text, voice, category, and forum channel changes.',
    items: [
      {
        key: 'channelCreate',
        label: 'Channel Created',
        description: 'New channels created in the guild.',
        channelKey: 'general',
        eventKey: 'channelCreate',
      },
      {
        key: 'channelDelete',
        label: 'Channel Deleted',
        description: 'Channels deleted from the guild.',
        channelKey: 'general',
        eventKey: 'channelDelete',
      },
      {
        key: 'channelUpdate',
        label: 'Channel Updated',
        description: 'Channel name, topic, permission, position, and setting changes.',
        channelKey: 'general',
        eventKey: 'channelUpdate',
      },
    ],
  },
  {
    key: 'voice',
    label: 'Voice Logs',
    description: 'Track voice joins, leaves, and movement.',
    items: [
      {
        key: 'voiceJoin',
        label: 'Voice Joined',
        description: 'Members joining voice channels.',
        channelKey: 'voice',
        eventKey: 'voiceJoin',
      },
      {
        key: 'voiceLeave',
        label: 'Voice Left',
        description: 'Members leaving voice channels.',
        channelKey: 'voice',
        eventKey: 'voiceLeave',
      },
      {
        key: 'voiceMove',
        label: 'Voice Moved',
        description: 'Members moving between voice channels.',
        channelKey: 'voice',
        eventKey: 'voiceMove',
      },
    ],
  },
];
