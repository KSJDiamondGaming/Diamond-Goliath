import React, { useMemo, useState } from 'react';

import { api } from '../../services/apiClient.js';
import { EmptyState, Notice, SectionCard } from '../../shared/PageShell';

function flattenThreadMappings(threadMappings = {}, threadChannels = {}) {
  const rows = [];

  for (const [sourceChannelId, languageMap] of Object.entries(threadMappings || {})) {
    for (const [languageCode, mapping] of Object.entries(languageMap || {})) {
      rows.push({
        sourceChannelId,
        languageCode,
        threadId: mapping?.threadId || '',
        threadName: mapping?.threadName || `Translation ${languageCode}`,
        active: mapping?.active !== false,
        archived: mapping?.archived === true,
        locked: mapping?.locked === true,
        lastTranslatedAt: mapping?.lastTranslatedAt || null,
        lastTranslatedMessageId: mapping?.lastTranslatedMessageId || '',
        channelEnabled: threadChannels?.[sourceChannelId]?.enabled !== false,
      });
    }
  }

  return rows.sort((a, b) => `${a.sourceChannelId}:${a.languageCode}`.localeCompare(`${b.sourceChannelId}:${b.languageCode}`));
}

function statusText(row) {
  if (!row.threadId) return 'Missing';
  if (!row.active) return 'Disabled';
  if (row.locked) return 'Locked';
  if (row.archived) return 'Archived';
  return 'Active';
}

function statusColor(row) {
  const status = statusText(row);
  if (status === 'Active') return '#86efac';
  if (status === 'Missing') return '#fca5a5';
  return '#fcd34d';
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Never' : date.toLocaleString();
}

export default function TranslationThreadsPanel({ theme, guildId, config = {}, onRefresh }) {
  const [busyChannel, setBusyChannel] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const rows = useMemo(() => flattenThreadMappings(config.threadMappings, config.threadChannels || config.channels), [config]);
  const sourceChannelIds = useMemo(() => Object.keys(config.threadChannels || config.channels || {}), [config]);

  async function recoverChannel(channelId) {
    if (!guildId || !channelId) return;
    setBusyChannel(channelId);
    setNotice('');
    setError('');

    try {
      const result = await api.request(`/api/translation/${guildId}/threads/channels/${channelId}/recover`, { method: 'POST' });
      const created = result.recovery?.created?.length || 0;
      const recovered = result.recovery?.recovered?.length || 0;
      setNotice(`Thread recovery complete. Created ${created}, recovered ${recovered}.`);
      await onRefresh?.();
    } catch (recoverError) {
      setError(recoverError.message || 'Failed to recover translation threads.');
    } finally {
      setBusyChannel('');
    }
  }

  return (
    <SectionCard theme={theme} title="Translation Threads" subtitle="Source channels, language threads, recovery status and last routed messages.">
      {notice ? <Notice theme={theme} tone="success">{notice}</Notice> : null}
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}

      {!sourceChannelIds.length ? (
        <EmptyState theme={theme} text="No translation thread channels configured yet." />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {sourceChannelIds.map((channelId) => {
            const channelRows = rows.filter((row) => row.sourceChannelId === channelId);
            const channelConfig = (config.threadChannels || config.channels || {})[channelId] || {};
            const languages = channelConfig.languages || channelConfig.targetLanguages || [];

            return (
              <div key={channelId} style={{ border: `1px solid ${theme.cardBorder}`, background: 'rgba(15,23,42,0.24)', borderRadius: 18, padding: 14, display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ color: theme.cardText, display: 'block', overflowWrap: 'anywhere' }}>Source Channel: {channelId}</strong>
                    <span style={{ color: theme.mutedText, fontSize: 13 }}>Languages: {languages.length ? languages.join(', ') : 'Not set'} • Mode: {channelConfig.mode || 'manual'}</span>
                  </div>
                  <button type="button" disabled={busyChannel === channelId} onClick={() => recoverChannel(channelId)} style={{ border: '1px solid rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.12)', color: '#bfdbfe', borderRadius: 12, padding: '9px 11px', fontWeight: 900, cursor: busyChannel === channelId ? 'not-allowed' : 'pointer' }}>
                    {busyChannel === channelId ? 'Recovering...' : 'Recover Threads'}
                  </button>
                </div>

                {channelRows.length ? (
                  <div style={{ overflowX: 'auto', border: `1px solid ${theme.cardBorder}`, borderRadius: 14 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                      <thead>
                        <tr style={{ background: 'rgba(15,23,42,0.38)' }}>
                          <th style={{ padding: 12, textAlign: 'left', color: theme.mutedText }}>Language</th>
                          <th style={{ padding: 12, textAlign: 'left', color: theme.mutedText }}>Thread</th>
                          <th style={{ padding: 12, textAlign: 'left', color: theme.mutedText }}>Status</th>
                          <th style={{ padding: 12, textAlign: 'left', color: theme.mutedText }}>Last Routed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {channelRows.map((row) => (
                          <tr key={`${row.sourceChannelId}-${row.languageCode}`} style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
                            <td style={{ padding: 12, color: theme.cardText, fontWeight: 900 }}>{row.languageCode}</td>
                            <td style={{ padding: 12, color: theme.cardText, overflowWrap: 'anywhere' }}>{row.threadName}<br /><span style={{ color: theme.mutedText, fontSize: 12 }}>{row.threadId || 'No thread ID'}</span></td>
                            <td style={{ padding: 12, color: statusColor(row), fontWeight: 950 }}>{statusText(row)}</td>
                            <td style={{ padding: 12, color: theme.mutedText }}>{formatDate(row.lastTranslatedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState theme={theme} text="No language threads mapped yet. Use Recover Threads to create or repair them." />
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
