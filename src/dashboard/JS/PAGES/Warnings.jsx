import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import PageShell, {
  EmptyState,
  LoadingPanel,
  Notice,
  SecondaryButton,
  StatGrid,
  SummaryStat,
} from '../shared/PageShell';
import { PAGE_LAYOUTS } from "../ui/layout";
import { createWarningsPageStyles } from "../ui/components";

const PAGE_KEY = 'warnings';

function getGuildId(selectedGuild) {
  if (!selectedGuild) return '';
  if (typeof selectedGuild === 'string') return selectedGuild;
  return selectedGuild.id || selectedGuild.guildId || '';
}

export default function Warnings({ selectedGuild, theme }) {
  const styles = useMemo(() => createWarningsPageStyles(theme), [theme]);
  const page = PAGE_LAYOUTS[PAGE_KEY];
  const guildId = getGuildId(selectedGuild);

  const [warnings, setWarnings] = useState([]);
  const [selectedWarning, setSelectedWarning] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadWarnings = useCallback(
    async ({ quiet = false } = {}) => {
      if (!guildId) {
        setWarnings([]);
        setSelectedWarning(null);
        setError('');
        return;
      }

      try {
        if (quiet) setRefreshing(true);
        else setLoading(true);

        setError('');

        const data = await api.getWarnings(guildId);
        const nextWarnings = normalizeWarnings(data, guildId);

        setWarnings(nextWarnings);
        setSelectedWarning((current) => {
          if (!current) return null;
          const currentKey = getWarningKey(current);
          return nextWarnings.find((item) => getWarningKey(item) === currentKey) || null;
        });
      } catch (err) {
        console.error(err);
        setWarnings([]);
        setSelectedWarning(null);
        setError('Could not load warnings.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [guildId],
  );

  useEffect(() => {
    loadWarnings();
  }, [loadWarnings]);

  const filteredWarnings = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return warnings;

    return warnings.filter((w) =>
      [
        w.id,
        w.caseNumber,
        w.userTag,
        w.userId,
        w.moderatorTag,
        w.reason,
        w.cleared ? 'cleared' : 'active',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [warnings, search]);

  const stats = useMemo(() => {
    return {
      total: warnings.length,
      active: warnings.filter((w) => !w.cleared).length,
      cleared: warnings.filter((w) => w.cleared).length,
    };
  }, [warnings]);

  const formatDate = useCallback((value) => {
    if (!value) return 'Unknown';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString();
  }, []);

  return (
    <PageShell
      title={page?.title || 'Warnings'}
      subtitle={
        guildId
          ? page?.description || 'View and manage warning records.'
          : page?.emptyDescription || 'Select a server to view warnings.'
      }
      theme={theme}
      actions={
        guildId ? (
          <div style={styles.actionsRow}>
            <input
              style={styles.searchInput}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search warnings..."
            />

            <SecondaryButton
              theme={theme}
              onClick={() => loadWarnings({ quiet: true })}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </SecondaryButton>
          </div>
        ) : null
      }
    >
      {!guildId ? (
        <EmptyState theme={theme} text="Select a server to view warnings." />
      ) : null}

      {error ? (
        <Notice theme={theme} tone="danger">
          {error}
        </Notice>
      ) : null}

      {guildId ? (
        <StatGrid>
          <SummaryStat theme={theme} label="Total Warnings" value={stats.total} />
          <SummaryStat theme={theme} label="Active" value={stats.active} accent={theme.warning} />
          <SummaryStat theme={theme} label="Cleared" value={stats.cleared} accent={theme.success} />
        </StatGrid>
      ) : null}

      {guildId && loading ? (
        <LoadingPanel theme={theme} text="Loading warnings..." />
      ) : null}

      {guildId && !loading ? (
        <div style={styles.page}>
          {filteredWarnings.length === 0 ? (
            <div style={styles.emptyPanel}>
              <h3 style={styles.emptyTitle}>No warnings found</h3>
              <p style={styles.emptyText}>
                No warning records match this server or search.
              </p>
            </div>
          ) : (
            <div style={styles.contentGrid}>
              <section style={styles.listCard}>
                <div style={styles.listHeader}>
                  <h3 style={styles.listTitle}>Warning History</h3>
                  <span style={styles.countPill}>{filteredWarnings.length}</span>
                </div>

                <div style={styles.list}>
                  {filteredWarnings.map((w) => {
                    const key = getWarningKey(w);

                    return (
                      <WarningItem
                        key={key}
                        item={w}
                        active={getWarningKey(selectedWarning) === key}
                        styles={styles}
                        formatDate={formatDate}
                        onClick={() => setSelectedWarning(w)}
                      />
                    );
                  })}
                </div>
              </section>

              {selectedWarning ? (
                <WarningDetail
                  item={selectedWarning}
                  styles={styles}
                  theme={theme}
                  formatDate={formatDate}
                  onClose={() => setSelectedWarning(null)}
                />
              ) : (
                <div style={styles.emptyPanel}>
                  <h3 style={styles.emptyTitle}>No warning selected</h3>
                  <p style={styles.emptyText}>
                    Select a warning to view details.
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

const WarningItem = memo(function WarningItem({ item, active, styles, formatDate, onClick }) {
  const tone = item.cleared ? 'success' : 'warning';

  return (
    <button type="button" onClick={onClick} style={styles.recordButton(active)}>
      <div style={styles.recordTop}>
        <h4 style={styles.recordTitle}>Warning #{item.id || item.caseNumber || '—'}</h4>
        <span style={styles.badge(tone)}>
          {item.cleared ? 'Cleared' : 'Active'}
        </span>
      </div>

      <p style={styles.recordMeta}>
        User: {item.userTag || item.userId || 'Unknown'}
      </p>

      <p style={styles.recordReason}>
        {item.reason || 'No reason provided'}
      </p>

      <p style={styles.recordMeta}>{formatDate(item.createdAt)}</p>
    </button>
  );
});

const WarningDetail = memo(function WarningDetail({ item, styles, theme, formatDate, onClose }) {
  const tone = item.cleared ? 'success' : 'warning';

  return (
    <aside style={styles.detailCard}>
      <div style={styles.detailHeader}>
        <div style={styles.recordTop}>
          <h3 style={styles.detailTitle}>Warning #{item.id || item.caseNumber || '—'}</h3>
          <span style={styles.badge(tone)}>
            {item.cleared ? 'Cleared' : 'Active'}
          </span>
        </div>

        <p style={styles.detailSubtitle}>Full warning details.</p>
      </div>

      <div style={styles.detailBody}>
        <div style={styles.detailGrid}>
          <DetailRow styles={styles} label="User" value={item.userTag || item.userId || 'Unknown'} />
          <DetailRow styles={styles} label="Moderator" value={item.moderatorTag || 'Unknown'} />
          <DetailRow styles={styles} label="Date" value={formatDate(item.createdAt)} />
          <DetailRow styles={styles} label="Reason" value={item.reason || 'No reason provided'} />
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

function normalizeWarnings(data, guildId) {
  if (!data) return [];

  let rawWarnings = [];

  if (Array.isArray(data)) {
    rawWarnings = data;
  } else if (Array.isArray(data.warnings)) {
    rawWarnings = data.warnings;
  } else if (data.warnings && typeof data.warnings === 'object') {
    rawWarnings = Object.values(data.warnings);
  } else if (guildId && data[guildId]) {
    return normalizeWarnings(data[guildId], guildId);
  } else if (typeof data === 'object') {
    rawWarnings = Object.values(data).filter(
      (item) => item && typeof item === 'object' && !Array.isArray(item),
    );
  }

  return rawWarnings
    .map((w, index) => normalizeWarning(w, guildId, index))
    .sort((a, b) => {
      const aNumber = Number(a.caseNumber || a.id || 0);
      const bNumber = Number(b.caseNumber || b.id || 0);

      if (aNumber !== bNumber) return bNumber - aNumber;

      const aTime = new Date(a.createdAt || 0).getTime() || 0;
      const bTime = new Date(b.createdAt || 0).getTime() || 0;

      return bTime - aTime;
    });
}

function normalizeWarning(w, guildId, index = 0) {
  const id = w.id || w.warningId || w.caseNumber || w.case || index + 1;

  return {
    ...w,
    guildId: w.guildId || guildId,
    id,
    caseNumber: w.caseNumber || w.case || id,
    userTag: w.userTag || w.user || w.targetTag || w.target,
    userId: w.userId || w.targetId,
    moderatorTag: w.moderatorTag || w.moderator,
    reason: w.reason,
    cleared: w.cleared === true,
    createdAt: w.createdAt || w.timestamp || w.date,
  };
}

function getWarningKey(w) {
  if (!w) return '';
  return `${w.guildId}-${w.id || w.caseNumber || w.createdAt}`;
}