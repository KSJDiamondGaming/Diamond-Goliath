import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import PageShell, {
  DetailGrid,
  DetailRow,
  EmptyState,
  LoadingPanel,
  Notice,
  SecondaryButton,
  SectionCard,
  StatGrid,
  SummaryStat,
} from '../components/PageShell';
import { PAGE_LAYOUTS, SECTION_DEFS } from '../ui';

const PAGE_KEY = 'warnings';

export default function Warnings({ selectedGuild, theme }) {
  const [warnings, setWarnings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedWarning, setSelectedWarning] = useState(null);

  const page = PAGE_LAYOUTS[PAGE_KEY] || {
    title: 'Warnings',
    description: 'View and manage warning records for the selected server.',
    emptyDescription: 'Select a server to view warnings.',
    sections: [{ id: 'warningTable', type: 'table' }],
  };

  useEffect(() => {
    let mounted = true;

    async function loadWarnings() {
      if (!selectedGuild) {
        if (mounted) {
          setWarnings(null);
          setLoading(false);
          setError('');
          setSelectedWarning(null);
        }
        return;
      }

      try {
        setLoading(true);
        setError('');
        setSelectedWarning(null);

        const data = await api.getWarnings(selectedGuild);

        if (!mounted) return;

        setWarnings(data || null);
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setWarnings(null);
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

  const normalizedWarnings = useMemo(() => {
    return normalizeWarnings(warnings, selectedGuild).sort((a, b) => {
      const timeA = new Date(a?.createdAt || 0).getTime();
      const timeB = new Date(b?.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [warnings, selectedGuild]);

  const warningStats = useMemo(() => {
    const total = normalizedWarnings.length;
    const active = normalizedWarnings.filter((warning) => warning.cleared !== true).length;
    const cleared = normalizedWarnings.filter((warning) => warning.cleared === true).length;
    return { total, active, cleared };
  }, [normalizedWarnings]);

  const formatDate = useCallback((timestamp) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleString();
  }, []);

  return (
    <PageShell
      title={page.title || 'Warnings'}
      subtitle={
        selectedGuild
          ? page.description || 'View and manage warning records for the selected server.'
          : page.emptyDescription || 'Select a server to view warnings.'
      }
      theme={theme}
    >
      {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}

      <StatGrid>
        <SummaryStat theme={theme} label="Total Warnings" value={warningStats.total} />
        <SummaryStat theme={theme} label="Active" value={warningStats.active} />
        <SummaryStat theme={theme} label="Cleared" value={warningStats.cleared} />
      </StatGrid>

      <SectionCard
        theme={theme}
        title={SECTION_DEFS?.warningTable?.title || 'Warnings'}
        subtitle={
          SECTION_DEFS?.warningTable?.description ||
          'Browse warning history and open a record to inspect full details.'
        }
        padding="20px"
      >
        {!selectedGuild ? (
          <EmptyState theme={theme} text="Select a guild to view warnings." />
        ) : loading ? (
          <LoadingPanel theme={theme} text="Loading warnings..." />
        ) : normalizedWarnings.length === 0 ? (
          <EmptyState theme={theme} text="No warnings found." />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: selectedWarning ? 'minmax(0, 1fr) minmax(320px, 0.82fr)' : '1fr',
              gap: '20px',
              alignItems: 'start',
            }}
          >
            <div style={{ display: 'grid', gap: '14px', minWidth: 0 }}>
              {normalizedWarnings.map((warning) => {
                const accentColor = warning.cleared === true ? '#16a34a' : '#f59e0b';

                return (
                  <button
                    key={`${warning.guildId}-${warning.id}-${warning.createdAt}`}
                    type="button"
                    onClick={() => setSelectedWarning(warning)}
                    style={{
                      background: theme.cardBg,
                      padding: '18px',
                      borderRadius: '18px',
                      boxShadow: theme.shadow,
                      borderLeft: `6px solid ${accentColor}`,
                      borderTop: `1px solid ${theme.cardBorder}`,
                      borderRight: `1px solid ${theme.cardBorder}`,
                      borderBottom: `1px solid ${theme.cardBorder}`,
                      textAlign: 'left',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <div style={{ display: 'grid', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, color: theme.cardText, fontSize: '18px' }}>
                          Warning #{warning.id || warning.warningId || '—'}
                        </h3>
                        <span
                          style={{
                            background: accentColor,
                            color: '#fff',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            fontSize: '12px',
                            fontWeight: 800,
                          }}
                        >
                          {warning.cleared === true ? 'Cleared' : 'Active'}
                        </span>
                      </div>

                      <p style={{ margin: 0, color: theme.cardText }}>
                        <strong>User:</strong> {warning.userTag || warning.targetTag || 'Unknown'}
                      </p>
                      <p style={{ margin: 0, color: theme.cardText }}>
                        <strong>Moderator:</strong> {warning.moderatorTag || 'Unknown'}
                      </p>
                      <p style={{ margin: 0, color: theme.cardText }}>
                        <strong>Reason:</strong> {warning.reason || 'No reason provided'}
                      </p>
                      <p style={{ margin: 0, color: theme.mutedText, fontSize: '13px' }}>
                        {formatDate(warning.createdAt)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedWarning ? (
              <SectionCard
                theme={theme}
                title={`Warning #${selectedWarning.id || selectedWarning.warningId || '—'}`}
                actions={
                  <SecondaryButton onClick={() => setSelectedWarning(null)} theme={theme}>
                    Close
                  </SecondaryButton>
                }
                padding="20px"
              >
                <DetailGrid>
                  <DetailRow label="Server" value={selectedWarning.guildId || 'Unknown'} theme={theme} />
                  <DetailRow
                    label="User"
                    value={`${selectedWarning.userTag || selectedWarning.targetTag || 'Unknown'} (${selectedWarning.userId || selectedWarning.targetId || 'Unknown'})`}
                    theme={theme}
                  />
                  <DetailRow
                    label="Moderator"
                    value={`${selectedWarning.moderatorTag || 'Unknown'} (${selectedWarning.moderatorId || 'Unknown'})`}
                    theme={theme}
                  />
                  <DetailRow
                    label="Status"
                    value={selectedWarning.cleared === true ? 'Cleared' : 'Active'}
                    theme={theme}
                  />
                  <DetailRow label="Created" value={formatDate(selectedWarning.createdAt)} theme={theme} />
                  <DetailRow label="Reason" value={selectedWarning.reason || 'No reason provided'} theme={theme} />
                </DetailGrid>
              </SectionCard>
            ) : null}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}

function normalizeWarnings(data, selectedGuild) {
  if (!data) return [];

  if (Array.isArray(data)) {
    return data.map((warning) => normalizeWarningItem(warning, selectedGuild));
  }

  if (typeof data !== 'object') {
    return [];
  }

  if (selectedGuild && data[selectedGuild]) {
    return normalizeWarningCollection(data[selectedGuild], selectedGuild);
  }

  return Object.entries(data).flatMap(([guildId, guildWarnings]) =>
    normalizeWarningCollection(guildWarnings, guildId)
  );
}

function normalizeWarningCollection(collection, guildId) {
  if (!collection) return [];

  if (Array.isArray(collection)) {
    return collection.map((warning) => normalizeWarningItem(warning, guildId));
  }

  if (typeof collection !== 'object') {
    return [];
  }

  return Object.values(collection).map((warning) => normalizeWarningItem(warning, guildId));
}

function normalizeWarningItem(warning, guildId) {
  return {
    ...warning,
    id: warning?.id ?? warning?.warningId ?? warning?.caseNumber ?? null,
    warningId: warning?.warningId ?? warning?.id ?? warning?.caseNumber ?? null,
    guildId: warning?.guildId || guildId || 'Unknown',
    userId: warning?.userId || warning?.targetId || null,
    userTag: warning?.userTag || warning?.targetTag || null,
    targetId: warning?.targetId || warning?.userId || null,
    targetTag: warning?.targetTag || warning?.userTag || null,
    moderatorId: warning?.moderatorId || null,
    moderatorTag: warning?.moderatorTag || null,
    createdAt: warning?.createdAt || warning?.timestamp || warning?.date || null,
    notes: Array.isArray(warning?.notes) ? warning.notes : [],
  };
}
