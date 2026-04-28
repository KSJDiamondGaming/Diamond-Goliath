import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import PageShell, {
  EmptyState,
  LoadingPanel,
  Notice,
  SecondaryButton,
  StatGrid,
  SummaryStat,
} from '../components/PageShell';
import { PAGE_LAYOUTS, createWarningsPageStyles } from '../ui';

const PAGE_KEY = 'warnings';

export default function Warnings({ selectedGuild, theme }) {
  const styles = useMemo(() => createWarningsPageStyles(theme), [theme]);

  const [warnings, setWarnings] = useState([]);
  const [selectedWarning, setSelectedWarning] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const page = PAGE_LAYOUTS[PAGE_KEY];

  useEffect(() => {
    let mounted = true;

    async function loadWarnings() {
      if (!selectedGuild) {
        setWarnings([]);
        setSelectedWarning(null);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const data = await api.getWarnings(selectedGuild);

        if (!mounted) return;

        setWarnings(normalizeWarnings(data, selectedGuild));
        setSelectedWarning(null);
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setWarnings([]);
        setError('Could not load warnings.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadWarnings();

    return () => {
      mounted = false;
    };
  }, [selectedGuild]);

  const filteredWarnings = useMemo(() => {
    const query = search.toLowerCase();
    if (!query) return warnings;

    return warnings.filter((w) =>
      [
        w.id,
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
    return isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString();
  }, []);

  return (
    <PageShell
      title={page?.title || 'Warnings'}
      subtitle={
        selectedGuild
          ? page?.description || 'View and manage warning records.'
          : page?.emptyDescription || 'Select a server to view warnings.'
      }
      theme={theme}
      actions={
        selectedGuild ? (
          <input
            style={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search warnings..."
          />
        ) : null
      }
    >
      {!selectedGuild && (
        <EmptyState theme={theme} text="Select a server to view warnings." />
      )}

      {error && (
        <Notice theme={theme} tone="danger">
          {error}
        </Notice>
      )}

      {selectedGuild && (
        <StatGrid>
          <SummaryStat theme={theme} label="Total Warnings" value={stats.total} />
          <SummaryStat theme={theme} label="Active" value={stats.active} accent={theme.warning} />
          <SummaryStat theme={theme} label="Cleared" value={stats.cleared} accent={theme.success} />
        </StatGrid>
      )}

      {selectedGuild && loading && (
        <LoadingPanel theme={theme} text="Loading warnings..." />
      )}

      {selectedGuild && !loading && (
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
      )}
    </PageShell>
  );
}

/* ================= COMPONENTS ================= */

const WarningItem = memo(function WarningItem({ item, active, styles, formatDate, onClick }) {
  const tone = item.cleared ? 'success' : 'warning';

  return (
    <button onClick={onClick} style={styles.recordButton(active)}>
      <div style={styles.recordTop}>
        <h4 style={styles.recordTitle}>Warning #{item.id || '—'}</h4>
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
          <h3 style={styles.detailTitle}>Warning #{item.id}</h3>
          <span style={styles.badge(tone)}>
            {item.cleared ? 'Cleared' : 'Active'}
          </span>
        </div>

        <p style={styles.detailSubtitle}>Full warning details.</p>
      </div>

      <div style={styles.detailBody}>
        <div style={styles.detailGrid}>
          <DetailRow styles={styles} label="User" value={item.userTag || item.userId} />
          <DetailRow styles={styles} label="Moderator" value={item.moderatorTag} />
          <DetailRow styles={styles} label="Date" value={formatDate(item.createdAt)} />
          <DetailRow styles={styles} label="Reason" value={item.reason} />
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

/* ================= HELPERS ================= */

function normalizeWarnings(data, guildId) {
  if (!data) return [];

  if (Array.isArray(data)) {
    return data.map((w) => normalizeWarning(w, guildId));
  }

  if (data[guildId]) {
    return normalizeWarnings(data[guildId], guildId);
  }

  return Object.values(data).flatMap((val) =>
    Array.isArray(val)
      ? val.map((w) => normalizeWarning(w, guildId))
      : [],
  );
}

function normalizeWarning(w, guildId) {
  return {
    ...w,
    guildId,
    id: w.id || w.warningId,
    userTag: w.userTag || w.user,
    userId: w.userId,
    moderatorTag: w.moderatorTag || w.moderator,
    reason: w.reason,
    cleared: w.cleared === true,
    createdAt: w.createdAt || w.timestamp,
  };
}

function getWarningKey(w) {
  if (!w) return '';
  return `${w.guildId}-${w.id || w.createdAt}`;
}