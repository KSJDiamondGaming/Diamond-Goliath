import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import PageShell, {
  EmptyState,
  LoadingPanel,
  Notice,
  SecondaryButton,
} from '../components/PageShell';
import { PAGE_LAYOUTS, createCasesPageStyles } from '../ui';

const PAGE_KEY = 'cases';

const ACTION_TONES = {
  ban: 'danger',
  kick: 'warning',
  timeout: 'warning',
  warn: 'primary',
  clearwarnings: 'soft',
};

export default function Cases({ selectedGuild, theme }) {
  const styles = useMemo(() => createCasesPageStyles(theme), [theme]);

  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const page = PAGE_LAYOUTS[PAGE_KEY];

  useEffect(() => {
    let mounted = true;

    async function loadCases() {
      if (!selectedGuild) {
        setCases([]);
        setSelectedCase(null);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const data = await api.getCases(selectedGuild);

        if (!mounted) return;

        const nextCases = normalizeCases(data, selectedGuild);
        setCases(nextCases);
        setSelectedCase(null);
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setCases([]);
        setError('Could not load cases.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadCases();

    return () => {
      mounted = false;
    };
  }, [selectedGuild]);

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
        selectedGuild
          ? page?.description || 'Moderation history'
          : page?.emptyDescription || 'Select a server to view cases.'
      }
      theme={theme}
      actions={
        selectedGuild ? (
          <input
            style={styles.searchInput}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search cases..."
          />
        ) : null
      }
    >
      {!selectedGuild ? (
        <EmptyState theme={theme} text="Select a guild to view cases." />
      ) : null}

      {error ? (
        <Notice theme={theme} tone="danger">
          {error}
        </Notice>
      ) : null}

      {selectedGuild && loading ? (
        <LoadingPanel theme={theme} text="Loading cases..." />
      ) : null}

      {selectedGuild && !loading ? (
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
        <span style={styles.badge(tone)}>{item.action || 'Unknown'}</span>
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
}) {
  const tone = getActionTone(item.action);

  return (
    <aside style={styles.detailCard}>
      <div style={styles.detailHeader}>
        <div style={styles.recordTop}>
          <h3 style={styles.detailTitle}>
            Case #{item.caseNumber || item.id || 'Unknown'}
          </h3>
          <span style={styles.badge(tone)}>{item.action || 'Unknown'}</span>
        </div>

        <p style={styles.detailSubtitle}>Full moderation case details.</p>
      </div>

      <div style={styles.detailBody}>
        <div style={styles.detailGrid}>
          <DetailRow styles={styles} label="Action" value={item.action || 'Unknown'} />
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
        </div>

        <div style={styles.detailActions}>
          <SecondaryButton theme={theme} onClick={onClose}>
            Close
          </SecondaryButton>
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

function normalizeCases(data, selectedGuild) {
  if (!data) return [];

  if (Array.isArray(data)) {
    return data.map((item) => normalizeCase(item, selectedGuild));
  }

  if (Array.isArray(data.cases)) {
    return data.cases.map((item) => normalizeCase(item, selectedGuild));
  }

  if (selectedGuild && data[selectedGuild]) {
    return normalizeCases(data[selectedGuild], selectedGuild);
  }

  if (typeof data === 'object') {
    return Object.entries(data).flatMap(([guildId, value]) => {
      if (Array.isArray(value)) {
        return value.map((item) => normalizeCase(item, guildId));
      }

      if (value && typeof value === 'object') {
        return Object.values(value).map((item) => normalizeCase(item, guildId));
      }

      return [];
    });
  }

  return [];
}

function normalizeCase(item, guildId) {
  return {
    ...item,
    guildId: item?.guildId || guildId,
    caseNumber: item?.caseNumber || item?.case || item?.number || item?.id,
    action: item?.action || item?.type || item?.punishment,
    targetTag: item?.targetTag || item?.userTag || item?.user,
    targetId: item?.targetId || item?.userId,
    moderatorTag: item?.moderatorTag || item?.moderator,
    moderatorId: item?.moderatorId,
    createdAt: item?.createdAt || item?.date || item?.timestamp,
    reason: item?.reason,
    cleared: item?.cleared === true,
  };
}

function getCaseKey(item) {
  if (!item) return '';
  return `${item.guildId || 'guild'}-${item.caseNumber || item.id || item.createdAt || Math.random()}`;
}

function getActionTone(action = '') {
  return ACTION_TONES[String(action).toLowerCase()] || 'soft';
}

function formatUser(tag, id) {
  if (tag && id) return `${tag} (${id})`;
  if (tag) return tag;
  if (id) return id;
  return 'Unknown';
}