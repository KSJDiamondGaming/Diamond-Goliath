import { memo, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import PageShell, {
  EmptyState,
  LoadingPanel,
  Notice,
  PrimaryButton,
} from '../components/PageShell';
import { PAGE_LAYOUTS, createLogsPageStyles } from '../ui';

export default function Logs({ selectedGuild, theme }) {
  const styles = useMemo(() => createLogsPageStyles(theme), [theme]);
  const page = PAGE_LAYOUTS.logs;

  const [logs, setLogs] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadLogs() {
      if (!selectedGuild) {
        setLogs({});
        return;
      }

      try {
        setLoading(true);
        setError('');

        const data = await api.getLogs(selectedGuild);

        if (!mounted) return;

        setLogs(data || {});
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setLogs({});
        setError('Failed to load log settings.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadLogs();

    return () => {
      mounted = false;
    };
  }, [selectedGuild]);

  async function handleSave() {
    try {
      setSaving(true);
      await api.updateLogs(selectedGuild, logs);
    } catch (err) {
      console.error(err);
      setError('Failed to save logs.');
    } finally {
      setSaving(false);
    }
  }

  function updateLog(key, value) {
    setLogs((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

    return (
    <PageShell
  title={page.title}
  subtitle={selectedGuild ? page.description : page.emptyDescription}
  theme={theme}
  actions={
    <PrimaryButton onClick={handleSave} disabled={saving}>
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
                  {group.items.map((item) => (
                    <div key={item.key} style={styles.row}>
                      <div style={styles.rowHeader}>
                        <h4 style={styles.rowTitle}>{item.label}</h4>

                        <span style={styles.badge(!!logs[item.key])}>
                          {logs[item.key] ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>

                      <p style={styles.rowText}>{item.description}</p>

                      <select
                        style={styles.channelSelect}
                        value={logs[item.key] || ''}
                        onChange={(e) => updateLog(item.key, e.target.value)}
                      >
                        <option value="">Select channel</option>
                        <option value="general">#general</option>
                        <option value="mod-logs">#mod-logs</option>
                        <option value="admin">#admin</option>
                      </select>
                    </div>
                  ))}
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
      },
      {
        key: 'warnLog',
        label: 'Warning Log',
        description: 'User warnings.',
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
        description: 'Logs deleted messages.',
      },
      {
        key: 'messageEdit',
        label: 'Edited Messages',
        description: 'Logs edited messages.',
      },
    ],
  },
];