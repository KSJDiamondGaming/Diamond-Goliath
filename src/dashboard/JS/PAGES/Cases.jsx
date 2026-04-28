import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api, joinGuildRoom, listenForGuildUpdate } from '../api';
import PageShell, {
  EmptyState,
  LoadingPanel,
  Notice,
  SecondaryButton,
} from '../shared/PageShell';
import { PAGE_LAYOUTS, createCasesPageStyles } from '../ui';

const PAGE_KEY = 'cases';

const ACTION_TONES = {
  ban: 'danger',
  kick: 'warning',
  timeout: 'warning',
  warn: 'primary',
  warning: 'primary',
  mute: 'warning',
  clearwarnings: 'soft',
};

function getGuildId(selectedGuild) {
  if (!selectedGuild) return '';
  if (typeof selectedGuild === 'string') return selectedGuild;
  return selectedGuild.id || selectedGuild.guildId || '';
}

export default function Cases({ selectedGuild, theme }) {
  const styles = useMemo(() => createCasesPageStyles(theme), [theme]);
  const page = PAGE_LAYOUTS[PAGE_KEY];
  const guildId = getGuildId(selectedGuild);

  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [clearingCase, setClearingCase] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');

  const loadCases = useCallback(
    async ({ quiet = false } = {}) => {
      if (!guildId) {
        setCases([]);
        setSelectedCase(null);
        setError('');
        setSyncMessage('');
        return;
      }

      try {
        if (quiet) setRefreshing(true);
        else setLoading(true);

        setError('');

        const data = await api.getCases(guildId);
        const nextCases = normalizeCases(data, guildId);

        setCases(nextCases);
        setSelectedCase((current) => {
          if (!current) return null;
          const currentKey = getCaseKey(current);
          return nextCases.find((item) => getCaseKey(item) === currentKey) || null;
        });
      } catch (err) {
        console.error(err);
        setCases([]);
        setSelectedCase(null);
        setError('Could not load cases.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [guildId],
  );

  const handleClearCase = useCallback(
    async (item) => {
      if (!guildId || !item?.caseNumber) return;

      try {
        setClearingCase(String(item.caseNumber));
        setError('');
        setSyncMessage('');

        const result = await api.clearCase(guildId, item.caseNumber);
        const nextCases = normalizeCases(result?.cases || result?.data || result, guildId);

        if (nextCases.length > 0) {
          setCases(nextCases);
          setSelectedCase(
            nextCases.find(
              (caseItem) => String(caseItem.caseNumber) === String(item.caseNumber),
            ) || null,
          );
        } else {
          await loadCases({ quiet: true });
        }

        setSyncMessage('✅ Case cleared.');
      } catch (err) {
        console.error(err);
        setError('Failed to clear case.');
      } finally {
        setClearingCase('');
      }
    },
    [guildId, loadCases],
  );

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  useEffect(() => {
    if (!guildId) return undefined;

    joinGuildRoom(guildId);

    return listenForGuildUpdate(guildId, 'cases', (data) => {
      const nextCases = normalizeCases(data, guildId);

      setCases(nextCases);
      setSelectedCase((current) => {
        if (!current) return null;
        const currentKey = getCaseKey(current);
        return nextCases.find((item) => getCaseKey(item) === currentKey) || null;
      });
      setSyncMessage('✅ Cases synced live.');
    });
  }, [guildId]);

  useEffect(() => {
    if (!syncMessage) return undefined;

    const timeout = setTimeout(() => {
      setSyncMessage('');
    }, 3000);

    return () => clearTimeout(timeout);
  }, [syncMessage]);

  const filteredCases = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return cases;

    return cases.filter((item) =>
      [
        item.caseNumber,
        item.action,
        item.targetTag,
        item.targetId,
        item.moderatorTag,
        item.moderatorId,
        item.reason,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [cases, search]);

  const caseStats = useMemo(() => {
    const total = cases.length;
    const active = cases.filter((item) => item.cleared !== true).length;
    const cleared = cases.filter((item) => item.cleared === true).length;

    return { total, active, cleared };
  }, [cases]);

  const formatDate = useCallback((value) => {
    if (!value) return 'Unknown';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';

    return date.toLocaleString();
  }, []);

  return (
    <PageShell
      title={page?.title || 'Cases'}
      subtitle={
        guildId
          ? page?.description || 'Moderation history'
          : page?.emptyDescription || 'Select a server to view cases.'
      }
      theme={theme}
      actions={
  guildId ? (
    <div style={styles.actionsRow}>
      <input
        style={styles.searchInput}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search cases..."
      />

      <SecondaryButton
        theme={theme}
        onClick={() => loadCases({ quiet: true })}
        disabled={refreshing}
      >
        {refreshing ? 'Refreshing...' : 'Refresh'}
      </SecondaryButton>
    </div>
  ) : null
}
    >
      {!guildId ? (
        <EmptyState theme={theme} text="Select a guild to view cases." />
      ) : null}

      {error ? (
        <Notice theme={theme} tone="danger">
          {error}
        </Notice>
      ) : null}

      {syncMessage ? (
        <Notice theme={theme} tone="success">
          {syncMessage}
        </Notice>
      ) : null}

      {guildId && loading ? (
        <LoadingPanel theme={theme} text="Loading cases..." />
      ) : null}

      {guildId && !loading ? (
        <div style={styles.page}>
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <p style={styles.statLabel}>Total Cases</p>
              <p style={styles.statValue}>{caseStats.total}</p>
            </div>

            <div style={styles.statCard}>
              <p style={styles.statLabel}>Active</p>
              <p style={styles.statValueWarning}>{caseStats.active}</p>
            </div>

            <div style={styles.statCard}>
              <p style={styles.statLabel}>Cleared</p>
              <p style={styles.statValueSuccess}>{caseStats.cleared}</p>
            </div>
          </div>

          {filteredCases.length === 0 ? (
            <div style={styles.emptyPanel}>
              <h3 style={styles.emptyTitle}>No cases found</h3>
              <p style={styles.emptyText}>
                No moderation cases match this server or search.
              </p>
            </div>
          ) : (
            <div style={styles.contentGrid}>
              <section style={styles.listCard}>
                <div style={styles.listHeader}>
                  <h3 style={styles.listTitle}>Case History</h3>
                  <span style={styles.countPill}>{filteredCases.length}</span>
                </div>

                <div style={styles.list}>
                  {filteredCases.map((item) => (
                    <CaseListItem
                      key={getCaseKey(item)}
                      item={item}
                      active={getCaseKey(selectedCase) === getCaseKey(item)}
                      styles={styles}
                      formatDate={formatDate}
                      onClick={() => setSelectedCase(item)}
                    />
                  ))}
                </div>
              </section>

              {selectedCase ? (
                <CaseDetail
                  item={selectedCase}
                  styles={styles}
                  theme={theme}
                  formatDate={formatDate}
                  onClose={() => setSelectedCase(null)}
                  onClear={() => handleClearCase(selectedCase)}
                  clearing={clearingCase === String(selectedCase.caseNumber)}
                />
              ) : (
                <div style={styles.emptyPanel}>
                  <h3 style={styles.emptyTitle}>No case selected</h3>
                  <p style={styles.emptyText}>
                    Select a case from the list to view full details.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </PageShell>
  );
}

const CaseListItem = memo(function CaseListItem({
  item,
  active,
  styles,
  formatDate,
  onClick,
}) {
  const tone = getActionTone(item.action);

  return (
    <button type="button" onClick={onClick} style={styles.recordButton(active)}>
      <div style={styles.recordTop}>
        <h4 style={styles.recordTitle}>
          Case #{item.caseNumber || item.id || 'Unknown'}
        </h4>

        <span style={styles.badge(tone)}>{formatAction(item.action)}</span>
      </div>

      <p style={styles.recordMeta}>
        Target: {item.targetTag || item.userTag || item.user || item.targetId || 'Unknown'}
      </p>

      <p style={styles.recordReason}>{item.reason || 'No reason provided'}</p>

      <p style={styles.recordMeta}>
        {formatDate(item.createdAt || item.date || item.timestamp)}
      </p>
    </button>
  );
});

const CaseDetail = memo(function CaseDetail({
  item,
  styles,
  theme,
  formatDate,
  onClose,
  onClear,
  clearing,
}) {
  const tone = getActionTone(item.action);

  return (
    <aside style={styles.detailCard}>
      <div style={styles.detailHeader}>
        <div style={styles.recordTop}>
          <h3 style={styles.detailTitle}>
            Case #{item.caseNumber || item.id || 'Unknown'}
          </h3>

          <span style={styles.badge(tone)}>{formatAction(item.action)}</span>
        </div>

        <p style={styles.detailSubtitle}>
          {item.cleared ? 'This case has been cleared.' : 'Full moderation case details.'}
        </p>
      </div>

      <div style={styles.detailBody}>
        <div style={styles.detailGrid}>
          <DetailRow styles={styles} label="Action" value={formatAction(item.action)} />

          <DetailRow
            styles={styles}
            label="Target"
            value={formatUser(
              item.targetTag || item.userTag || item.user,
              item.targetId || item.userId,
            )}
          />

          <DetailRow
            styles={styles}
            label="Moderator"
            value={formatUser(item.moderatorTag || item.moderator, item.moderatorId)}
          />

          <DetailRow
            styles={styles}
            label="Date"
            value={formatDate(item.createdAt || item.date || item.timestamp)}
          />

          <DetailRow
            styles={styles}
            label="Reason"
            value={item.reason || 'No reason provided'}
          />

          {item.cleared ? (
            <DetailRow
              styles={styles}
              label="Cleared At"
              value={formatDate(item.clearedAt)}
            />
          ) : null}
        </div>

        <div style={styles.detailActions}>
          <SecondaryButton theme={theme} onClick={onClose}>
            Close
          </SecondaryButton>

          {!item.cleared ? (
            <SecondaryButton theme={theme} onClick={onClear} disabled={clearing}>
              {clearing ? 'Clearing...' : 'Clear Case'}
            </SecondaryButton>
          ) : null}
        </div>
      </div>
    </aside>
  );
});

const DetailRow = memo(function DetailRow({ label, value, styles }) {
  return (
    <div style={styles.detailRow}>
      <p style={styles.detailLabel}>{label}</p>
      <p style={styles.detailValue}>{value}</p>
    </div>
  );
});

function normalizeCases(data, guildId) {
  if (!data) return [];

  let rawCases = [];

  if (Array.isArray(data)) {
    rawCases = data;
  } else if (Array.isArray(data.cases)) {
    rawCases = data.cases;
  } else if (data.cases && typeof data.cases === 'object') {
    rawCases = Object.values(data.cases);
  } else if (typeof data === 'object') {
    rawCases = Object.values(data).filter(
      (item) => item && typeof item === 'object' && !Array.isArray(item),
    );
  }

  return rawCases
    .map((item, index) => normalizeCase(item, guildId, index))
    .sort((a, b) => {
      const aNumber = Number(a.caseNumber || 0);
      const bNumber = Number(b.caseNumber || 0);

      if (aNumber !== bNumber) return bNumber - aNumber;

      const aTime = new Date(a.createdAt || 0).getTime() || 0;
      const bTime = new Date(b.createdAt || 0).getTime() || 0;

      return bTime - aTime;
    });
}

function normalizeCase(item = {}, guildId, index = 0) {
  const caseNumber = item.caseNumber || item.case || item.number || item.id || index + 1;

  return {
    ...item,
    guildId: item.guildId || guildId,
    caseNumber,
    action: item.action || item.type || item.punishment || 'unknown',
    targetTag: item.targetTag || item.userTag || item.user || item.target,
    targetId: item.targetId || item.userId,
    moderatorTag: item.moderatorTag || item.moderator,
    moderatorId: item.moderatorId,
    createdAt: item.createdAt || item.date || item.timestamp,
    reason: item.reason,
    cleared: item.cleared === true,
    clearedAt: item.clearedAt,
    stableKey:
      item.id ||
      item.caseId ||
      `${item.guildId || guildId}-${caseNumber}-${item.createdAt || item.timestamp || index}`,
  };
}

function getCaseKey(item) {
  if (!item) return '';
  return item.stableKey || `${item.guildId || 'guild'}-${item.caseNumber || item.id || 'case'}`;
}

function getActionTone(action = '') {
  return ACTION_TONES[String(action).toLowerCase()] || 'soft';
}

function formatAction(action = '') {
  const normalized = String(action || 'unknown').trim();

  if (!normalized) return 'Unknown';

  return normalized
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatUser(tag, id) {
  if (tag && id) return `${tag} (${id})`;
  if (tag) return tag;
  if (id) return id;
  return 'Unknown';
}