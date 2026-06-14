import React, { useEffect, useMemo, useState } from 'react';

import {
  joinGuildRoom,
  listenForGuildUpdate,
} from '../services/socketClient';

import { api } from '../services/apiClient';

import PageShell, {
  SectionCard,
  StatGrid,
  SummaryStat,
  EmptyState,
  LoadingPanel,
  Notice,
  PrimaryButton,
} from '../shared/PageShell';

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

  if (typeof selectedGuild === 'string') {
    return selectedGuild;
  }

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

function ConfigRow({
  theme,
  title,
  description,
  enabled,
  channel,
  channels,
  onToggle,
  onChannelChange,
}) {
  return (
    <div
      style={{
        background: theme.softBg,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: 18,
        padding: 18,
        display: 'grid',
        gap: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'grid', gap: 6 }}>
          <h4
            style={{
              margin: 0,
              color: theme.cardText,
              fontSize: 16,
              fontWeight: 900,
            }}
          >
            {title}
          </h4>

          <p
            style={{
              margin: 0,
              color: theme.mutedText,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {description}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggle}
          style={{
            border: `1px solid ${
              enabled
                ? 'rgba(34,197,94,0.24)'
                : 'rgba(239,68,68,0.24)'
            }`,

            background: enabled
              ? 'rgba(34,197,94,0.12)'
              : 'rgba(239,68,68,0.12)',

            color: enabled
              ? '#86efac'
              : '#fca5a5',

            borderRadius: 999,
            padding: '7px 12px',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      <select
        value={channel}
        onChange={(event) => onChannelChange(event.target.value)}
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
        <option value="">Select channel</option>

        {channels.map((channelData) => (
          <option
            key={channelData.id}
            value={channelData.id}
          >
            #{channelData.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function Logs({
  selectedGuild,
  theme,
}) {
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

        setChannels(
          Array.isArray(channelsRes)
            ? channelsRes
            : [],
        );
      } catch (err) {
        console.error(err);

        if (!mounted) return;

        setError('Failed to load log settings.');
        setChannels([]);
      } finally {
        if (mounted) {
          setLoading(false);
        }
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

    return listenForGuildUpdate(
      guildId,
      'logs',
      (data, payload) => {
        setLogs(normalizeLogs(data));

        setSaveMessage(
          payload.source === 'dashboard'
            ? '✅ Logs synced live.'
            : '🔄 Logs updated live.',
        );
      },
    );
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

      const saved = await api.saveLogConfig(
        guildId,
        logs,
      );

      if (saved?.config) {
        setLogs(normalizeLogs(saved.config));
      }

      setSaveMessage(
        '✅ Logs saved successfully.',
      );
    } catch (err) {
      console.error(err);

      setError('Failed to save logs.');
    } finally {
      setSaving(false);
    }
  }

  const enabledEvents = Object.values(
    logs.events || {},
  ).filter(Boolean).length;

  const configuredChannels = Object.values(
    logs.channels || {},
  ).filter(Boolean).length;

  return (
    <PageShell
      title="Logs"
      subtitle="Manage moderation, message, and server event logging channels."
      theme={theme}
      guild={{
        id: guildId,
        name: 'Logs',
      }}
      actions={
        <PrimaryButton
          onClick={handleSave}
          disabled={!guildId || saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </PrimaryButton>
      }
    >
      {!selectedGuild ? (
        <EmptyState
          theme={theme}
          text="Select a guild to manage logs."
        />
      ) : null}

      {error ? (
        <Notice theme={theme} tone="danger">
          {error}
        </Notice>
      ) : null}

      {saveMessage ? (
        <Notice
          theme={theme}
          tone={
            saveMessage.startsWith('❌')
              ? 'danger'
              : 'success'
          }
        >
          {saveMessage}
        </Notice>
      ) : null}

      {selectedGuild && loading ? (
        <LoadingPanel
          theme={theme}
          text="Loading logs..."
        />
      ) : null}

      {selectedGuild && !loading ? (
        <>
          <StatGrid min="200px">
            <SummaryStat
              theme={theme}
              label="Logging"
              value={
                logs.enabled
                  ? 'Enabled'
                  : 'Disabled'
              }
              accent={
                logs.enabled
                  ? theme.success
                  : theme.danger
              }
              description="Global logging system state"
            />

            <SummaryStat
              theme={theme}
              label="Configured Channels"
              value={configuredChannels}
              accent="#3b82f6"
              description="Assigned logging channels"
            />

            <SummaryStat
              theme={theme}
              label="Enabled Events"
              value={enabledEvents}
              accent="#f59e0b"
              description="Tracked logging events"
            />

            <SummaryStat
              theme={theme}
              label="Realtime Sync"
              value="Live"
              accent="#22c55e"
              description="Socket configuration syncing"
            />
          </StatGrid>

          {LOG_GROUPS.map((group) => (
            <SectionCard
              key={group.key}
              theme={theme}
              title={group.label}
              subtitle={group.description}
            >
              <div
                style={{
                  display: 'grid',
                  gap: 16,
                }}
              >
                {group.items.map((item) => {
                  const enabled =
                    logs.events?.[
                      item.eventKey
                    ] !== false;

                  const selectedChannel =
                    logs.channels?.[
                      item.channelKey
                    ] || '';

                  return (
                    <ConfigRow
                      key={item.key}
                      theme={theme}
                      title={item.label}
                      description={item.description}
                      enabled={enabled}
                      channel={selectedChannel}
                      channels={channels}
                      onToggle={() =>
                        updateEvent(
                          item.eventKey,
                          !enabled,
                        )
                      }
                      onChannelChange={(value) =>
                        updateChannel(
                          item.channelKey,
                          value,
                        )
                      }
                    />
                  );
                })}
              </div>
            </SectionCard>
          ))}
        </>
      ) : null}
    </PageShell>
  );
}

const LOG_GROUPS = [
  {
    key: 'moderation',

    label: 'Moderation Logs',

    description:
      'Track moderation actions and automod events.',

    items: [
      {
        key: 'modLog',

        label: 'Moderation Actions',

        description:
          'Bans, kicks, warnings, timeouts, and moderation actions.',

        channelKey: 'moderation',

        eventKey: 'moderationActions',
      },

      {
        key: 'automodLog',

        label: 'AutoMod Actions',

        description:
          'Blocked messages, automod triggers, and protection events.',

        channelKey: 'automod',

        eventKey: 'automodActions',
      },
    ],
  },

  {
    key: 'messages',

    label: 'Message Logs',

    description:
      'Track deleted and edited messages.',

    items: [
      {
        key: 'messageDelete',

        label: 'Deleted Messages',

        description:
          'Messages deleted anywhere in the server.',

        channelKey: 'messageDelete',

        eventKey: 'messageDelete',
      },

      {
        key: 'messageEdit',

        label: 'Edited Messages',

        description:
          'Messages edited anywhere in the server.',

        channelKey: 'messageEdit',

        eventKey: 'messageEdit',
      },
    ],
  },
];